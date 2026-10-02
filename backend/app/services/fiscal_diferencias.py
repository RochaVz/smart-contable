"""Comparacion de fuentes: CFDI vs polizas vs calculo fiscal del periodo."""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import extract, func
from sqlalchemy.orm import Session

from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.poliza import MovimientoPoliza, Poliza, TipoPoliza
from app.services.calculos_fiscales import calcular_isr_provisional, calcular_iva_provisional
from app.services.cfdi_helpers import es_venta
from app.services.diot import construir_diot

CENTAVOS = Decimal("0.01")


def _m(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def _f(v: Decimal) -> float:
    return float(v.quantize(CENTAVOS))


def _diff(a: Decimal, b: Decimal) -> dict:
    d = (a - b).quantize(CENTAVOS)
    return {
        "izquierda": _f(a),
        "derecha": _f(b),
        "diferencia": _f(d),
        "coincide": abs(d) <= Decimal("0.05"),
    }


def comparar_fuentes_fiscales(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
) -> dict:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    rfc = (empresa.rfc or "").strip().upper() if empresa else ""

    facturas = (
        db.query(Factura)
        .filter(
            Factura.empresa_id == empresa_id,
            extract("year", Factura.fecha_emision) == anio,
            extract("month", Factura.fecha_emision) == mes,
        )
        .all()
    )

    cfdi_ingreso_sub = Decimal("0")
    cfdi_ingreso_iva = Decimal("0")
    cfdi_egreso_sub = Decimal("0")
    cfdi_egreso_iva = Decimal("0")
    cfdi_count_i = 0
    cfdi_count_e = 0
    for fac in facturas:
        tipo = getattr(getattr(fac, "tipo_comprobante", ""), "value", fac.tipo_comprobante)
        tipo = str(tipo or "").upper()
        if tipo == "I" and es_venta(fac, rfc):
            cfdi_ingreso_sub += _m(fac.subtotal)
            cfdi_ingreso_iva += _m(fac.iva_trasladado)
            cfdi_count_i += 1
        elif tipo == "E" and not es_venta(fac, rfc):
            cfdi_egreso_sub += _m(fac.subtotal)
            cfdi_egreso_iva += _m(fac.iva_trasladado)
            cfdi_count_e += 1

    polizas = (
        db.query(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
        )
        .all()
    )
    poliza_ingreso = sum((_m(p.total) for p in polizas if p.tipo == TipoPoliza.ingreso), Decimal("0"))
    poliza_egreso = sum((_m(p.total) for p in polizas if p.tipo == TipoPoliza.egreso), Decimal("0"))
    poliza_diario = sum((_m(p.total) for p in polizas if p.tipo == TipoPoliza.diario), Decimal("0"))

    iva_trasladado_pol = (
        db.query(func.coalesce(func.sum(MovimientoPoliza.haber), 0))
        .join(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            MovimientoPoliza.cuenta.like("216.01%"),
        )
        .scalar()
    )
    iva_acreditable_pol = (
        db.query(func.coalesce(func.sum(MovimientoPoliza.debe), 0))
        .join(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            MovimientoPoliza.cuenta.like("118.01%"),
        )
        .scalar()
    )
    iva_trasladado_pol = _m(iva_trasladado_pol)
    iva_acreditable_pol = _m(iva_acreditable_pol)

    iva_calc = calcular_iva_provisional(db, empresa_id, mes, anio)
    isr_calc = calcular_isr_provisional(db, empresa_id, mes, anio)
    diot = construir_diot(db, empresa_id, mes, anio)

    per_iva = iva_calc.get("periodo_actual") or {}
    fiscal_iva_tras = _m(per_iva.get("iva_trasladado"))
    fiscal_iva_acr = _m(per_iva.get("iva_acreditable"))
    fiscal_ingresos = _m(isr_calc.get("ingresos_acumulados"))  # acumulado YTD
    # Para periodo solo CFDI del mes en ingresos:
    fiscal_base_mes_ing = cfdi_ingreso_sub
    fiscal_base_mes_egr = cfdi_egreso_sub

    pendientes = []
    if isr_calc.get("parametros_faltantes"):
        pendientes.extend([f"isr:{p}" for p in isr_calc["parametros_faltantes"]])
    if diot.get("bloqueado_por_incompletos"):
        pendientes.append("diot:datos_incompletos")
    if isr_calc.get("estatus") != "estimado":
        pendientes.append("isr:requiere_parametros")

    diferencias = {
        "iva_trasladado_cfdi_vs_fiscal": _diff(cfdi_ingreso_iva, fiscal_iva_tras),
        "iva_acreditable_cfdi_vs_fiscal": _diff(cfdi_egreso_iva, fiscal_iva_acr),
        "iva_trasladado_cfdi_vs_polizas": _diff(cfdi_ingreso_iva, iva_trasladado_pol),
        "iva_acreditable_cfdi_vs_polizas": _diff(cfdi_egreso_iva, iva_acreditable_pol),
        "iva_trasladado_fiscal_vs_polizas": _diff(fiscal_iva_tras, iva_trasladado_pol),
        "iva_acreditable_fiscal_vs_polizas": _diff(fiscal_iva_acr, iva_acreditable_pol),
        "totales_egreso_cfdi_vs_polizas": _diff(
            cfdi_egreso_sub + cfdi_egreso_iva,
            poliza_egreso,
        ),
        "totales_ingreso_cfdi_vs_polizas_diario": _diff(
            cfdi_ingreso_sub + cfdi_ingreso_iva,
            poliza_diario if poliza_diario > 0 else poliza_ingreso,
        ),
    }

    alertas = [
        {"clave": k, "mensaje": f"Desvio en {k.replace('_', ' ')}", **v}
        for k, v in diferencias.items()
        if not v["coincide"]
    ]

    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "rfc_empresa": rfc or None,
        "cfdi": {
            "facturas_ingreso": cfdi_count_i,
            "facturas_egreso": cfdi_count_e,
            "ingresos_subtotal": _f(cfdi_ingreso_sub),
            "ingresos_iva": _f(cfdi_ingreso_iva),
            "egresos_subtotal": _f(cfdi_egreso_sub),
            "egresos_iva": _f(cfdi_egreso_iva),
            "ingresos_total": _f(cfdi_ingreso_sub + cfdi_ingreso_iva),
            "egresos_total": _f(cfdi_egreso_sub + cfdi_egreso_iva),
        },
        "polizas": {
            "count": len(polizas),
            "total_diario": _f(poliza_diario),
            "total_ingreso": _f(poliza_ingreso),
            "total_egreso": _f(poliza_egreso),
            "iva_trasladado_cuentas": _f(iva_trasladado_pol),
            "iva_acreditable_cuentas": _f(iva_acreditable_pol),
        },
        "calculo_fiscal": {
            "iva": per_iva,
            "isr_estatus": isr_calc.get("estatus"),
            "isr_parametros_faltantes": isr_calc.get("parametros_faltantes") or [],
            "isr_estimado": isr_calc.get("isr_estimado"),
            "isr_base_gravable": isr_calc.get("base_gravable"),
            "diot_exportable": diot.get("exportable"),
            "diot_incompletos": diot.get("totales", {}).get("proveedores_incompletos", 0),
            "ingresos_ytd_isr": _f(fiscal_ingresos),
            "base_mes_ingresos_cfdi": _f(fiscal_base_mes_ing),
            "base_mes_egresos_cfdi": _f(fiscal_base_mes_egr),
        },
        "diferencias": diferencias,
        "alertas": alertas,
        "pendientes": pendientes,
        "estado_general": "ok" if not alertas and not pendientes else ("pendiente" if pendientes else "desvios"),
        "criterio": (
            "Compara CFDI del mes, totales de polizas del periodo y el motor fiscal (IVA/ISR/DIOT). "
            "Tolerancia 0.05 MXN. Desvios requieren revision contable."
        ),
    }
