from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.conciliacion import EstadoCuentaCarga, MovimientoBanco
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.services.conciliacion import (
    conciliar_periodo,
    hash_archivo,
    hash_movimiento,
    parsear_estado_cuenta_xml,
)

router = APIRouter()


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
    tolerancia: float = Query(1.0, ge=0),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Resumen de conciliación del periodo (compatible con GET /estado-cuenta)."""
    _validar_empresa(db, empresa_id, current_user)
    mes_f, anio_f = _periodo_default(mes, anio)
    _validar_periodo(mes_f, anio_f)
    return conciliar_periodo(db, empresa_id, mes_f, anio_f, tolerancia)


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

    if not archivo.filename or not archivo.filename.lower().endswith(".xml"):
        raise HTTPException(status_code=400, detail="Solo se aceptan estados de cuenta en XML")

    xml_bytes = await archivo.read()
    if not xml_bytes.strip():
        raise HTTPException(status_code=400, detail="El archivo XML está vacío")

    snippet = xml_bytes[:4000].lower()
    if b"cfdi:comprobante" in snippet or b"tipodecomprobante" in snippet:
        raise HTTPException(
            status_code=400,
            detail="Este XML parece ser un CFDI de factura. Carga el estado de cuenta del banco, no facturas.",
        )

    try:
        movimientos = parsear_estado_cuenta_xml(xml_bytes)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo leer el XML del estado de cuenta: {exc}",
        ) from exc

    if not movimientos:
        raise HTTPException(
            status_code=400,
            detail=(
                "No se encontraron movimientos bancarios en el XML. "
                "Verifica que sea el estado de cuenta exportado por tu banco."
            ),
        )

    carga = EstadoCuentaCarga(
        empresa_id=empresa_id,
        banco_id=banco_id,
        nombre_archivo=archivo.filename,
        hash_archivo=hash_archivo(xml_bytes),
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
        "mensaje": "Estado de cuenta cargado",
        "carga_id": carga.id,
        "archivo": archivo.filename,
        "periodo_referencia": {"mes": mes_f, "anio": anio_f},
        "movimientos_detectados": len(movimientos),
        "movimientos_nuevos": nuevos,
        "duplicados": duplicados,
    }
