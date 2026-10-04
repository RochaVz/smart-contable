from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from decimal import Decimal
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.tenancy_validators import validar_empresa_pertenece_usuario
from app.models.fiscal import (
    AccionHistorialFiscal,
    OperacionFiscal,
    PeriodoFiscal,
    TipoDeclaracionFiscal,
    TipoEntidadHistorialFiscal,
    TipoOperacionDiot,
)
from app.models.usuario import Usuario
from app.models.ajustes_fiscales import (
    PagoProvisionalAnterior,
    PerdidaFiscal,
    TipoImpuestoProvisional,
)
from app.services.calculos_fiscales import (
    calcular_ieps_provisional,
    calcular_isr_anual,
    calcular_isr_provisional,
    calcular_iva_provisional,
    listar_tarifas_ejercicio,
)
from app.services.resumen_fiscal_sat import construir_resumen_fiscal_sat
from app.services.diot import construir_diot, exportar_diot
from app.services.fiscal_diferencias import comparar_fuentes_fiscales
from app.services.fiscal_indicadores import (
    construir_indicadores_fiscales,
    registrar_revision_contable,
)
from app.services.historial_declaraciones import (
    cancelar_declaracion,
    crear_declaracion,
    listar_declaraciones,
    listar_historial,
    modificar_declaracion,
    presentar_declaracion,
    registrar_evento_historial,
    serializar_declaracion,
    serializar_historial,
)
from app.schemas.fiscal import (
    PagoProvisionalCreate,
    PagoProvisionalResponse,
    PerdidaFiscalCreate,
    PerdidaFiscalResponse,
    DeclaracionFiscalCreate,
    DeclaracionFiscalModificar,
    DeclaracionFiscalResponse,
    HistorialFiscalResponse,
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


@router.get("/resumen-sat")
def obtener_resumen_fiscal_sat(
    empresa_id: int,
    mes: int,
    anio: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Resumen informativo de impuestos, declaraciones y sugerencias de pago."""
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    if mes < 1 or mes > 12:
        raise HTTPException(status_code=422, detail="mes debe estar entre 1 y 12")
    if anio < 2000 or anio > 2100:
        raise HTTPException(status_code=422, detail="anio fuera de rango")
    return construir_resumen_fiscal_sat(db, empresa_id, mes, anio)


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
    db.flush()
    registrar_evento_historial(
        db,
        empresa_id=periodo.empresa_id,
        usuario_id=current_user.id,
        entidad_tipo=TipoEntidadHistorialFiscal.periodo,
        entidad_id=periodo.id,
        accion=AccionHistorialFiscal.crear,
        resumen=f"Periodo fiscal {periodo.tipo.value} {periodo.anio}-{periodo.mes or 'anual'} creado",
        detalle_despues={
            "id": periodo.id,
            "empresa_id": periodo.empresa_id,
            "tipo": periodo.tipo.value,
            "anio": periodo.anio,
            "mes": periodo.mes,
        },
    )
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
    db.flush()
    registrar_evento_historial(
        db,
        empresa_id=operacion.empresa_id,
        usuario_id=current_user.id,
        entidad_tipo=TipoEntidadHistorialFiscal.operacion,
        entidad_id=operacion.id,
        accion=AccionHistorialFiscal.crear,
        resumen=(
            f"Operación fiscal {operacion.tipo_operacion.value} "
            f"({operacion.origen.value}:{operacion.referencia_origen}) registrada"
        ),
        detalle_despues={
            "id": operacion.id,
            "empresa_id": operacion.empresa_id,
            "periodo_id": operacion.periodo_id,
            "tipo_operacion": operacion.tipo_operacion.value,
            "origen": operacion.origen.value,
            "referencia_origen": operacion.referencia_origen,
            "total": str(operacion.total or 0),
        },
    )
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


def _response_declaracion(declaracion) -> dict:
    data = serializar_declaracion(declaracion)
    # Pydantic espera Decimal/bool nativos vía from_attributes; rearmamos dict limpio.
    return DeclaracionFiscalResponse.model_validate(
        {
            **data,
            "base_gravable": declaracion.base_gravable,
            "isr_causado": declaracion.isr_causado,
            "iva_trasladado": declaracion.iva_trasladado,
            "iva_acreditable": declaracion.iva_acreditable,
            "iva_retenido": declaracion.iva_retenido,
            "monto_a_cargo": declaracion.monto_a_cargo,
            "monto_a_favor": declaracion.monto_a_favor,
            "fecha_presentacion": declaracion.fecha_presentacion,
            "creado_en": declaracion.creado_en,
            "actualizado_en": declaracion.actualizado_en,
            "tipo": declaracion.tipo,
            "estado": declaracion.estado,
        }
    )


@router.post(
    "/declaraciones",
    response_model=DeclaracionFiscalResponse,
    status_code=status.HTTP_201_CREATED,
)
def crear_declaracion_fiscal(
    datos: DeclaracionFiscalCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(datos.empresa_id, current_user.id, db)
    declaracion = crear_declaracion(
        db,
        empresa_id=datos.empresa_id,
        periodo_id=datos.periodo_id,
        tipo=datos.tipo,
        usuario_id=current_user.id,
        estado=datos.estado,
        base_gravable=datos.base_gravable,
        isr_causado=datos.isr_causado,
        iva_trasladado=datos.iva_trasladado,
        iva_acreditable=datos.iva_acreditable,
        iva_retenido=datos.iva_retenido,
        monto_a_cargo=datos.monto_a_cargo,
        monto_a_favor=datos.monto_a_favor,
        snapshot_calculo=datos.snapshot_calculo,
        notas=datos.notas,
    )
    return _response_declaracion(declaracion)


@router.get("/declaraciones/{empresa_id}", response_model=list[DeclaracionFiscalResponse])
def listar_declaraciones_fiscales(
    empresa_id: int,
    periodo_id: int | None = None,
    tipo: TipoDeclaracionFiscal | None = None,
    solo_vigentes: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    items = listar_declaraciones(
        db,
        empresa_id,
        periodo_id=periodo_id,
        tipo=tipo,
        solo_vigentes=solo_vigentes,
    )
    return [_response_declaracion(item) for item in items]


@router.post(
    "/declaraciones/{declaracion_id}/presentar",
    response_model=DeclaracionFiscalResponse,
)
def presentar_declaracion_fiscal(
    declaracion_id: int,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    declaracion = presentar_declaracion(
        db,
        declaracion_id=declaracion_id,
        empresa_id=empresa_id,
        usuario_id=current_user.id,
    )
    return _response_declaracion(declaracion)


@router.post(
    "/declaraciones/{declaracion_id}/modificar",
    response_model=DeclaracionFiscalResponse,
    status_code=status.HTTP_201_CREATED,
)
def modificar_declaracion_fiscal(
    declaracion_id: int,
    datos: DeclaracionFiscalModificar,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    payload = datos.model_dump(exclude_unset=True)
    motivo = payload.pop("motivo")
    declaracion = modificar_declaracion(
        db,
        declaracion_id=declaracion_id,
        empresa_id=empresa_id,
        motivo=motivo,
        usuario_id=current_user.id,
        **payload,
    )
    return _response_declaracion(declaracion)


class CancelarDeclaracionBody(BaseModel):
    motivo: str | None = Field(default=None, max_length=500)


@router.post(
    "/declaraciones/{declaracion_id}/cancelar",
    response_model=DeclaracionFiscalResponse,
)
def cancelar_declaracion_fiscal(
    declaracion_id: int,
    datos: CancelarDeclaracionBody | None = None,
    empresa_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    declaracion = cancelar_declaracion(
        db,
        declaracion_id=declaracion_id,
        empresa_id=empresa_id,
        motivo=(datos.motivo if datos else None),
        usuario_id=current_user.id,
    )
    return _response_declaracion(declaracion)


@router.get("/historial/{empresa_id}", response_model=list[HistorialFiscalResponse])
def listar_historial_fiscal(
    empresa_id: int,
    entidad_tipo: TipoEntidadHistorialFiscal | None = None,
    entidad_id: int | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    eventos = listar_historial(
        db,
        empresa_id,
        entidad_tipo=entidad_tipo,
        entidad_id=entidad_id,
        limit=limit,
    )
    return [
        HistorialFiscalResponse.model_validate(
            {
                **serializar_historial(evento),
                "entidad_tipo": evento.entidad_tipo,
                "accion": evento.accion,
                "creado_en": evento.creado_en,
            }
        )
        for evento in eventos
    ]

@router.get("/anual")
def obtener_calculo_anual(
    empresa_id: int,
    anio: int,
    tasa_isr: Decimal | None = None,
    coeficiente_utilidad: Decimal | None = None,
    deduccion_ciega_pct: Decimal | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    if anio < 2000 or anio > 2100:
        raise HTTPException(status_code=422, detail="anio fuera de rango")
    if tasa_isr is not None and (tasa_isr < 0 or tasa_isr > 100):
        raise HTTPException(status_code=422, detail="tasa_isr debe estar entre 0 y 100")
    if coeficiente_utilidad is not None and (coeficiente_utilidad < 0 or coeficiente_utilidad > 1):
        raise HTTPException(status_code=422, detail="coeficiente_utilidad debe estar entre 0 y 1")
    if deduccion_ciega_pct is not None and (deduccion_ciega_pct < 0 or deduccion_ciega_pct > 100):
        raise HTTPException(status_code=422, detail="deduccion_ciega_pct debe estar entre 0 y 100")
    return calcular_isr_anual(
        db, empresa_id, anio, tasa_isr, coeficiente_utilidad, deduccion_ciega_pct
    )


@router.get("/ieps")
def obtener_ieps_provisional(
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
    return calcular_ieps_provisional(db, empresa_id, mes, anio)


@router.get("/tarifas-isr/{ejercicio}")
def obtener_tarifas_isr(
    ejercicio: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _ = db, current_user  # auth gate only
    if ejercicio < 2000 or ejercicio > 2100:
        raise HTTPException(status_code=422, detail="ejercicio fuera de rango")
    data = listar_tarifas_ejercicio(ejercicio)
    if not data["disponible"]:
        raise HTTPException(status_code=404, detail=f"No hay tarifas versionadas para {ejercicio}")
    return data


@router.post(
    "/pagos-provisionales",
    response_model=PagoProvisionalResponse,
    status_code=status.HTTP_201_CREATED,
)
def registrar_pago_provisional(
    datos: PagoProvisionalCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(datos.empresa_id, current_user.id, db)
    tipo = datos.tipo_impuesto if isinstance(datos.tipo_impuesto, TipoImpuestoProvisional) else TipoImpuestoProvisional(datos.tipo_impuesto)
    existente = (
        db.query(PagoProvisionalAnterior)
        .filter(
            PagoProvisionalAnterior.empresa_id == datos.empresa_id,
            PagoProvisionalAnterior.tipo_impuesto == tipo,
            PagoProvisionalAnterior.ejercicio == datos.ejercicio,
            PagoProvisionalAnterior.mes == datos.mes,
        )
        .first()
    )
    if existente:
        existente.monto = datos.monto
        existente.notas = datos.notas
        db.commit()
        db.refresh(existente)
        return existente

    fila = PagoProvisionalAnterior(
        empresa_id=datos.empresa_id,
        tipo_impuesto=tipo,
        ejercicio=datos.ejercicio,
        mes=datos.mes,
        monto=datos.monto,
        notas=datos.notas,
    )
    db.add(fila)
    db.commit()
    db.refresh(fila)
    return fila


@router.get("/pagos-provisionales/{empresa_id}", response_model=list[PagoProvisionalResponse])
def listar_pagos_provisionales(
    empresa_id: int,
    ejercicio: int | None = None,
    tipo_impuesto: TipoImpuestoProvisional | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    q = db.query(PagoProvisionalAnterior).filter(PagoProvisionalAnterior.empresa_id == empresa_id)
    if ejercicio is not None:
        q = q.filter(PagoProvisionalAnterior.ejercicio == ejercicio)
    if tipo_impuesto is not None:
        q = q.filter(PagoProvisionalAnterior.tipo_impuesto == tipo_impuesto)
    return q.order_by(
        PagoProvisionalAnterior.ejercicio.desc(),
        PagoProvisionalAnterior.mes.desc(),
    ).all()


@router.post(
    "/perdidas-fiscales",
    response_model=PerdidaFiscalResponse,
    status_code=status.HTTP_201_CREATED,
)
def registrar_perdida_fiscal(
    datos: PerdidaFiscalCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(datos.empresa_id, current_user.id, db)
    fila = PerdidaFiscal(
        empresa_id=datos.empresa_id,
        ejercicio_origen=datos.ejercicio_origen,
        monto_original=datos.monto_original,
        monto_pendiente=datos.monto_pendiente if datos.monto_pendiente is not None else datos.monto_original,
        ejercicio_limite=datos.ejercicio_limite,
        activa=datos.activa,
        notas=datos.notas,
    )
    db.add(fila)
    db.commit()
    db.refresh(fila)
    return fila


@router.get("/perdidas-fiscales/{empresa_id}", response_model=list[PerdidaFiscalResponse])
def listar_perdidas_fiscales(
    empresa_id: int,
    solo_activas: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    q = db.query(PerdidaFiscal).filter(PerdidaFiscal.empresa_id == empresa_id)
    if solo_activas:
        q = q.filter(PerdidaFiscal.activa.is_(True))
    return q.order_by(PerdidaFiscal.ejercicio_origen.asc()).all()

def _validar_periodo_mes_anio(mes: int, anio: int) -> None:
    if mes < 1 or mes > 12:
        raise HTTPException(status_code=422, detail="mes debe estar entre 1 y 12")
    if anio < 2000 or anio > 2100:
        raise HTTPException(status_code=422, detail="anio fuera de rango")


@router.get("/diot")
def obtener_diot(
    empresa_id: int,
    mes: int,
    anio: int,
    incluir_cfdi: bool = Query(default=True),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """DIOT del periodo: proveedores agrupados con base, IVA y validacion de incompletos."""
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    _validar_periodo_mes_anio(mes, anio)
    return construir_diot(db, empresa_id, mes, anio, incluir_cfdi=incluir_cfdi)


@router.get("/diot/export")
def exportar_diot_periodo(
    empresa_id: int,
    mes: int,
    anio: int,
    formato: str = Query(default="sat", pattern="^(sat|csv|xlsx|excel|pdf)$"),
    incluir_cfdi: bool = Query(default=True),
    forzar: bool = Query(
        default=False,
        description="Permite exportar aunque haya datos incompletos (solo revision interna)",
    ),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Exporta DIOT en layout SAT, CSV, Excel o PDF."""
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    _validar_periodo_mes_anio(mes, anio)
    diot = construir_diot(db, empresa_id, mes, anio, incluir_cfdi=incluir_cfdi)
    if not diot["proveedores"]:
        raise HTTPException(status_code=404, detail="No hay operaciones DIOT en el periodo")
    if diot["bloqueado_por_incompletos"] and formato == "sat" and not forzar:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Hay datos incompletos; corrige antes del layout SAT o usa forzar=true",
                "datos_incompletos": diot["datos_incompletos"],
            },
        )
    try:
        content, media_type, filename = exportar_diot(diot, formato)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # Bitácora de exportaciones (entidad sintética periodo YYYYMM)
    registrar_evento_historial(
        db,
        empresa_id=empresa_id,
        entidad_tipo=TipoEntidadHistorialFiscal.periodo,
        entidad_id=anio * 100 + mes,
        accion=AccionHistorialFiscal.actualizar,
        resumen=f"Exportación DIOT {formato.upper()} {anio}-{mes:02d}",
        usuario_id=current_user.id,
        detalle_despues={
            "tipo_exportacion": "diot",
            "formato": formato,
            "filename": filename,
            "mes": mes,
            "anio": anio,
            "forzado": bool(forzar),
            "proveedores": diot.get("totales", {}).get("proveedores"),
            "incompletos": diot.get("totales", {}).get("proveedores_incompletos"),
        },
        motivo="exportacion_fiscal",
        commit=True,
    )

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/diferencias")
def obtener_diferencias_fiscales(
    empresa_id: int,
    mes: int,
    anio: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Compara CFDI del mes vs pólizas del periodo vs motor fiscal (IVA/ISR/DIOT)."""
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    _validar_periodo_mes_anio(mes, anio)
    return comparar_fuentes_fiscales(db, empresa_id, mes, anio)


class RevisionContableBody(BaseModel):
    empresa_id: int
    modulo: str = Field(..., min_length=2, max_length=40)
    mes: int = Field(..., ge=1, le=12)
    anio: int = Field(..., ge=2000, le=2100)
    notas: str | None = Field(default=None, max_length=500)


@router.get("/indicadores")
def obtener_indicadores_fiscales(
    empresa_id: int,
    mes: int,
    anio: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Indicadores de seguimiento: avance, pruebas, UX, DIOT, desvíos, exportaciones y revisiones."""
    validar_empresa_pertenece_usuario(empresa_id, current_user.id, db)
    _validar_periodo_mes_anio(mes, anio)
    return construir_indicadores_fiscales(db, empresa_id, mes, anio)


@router.post("/indicadores/revision")
def aprobar_revision_contable(
    body: RevisionContableBody,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Registra aprobación contable de un módulo fiscal del periodo (queda en bitácora)."""
    validar_empresa_pertenece_usuario(body.empresa_id, current_user.id, db)
    try:
        return registrar_revision_contable(
            db,
            empresa_id=body.empresa_id,
            usuario_id=current_user.id,
            modulo=body.modulo,
            mes=body.mes,
            anio=body.anio,
            notas=body.notas,
            commit=True,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
