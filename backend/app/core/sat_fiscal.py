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


SAT_REGIMEN_RULES = {
    SatRegimenEnum.resico_pf: {
        "calculo_isr_tipo": CalculoIsrTipo.flujo_efectivo_resico,
        "exige_diot": False,
        "exige_contabilidad_electronica": False,
        "permite_deducciones_isr": False,
        "reglas_retencion_emitida": {"ISR": 0.0125},
    },
    SatRegimenEnum.resico_pm: {
        "calculo_isr_tipo": CalculoIsrTipo.flujo_efectivo_resico,
        "exige_diot": True,
        "exige_contabilidad_electronica": True,
        "permite_deducciones_isr": True,
        "reglas_retencion_emitida": {},
    },
    SatRegimenEnum.actividad_empresarial: {
        "calculo_isr_tipo": CalculoIsrTipo.tarifa_progresiva,
        "exige_diot": True,
        "exige_contabilidad_electronica": True,
        "permite_deducciones_isr": True,
        "reglas_retencion_emitida": {"ISR": 0.10, "IVA": 0.106667},
    },
    SatRegimenEnum.arrendamiento: {
        "calculo_isr_tipo": CalculoIsrTipo.deduccion_ciega,
        "exige_diot": True,
        "exige_contabilidad_electronica": True,
        "permite_deducciones_isr": True,
        "reglas_retencion_emitida": {"ISR": 0.10, "IVA": 0.106667},
    },
    SatRegimenEnum.general_de_ley: {
        "calculo_isr_tipo": CalculoIsrTipo.coeficiente_utilidad,
        "exige_diot": True,
        "exige_contabilidad_electronica": True,
        "permite_deducciones_isr": True,
        "reglas_retencion_emitida": {},
    },
    SatRegimenEnum.sueldos_salarios: {
        "calculo_isr_tipo": CalculoIsrTipo.retenciones_nomina,
        "exige_diot": False,
        "exige_contabilidad_electronica": False,
        "permite_deducciones_isr": False,
        "reglas_retencion_emitida": {},
    },
    SatRegimenEnum.personas_morales_no_lucrativas: {
        "calculo_isr_tipo": CalculoIsrTipo.coeficiente_utilidad,
        "exige_diot": True,
        "exige_contabilidad_electronica": True,
        "permite_deducciones_isr": True,
        "reglas_retencion_emitida": {},
    },
    SatRegimenEnum.incorporacion_fiscal: {
        "calculo_isr_tipo": CalculoIsrTipo.tarifa_progresiva,
        "exige_diot": True,
        "exige_contabilidad_electronica": True,
        "permite_deducciones_isr": True,
        "reglas_retencion_emitida": {},
    },
}