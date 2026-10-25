"""Detalles documentales de solo lectura para trazabilidad fiscal."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.factura import Factura
from app.services.calculos_fiscales import (
    _es_emitido,
    _facturas_del_periodo,
    _facturas_hasta_periodo,
    _moneda,
    _resumen_iva,
    _resumen_isr,
    _rfc_empresa,
)


def _f(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value.quantize(Decimal("0.01")))
    return float(value or 0)


def _tipo_comprobante(factura: Factura) -> str:
    raw = getattr(getattr(factura, "tipo_comprobante", ""), "value", factura.tipo_comprobante)
    return str(raw or "").upper()


def _fecha_iso(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _polizas_vinculadas(factura: Factura) -> list[dict[str, Any]]:
    resultado: list[dict[str, Any]] = []
    for poliza in getattr(factura, "polizas", None) or []:
        resultado.append(
            {
                "id": getattr(poliza, "id", None),
                "tipo": getattr(getattr(poliza, "tipo", None), "value", poliza.tipo if hasattr(poliza, "tipo") else None),
                "numero": getattr(poliza, "numero", None),
                "total": _f(getattr(poliza, "total", 0)),
            }
        )
    return resultado


def serializar_cfdi(factura: Factura, rfc_empresa: str) -> dict[str, Any]:
    tipo = _tipo_comprobante(factura)
    emitido = _es_emitido(factura, rfc_empresa)
    return {
        "id": factura.id,
        "uuid": factura.uuid,
        "serie": factura.serie,
        "folio": factura.folio,
        "tipo_comprobante": tipo,
        "fecha_emision": _fecha_iso(factura.fecha_emision),
        "rfc_emisor": factura.rfc_emisor,
        "nombre_emisor": factura.nombre_emisor,
        "rfc_receptor": factura.rfc_receptor,
        "nombre_receptor": factura.nombre_receptor,
        "concepto": getattr(factura, "concepto", None),
        "subtotal": _f(_moneda(factura.subtotal)),
        "iva_trasladado": _f(_moneda(factura.iva_trasladado)),
        "iva_retenido": _f(_moneda(factura.iva_retenido)),
        "isr_retenido": _f(_moneda(factura.isr_retenido)),
        "impuestos_locales": _f(_moneda(getattr(factura, "impuestos_locales", 0))),
        "total": _f(_moneda(factura.total)),
        "estatus": getattr(getattr(factura, "estatus", None), "value", factura.estatus),
        "es_deducible": bool(getattr(factura, "es_deducible", True)),
        "emitido_por_empresa": emitido,
        "origen": "cfdi",
        "polizas_vinculadas": _polizas_vinculadas(factura),
    }


def _resumen_a_dict(resumen: dict) -> dict[str, float]:
    return {clave: _f(valor) for clave, valor in resumen.items()}


def _integracion_iva(periodo: dict[str, float]) -> list[dict[str, Any]]:
    return [
        {"paso": 1, "concepto": "IVA trasladado (CFDI emitidos)", "importe": periodo["iva_trasladado"], "signo": "+"},
        {"paso": 2, "concepto": "IVA acreditable (CFDI recibidos)", "importe": periodo["iva_acreditable"], "signo": "-"},
        {"paso": 3, "concepto": "IVA retenido", "importe": periodo["iva_retenido"], "signo": "-"},
        {"paso": 4, "concepto": "ISH / impuestos locales", "importe": periodo.get("ish", 0.0), "signo": "+"},
        {"paso": 5, "concepto": "IVA a cargo del periodo", "importe": periodo["iva_a_cargo"], "signo": "="},
        {"paso": 6, "concepto": "Saldo a favor", "importe": periodo["saldo_a_favor"], "signo": "="},
    ]


def construir_detalle_iva(db: Session, empresa_id: int, mes: int, anio: int) -> dict[str, Any]:
    rfc = _rfc_empresa(db, empresa_id)
    facturas_periodo = _facturas_del_periodo(db, empresa_id, mes, anio)
    facturas_acumulado = _facturas_hasta_periodo(db, empresa_id, mes, anio)
    resumen_periodo = _resumen_iva(facturas_periodo, rfc)
    resumen_acumulado = _resumen_iva(facturas_acumulado, rfc)
    periodo_dict = _resumen_a_dict(resumen_periodo)
    acumulado_dict = _resumen_a_dict(resumen_acumulado)

    cfdi_ingresos = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _tipo_comprobante(f) in ("I", "E") and _es_emitido(f, rfc)
    ]
    cfdi_egresos = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _tipo_comprobante(f) in ("I", "E") and not _es_emitido(f, rfc)
    ]
    cfdi_retenciones_iva = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _f(_moneda(f.iva_retenido)) > 0
    ]
    cfdi_ish = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _f(_moneda(getattr(f, "impuestos_locales", 0))) != 0
    ]

    polizas_ids = sorted(
        {
            poliza["id"]
            for cfdi in cfdi_ingresos + cfdi_egresos
            for poliza in cfdi["polizas_vinculadas"]
            if poliza.get("id") is not None
        }
    )

    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "rfc_empresa": rfc or None,
        "origen": "cfdi",
        "totales_periodo": periodo_dict,
        "totales_acumulado": acumulado_dict,
        "integracion": _integracion_iva(periodo_dict),
        "cfdi_ingresos": cfdi_ingresos,
        "cfdi_egresos": cfdi_egresos,
        "cfdi_con_retenciones_iva": cfdi_retenciones_iva,
        "cfdi_con_ish": cfdi_ish,
        "polizas_vinculadas": polizas_ids,
        "criterio": (
            "Detalle documental de solo lectura del IVA del periodo. "
            "Reutiliza las mismas consultas y agregados del motor fiscal; "
            "no recalcula ni modifica resultados."
        ),
    }
def _integracion_isr(periodo: dict[str, float]) -> list[dict[str, Any]]:
    return [
        {"paso": 1, "concepto": "Ingresos acumulados (CFDI emitidos)", "importe": periodo["ingresos_acumulados"], "signo": "+"},
        {"paso": 2, "concepto": "Deducciones acumuladas (CFDI recibidos)", "importe": periodo["deducciones_acumuladas"], "signo": "-"},
        {"paso": 3, "concepto": "Base gravable", "importe": periodo["base_gravable"], "signo": "="},
        {"paso": 4, "concepto": "Retenciones ISR", "importe": periodo["retenciones_isr"], "signo": "-"},
    ]


def construir_detalle_isr(db: Session, empresa_id: int, mes: int, anio: int) -> dict[str, Any]:
    rfc = _rfc_empresa(db, empresa_id)
    facturas_periodo = _facturas_del_periodo(db, empresa_id, mes, anio)
    facturas_acumulado = _facturas_hasta_periodo(db, empresa_id, mes, anio)
    resumen_periodo = _resumen_isr(facturas_periodo, rfc)
    resumen_acumulado = _resumen_isr(facturas_acumulado, rfc)
    periodo_dict = _resumen_a_dict(resumen_periodo)
    acumulado_dict = _resumen_a_dict(resumen_acumulado)

    cfdi_ingresos = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _tipo_comprobante(f) in ("I", "E") and _es_emitido(f, rfc)
    ]
    cfdi_deducciones = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _tipo_comprobante(f) in ("I", "E")
        and not _es_emitido(f, rfc)
        and bool(getattr(f, "es_deducible", True))
    ]
    cfdi_con_retenciones_isr = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _f(_moneda(f.isr_retenido)) > 0
    ]
    cfdi_no_deducibles = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _tipo_comprobante(f) in ("I", "E")
        and not _es_emitido(f, rfc)
        and not bool(getattr(f, "es_deducible", True))
    ]

    polizas_ids = sorted(
        {
            poliza["id"]
            for cfdi in cfdi_ingresos + cfdi_deducciones
            for poliza in cfdi["polizas_vinculadas"]
            if poliza.get("id") is not None
        }
    )

    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "rfc_empresa": rfc or None,
        "origen": "cfdi",
        "totales_periodo": periodo_dict,
        "totales_acumulado": acumulado_dict,
        "integracion": _integracion_isr(periodo_dict),
        "cfdi_ingresos": cfdi_ingresos,
        "cfdi_deducciones": cfdi_deducciones,
        "cfdi_con_retenciones_isr": cfdi_con_retenciones_isr,
        "cfdi_no_deducibles": cfdi_no_deducibles,
        "polizas_vinculadas": polizas_ids,
        "criterio": (
            "Detalle documental de solo lectura del ISR provisional del periodo. "
            "Reutiliza las mismas consultas y agregados del motor fiscal; "
            "no recalcula ni modifica resultados."
        ),
    }


def construir_detalle_retenciones(db: Session, empresa_id: int, mes: int, anio: int) -> dict[str, Any]:
    rfc = _rfc_empresa(db, empresa_id)
    facturas_periodo = _facturas_del_periodo(db, empresa_id, mes, anio)
    resumen_iva = _resumen_iva(facturas_periodo, rfc)
    resumen_isr = _resumen_isr(facturas_periodo, rfc)

    cfdi_iva_retenido = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _f(_moneda(f.iva_retenido)) > 0
    ]
    cfdi_isr_retenido = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _f(_moneda(f.isr_retenido)) > 0
    ]

    total_iva_retenido = _f(resumen_iva["iva_retenido"])
    total_isr_retenido = _f(resumen_isr["retenciones_isr"])

    polizas_ids = sorted(
        {
            poliza["id"]
            for cfdi in cfdi_iva_retenido + cfdi_isr_retenido
            for poliza in cfdi["polizas_vinculadas"]
            if poliza.get("id") is not None
        }
    )

    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "rfc_empresa": rfc or None,
        "origen": "cfdi",
        "totales": {
            "iva_retenido": total_iva_retenido,
            "isr_retenido": total_isr_retenido,
            "total_retenciones": round(total_iva_retenido + total_isr_retenido, 2),
        },
        "integracion": [
            {"paso": 1, "concepto": "IVA retenido en CFDI", "importe": total_iva_retenido, "signo": "+"},
            {"paso": 2, "concepto": "ISR retenido en CFDI", "importe": total_isr_retenido, "signo": "+"},
            {"paso": 3, "concepto": "Total retenciones", "importe": round(total_iva_retenido + total_isr_retenido, 2), "signo": "="},
        ],
        "cfdi_con_retencion_iva": cfdi_iva_retenido,
        "cfdi_con_retencion_isr": cfdi_isr_retenido,
        "polizas_vinculadas": polizas_ids,
        "criterio": (
            "Detalle documental de solo lectura de las retenciones detectadas en CFDI. "
            "Reutiliza las mismas consultas y agregados del motor fiscal; "
            "no recalcula ni modifica resultados."
        ),
    }


def construir_detalle_ish(db: Session, empresa_id: int, mes: int, anio: int) -> dict[str, Any]:
    rfc = _rfc_empresa(db, empresa_id)
    facturas_periodo = _facturas_del_periodo(db, empresa_id, mes, anio)
    resumen = _resumen_iva(facturas_periodo, rfc)

    cfdi_con_ish = [
        serializar_cfdi(f, rfc)
        for f in facturas_periodo
        if _f(_moneda(getattr(f, "impuestos_locales", 0))) != 0
    ]

    total_ish = _f(resumen["ish"])

    polizas_ids = sorted(
        {
            poliza["id"]
            for cfdi in cfdi_con_ish
            for poliza in cfdi["polizas_vinculadas"]
            if poliza.get("id") is not None
        }
    )

    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "rfc_empresa": rfc or None,
        "origen": "cfdi",
        "totales": {
            "ish": total_ish,
            "cfdi_con_ish": len(cfdi_con_ish),
        },
        "integracion": [
            {"paso": 1, "concepto": "Impuestos locales (ISH) en CFDI emitidos", "importe": total_ish, "signo": "+"},
            {"paso": 2, "concepto": "ISH acumulado del periodo", "importe": total_ish, "signo": "="},
        ],
        "cfdi_con_ish": cfdi_con_ish,
        "polizas_vinculadas": polizas_ids,
        "criterio": (
            "Detalle documental de solo lectura del ISH cobrado en CFDI. "
            "Reutiliza las mismas consultas y agregados del motor fiscal; "
            "no recalcula ni modifica resultados."
        ),
    }
