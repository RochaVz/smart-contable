from fastapi import APIRouter, Depends, HTTPException
from app.core.dependencies import get_current_user
from app.models.usuario import Usuario
from app.models.empresa import Empresa
from sqlalchemy import func, case
from sqlalchemy.orm import Session
from sqlalchemy import distinct

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
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    validar_empresa_usuario(db, empresa_id, current_user.id)
    validar_periodo(mes, anio)

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
    # 1. Validaciones centralizadas usando las utilidades del core
    validar_empresa_usuario(db, empresa_id, current_user.id)
    validar_periodo(mes, anio)

    # 2. Consulta unificada mediante agregación condicional (case)
    # Añadimos el comentario para que Pylint ignore el falso positivo en la generación de funciones SQL.
    datos = db.query(
        func.sum(case((MovimientoPoliza.cuenta.like('4%'), MovimientoPoliza.haber), else_=0)).label("ingresos"),
        func.sum(case((MovimientoPoliza.cuenta.like('6%'), MovimientoPoliza.debe), else_=0)).label("gastos"),
        func.sum(case((MovimientoPoliza.cuenta.like('216.01%'), MovimientoPoliza.haber), else_=0)).label("iva_trasladado"),
        func.sum(case((MovimientoPoliza.cuenta.like('216.04%'), MovimientoPoliza.haber), else_=0)).label("impuestos_locales"),
        func.count(func.distinct(Poliza.factura_id)).label("facturas_emitidas")  # pylint: disable=not-callable
    ).select_from(Poliza).join(MovimientoPoliza).filter(
        Poliza.empresa_id == empresa_id,
        Poliza.mes == mes,
        Poliza.anio == anio
    ).first()

    # 3. Formateo y operaciones aritméticas seguras en memoria
    ingresos_monto = round(float(datos.ingresos or 0), 2)
    gastos_monto = round(float(datos.gastos or 0), 2)
    utilidad = round(ingresos_monto - gastos_monto, 2)

    margen_utilidad = 0.0
    if ingresos_monto > 0:
        margen_utilidad = round((utilidad / ingresos_monto) * 100, 2)

    iva_trasladado = round(float(datos.iva_trasladado or 0), 2)
    impuestos_locales = round(float(datos.impuestos_locales or 0), 2)

    return {
        "mes": mes,
        "anio": anio,
        "kpis": {
            "ingresos_mes": ingresos_monto,
            "gastos_mes": gastos_monto,
            "utilidad": utilidad,
            "margen_utilidad": margen_utilidad,
            "iva_trasladado": iva_trasladado,
            "impuestos_locales": impuestos_locales,
            "iva_estimado": round(iva_trasladado * 0.16, 2),
            "facturas_emitidas": datos.facturas_emitidas or 0
        }
    }

@router.get("/global-kpis")
def obtener_kpis_globales(
    mes: int,
    anio: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    # 1. Validación del período de consulta
    validar_periodo(mes, anio)

    # 2. Una sola consulta eficiente que cruza Empresa -> Poliza -> Movimiento
    datos = db.query(
        func.sum(case((MovimientoPoliza.cuenta.like('4%'), MovimientoPoliza.haber), else_=0)).label("ingresos"),
        func.sum(case((MovimientoPoliza.cuenta.like('6%'), MovimientoPoliza.debe), else_=0)).label("gastos")
    ).select_from(MovimientoPoliza).join(Poliza).join(Empresa).filter(
        Empresa.usuario_id == current_user.id,
        Poliza.mes == mes,
        Poliza.anio == anio
    ).first()

    # 3. Formateo de montos
    ingresos_monto = round(float(datos.ingresos or 0), 2)
    gastos_monto = round(float(datos.gastos or 0), 2)

    return {
        "ingresos": ingresos_monto,
        "gastos": gastos_monto,
        "utilidad": round(ingresos_monto - gastos_monto, 2)
    }
