from fastapi import APIRouter, Depends, HTTPException, status
from decimal import Decimal
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.tenancy_validators import validar_empresa_pertenece_usuario
from app.models.fiscal import OperacionFiscal, PeriodoFiscal, TipoOperacionDiot
from app.models.usuario import Usuario
from app.services.calculos_fiscales import calcular_isr_provisional, calcular_iva_provisional
from app.schemas.fiscal import (
    OperacionFiscalCreate,
    OperacionFiscalResponse,
    PeriodoFiscalCreate,
    PeriodoFiscalResponse,
)

router = APIRouter()


@router.get("/isr")
def obtener_isr_provisional(
    empresa_id: int,
    mes: int,
    anio: int,
    tasa_isr: Decimal | None = None,
    coeficiente_utilidad: Decimal | None = None,
    deduccion_ciega_pct: Decimal | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    if mes < 1 or mes > 12:
        raise HTTPException(status_code=422, detail="mes debe estar entre 1 y 12")
    if anio < 2000 or anio > 2100:
        raise HTTPException(status_code=422, detail="anio fuera de rango")
    if tasa_isr is not None and (tasa_isr < 0 or tasa_isr > 100):
        raise HTTPException(status_code=422, detail="tasa_isr debe estar entre 0 y 100")
    if coeficiente_utilidad is not None and (coeficiente_utilidad < 0 or coeficiente_utilidad > 1):
        raise HTTPException(status_code=422, detail="coeficiente_utilidad debe estar entre 0 y 1")
    if deduccion_ciega_pct is not None and (deduccion_ciega_pct < 0 or deduccion_ciega_pct > 100):
        raise HTTPException(status_code=422, detail="deduccion_ciega_pct debe estar entre 0 y 100")
    return calcular_isr_provisional(
        db, empresa_id, mes, anio, tasa_isr, coeficiente_utilidad, deduccion_ciega_pct
    )


@router.get("/iva")
def obtener_iva_provisional(
    empresa_id: int,
    mes: int,
    anio: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    if mes < 1 or mes > 12:
        raise HTTPException(status_code=422, detail="mes debe estar entre 1 y 12")
    if anio < 2000 or anio > 2100:
        raise HTTPException(status_code=422, detail="anio fuera de rango")
    return calcular_iva_provisional(db, empresa_id, mes, anio)


@router.post("/periodos", response_model=PeriodoFiscalResponse, status_code=status.HTTP_201_CREATED)
def crear_periodo_fiscal(
    datos: PeriodoFiscalCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(datos.empresa_id, current_user.id, db)
    existente = db.query(PeriodoFiscal).filter(
        PeriodoFiscal.empresa_id == datos.empresa_id,
        PeriodoFiscal.tipo == datos.tipo,
        PeriodoFiscal.anio == datos.anio,
        PeriodoFiscal.mes == datos.mes,
    ).first()
    if existente:
        return existente

    periodo = PeriodoFiscal(**datos.model_dump())
    db.add(periodo)
    db.commit()
    db.refresh(periodo)
    return periodo


@router.get("/periodos/{empresa_id}", response_model=list[PeriodoFiscalResponse])
def listar_periodos_fiscales(
    empresa_id: int,
    anio: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    query = db.query(PeriodoFiscal).filter(PeriodoFiscal.empresa_id == empresa_id)
    if anio is not None:
        query = query.filter(PeriodoFiscal.anio == anio)
    return query.order_by(PeriodoFiscal.anio.desc(), PeriodoFiscal.mes.desc()).all()


@router.post("/operaciones", response_model=OperacionFiscalResponse, status_code=status.HTTP_201_CREATED)
def registrar_operacion_fiscal(
    datos: OperacionFiscalCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(datos.empresa_id, current_user.id, db)
    periodo = db.query(PeriodoFiscal).filter(
        PeriodoFiscal.id == datos.periodo_id,
        PeriodoFiscal.empresa_id == datos.empresa_id,
    ).first()
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo fiscal no encontrado")

    if datos.origen.value == "cfdi" and not datos.factura_id:
        raise HTTPException(status_code=422, detail="factura_id es obligatorio para origen cfdi")
    if datos.tipo_operacion_diot and datos.tipo_operacion not in {"egreso", "pago"}:
        raise HTTPException(status_code=422, detail="La clasificación DIOT solo aplica a egresos o pagos")

    referencia = datos.referencia_origen.strip()
    existente = db.query(OperacionFiscal).filter(
        OperacionFiscal.empresa_id == datos.empresa_id,
        OperacionFiscal.origen == datos.origen,
        OperacionFiscal.referencia_origen == referencia,
    ).first()
    if existente:
        raise HTTPException(status_code=409, detail="La operación fiscal ya está registrada")

    payload = datos.model_dump()
    payload["referencia_origen"] = referencia
    if payload.get("rfc_contraparte"):
        payload["rfc_contraparte"] = payload["rfc_contraparte"].strip().upper()
    operacion = OperacionFiscal(**payload)
    db.add(operacion)
    db.commit()
    db.refresh(operacion)
    return operacion


@router.get("/operaciones/{empresa_id}", response_model=list[OperacionFiscalResponse])
def listar_operaciones_fiscales(
    empresa_id: int,
    periodo_id: int | None = None,
    tipo_operacion_diot: TipoOperacionDiot | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    query = db.query(OperacionFiscal).filter(OperacionFiscal.empresa_id == empresa_id)
    if periodo_id is not None:
        query = query.filter(OperacionFiscal.periodo_id == periodo_id)
    if tipo_operacion_diot is not None:
        query = query.filter(OperacionFiscal.tipo_operacion_diot == tipo_operacion_diot)
    return query.order_by(OperacionFiscal.creado_en.desc()).all()