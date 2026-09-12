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


def resumir_obligaciones_fiscales(
    regimen: SatRegimenEnum | str,
    tipo_persona: str,
    *,
    total_ventas: float | Decimal | None = None,
    total_gastos: float | Decimal | None = None,
) -> dict:
    """Resume las obligaciones del régimen fiscal para apoyo contable y fiscal.

    Devuelve, además de la configuración del régimen, alertas concretas para la
    empresa y una guía de acciones sugeridas.
    """
    regimen_enum = _normalizar_regimen(regimen)
    reglas = SAT_REGIMEN_RULES.get(regimen_enum, {}) if regimen_enum else {}

    obligaciones = {
        "regimen_fiscal": getattr(regimen_enum, "value", str(regimen) or ""),
        "calculo_isr_tipo": getattr(reglas.get("calculo_isr_tipo"), "value", None),
        "exige_diot": bool(reglas.get("exige_diot")),
        "exige_contabilidad_electronica": bool(reglas.get("exige_contabilidad_electronica")),
        "permite_deducciones_isr": bool(reglas.get("permite_deducciones_isr")),
    }

    alertas: list[str] = []
    if obligaciones["exige_diot"]:
        alertas.append("DIOT: revisar presentación mensual y conciliación del régimen activo.")
    if obligaciones["exige_contabilidad_electronica"]:
        alertas.append("Contabilidad electrónica: mantener registros y archivos sincronizados con el SAT.")
    if obligaciones["permite_deducciones_isr"]:
        alertas.append("ISR: validar deducciones y documentación soporte de gastos antes de cierre.")

    if regimen_enum in {SatRegimenEnum.resico_pf, SatRegimenEnum.actividad_empresarial, SatRegimenEnum.arrendamiento} and not _es_persona_moral(tipo_persona):
        alertas.append("Retenciones: revisar si debe retener ISR/IVA en facturas emitidas a personas morales.")

    if total_ventas is not None:
        ventas = Decimal(str(total_ventas))
        if ventas > Decimal("0"):
            alertas.append("Ventas: comparar el total de facturas con la base contable y la conciliación bancaria.")

    if total_gastos is not None:
        gastos = Decimal(str(total_gastos))
        if gastos > Decimal("0"):
            alertas.append("Gastos: revisar la clasificación y documentación de proveedores para deducibilidad.")

    return {
        "regimen_fiscal": obligaciones["regimen_fiscal"],
        "obligaciones": obligaciones,
        "alertas": alertas,
        "recomendaciones": [
            "Mantener concentrado el flujo de CFDI por empresa y período.",
            "Validar partidas al cierre del mes antes de presentar obligaciones fiscales.",
        ],
    }


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