"""Resumen informativo del motor fiscal SAT (ISR, IVA, retenciones y calendario)."""

from __future__ import annotations

from decimal import Decimal
from typing import cast

from sqlalchemy.orm import Session

from app.core.sat_fiscal import (
    SAT_REGIMEN_RULES,
    SatRegimenEnum,
    impuestos_aplicables_regimen,
)
from app.models.empresa import Empresa
from app.models.fiscal import (
    DeclaracionFiscal,
    EstadoDeclaracionFiscal,
    PeriodoFiscal,
    TipoDeclaracionFiscal,
    TipoPeriodoFiscal,
)
from app.services.calculos_fiscales import calcular_isr_provisional
from app.services.informes_contables import (
    generar_impuestos_acreditables,
    generar_impuestos_retenidos,
    generar_impuestos_trasladados,
)


MESES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _regimen_clave(empresa: Empresa | None) -> str:
    """Normaliza la clave SAT del regimen (soporta Enum ORM o string crudo)."""
    if empresa is None:
        return ""
    raw = cast(SatRegimenEnum | str | None, empresa.regimen_fiscal)
    if raw is None or raw == "":
        return ""
    if hasattr(raw, "value"):
        return str(raw.value).strip()
    text = str(raw).strip()
    # str(Enum) a veces devuelve "SatRegimenEnum.nombre"
    if "." in text and not text[0].isdigit():
        name = text.split(".")[-1]
        try:
            return SatRegimenEnum[name].value
        except KeyError:
            pass
    return text


def _regimen_rules(empresa: Empresa | None) -> dict:
    clave = _regimen_clave(empresa)
    if not clave:
        return {}
    try:
        return SAT_REGIMEN_RULES.get(SatRegimenEnum(clave), {})
    except ValueError:
        # soportar 626 sin sufijo
        if clave == "626":
            tipo_persona = getattr(empresa, "tipo_persona", "")
            tipo_persona = getattr(tipo_persona, "value", tipo_persona)
            if str(tipo_persona or "").lower() == "moral":
                return SAT_REGIMEN_RULES.get(SatRegimenEnum.resico_pm, {})
            return SAT_REGIMEN_RULES.get(SatRegimenEnum.resico_pf, {})
        return {}


def _periodicidad_declaraciones(empresa: Empresa | None, rules: dict) -> list[dict]:
    regimen = _regimen_clave(empresa)
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


def _declaraciones_registradas(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
) -> dict[str, DeclaracionFiscal]:
    filas = (
        db.query(DeclaracionFiscal)
        .join(PeriodoFiscal, DeclaracionFiscal.periodo_id == PeriodoFiscal.id)
        .filter(
            DeclaracionFiscal.empresa_id == empresa_id,
            DeclaracionFiscal.es_vigente.is_(True),
            DeclaracionFiscal.estado != EstadoDeclaracionFiscal.cancelada,
            PeriodoFiscal.empresa_id == empresa_id,
            PeriodoFiscal.tipo == TipoPeriodoFiscal.mensual,
            PeriodoFiscal.mes == mes,
            PeriodoFiscal.anio == anio,
        )
        .order_by(DeclaracionFiscal.version.desc(), DeclaracionFiscal.id.desc())
        .all()
    )
    resultado: dict[str, DeclaracionFiscal] = {}
    for declaracion in filas:
        tipo = getattr(declaracion.tipo, "value", declaracion.tipo)
        resultado.setdefault(str(tipo), declaracion)
    return resultado


def _monto_declarado(declaracion: DeclaracionFiscal | None, campo: str) -> float | None:
    if declaracion is None:
        return None
    valor = getattr(declaracion, campo)
    return round(float(Decimal(str(valor or 0))), 2)


def construir_resumen_fiscal_sat(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
) -> dict:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    rules = _regimen_rules(empresa)
    declaraciones_registradas = _declaraciones_registradas(db, empresa_id, mes, anio)
    isr_declarado = declaraciones_registradas.get(TipoDeclaracionFiscal.isr.value)
    iva_declarado = declaraciones_registradas.get(TipoDeclaracionFiscal.iva.value)

    trasladados = generar_impuestos_trasladados(db, empresa_id, mes, anio)
    acreditables = generar_impuestos_acreditables(db, empresa_id, mes, anio)
    retenciones = generar_impuestos_retenidos(db, empresa_id, mes, anio)

    isr_a_cargo = _monto_declarado(isr_declarado, "monto_a_cargo")
    isr_origen = "declaracion" if isr_declarado is not None else None
    if isr_declarado is None:
        # Sin declaración registrada: estimar el ISR provisional según el régimen.
        isr_calculo = calcular_isr_provisional(db, empresa_id, mes, anio)
        estimado = isr_calculo.get("isr_estimado")
        if estimado is not None:
            isr_a_cargo = round(float(estimado), 2)
            isr_origen = "estimado"
    iva_a_cargo = _monto_declarado(iva_declarado, "monto_a_cargo")
    iva_a_favor = _monto_declarado(iva_declarado, "monto_a_favor")
    ret_isr = retenciones["total_isr_retenido"]
    ret_iva = retenciones["total_iva_retenido"]
    iva_origen = "declaracion" if iva_declarado is not None else None
    if iva_declarado is None:
        # Sin declaración registrada: estimar IVA del periodo desde CFDI/pólizas.
        neto = round(
            float(trasladados["total_iva_trasladado"])
            - float(acreditables["total_iva_acreditable"])
            - float(ret_iva or 0),
            2,
        )
        iva_a_cargo = max(neto, 0.0)
        iva_a_favor = max(-neto, 0.0)
        iva_origen = "estimado"
    ish = trasladados["total_impuestos_locales_cfdi"]

    impuestos_reg = impuestos_aplicables_regimen(rules)
    flags = impuestos_reg["flags"]

    declaraciones = _periodicidad_declaraciones(empresa, rules)
    for decl in declaraciones:
        if decl["periodicidad"] == "mensual":
            decl["periodo_corresponde"] = f"{MESES[mes]} {anio}"
        elif decl["periodicidad"] == "bimestral":
            bimestre = (mes + 1) // 2
            decl["periodo_corresponde"] = f"Bimestre {bimestre} · {anio}"
        else:
            decl["periodo_corresponde"] = f"Ejercicio {anio}"

    calculo_isr_tipo = rules.get("calculo_isr_tipo")

    return {
        "aviso": (
            "Este resumen consulta importes fiscales persistidos en declaraciones, CFDI y pólizas. "
            "Los importes netos no registrados se muestran como sin registro."
        ),
        "empresa": {
            "id": empresa_id,
            "razon_social": getattr(empresa, "razon_social", None) or getattr(empresa, "nombre", None),
            "rfc": getattr(empresa, "rfc", None),
            "tipo_persona": getattr(empresa, "tipo_persona", None),
            "regimen_fiscal": getattr(empresa, "regimen_fiscal", None),
        },
        "periodo": {"mes": mes, "anio": anio, "etiqueta": f"{MESES[mes]} {anio}"},
        "totales": {
            "isr_a_cargo": isr_a_cargo,
            "iva_a_cargo": iva_a_cargo,
            "iva_a_favor": iva_a_favor,
            "retenciones": round(ret_isr + ret_iva, 2),
            "ish": round(ish, 2),
            "total_a_pagar": None,
        },
        "impuestos": {
            "isr": {
                "resumen": (
                    "Importe a cargo de la declaración fiscal registrada."
                    if isr_origen != "estimado"
                    else "Estimado según el régimen fiscal (sin declaración registrada)."
                ),
                "origen": isr_origen,
                "a_cargo": isr_a_cargo,
                "aplica": flags.get("isr", True),
                "detalle": (
                    {
                        "declaracion_id": isr_declarado.id,
                        "estado": getattr(isr_declarado.estado, "value", isr_declarado.estado),
                    }
                    if isr_declarado
                    else None
                ),
            },
            "iva": {
                "resumen": (
                    "Importe a cargo/a favor de la declaración fiscal registrada."
                    if iva_origen == "declaracion"
                    else "Estimado: IVA trasladado - acreditable - retenido (sin declaración registrada)."
                ),
                "origen": iva_origen,
                "a_cargo": iva_a_cargo,
                "a_favor": iva_a_favor,
                "aplica": flags.get("iva", True),
                "detalle": {
                    "trasladado": trasladados["total_iva_trasladado"],
                    "acreditable": acreditables["total_iva_acreditable"],
                    "trasladado_polizas": trasladados["iva_desde_polizas"],
                    "acreditable_polizas": acreditables["iva_desde_polizas"],
                    "declaracion_id": iva_declarado.id if iva_declarado else None,
                    "estado": (
                        getattr(iva_declarado.estado, "value", iva_declarado.estado)
                        if iva_declarado
                        else None
                    ),
                },
            },
            "retenciones": {
                "resumen": "Retenciones registradas en las pólizas del periodo.",
                "isr": round(ret_isr, 2),
                "iva": round(ret_iva, 2),
                "total": round(ret_isr + ret_iva, 2),
            },
            "ish": {
                "resumen": (
                    "Impuesto sobre hospedaje (ISH) cobrado en los CFDI emitidos. "
                    "Es un impuesto local; el pago se presenta ante la autoridad estatal."
                ),
                "a_cargo": round(ish, 2),
                "aplica": flags.get("ish", False),
                "detalle": {"origen": "cfdi_ingreso"},
            },
        },
        "declaraciones_registradas": [
            {
                "id": declaracion.id,
                "tipo": tipo,
                "estado": getattr(declaracion.estado, "value", declaracion.estado),
                "version": declaracion.version,
                "monto_a_cargo": _monto_declarado(declaracion, "monto_a_cargo"),
                "monto_a_favor": _monto_declarado(declaracion, "monto_a_favor"),
            }
            for tipo, declaracion in declaraciones_registradas.items()
        ],
        "impuestos_aplicables": impuestos_reg["aplicables"],
        "impuestos_no_aplicables": impuestos_reg["no_aplicables"],
        "acciones": [],
        "declaraciones": declaraciones,
        "sugerencias_pago": [],
        "obligaciones_regimen": {
            "calculo_isr_tipo": getattr(calculo_isr_tipo, "value", calculo_isr_tipo),
            "exige_diot": bool(rules.get("exige_diot")),
            "exige_contabilidad_electronica": bool(rules.get("exige_contabilidad_electronica")),
            "permite_deducciones_isr": bool(rules.get("permite_deducciones_isr")),
            "aplica_isr": flags.get("isr", True),
            "aplica_iva": flags.get("iva", True),
            "aplica_diot": flags.get("diot", False),
            "aplica_ieps": flags.get("ieps", False),
            "aplica_ish": flags.get("ish", False),
        },
    }
