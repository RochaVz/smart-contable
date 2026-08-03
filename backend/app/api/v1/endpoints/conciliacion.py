from datetime import date
import io
import csv
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.logging_config import get_logger
from app.models.conciliacion import EstadoCuentaCarga, MovimientoBanco
from app.models.empresa import Empresa
from app.models.usuario import Usuario

# 1. IMPORTAMOS TU NUEVA ARQUITECTURA LIMPIA DE PARSERS
from app.services.bank_parser.analyzer import DocumentAnalyzer, PDFExtractor
from app.services.bank_parser.factory import BankParserFactory

from app.services.conciliacion import (
    conciliar_periodo,
    hash_archivo,
    hash_movimiento,
    parsear_estado_cuenta_xml,
    parsear_estado_cuenta_csv,
    # parsear_estado_cuenta_pdf, -> Ya no lo necesitamos para PDF, lo maneja bank_parser
)

router = APIRouter()
logger = get_logger(__name__)


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
    tolerancia: float = Query(1.0, ge=0),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Resumen de conciliación del periodo (compatible con GET /estado-cuenta)."""
    _validar_empresa(db, empresa_id, current_user)
    mes_f, anio_f = _periodo_default(mes, anio)
    _validar_periodo(mes_f, anio_f)
    return conciliar_periodo(db, empresa_id, mes_f, anio_f, tolerancia, banco_id)


@router.post("/estado-cuenta", status_code=201)
async def cargar_estado_cuenta(
    empresa_id: int,
    archivo: UploadFile = File(...),
    banco_id: int | None = None,
    mes: int | None = Query(None, ge=1, le=12, description="Periodo contable de referencia"),
    anio: int | None = Query(None, ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _validar_empresa(db, empresa_id, current_user)
    mes_f, anio_f = _periodo_default(mes, anio)
    _validar_periodo(mes_f, anio_f)

    if not archivo.filename:
        raise HTTPException(status_code=400, detail="Archivo sin nombre")

    fname = archivo.filename.lower()
    
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

        elif fname.endswith('.csv'):
            archivo_bytes = await archivo.read()
            if not archivo_bytes.strip():
                raise HTTPException(status_code=400, detail="El archivo CSV está vacío")
            movimientos = parsear_estado_cuenta_csv(archivo_bytes)

        elif fname.endswith('.pdf'):
            archivo_bytes = await archivo.read()
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

    if not movimientos:
        raise HTTPException(
            status_code=400,
            detail=(
                "No se encontraron movimientos bancarios en el estado de cuenta. "
                "Verifica que sea el archivo exportado por tu banco."
            ),
        )

    carga = EstadoCuentaCarga(
        empresa_id=empresa_id,
        banco_id=banco_id,
        nombre_archivo=archivo.filename,
        hash_archivo=hash_archivo(archivo_bytes),
        movimientos_count=0,
    )
    db.add(carga)
    db.flush()

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
                banco_id=banco_id,
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
        raise HTTPException(
            status_code=409,
            detail="El estado de cuenta ya fue cargado anteriormente",
        ) from None

    return {
        "mensaje": "Estado de cuenta cargado con éxito",
        "carga_id": carga.id,
        "archivo": archivo.filename,
        "periodo_referencia": {"mes": mes_f, "anio": anio_f},
        "movimientos_detectados": len(movimientos),
        "movimientos_nuevos": nuevos,
        "duplicados": duplicados,
    }


@router.post("/convertir-pdf-csv")
async def convertir_pdf_a_csv(
    archivo: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user),
):
    """Convierte cualquier estado de cuenta PDF a un archivo CSV estructurado."""
    if not archivo.filename or not archivo.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="El archivo debe ser un PDF válido")

    try:
        archivo_bytes = await archivo.read()
        
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