import pytest

from app.api.v1.endpoints import facturas
from app.models.factura import Factura


def test_procesar_xml_interno_registra_complemento_pago(monkeypatch):
    monkeypatch.setattr(
        facturas,
        "parsear_xml_sat",
        lambda _xml: {
            "tipo_comprobante": "P",
            "uuid": "11111111-1111-1111-1111-111111111111",
            "serie": "P",
            "folio": "1",
            "version_cfdi": "4.0",
            "fecha_emision": None,
            "fecha_timbrado": None,
            "rfc_emisor": "AAA010101AAA",
            "nombre_emisor": "A",
            "rfc_receptor": "BBB010101BBB",
            "nombre_receptor": "B",
            "moneda": "MXN",
            "total": 0,
            "pagos": {
                "version": "2.0",
                "pagos": [],
                "documentos": [],
                "total_pagos": 0,
                "num_documentos": 0,
            },
        },
    )
    monkeypatch.setattr(facturas, "validar_cfdi_empresa", lambda *_args, **_kwargs: None)

    class DummyComplemento:
        def __init__(self):
            self.id = 9
            self.uuid = "11111111-1111-1111-1111-111111111111"
            self.documentos = []
            self.num_documentos = 0
            self.total = 0
            self.total_pagos = 0
            self.serie = "P"
            self.folio = "1"
            self.version_cfdi = "4.0"
            self.version_pagos = "2.0"
            self.fecha_emision = None
            self.fecha_timbrado = None
            self.rfc_emisor = "AAA010101AAA"
            self.nombre_emisor = "A"
            self.rfc_receptor = "BBB010101BBB"
            self.nombre_receptor = "B"
            self.moneda = "MXN"
            self.creado_en = None

    monkeypatch.setattr(
        facturas,
        "guardar_complemento_pago",
        lambda *args, **kwargs: DummyComplemento(),
    )

    resultado = facturas.procesar_xml_interno(
        empresa_id=1,
        xml_str="<xml />",
        db=object(),
        empresa_rfc="XAXX010101000",
    )

    assert isinstance(resultado, facturas.ComplementoPagoRegistrado)
    assert resultado.uuid == "11111111-1111-1111-1111-111111111111"


def test_respuesta_complemento_pago_registrado_incluye_contadores():
    complemento = type(
        "C",
        (),
        {
            "id": 1,
            "empresa_id": 1,
            "uuid": "11111111-1111-1111-1111-111111111111",
            "serie": None,
            "folio": None,
            "version_cfdi": "4.0",
            "version_pagos": "2.0",
            "fecha_emision": None,
            "fecha_timbrado": None,
            "rfc_emisor": "A",
            "nombre_emisor": None,
            "rfc_receptor": "B",
            "nombre_receptor": None,
            "moneda": "MXN",
            "total": 0,
            "total_pagos": 0,
            "num_documentos": 0,
            "documentos": [],
            "creado_en": None,
        },
    )()
    respuesta = facturas._respuesta_complemento_pago_registrado(complemento)

    assert respuesta["registrado"] is True
    assert respuesta["motivo"] == "complemento_pago"
    assert respuesta["pagos_registrados"] == 1
    assert respuesta["omitidos_complemento_pago"] == 0
    assert respuesta["exitos"] == 1
    assert respuesta["errores"] == 0


def test_factura_serie_permite_valores_largos_de_cfdi():
    assert Factura.__table__.c.serie.type.length == 50


def test_validar_tamano_xml_rechaza_archivo_sobre_limite():
    with pytest.raises(facturas.HTTPException) as exc_info:
        facturas._validar_tamano_archivo(b"123456", limite=5, tipo="XML")

    assert exc_info.value.status_code == 413
    assert "excede el limite" in exc_info.value.detail
