from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_current_user
from app.models.usuario import Usuario
from app.models.empresa import Empresa
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.poliza import MovimientoPoliza, Poliza

from app.core.validators import (
    validar_empresa_usuario,
    validar_periodo
)
from app.services.informes_contables import generar_paquete_informes

router = APIRouter()

# Constantes contables
FAMILIA_ACTIVO = '1'
FAMILIA_PASIVO = '2'
FAMILIA_CAPITAL = '3'
FAMILIA_INGRESOS = '4'
FAMILIA_GASTOS = '6'

@router.get("/paquete-fiscal")
def obtener_paquete_fiscal(
    mes: int,
    anio: int,
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_usuario(db, empresa_id, current_user.id)
    validar_periodo(mes, anio)
    return generar_paquete_informes(db, empresa_id, mes, anio)


@router.get("/financiero")
def obtener_resumen_financiero(
    mes: int,
    anio: int,
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):

    # VALIDAR EMPRESA DEL USUARIO
    validar_empresa_usuario(
        db,
        empresa_id,
        current_user.id
    )

    # VALIDAR PERIODO
    validar_periodo(
        mes,
        anio
    )

    # CONSULTA CONTABLE
    resultados = db.query(
        func.substring(
            MovimientoPoliza.cuenta,
            1,
            1
        ).label("familia_cuenta"),

        func.sum(
            MovimientoPoliza.debe
        ).label("total_debe"),

        func.sum(
            MovimientoPoliza.haber
        ).label("total_haber")

    ).join(Poliza).filter(

        Poliza.empresa_id == empresa_id,
        Poliza.mes == mes,
        Poliza.anio == anio

    ).group_by(
        func.substring(
            MovimientoPoliza.cuenta,
            1,
            1
        )
    ).all()

    # ─────────────────────────────────────
    # Procesamiento de KPIs
    # ─────────────────────────────────────
    total_ingresos = 0.0
    total_gastos = 0.0

    detalle_por_categoria = []

    nombres_familias = {
        FAMILIA_ACTIVO: "Activo",
        FAMILIA_PASIVO: "Pasivo",
        FAMILIA_CAPITAL: "Capital",
        FAMILIA_INGRESOS: "Ingresos",
        FAMILIA_GASTOS: "Gastos",
    }

    for r in resultados:
        categoria = nombres_familias.get(
            r.familia_cuenta,
            "Otros"
        )

        cargos = round(
            float(r.total_debe or 0),
            2
        )

        abonos = round(
            float(r.total_haber or 0),
            2
        )

        detalle_por_categoria.append({
            "categoria": categoria,
            "cargos": cargos,
            "abonos": abonos
        })

        # KPIs
        if r.familia_cuenta == FAMILIA_INGRESOS:
            total_ingresos += abonos

        elif r.familia_cuenta == FAMILIA_GASTOS:
            total_gastos += cargos

    utilidad_bruta = round(
        total_ingresos - total_gastos,
        2
    )

    # ─────────────────────────────────────
    # Respuesta final
    # ─────────────────────────────────────
    return {
        "mes": mes,
        "anio": anio,

        "resumen_kpi": {
            "total_ingresos": round(total_ingresos, 2),
            "total_gastos": round(total_gastos, 2),
            "utilidad_bruta": utilidad_bruta
        },

        "detalle_por_categoria": detalle_por_categoria
    }


@router.get("/desglose-gastos")
def obtener_desglose_gastos(
    mes: int,
    anio: int,
    empresa_id: int,
    db: Session = Depends(get_db)
):
    # ─────────────────────────────────────
    # Validaciones
    # ─────────────────────────────────────
    if mes < 1 or mes > 12:
        raise HTTPException(
            status_code=400,
            detail="Mes inválido"
        )

    if anio < 2000 or anio > 2100:
        raise HTTPException(
            status_code=400,
            detail="Año inválido"
        )

    # ─────────────────────────────────────
    # Consulta de gastos
    # ─────────────────────────────────────
    gastos = db.query(
        MovimientoPoliza.nombre_cuenta,

        func.sum(
            MovimientoPoliza.debe
        ).label("total_gasto")

    ).join(
        Poliza

    ).filter(
        Poliza.empresa_id == empresa_id,
        Poliza.mes == mes,
        Poliza.anio == anio,

        MovimientoPoliza.cuenta.like('6%')

    ).group_by(
        MovimientoPoliza.nombre_cuenta

    ).order_by(
        func.sum(
            MovimientoPoliza.debe
        ).desc()

    ).all()

    # ─────────────────────────────────────
    # Formateo
    # ─────────────────────────────────────
    reporte_gastos = [
        {
            "categoria_gasto": g.nombre_cuenta,
            "total": round(
                float(g.total_gasto or 0),
                2
            )
        }
        for g in gastos
    ]

    # ─────────────────────────────────────
    # Respuesta final
    # ─────────────────────────────────────
    return {
        "mes": mes,
        "anio": anio,
        "desglose_gastos": reporte_gastos
    }

@router.get("/kpis")
def obtener_kpis(
    mes: int,
    anio: int,
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):

    # ─────────────────────────────────────
    # VALIDAR EMPRESA DEL USUARIO
    # ─────────────────────────────────────
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == current_user.id
    ).first()

    if not empresa:
        raise HTTPException(
            status_code=403,
            detail="No tienes acceso a esta empresa"
        )

    # ─────────────────────────────────────
    # VALIDAR MES
    # ─────────────────────────────────────
    if mes < 1 or mes > 12:
        raise HTTPException(
            status_code=400,
            detail="Mes inválido"
        )

    # ─────────────────────────────────────
    # VALIDAR AÑO
    # ─────────────────────────────────────
    if anio < 2000 or anio > 2100:
        raise HTTPException(
            status_code=400,
            detail="Año inválido"
        )

    # ─────────────────────────────────────
    # INGRESOS
    # ─────────────────────────────────────
    ingresos = db.query(
        func.sum(MovimientoPoliza.haber)
    ).join(
        Poliza
    ).filter(
        Poliza.empresa_id == empresa_id,
        Poliza.mes == mes,
        Poliza.anio == anio,
        MovimientoPoliza.cuenta.like('4%')
    ).scalar() or 0

    # ─────────────────────────────────────
    # GASTOS
    # ─────────────────────────────────────
    gastos = db.query(
        func.sum(MovimientoPoliza.debe)
    ).join(
        Poliza
    ).filter(
        Poliza.empresa_id == empresa_id,
        Poliza.mes == mes,
        Poliza.anio == anio,
        MovimientoPoliza.cuenta.like('6%')
    ).scalar() or 0

    # ─────────────────────────────────────
    # IVA TRASLADADO
    # ─────────────────────────────────────
    iva_trasladado = db.query(
        func.sum(MovimientoPoliza.haber)
    ).join(
        Poliza
    ).filter(
        Poliza.empresa_id == empresa_id,
        Poliza.mes == mes,
        Poliza.anio == anio,
        MovimientoPoliza.cuenta.like('216.01%')
    ).scalar() or 0

    # ─────────────────────────────────────
    # IMPUESTOS LOCALES
    # ─────────────────────────────────────
    impuestos_locales = db.query(
        func.sum(MovimientoPoliza.haber)
    ).join(
        Poliza
    ).filter(
        Poliza.empresa_id == empresa_id,
        Poliza.mes == mes,
        Poliza.anio == anio,
        MovimientoPoliza.cuenta.like('216.04%')
    ).scalar() or 0

    # ─────────────────────────────────────
    # FACTURAS EMITIDAS
    # ─────────────────────────────────────
    facturas_emitidas = db.query(
        func.count(Poliza.id) # pylint: disable=not-callable
    ).filter(
        Poliza.empresa_id == empresa_id,
        Poliza.mes == mes,
        Poliza.anio == anio
    ).scalar() or 0

    # ─────────────────────────────────────
    # CÁLCULOS
    # ─────────────────────────────────────
    ingresos = round(
        float(ingresos),
        2
    )

    gastos = round(
        float(gastos),
        2
    )

    utilidad = round(
        ingresos - gastos,
        2
    )

    margen_utilidad = 0

    if ingresos > 0:
        margen_utilidad = round(
            (utilidad / ingresos) * 100,
            2
        )

    iva_trasladado = round(
        float(iva_trasladado),
        2
    )

    impuestos_locales = round(
        float(impuestos_locales),
        2
    )

    iva_estimado = round(
        iva_trasladado * 0.16,
        2
    )

    # ─────────────────────────────────────
    # RESPUESTA FINAL
    # ─────────────────────────────────────
    return {
        "mes": mes,
        "anio": anio,

        "kpis": {

            "ingresos_mes": ingresos,

            "gastos_mes": gastos,

            "utilidad": utilidad,

            "margen_utilidad": margen_utilidad,

            "iva_trasladado": iva_trasladado,

            "impuestos_locales": impuestos_locales,

            "iva_estimado": iva_estimado,

            "facturas_emitidas": facturas_emitidas
        }
    }

@router.get("/global-kpis")
def obtener_kpis_globales(
    mes: int,
    anio: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    # Sumamos ingresos y gastos de todas las empresas del usuario en el mes/año
    ingresos = db.query(func.sum(MovimientoPoliza.haber)).join(Poliza).join(Empresa).filter(
        Empresa.usuario_id == current_user.id,
        Poliza.mes == mes,
        Poliza.anio == anio,
        MovimientoPoliza.cuenta.like('4%')
    ).scalar() or 0

    gastos = db.query(func.sum(MovimientoPoliza.debe)).join(Poliza).join(Empresa).filter(
        Empresa.usuario_id == current_user.id,
        Poliza.mes == mes,
        Poliza.anio == anio,
        MovimientoPoliza.cuenta.like('6%')
    ).scalar() or 0

    return {
        "ingresos": round(float(ingresos), 2),
        "gastos": round(float(gastos), 2),
        "utilidad": round(float(ingresos - gastos), 2)
    }

@router.get("/tendencias")
def obtener_tendencias(
    anio: int,
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    validar_empresa_usuario(db, empresa_id, current_user.id)

    # Una sola consulta eficiente que agrupa por mes
    datos = db.query(
        Poliza.mes,
        func.sum(case((MovimientoPoliza.cuenta.like('4%'), MovimientoPoliza.haber), else_=0)).label("ingresos"),
        func.sum(case((MovimientoPoliza.cuenta.like('6%'), MovimientoPoliza.debe), else_=0)).label("gastos")
    ).join(MovimientoPoliza).filter(
        Poliza.empresa_id == empresa_id,
        Poliza.anio == anio
    ).group_by(Poliza.mes).all()

    # Convertimos los resultados en un diccionario para acceso rápido
    mapa_datos = {d.mes: {"ingresos": float(d.ingresos or 0), "gastos": float(d.gastos or 0)} for d in datos}

    # Completamos los 12 meses
    resultados =[]
    for mes in range(1, 13):
        data = mapa_datos.get(mes, {"ingresos": 0, "gastos": 0})
        ingresos = round(data["ingresos"], 2)
        gastos = round(data["gastos"], 2)
        
        resultados.append({
            "mes": mes,
            "ingresos": ingresos,
            "gastos": gastos,
            "utilidad": round(ingresos - gastos, 2)
        })

    return {"anio": anio, "tendencias": resultados}