import pytest

from app.api.v1.endpoints import facturas


def test_procesar_xml_interno_omite_complemento_pago(monkeypatch):
    monkeypatch.setattr(
        facturas,
        "parsear_xml_sat",
        lambda _xml: {
            "tipo_comprobante": "P",
            "uuid": "11111111-1111-1111-1111-111111111111",
        },
    )
    monkeypatch.setattr(facturas, "validar_cfdi_empresa", lambda *_args, **_kwargs: None)

    with pytest.raises(facturas.ComplementoPagoOmitido) as exc_info:
        facturas.procesar_xml_interno(
            empresa_id=1,
            xml_str="<xml />",
            db=object(),
            empresa_rfc="XAXX010101000",
        )

    assert exc_info.value.uuid == "11111111-1111-1111-1111-111111111111"


def test_respuesta_complemento_pago_omitido_incluye_contadores():
    respuesta = facturas._respuesta_complemento_pago_omitido(
        "11111111-1111-1111-1111-111111111111"
    )

    assert respuesta["omitido"] is True
    assert respuesta["motivo"] == "complemento_pago"
    assert respuesta["omitidos_complemento_pago"] == 1
    assert respuesta["exitos"] == 0
    assert respuesta["duplicados"] == 0
    assert respuesta["errores"] == 0
