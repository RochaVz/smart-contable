"""Tarifas ISR progresivas oficiales versionadas por ejercicio.

Fuente de referencia: tarifas del ISR para personas fisicas publicadas por el SAT
(Articulo 96 LISR y actualizaciones anuales). Valores en MXN.

Nota: se incluyen ejercicios 2024-2026 para beta. La aplicacion no inventa tasas
fuera de estas tablas versionadas; si no hay tarifa para el ejercicio, se reporta.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Literal

CENTAVOS = Decimal("0.01")
PeriodoTarifa = Literal["mensual", "anual"]


def _d(value) -> Decimal:
    return Decimal(str(value))


# Cada tramo: (limite_inferior, limite_superior|None, cuota_fija, pct_excedente)
# limite_superior None = sin techo
TARIFAS_ISR_OFICIALES: dict[int, dict[str, list[tuple[Decimal, Decimal | None, Decimal, Decimal]]]] = {
    2024: {
        "mensual": [
            (_d("0.01"), _d("746.04"), _d("0.00"), _d("1.92")),
            (_d("746.05"), _d("6332.05"), _d("14.32"), _d("6.40")),
            (_d("6332.06"), _d("11128.01"), _d("371.83"), _d("10.88")),
            (_d("11128.02"), _d("12935.82"), _d("893.63"), _d("16.00")),
            (_d("12935.83"), _d("15487.71"), _d("1182.88"), _d("17.92")),
            (_d("15487.72"), _d("31236.49"), _d("1640.18"), _d("21.36")),
            (_d("31236.50"), _d("49233.00"), _d("5004.12"), _d("23.52")),
            (_d("49233.01"), _d("93993.90"), _d("9236.89"), _d("30.00")),
            (_d("93993.91"), _d("125487.65"), _d("22665.17"), _d("32.00")),
            (_d("125487.66"), _d("375731.37"), _d("32737.55"), _d("34.00")),
            (_d("375731.38"), None, _d("117912.32"), _d("35.00")),
        ],
        "anual": [
            (_d("0.01"), _d("8952.49"), _d("0.00"), _d("1.92")),
            (_d("8952.50"), _d("75984.55"), _d("171.88"), _d("6.40")),
            (_d("75984.56"), _d("133536.07"), _d("4461.94"), _d("10.88")),
            (_d("133536.08"), _d("155229.80"), _d("10723.55"), _d("16.00")),
            (_d("155229.81"), _d("185852.57"), _d("14194.54"), _d("17.92")),
            (_d("185852.58"), _d("374837.88"), _d("19682.13"), _d("21.36")),
            (_d("374837.89"), _d("590795.99"), _d("60063.83"), _d("23.52")),
            (_d("590796.00"), _d("1127926.84"), _d("110842.74"), _d("30.00")),
            (_d("1127926.85"), _d("1505851.86"), _d("271981.99"), _d("32.00")),
            (_d("1505851.87"), _d("4508777.49"), _d("392850.60"), _d("34.00")),
            (_d("4508777.50"), None, _d("1414947.85"), _d("35.00")),
        ],
    },
    2025: {
        "mensual": [
            (_d("0.01"), _d("773.35"), _d("0.00"), _d("1.92")),
            (_d("773.36"), _d("6563.50"), _d("14.84"), _d("6.40")),
            (_d("6563.51"), _d("11534.67"), _d("385.33"), _d("10.88")),
            (_d("11534.68"), _d("13408.40"), _d("926.11"), _d("16.00")),
            (_d("13408.41"), _d("16053.31"), _d("1225.91"), _d("17.92")),
            (_d("16053.32"), _d("32377.42"), _d("1699.88"), _d("21.36")),
            (_d("32377.43"), _d("51031.64"), _d("5186.27"), _d("23.52")),
            (_d("51031.65"), _d("97426.63"), _d("9573.08"), _d("30.00")),
            (_d("97426.64"), _d("130070.30"), _d("23491.56"), _d("32.00")),
            (_d("130070.31"), _d("389446.09"), _d("33937.37"), _d("34.00")),
            (_d("389446.10"), None, _d("122225.14"), _d("35.00")),
        ],
        "anual": [
            (_d("0.01"), _d("9280.21"), _d("0.00"), _d("1.92")),
            (_d("9280.22"), _d("78762.00"), _d("178.12"), _d("6.40")),
            (_d("78762.01"), _d("138416.00"), _d("4624.24"), _d("10.88")),
            (_d("138416.01"), _d("160900.80"), _d("11113.62"), _d("16.00")),
            (_d("160900.81"), _d("192639.68"), _d("14711.08"), _d("17.92")),
            (_d("192639.69"), _d("388529.04"), _d("20398.56"), _d("21.36")),
            (_d("388529.05"), _d("612379.68"), _d("62235.24"), _d("23.52")),
            (_d("612379.69"), _d("1169119.56"), _d("114877.08"), _d("30.00")),
            (_d("1169119.57"), _d("1560843.60"), _d("281898.72"), _d("32.00")),
            (_d("1560843.61"), _d("4673353.08"), _d("407248.44"), _d("34.00")),
            (_d("4673353.09"), None, _d("1466701.68"), _d("35.00")),
        ],
    },
    # 2026: se reutiliza 2025 hasta publicacion oficial distinta (versionada explicitamente)
    2026: {},
}

# Alias 2026 = 2025 hasta nueva publicacion
TARIFAS_ISR_OFICIALES[2026] = {
    "mensual": list(TARIFAS_ISR_OFICIALES[2025]["mensual"]),
    "anual": list(TARIFAS_ISR_OFICIALES[2025]["anual"]),
}


def ejercicios_con_tarifa() -> list[int]:
    return sorted(TARIFAS_ISR_OFICIALES.keys())


def obtener_tramos(ejercicio: int, periodo: PeriodoTarifa = "mensual") -> list[dict] | None:
    data = TARIFAS_ISR_OFICIALES.get(int(ejercicio))
    if not data:
        return None
    tramos = data.get(periodo)
    if not tramos:
        return None
    return [
        {
            "orden": idx + 1,
            "limite_inferior": float(li),
            "limite_superior": float(ls) if ls is not None else None,
            "cuota_fija": float(cf),
            "porcentaje_excedente": float(pct),
        }
        for idx, (li, ls, cf, pct) in enumerate(tramos)
    ]


def aplicar_tarifa_progresiva(
    base_gravable,
    ejercicio: int,
    periodo: PeriodoTarifa = "mensual",
) -> dict:
    """Aplica tarifa progresiva oficial versionada. No inventa tasas fuera de tabla."""
    base = _d(base_gravable or 0).quantize(CENTAVOS, rounding=ROUND_HALF_UP)
    tramos_raw = TARIFAS_ISR_OFICIALES.get(int(ejercicio), {}).get(periodo)
    if not tramos_raw:
        return {
            "ejercicio": ejercicio,
            "periodo": periodo,
            "base_gravable": float(base),
            "isr_causado": None,
            "tramo_aplicado": None,
            "disponible": False,
            "mensaje": f"No hay tarifa ISR {periodo} versionada para el ejercicio {ejercicio}.",
        }

    if base <= 0:
        return {
            "ejercicio": ejercicio,
            "periodo": periodo,
            "base_gravable": float(base),
            "isr_causado": 0.0,
            "tramo_aplicado": None,
            "disponible": True,
            "mensaje": None,
        }

    aplicado = None
    isr = Decimal("0")
    for li, ls, cf, pct in tramos_raw:
        if base >= li and (ls is None or base <= ls):
            excedente = base - li
            isr = (cf + excedente * pct / Decimal("100")).quantize(CENTAVOS, rounding=ROUND_HALF_UP)
            aplicado = {
                "limite_inferior": float(li),
                "limite_superior": float(ls) if ls is not None else None,
                "cuota_fija": float(cf),
                "porcentaje_excedente": float(pct),
            }
            break

    return {
        "ejercicio": ejercicio,
        "periodo": periodo,
        "base_gravable": float(base),
        "isr_causado": float(isr) if aplicado else None,
        "tramo_aplicado": aplicado,
        "disponible": aplicado is not None,
        "mensaje": None if aplicado else "Base fuera de tramos configurados.",
    }
