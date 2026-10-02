"""Pruebas DIOT: clasificacion, agrupacion, incompletos y layout SAT."""

from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

from app.models.fiscal import TipoOperacionDiot
from app.services.diot import (
    clasificar_tipo_diot,
    construir_diot,
    exportar_diot,
    generar_csv_diot,
    generar_layout_sat,
)


def test_clasificar_tipo_diot_nacional_extranjero_global():
    assert clasificar_tipo_diot("AAA010101AAA") == TipoOperacionDiot.nacional
    assert clasificar_tipo_diot("XEXX010101000") == TipoOperacionDiot.extranjero
    assert clasificar_tipo_diot("XAXX010101000") == TipoOperacionDiot.global_
    assert clasificar_tipo_diot(None) is None
    assert clasificar_tipo_diot("") is None


def test_construir_diot_agrupa_cfdi_por_rfc(monkeypatch):
    rfc_emp = "EMP010101AAA"
    facturas = [
        SimpleNamespace(
            id=1,
            tipo_comprobante="E",
            rfc_emisor="PRO010101AAA",
            nombre_emisor="Proveedor Uno",
            rfc_receptor=rfc_emp,
            subtotal=1000,
            iva_trasladado=160,
            iva_retenido=0,
            total=1160,
        ),
        SimpleNamespace(
            id=2,
            tipo_comprobante="E",
            rfc_emisor="PRO010101AAA",
            nombre_emisor="Proveedor Uno",
            rfc_receptor=rfc_emp,
            subtotal=500,
            iva_trasladado=80,
            iva_retenido=10,
            total=570,
        ),
        SimpleNamespace(
            id=3,
            tipo_comprobante="E",
            rfc_emisor="XEXX010101000",
            nombre_emisor="Foreign LLC",
            rfc_receptor=rfc_emp,
            subtotal=200,
            iva_trasladado=0,
            iva_retenido=0,
            total=200,
        ),
    ]

    class Query:
        def __init__(self, model=None):
            self.model = model

        def filter(self, *a, **k):
            return self

        def all(self):
            return []

        def first(self):
            return SimpleNamespace(rfc=rfc_emp)

    class Db:
        def query(self, model):
            return Query(model)

    monkeypatch.setattr("app.services.diot._operaciones_diot_periodo", lambda *a, **k: [])
    monkeypatch.setattr("app.services.diot._facturas_egreso_periodo", lambda *a, **k: facturas)
    monkeypatch.setattr("app.services.diot.es_venta", lambda fac, rfc: False)

    diot = construir_diot(Db(), 1, 3, 2026)
    assert diot["totales"]["proveedores"] == 2
    pro = next(p for p in diot["proveedores"] if p["rfc"] == "PRO010101AAA")
    assert pro["base_gravable"] == 1500.0
    assert pro["iva_acreditable"] == 240.0
    assert pro["iva_retenido"] == 10.0
    assert pro["tipo_operacion_diot"] == "nacional"
    assert pro["listo_para_exportar"] is True
    ext = next(p for p in diot["proveedores"] if p["tipo_operacion_diot"] == "extranjero")
    assert ext["nombre"] == "Foreign LLC"
    assert diot["exportable"] is True


def test_diot_detecta_incompletos_sin_rfc(monkeypatch):
    op = SimpleNamespace(
        id=1,
        factura_id=None,
        rfc_contraparte=None,
        nombre_contraparte="Sin RFC",
        tipo_operacion_diot=None,
        base_gravable=100,
        iva_acreditable=16,
        iva_trasladado=16,
        iva_retenido=0,
        total=116,
    )

    class Query:
        def filter(self, *a, **k):
            return self

        def all(self):
            return []

        def first(self):
            return SimpleNamespace(rfc="EMP010101AAA")

    class Db:
        def query(self, model):
            return Query()

    monkeypatch.setattr("app.services.diot._operaciones_diot_periodo", lambda *a, **k: [op])
    monkeypatch.setattr("app.services.diot._facturas_egreso_periodo", lambda *a, **k: [])

    diot = construir_diot(Db(), 1, 1, 2026)
    assert diot["bloqueado_por_incompletos"] is True
    assert diot["exportable"] is False
    assert "rfc" in diot["datos_incompletos"][0]["faltantes"]


def test_layout_sat_y_csv():
    diot = {
        "empresa_id": 1,
        "rfc_empresa": "EMP010101AAA",
        "periodo": {"mes": 2, "anio": 2026},
        "proveedores": [
            {
                "rfc": "PRO010101AAA",
                "nombre": "Proveedor",
                "tipo_operacion_diot": "nacional",
                "base_gravable": 1000,
                "iva_acreditable": 160,
                "iva_retenido": 0,
                "total": 1160,
                "operaciones": 1,
                "listo_para_exportar": True,
                "datos_incompletos": [],
                "origenes": ["cfdi"],
            }
        ],
        "totales": {"proveedores": 1},
        "exportable": True,
    }
    layout = generar_layout_sat(diot)
    assert "04|85|PRO010101AAA|" in layout
    assert "1000.00" in layout
    assert "160.00" in layout
    csv_bytes = generar_csv_diot(diot)
    assert b"PRO010101AAA" in csv_bytes
    content, media, name = exportar_diot(diot, "sat")
    assert media.startswith("text/plain")
    assert name.endswith(".txt")
    assert b"PRO010101AAA" in content


def test_export_xlsx_y_pdf():
    diot = {
        "empresa_id": 1,
        "rfc_empresa": "EMP010101AAA",
        "periodo": {"mes": 2, "anio": 2026},
        "proveedores": [
            {
                "rfc": "PRO010101AAA",
                "nombre": "Proveedor",
                "tipo_operacion_diot": "nacional",
                "base_gravable": 100.5,
                "iva_acreditable": 16.08,
                "iva_retenido": 0,
                "total": 116.58,
                "operaciones": 1,
                "listo_para_exportar": True,
                "datos_incompletos": [],
                "origenes": ["cfdi"],
            }
        ],
        "totales": {
            "proveedores": 1,
            "proveedores_completos": 1,
            "proveedores_incompletos": 0,
            "base_gravable": 100.5,
            "iva_acreditable": 16.08,
        },
        "exportable": True,
        "bloqueado_por_incompletos": False,
    }
    xbytes, xmedia, xname = exportar_diot(diot, "xlsx")
    assert xmedia.endswith("sheet")
    assert xname.endswith(".xlsx")
    assert len(xbytes) > 100
    pbytes, pmedia, pname = exportar_diot(diot, "pdf")
    assert pmedia == "application/pdf"
    assert pname.endswith(".pdf")
    assert pbytes[:4] == b"%PDF"
