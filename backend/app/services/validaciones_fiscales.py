"""Validaciones de retenciones SAT independientes de los endpoints."""

from decimal import Decimal, ROUND_HALF_UP

from app.core.sat_fiscal import SAT_REGIMEN_RULES, SatRegimenEnum


def _normalizar_regimen(regimen: SatRegimenEnum | str) -> SatRegimenEnum | None:
    valor = getattr(regimen, "value", regimen)
    try:
        return SatRegimenEnum(str(valor).upper())
    except ValueError:
        return None


def _es_persona_moral(tipo_persona: str) -> bool:
    return str(getattr(tipo_persona, "value", tipo_persona) or "").strip().upper() in {"MORAL", "PM"}


def validar_retenciones_cfdi(
    emisor_regimen: SatRegimenEnum | str,
    emisor_tipo_persona: str,
    receptor_tipo_persona: str,
    tipo_factor: str | None,
    conceptos_monto: float | Decimal,
) -> dict:
    """Sugiere retenciones obligatorias al emitir un CFDI conforme a reglas SAT.

    RESICO PF, servicios profesionales y arrendamiento de una persona física a
    una persona moral requieren las retenciones configuradas. El importe se
    redondea a centavos para poder usarse directamente en el CFDI.
    """
    regimen = _normalizar_regimen(emisor_regimen)
    monto = Decimal(str(conceptos_monto or 0))
    errores: list[str] = []
    retenciones_sugeridas: list[dict] = []

    if monto < 0:
        errores.append("El monto de los conceptos no puede ser negativo")
    if regimen is None:
        errores.append("El régimen fiscal del emisor no está soportado")

    aplica_retencion = regimen in {
        SatRegimenEnum.resico_pf,
        SatRegimenEnum.actividad_empresarial,
        SatRegimenEnum.arrendamiento,
    } and not _es_persona_moral(emisor_tipo_persona) and _es_persona_moral(receptor_tipo_persona)

    if aplica_retencion and regimen is not None:
        for impuesto, tasa in SAT_REGIMEN_RULES[regimen]["reglas_retencion_emitida"].items():
            importe = (monto * Decimal(str(tasa))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            retenciones_sugeridas.append({"impuesto": impuesto, "tasa": tasa, "monto": float(importe)})
        if regimen == SatRegimenEnum.resico_pf:
            errores.append("Un RESICO PF facturando a una Persona Moral debe incluir la retención del 1.25% de ISR")

    return {
        "es_valido": not errores,
        "retenciones_sugeridas": retenciones_sugeridas,
        "errores": errores,
        "tipo_factor": tipo_factor,
    }