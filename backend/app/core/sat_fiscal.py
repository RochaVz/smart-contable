"""Catálogo fiscal y reglas declarativas aplicables a cada empresa."""

from enum import Enum


class SatRegimenEnum(str, Enum):
    """Regímenes SAT soportados por el motor fiscal.

    RESICO persona física y moral se mantienen como valores internos distintos
    para seleccionar reglas independientes, aunque ambos usan la clave SAT 626.
    """

    general_de_ley = "601"
    personas_morales_no_lucrativas = "603"
    sueldos_salarios = "605"
    arrendamiento = "606"
    actividad_empresarial = "612"
    incorporacion_fiscal = "621"
    resico_pf = "626_PF"
    resico_pm = "626_PM"


class CalculoIsrTipo(str, Enum):
    """Métodos de cálculo de ISR para fines de configuración fiscal."""

    flujo_efectivo_resico = "FLUJO_EFECTIVO_RESICO"
    coeficiente_utilidad = "COEFICIENTE_UTILIDAD"
    tarifa_progresiva = "TARIFA_PROGRESIVA"
    deduccion_ciega = "DEDUCCION_CIEGA"
    retenciones_nomina = "RETENCIONES_NOMINA"


# Impuestos posibles en el motor (clave → etiqueta amigable)
IMPUESTOS_CATALOGO = {
    "isr": "ISR",
    "iva": "IVA",
    "diot": "DIOT",
    "ieps": "IEPS",
    "ish": "Impuesto sobre hospedaje (ISH)",
}


def _reglas(
    *,
    calculo_isr_tipo: CalculoIsrTipo,
    exige_diot: bool,
    exige_contabilidad_electronica: bool,
    permite_deducciones_isr: bool,
    reglas_retencion_emitida: dict | None = None,
    aplica_isr: bool = True,
    aplica_iva: bool = True,
    aplica_diot: bool | None = None,
    aplica_ieps: bool = False,
    aplica_ish: bool = False,
) -> dict:
    """Factory de reglas de régimen con flags de impuestos aplicables."""
    diot = exige_diot if aplica_diot is None else aplica_diot
    return {
        "calculo_isr_tipo": calculo_isr_tipo,
        "exige_diot": diot,
        "exige_contabilidad_electronica": exige_contabilidad_electronica,
        "permite_deducciones_isr": permite_deducciones_isr,
        "reglas_retencion_emitida": reglas_retencion_emitida or {},
        "aplica_isr": aplica_isr,
        "aplica_iva": aplica_iva,
        "aplica_diot": diot,
        "aplica_ieps": aplica_ieps,
        "aplica_ish": aplica_ish,
    }


SAT_REGIMEN_RULES = {
    SatRegimenEnum.resico_pf: _reglas(
        calculo_isr_tipo=CalculoIsrTipo.flujo_efectivo_resico,
        exige_diot=False,
        exige_contabilidad_electronica=False,
        permite_deducciones_isr=False,
        reglas_retencion_emitida={"ISR": 0.0125},
        aplica_ieps=False,
        aplica_ish=False,
    ),
    SatRegimenEnum.resico_pm: _reglas(
        calculo_isr_tipo=CalculoIsrTipo.flujo_efectivo_resico,
        exige_diot=True,
        exige_contabilidad_electronica=True,
        permite_deducciones_isr=True,
        aplica_ieps=False,
        aplica_ish=False,
    ),
    SatRegimenEnum.actividad_empresarial: _reglas(
        calculo_isr_tipo=CalculoIsrTipo.tarifa_progresiva,
        exige_diot=True,
        exige_contabilidad_electronica=True,
        permite_deducciones_isr=True,
        reglas_retencion_emitida={"ISR": 0.10, "IVA": 0.106667},
        # ISH solo aplica con actividad de hospedaje; por defecto no aplica
        aplica_ieps=False,
        aplica_ish=False,
    ),
    SatRegimenEnum.arrendamiento: _reglas(
        calculo_isr_tipo=CalculoIsrTipo.deduccion_ciega,
        exige_diot=True,
        exige_contabilidad_electronica=True,
        permite_deducciones_isr=True,
        reglas_retencion_emitida={"ISR": 0.10, "IVA": 0.106667},
        aplica_ieps=False,
        aplica_ish=False,
    ),
    SatRegimenEnum.general_de_ley: _reglas(
        calculo_isr_tipo=CalculoIsrTipo.coeficiente_utilidad,
        exige_diot=True,
        exige_contabilidad_electronica=True,
        permite_deducciones_isr=True,
        aplica_ieps=False,
        aplica_ish=False,
    ),
    SatRegimenEnum.sueldos_salarios: _reglas(
        calculo_isr_tipo=CalculoIsrTipo.retenciones_nomina,
        exige_diot=False,
        exige_contabilidad_electronica=False,
        permite_deducciones_isr=False,
        # Sueldos: ISR vía retenciones; IVA/DIOT/ISH no aplican como obligación propia
        aplica_isr=True,
        aplica_iva=False,
        aplica_diot=False,
        aplica_ieps=False,
        aplica_ish=False,
    ),
    SatRegimenEnum.personas_morales_no_lucrativas: _reglas(
        calculo_isr_tipo=CalculoIsrTipo.coeficiente_utilidad,
        exige_diot=True,
        exige_contabilidad_electronica=True,
        permite_deducciones_isr=True,
        aplica_ieps=False,
        aplica_ish=False,
    ),
    SatRegimenEnum.incorporacion_fiscal: _reglas(
        calculo_isr_tipo=CalculoIsrTipo.tarifa_progresiva,
        exige_diot=True,
        exige_contabilidad_electronica=True,
        permite_deducciones_isr=True,
        aplica_ieps=False,
        aplica_ish=False,
    ),
}


def impuestos_aplicables_regimen(rules: dict | None) -> dict:
    """Devuelve impuestos que aplican / no aplican según reglas del régimen."""
    rules = rules or {}
    flags = {
        "isr": bool(rules.get("aplica_isr", True)),
        "iva": bool(rules.get("aplica_iva", True)),
        "diot": bool(rules.get("aplica_diot", rules.get("exige_diot", False))),
        "ieps": bool(rules.get("aplica_ieps", False)),
        "ish": bool(rules.get("aplica_ish", False)),
    }
    aplicables = [
        {"clave": k, "nombre": IMPUESTOS_CATALOGO[k], "aplica": True}
        for k, v in flags.items()
        if v
    ]
    no_aplicables = [
        {
            "clave": k,
            "nombre": IMPUESTOS_CATALOGO[k],
            "aplica": False,
            "motivo": _motivo_no_aplica(k),
        }
        for k, v in flags.items()
        if not v
    ]
    return {"aplicables": aplicables, "no_aplicables": no_aplicables, "flags": flags}


def _motivo_no_aplica(clave: str) -> str:
    motivos = {
        "isr": "El régimen no genera pago provisional de ISR en este motor.",
        "iva": "El régimen no obliga a declarar IVA propio (p. ej. sueldos y salarios).",
        "diot": "La DIOT no es obligatoria para este régimen.",
        "ieps": "IEPS no está habilitado para este régimen (solo actividades gravadas específicas).",
        "ish": (
            "Impuesto sobre hospedaje (hotelero) no aplica: es local y solo para "
            "prestación de servicios de hospedaje."
        ),
    }
    return motivos.get(clave, "No aplica según el régimen fiscal configurado.")