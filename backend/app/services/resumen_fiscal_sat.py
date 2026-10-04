"""Resumen informativo del motor fiscal SAT (ISR, IVA, retenciones y calendario)."""

from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.sat_fiscal import SAT_REGIMEN_RULES, SatRegimenEnum
from app.models.empresa import Empresa
from app.services.calculos_fiscales import calcular_isr_provisional, calcular_iva_provisional


MESES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _ultimo_dia_habil_aproximado(anio: int, mes: int, dia_limite: int = 17) -> date:
    """Aproxima el día de vencimiento (sin calendario oficial de días inhábiles SAT)."""
    ultimo = monthrange(anio, mes)[1]
    dia = min(dia_limite, ultimo)
    return date(anio, mes, dia)


def _periodo_siguiente(mes: int, anio: int) -> tuple[int, int]:
    if mes == 12:
        return 1, anio + 1
    return mes + 1, anio


def _regimen_rules(empresa: Empresa | None) -> dict:
    if not empresa or not empresa.regimen_fiscal:
        return {}
    clave = str(empresa.regimen_fiscal).strip()
    try:
        return SAT_REGIMEN_RULES.get(SatRegimenEnum(clave), {})
    except ValueError:
        # soportar 626 sin sufijo
        if clave == "626":
            if (empresa.tipo_persona or "").lower() == "moral":
                return SAT_REGIMEN_RULES.get(SatRegimenEnum.resico_pm, {})
            return SAT_REGIMEN_RULES.get(SatRegimenEnum.resico_pf, {})
        return {}


def _periodicidad_declaraciones(empresa: Empresa | None, rules: dict) -> list[dict]:
    regimen = str(getattr(empresa, "regimen_fiscal", "") or "")
    items = [
        {
            "tipo": "IVA",
            "periodicidad": "mensual",
            "descripcion": "Declaración mensual de IVA (pago definitivo).",
            "base_legal": "Art. 5-D LIVA",
        },
        {
            "tipo": "ISR",
            "periodicidad": "mensual",
            "descripcion": "Pago provisional de ISR del mes.",
            "base_legal": "Art. 14 / 106 LISR (según régimen)",
        },
    ]

    if rules.get("exige_diot"):
        items.append({
            "tipo": "DIOT",
            "periodicidad": "mensual",
            "descripcion": "Informativa de operaciones con terceros (DIOT).",
            "base_legal": "Art. 32 LIVA",
        })

    if regimen in {"621"}:  # RIF histórico / bimestral
        items = [
            {
                "tipo": "ISR+IVA",
                "periodicidad": "bimestral",
                "descripcion": "Declaración bimestral consolidada (régimen de incorporación).",
                "base_legal": "RIF / reglas vigentes",
            }
        ]

    items.append({
        "tipo": "ISR anual",
        "periodicidad": "anual",
        "descripcion": (
            "Declaración anual de personas físicas (abril) o morales (marzo), "
            "según tipo de persona."
        ),
        "base_legal": "Arts. 150 / 76 LISR",
        "mes_presentacion": (
            "Abril del ejercicio siguiente"
            if (getattr(empresa, "tipo_persona", "") or "").lower() != "moral"
            else "Marzo del ejercicio siguiente"
        ),
    })
    return items


def construir_resumen_fiscal_sat(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
) -> dict:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    rules = _regimen_rules(empresa)

    isr = calcular_isr_provisional(db, empresa_id, mes, anio)
    iva = calcular_iva_provisional(db, empresa_id, mes, anio)

    mes_venc, anio_venc = _periodo_siguiente(mes, anio)
    vencimiento = _ultimo_dia_habil_aproximado(anio_venc, mes_venc, 17)

    isr_a_cargo = float(Decimal(str(isr.get("isr_a_cargo") or isr.get("isr_causado") or 0)))
    iva_a_cargo = float(Decimal(str(iva.get("iva_a_cargo") or iva.get("saldo_a_cargo") or 0)))
    iva_a_favor = float(Decimal(str(iva.get("iva_a_favor") or iva.get("saldo_a_favor") or 0)))
    ret_isr = float(Decimal(str(
        isr.get("isr_retenido")
        or isr.get("retenciones_isr")
        or iva.get("isr_retenido")
        or 0
    )))
    ret_iva = float(Decimal(str(
        iva.get("iva_retenido")
        or iva.get("retenciones_iva")
        or isr.get("iva_retenido")
        or 0
    )))

    declaraciones = _periodicidad_declaraciones(empresa, rules)
    sugerencias_pago: list[dict] = []

    if isr_a_cargo > 0:
        sugerencias_pago.append({
            "concepto": "ISR provisional",
            "monto_estimado": round(isr_a_cargo, 2),
            "vencimiento": vencimiento.isoformat(),
            "periodicidad": "mensual",
            "nota": "Estimación con base en CFDIs y parámetros del régimen. Verifica en el portal del SAT.",
        })
    if iva_a_cargo > 0:
        sugerencias_pago.append({
            "concepto": "IVA a cargo",
            "monto_estimado": round(iva_a_cargo, 2),
            "vencimiento": vencimiento.isoformat(),
            "periodicidad": "mensual",
            "nota": "IVA trasladado menos acreditable del periodo (informativo).",
        })
    elif iva_a_favor > 0:
        sugerencias_pago.append({
            "concepto": "IVA a favor",
            "monto_estimado": round(iva_a_favor, 2),
            "vencimiento": None,
            "periodicidad": "mensual",
            "nota": "Saldo a favor estimado; puedes acreditarlo en periodos siguientes o solicitar devolución.",
        })

    if ret_isr > 0 or ret_iva > 0:
        sugerencias_pago.append({
            "concepto": "Entero de retenciones",
            "monto_estimado": round(ret_isr + ret_iva, 2),
            "vencimiento": vencimiento.isoformat(),
            "periodicidad": "mensual",
            "nota": f"ISR retenido ${ret_isr:,.2f} + IVA retenido ${ret_iva:,.2f} (informativo).",
        })

    for decl in declaraciones:
        if decl["periodicidad"] == "mensual":
            decl["proximo_vencimiento"] = vencimiento.isoformat()
            decl["periodo_corresponde"] = f"{MESES[mes]} {anio}"
        elif decl["periodicidad"] == "bimestral":
            bimestre = (mes + 1) // 2
            decl["proximo_vencimiento"] = vencimiento.isoformat()
            decl["periodo_corresponde"] = f"Bimestre {bimestre} · {anio}"
        else:
            decl["proximo_vencimiento"] = decl.get("mes_presentacion")
            decl["periodo_corresponde"] = f"Ejercicio {anio}"

    return {
        "aviso": (
            "Este resumen es solo informativo y no sustituye el cálculo oficial del SAT. "
            "Valida montos, coeficientes y fechas exactas en el portal del SAT antes de pagar o presentar."
        ),
        "empresa": {
            "id": empresa_id,
            "razon_social": getattr(empresa, "razon_social", None) or getattr(empresa, "nombre", None),
            "rfc": getattr(empresa, "rfc", None),
            "tipo_persona": getattr(empresa, "tipo_persona", None),
            "regimen_fiscal": getattr(empresa, "regimen_fiscal", None),
        },
        "periodo": {"mes": mes, "anio": anio, "etiqueta": f"{MESES[mes]} {anio}"},
        "impuestos": {
            "isr": {
                "resumen": "Pago provisional estimado según régimen configurado.",
                "a_cargo": round(isr_a_cargo, 2),
                "detalle": isr,
            },
            "iva": {
                "resumen": "IVA del periodo = trasladado − acreditable − retenciones (simplificado).",
                "a_cargo": round(iva_a_cargo, 2),
                "a_favor": round(iva_a_favor, 2),
                "detalle": iva,
            },
            "retenciones": {
                "resumen": "Retenciones de ISR/IVA detectadas en CFDIs del periodo.",
                "isr": round(ret_isr, 2),
                "iva": round(ret_iva, 2),
                "total": round(ret_isr + ret_iva, 2),
            },
        },
        "declaraciones": declaraciones,
        "sugerencias_pago": sugerencias_pago,
        "obligaciones_regimen": {
            "calculo_isr_tipo": rules.get("calculo_isr_tipo").value
            if hasattr(rules.get("calculo_isr_tipo"), "value")
            else rules.get("calculo_isr_tipo"),
            "exige_diot": bool(rules.get("exige_diot")),
            "exige_contabilidad_electronica": bool(rules.get("exige_contabilidad_electronica")),
            "permite_deducciones_isr": bool(rules.get("permite_deducciones_isr")),
        },
    }
