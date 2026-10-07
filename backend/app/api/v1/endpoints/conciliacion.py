from datetime import date
import io
import csv
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.logging_config import get_logger
from app.services.file_storage import estado_cuenta_object_key, get_file_storage
from app.models.conciliacion import EstadoCuentaCarga, MovimientoBanco
from app.models.empresa import Empresa
from app.models.usuario import Usuario

# 1. IMPORTAMOS TU NUEVA ARQUITECTURA LIMPIA DE PARSERS
from app.services.bank_parser.analyzer import DocumentAnalyzer, PDFExtractor
from app.services.bank_parser.factory import BankParserFactory

from pydantic import BaseModel, Field

from app.core.bancos import listar_bancos_catalogo
from app.services.comisiones import obtener_o_crear_banco
from app.services.estados_cuenta_validacion import (
    buscar_carga_duplicada,
    extraer_rfcs_de_bytes,
    extraer_rfcs_de_texto,
    validar_rfc_estado_cuenta,
)
from app.services.purga_datos import eliminar_carga_estado_cuenta
from app.services.conciliacion import (
    asignar_conciliacion_manual,
    auto_conciliar_sin_poliza,
    conciliar_periodo,
    hash_archivo,
    hash_movimiento,
    parsear_estado_cuenta_xml,
    parsear_estado_cuenta_csv,
    TOLERANCIA_CONCILIACION_CENTAVOS,
    # parsear_estado_cuenta_pdf, -> Ya no lo necesitamos para PDF, lo maneja bank_parser
)

router = APIRouter()
logger = get_logger(__name__)


def _mb(bytes_value: int) -> int:
    return max(1, bytes_value // (1024 * 1024))


def _validar_tamano_pdf(contenido: bytes) -> None:
    if len(contenido) > settings.MAX_PDF_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"El PDF excede el limite de {_mb(settings.MAX_PDF_UPLOAD_BYTES)} MB para la beta.",
        )


def _validar_tamano_pdf_upload(archivo: UploadFile) -> None:
    if (
        archivo.size is not None
        and archivo.size > settings.MAX_PDF_UPLOAD_BYTES
    ):
        raise HTTPException(
            status_code=413,
            detail=f"El PDF excede el limite de {_mb(settings.MAX_PDF_UPLOAD_BYTES)} MB para la beta.",
        )


def _validar_empresa(db: Session, empresa_id: int, user: Usuario) -> Empresa:
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == user.id,
    ).first()
    if not empresa:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta empresa")
    return empresa


def _periodo_default(mes: int | None, anio: int | None) -> tuple[int, int]:
    hoy = date.today()
    return mes or hoy.month, anio or hoy.year


def _validar_periodo(mes: int, anio: int) -> None:
    if mes < 1 or mes > 12:
        raise HTTPException(status_code=400, detail="Mes inválido (use 1-12)")
    if anio < 2000 or anio > 2100:
        raise HTTPException(status_code=400, detail="Año inválido")


@router.get("/resumen")
@router.get("")
@router.get("/estado-cuenta")
def obtener_conciliacion(
    empresa_id: int,
    mes: int | None = Query(None, ge=1, le=12),
    anio: int | None = Query(None, ge=2000, le=2100),
    banco_id: int | None = None,
    tolerancia: float = Query(TOLERANCIA_CONCILIACION_CENTAVOS, ge=0, le=0.05),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Resumen de conciliación del periodo (compatible con GET /estado-cuenta)."""
    _validar_empresa(db, empresa_id, current_user)
    mes_f, anio_f = _periodo_default(mes, anio)
    _validar_periodo(mes_f, anio_f)
    return conciliar_periodo(db, empresa_id, mes_f, anio_f, tolerancia, banco_id)


class AutoConciliarInput(BaseModel):
    empresa_id: int
    mes: int | None = Field(None, ge=1, le=12)
    anio: int | None = Field(None, ge=2000, le=2100)
    banco_id: int | None = None
    tolerancia: float = Field(TOLERANCIA_CONCILIACION_CENTAVOS, ge=0, le=0.05)


class AsignarConciliacionInput(BaseModel):
    empresa_id: int
    tipo_poliza: str = Field(..., description="ingreso | egreso | diario")
    poliza_id: int | None = None
    cuenta_contrapartida: str | None = None
    nombre_contrapartida: str | None = None
    concepto: str | None = None


@router.post("/auto-conciliar")
def auto_conciliar_movimientos(
    datos: AutoConciliarInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Asigna automáticamente movimientos sin póliza a ingreso/egreso/diario."""
    _validar_empresa(db, datos.empresa_id, current_user)
    mes_f, anio_f = _periodo_default(datos.mes, datos.anio)
    _validar_periodo(mes_f, anio_f)
    try:
        return auto_conciliar_sin_poliza(
            db,
            datos.empresa_id,
            mes_f,
            anio_f,
            datos.tolerancia,
            datos.banco_id,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error en auto-conciliación")
        raise HTTPException(status_code=500, detail=f"No se pudo auto-conciliar: {exc}") from exc


@router.patch("/movimientos/{movimiento_id}")
def editar_conciliacion_movimiento(
    movimiento_id: int,
    datos: AsignarConciliacionInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Edición manual: cambia la asignación de un movimiento a ingreso/egreso/diario."""
    _validar_empresa(db, datos.empresa_id, current_user)
    try:
        return asignar_conciliacion_manual(
            db=db,
            empresa_id=datos.empresa_id,
            movimiento_id=movimiento_id,
            tipo_poliza=datos.tipo_poliza,
            poliza_id=datos.poliza_id,
            cuenta_contrapartida=datos.cuenta_contrapartida,
            nombre_contrapartida=datos.nombre_contrapartida,
            concepto=datos.concepto,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Error al editar conciliación manual")
        raise HTTPException(status_code=500, detail="No se pudo actualizar la conciliación") from exc


@router.get("/bancos-catalogo")
def obtener_catalogo_bancos(
    current_user: Usuario = Depends(get_current_user),
):
    """Catálogo fijo de bancos mexicanos para el selector de conciliación."""
    _ = current_user
    return listar_bancos_catalogo()


@router.get("/estados-cuenta")
def listar_estados_cuenta(
    empresa_id: int = Query(...),
    mes: int | None = Query(None, ge=1, le=12),
    anio: int | None = Query(None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista cargas de estados de cuenta de la empresa (para eliminar duplicados/errores)."""
    _validar_empresa(db, empresa_id, current_user)
    query = db.query(EstadoCuentaCarga).filter(EstadoCuentaCarga.empresa_id == empresa_id)
    cargas = query.order_by(EstadoCuentaCarga.creado_en.desc()).all()

    resultado = []
    for carga in cargas:
        movs = list(carga.movimientos or [])
        if mes is not None and anio is not None:
            movs_periodo = [
                m for m in movs
                if m.fecha and getattr(m.fecha, "month", None) == mes
                and getattr(m.fecha, "year", None) == anio
            ]
            if not movs_periodo and movs:
                # Si la carga no toca el periodo, omitirla del filtro
                continue
            movs_count = len(movs_periodo) if movs else carga.movimientos_count
        else:
            movs_count = carga.movimientos_count or len(movs)

        resultado.append({
            "id": carga.id,
            "nombre_archivo": carga.nombre_archivo,
            "banco_id": carga.banco_id,
            "hash_archivo": carga.hash_archivo,
            "movimientos_count": movs_count,
            "creado_en": str(carga.creado_en) if carga.creado_en else None,
        })
    return resultado


@router.delete("/estados-cuenta/{carga_id}", status_code=200)
def eliminar_estado_cuenta(
    carga_id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Elimina un estado de cuenta cargado por error y sus movimientos."""
    _validar_empresa(db, empresa_id, current_user)
    try:
        resultado = eliminar_carga_estado_cuenta(db, empresa_id, carga_id)
        db.commit()
        return {
            "mensaje": "Estado de cuenta eliminado correctamente",
            **resultado,
        }
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        logger.exception("Error al eliminar estado de cuenta")
        raise HTTPException(status_code=500, detail="No se pudo eliminar el estado de cuenta") from exc


@router.post("/estado-cuenta", status_code=201)
async def cargar_estado_cuenta(
    empresa_id: int,
    archivo: UploadFile = File(...),
    banco_id: int | None = None,
    banco_nombre: str | None = Query(None, description="Nombre del banco del catálogo"),
    mes: int | None = Query(None, ge=1, le=12, description="Periodo contable de referencia"),
    anio: int | None = Query(None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    empresa = _validar_empresa(db, empresa_id, current_user)
    mes_f, anio_f = _periodo_default(mes, anio)
    _validar_periodo(mes_f, anio_f)

    if not archivo.filename:
        raise HTTPException(status_code=400, detail="Archivo sin nombre")

    fname = archivo.filename.lower()
    raw_text = ""
    archivo_bytes = b""

    try:
        if fname.endswith('.xml'):
            archivo_bytes = await archivo.read()
            if not archivo_bytes.strip():
                raise HTTPException(status_code=400, detail="El archivo XML está vacío")

            snippet = archivo_bytes[:4000].lower()
            if b"cfdi:comprobante" in snippet or b"tipodecomprobante" in snippet:
                raise HTTPException(
                    status_code=400,
                    detail="Este XML parece ser un CFDI de factura. Carga el estado de cuenta del banco, no facturas.",
                )
            movimientos = parsear_estado_cuenta_xml(archivo_bytes)
            raw_text = archivo_bytes.decode("utf-8", errors="ignore")

        elif fname.endswith('.csv'):
            archivo_bytes = await archivo.read()
            if not archivo_bytes.strip():
                raise HTTPException(status_code=400, detail="El archivo CSV está vacío")
            movimientos = parsear_estado_cuenta_csv(archivo_bytes)
            raw_text = archivo_bytes.decode("utf-8", errors="ignore")

        elif fname.endswith('.pdf'):
            _validar_tamano_pdf_upload(archivo)
            archivo_bytes = await archivo.read()
            _validar_tamano_pdf(archivo_bytes)
            if not archivo_bytes.strip():
                raise HTTPException(status_code=400, detail="El archivo PDF está vacío")

            raw_text = PDFExtractor.extract_text(archivo_bytes)
            parser = BankParserFactory().get_parser(raw_text)
            statement_data = parser.parse(raw_text, pdf_bytes=archivo_bytes)
            logger.debug("Parser usado: %s", parser.__class__.__name__)
            logger.debug("Texto extraído (500 chars): %s", raw_text[:500])
            logger.debug("Movimientos encontrados: %s", len(statement_data.movimientos))

            class MovimientoAdaptado:
                def __init__(self, m):
                    try:
                        self.fecha = datetime.strptime(m.fecha, "%d/%m/%Y").date()
                    except ValueError:
                        try:
                            self.fecha = datetime.strptime(m.fecha, "%Y-%m-%d").date()
                        except ValueError:
                            self.fecha = date.today()

                    self.descripcion = m.descripcion
                    self.referencia = m.referencia
                    # Si tiene cargo es egreso/cargo, si tiene abono es ingreso/abono
                    if m.cargo > 0:
                        self.tipo = "cargo"
                        self.monto = m.cargo
                    else:
                        self.tipo = "abono"
                        self.monto = m.abono
                    self.saldo = m.saldo

            movimientos = [MovimientoAdaptado(m) for m in statement_data.movimientos]

        else:
            raise HTTPException(status_code=400, detail="Solo se aceptan estados de cuenta en XML, CSV o PDF")

    except HTTPException:
        raise
    except RuntimeError as re_err:
        raise HTTPException(status_code=500, detail=f"Error de configuración del servicio: {re_err}")
    except ValueError as val_err:
        raise HTTPException(status_code=422, detail=str(val_err))
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo procesar el archivo del estado de cuenta: {exc}",
        ) from exc

    # Duplicado del archivo completo (PDF/XML/CSV ya cargado)
    archivo_hash = hash_archivo(archivo_bytes)
    duplicado = buscar_carga_duplicada(db, empresa_id, archivo_hash)
    if duplicado:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Este estado de cuenta ya fue cargado anteriormente "
                f"(archivo: {duplicado.nombre_archivo}, carga_id: {duplicado.id}). "
                f"Elimínalo primero si deseas volver a importarlo."
            ),
        )

    # Validación RFC empresa vs documento
    rfcs = extraer_rfcs_de_texto(raw_text) or extraer_rfcs_de_bytes(archivo_bytes, archivo.filename)
    try:
        validacion_rfc = validar_rfc_estado_cuenta(empresa, rfcs)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if not movimientos:
        raise HTTPException(
            status_code=400,
            detail=(
                "No se encontraron movimientos bancarios en el estado de cuenta. "
                "Verifica que sea el archivo exportado por tu banco."
            ),
        )

    banco = obtener_o_crear_banco(
        db,
        empresa_id,
        banco_id=banco_id,
        banco_nombre=banco_nombre,
    )
    banco_resuelto_id = banco.id if banco else banco_id

    carga = EstadoCuentaCarga(
        empresa_id=empresa_id,
        banco_id=banco_resuelto_id,
        nombre_archivo=archivo.filename,
        hash_archivo=archivo_hash,
        movimientos_count=0,
    )
    db.add(carga)
    db.flush()
    storage = get_file_storage()
    archivo_s3_key = None

    if storage:
        extension = "." + fname.rsplit(".", maxsplit=1)[1]
        archivo_s3_key = storage.upload(
            estado_cuenta_object_key(empresa_id, carga.hash_archivo, extension),
            archivo_bytes,
            archivo.content_type or "application/octet-stream",
        )
        carga.archivo_s3_key = archivo_s3_key

    nuevos = 0
    duplicados = 0
    for mov in movimientos:
        h = hash_movimiento(empresa_id, mov)
        existe = db.query(MovimientoBanco).filter(
            MovimientoBanco.empresa_id == empresa_id,
            MovimientoBanco.hash_movimiento == h,
        ).first()
        if existe:
            duplicados += 1
            continue

        db.add(
            MovimientoBanco(
                empresa_id=empresa_id,
                carga_id=carga.id,
                banco_id=banco_resuelto_id,
                fecha=mov.fecha,
                tipo=mov.tipo,
                descripcion=mov.descripcion,
                referencia=mov.referencia,
                monto=mov.monto,
                saldo=mov.saldo,
                hash_movimiento=h,
            )
        )
        nuevos += 1

    carga.movimientos_count = nuevos
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if archivo_s3_key and storage:
            storage.delete(archivo_s3_key)
        raise HTTPException(
            status_code=409,
            detail="El estado de cuenta ya fue cargado anteriormente",
        ) from None

    return {
        "mensaje": "Estado de cuenta cargado con éxito",
        "carga_id": carga.id,
        "archivo": archivo.filename,
        "banco_id": banco_resuelto_id,
        "periodo_referencia": {"mes": mes_f, "anio": anio_f},
        "movimientos_detectados": len(movimientos),
        "movimientos_nuevos": nuevos,
        "duplicados": duplicados,
        "validacion_rfc": validacion_rfc,
    }


def _serializar_movimiento_export(mov: MovimientoBanco) -> dict:
    """Serializa movimiento bancario para respaldo portable (fingerprint = hash_movimiento)."""
    fecha = mov.fecha
    fecha_str = str(fecha.date() if hasattr(fecha, "date") else fecha)
    tipo = str(mov.tipo or "").lower()
    monto = float(mov.monto or 0)
    return {
        "id": mov.id,
        "empresa_id": mov.empresa_id,
        "banco_id": mov.banco_id,
        "carga_id": mov.carga_id,
        "fecha": fecha_str,
        "tipo": tipo,
        "descripcion": mov.descripcion or "",
        "referencia": mov.referencia or "",
        "monto": monto,
        "cargo": monto if tipo == "cargo" else None,
        "abono": monto if tipo == "abono" else None,
        "saldo": float(mov.saldo) if mov.saldo is not None else None,
        "hash_movimiento": mov.hash_movimiento,
        "fingerprint": mov.hash_movimiento,
    }


@router.get("/movimientos")
def listar_movimientos_banco(
    empresa_id: int = Query(..., description="Empresa dueña de los movimientos"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Lista todos los movimientos bancarios de la empresa (sin filtro de periodo) para respaldo."""
    _validar_empresa(db, empresa_id, current_user)
    movimientos = (
        db.query(MovimientoBanco)
        .filter(MovimientoBanco.empresa_id == empresa_id)
        .order_by(MovimientoBanco.fecha.asc(), MovimientoBanco.id.asc())
        .all()
    )
    return [_serializar_movimiento_export(mov) for mov in movimientos]


@router.post("/convertir-pdf-csv")
async def convertir_pdf_a_csv(
    archivo: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user),
):
    """Convierte cualquier estado de cuenta PDF a un archivo CSV estructurado."""
    if not archivo.filename or not archivo.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido")

    try:
        _validar_tamano_pdf_upload(archivo)
        archivo_bytes = await archivo.read()
        _validar_tamano_pdf(archivo_bytes)
        
        raw_text = PDFExtractor.extract_text(archivo_bytes)
        parser = BankParserFactory().get_parser(raw_text)
        statement_data = parser.parse(raw_text, pdf_bytes=archivo_bytes)
        
        # Mapeamos al formato que espera el escritor de CSV
        class MovimientoCSVAdaptado:
            def __init__(self, m):
                try:
                    self.fecha = datetime.strptime(m.fecha, "%d/%m/%Y").date()
                except ValueError:
                    self.fecha = date.today()
                self.tipo = "Cargo" if m.cargo > 0 else "Abono"
                self.descripcion = m.descripcion
                self.referencia = m.referencia
                self.monto = m.cargo if m.cargo > 0 else m.abono
                self.saldo = m.saldo

        movimientos = [MovimientoCSVAdaptado(m) for m in statement_data.movimientos]

    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"No se pudo procesar el PDF para conversión: {exc}")

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Fecha", "Tipo", "Descripcion", "Referencia", "Monto", "Saldo"])

    for mov in movimientos:
        writer.writerow([
            mov.fecha.strftime("%Y-%m-%d"),
            mov.tipo,
            mov.descripcion,
            mov.referencia or "",
            mov.monto,
            mov.saldo if mov.saldo is not None else ""
        ])

    csv_nombre = archivo.filename.rsplit('.', 1)[0] + ".csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={csv_nombre}"}
    )