"""Pruebas de reglas de retención del Motor de Régimen Fiscal."""

from app.services.validaciones_fiscales import validar_retenciones_cfdi


def test_resico_pf_a_persona_moral_exige_retencion_isr():
    resultado = validar_retenciones_cfdi("626_PF", "FISICA", "MORAL", "Tasa", 10000)

    assert resultado["es_valido"] is False
    assert resultado["retenciones_sugeridas"] == [{"impuesto": "ISR", "tasa": 0.0125, "monto": 125.0}]
    assert "1.25%" in resultado["errores"][0]


def test_honorarios_pf_a_persona_moral_exige_isr_e_iva():
    resultado = validar_retenciones_cfdi("612", "FISICA", "MORAL", "Tasa", 10000)

    assert resultado["es_valido"] is True
    assert resultado["retenciones_sugeridas"] == [
        {"impuesto": "ISR", "tasa": 0.10, "monto": 1000.0},
        {"impuesto": "IVA", "tasa": 0.106667, "monto": 1066.67},
    ]


def test_retenciones_de_honorarios_se_redondean_a_centavos():
    resultado = validar_retenciones_cfdi("612", "FISICA", "MORAL", "Tasa", "999.99")

    assert resultado["retenciones_sugeridas"] == [
        {"impuesto": "ISR", "tasa": 0.10, "monto": 100.0},
        {"impuesto": "IVA", "tasa": 0.106667, "monto": 106.67},
    ]


def test_persona_moral_general_a_persona_moral_no_exige_retenciones():
    resultado = validar_retenciones_cfdi("601", "MORAL", "MORAL", "Tasa", 10000)

    assert resultado["es_valido"] is True
    assert resultado["retenciones_sugeridas"] == []
    assert resultado["errores"] == []