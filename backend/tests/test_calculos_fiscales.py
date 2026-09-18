from datetime import datetime
from types import SimpleNamespace

from app.services.calculos_fiscales import calcular_isr_provisional, calcular_iva_provisional


def factura(tipo, fecha, emisor, receptor, iva, iva_retenido=0):
    return SimpleNamespace(
        tipo_comprobante=tipo,
        fecha_emision=datetime.fromisoformat(fecha),
        rfc_emisor=emisor,
        rfc_receptor=receptor,
        iva_trasladado=iva,
        iva_retenido=iva_retenido,
    )


def test_calcular_iva_separa_periodo_y_acumulado(monkeypatch):
    rfc_empresa = "AAA010101AAA"
    facturas = [
        factura("I", "2026-01-10", rfc_empresa, "BBB010101BBB", 160),
        factura("E", "2026-01-15", "CCC010101CCC", rfc_empresa, 80),
        factura("I", "2026-02-10", rfc_empresa, "DDD010101DDD", 320, 20),
        factura("E", "2026-02-15", "EEE010101EEE", rfc_empresa, 100),
    ]

    class Query:
        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return SimpleNamespace(rfc=rfc_empresa)

    class Db:
        def query(self, model):
            return Query()

    monkeypatch.setattr(
        "app.services.calculos_fiscales._facturas_del_periodo",
        lambda *_args: [facturas[2], facturas[3]],
    )
    monkeypatch.setattr(
        "app.services.calculos_fiscales._facturas_hasta_periodo",
        lambda *_args: facturas,
    )

    resultado = calcular_iva_provisional(Db(), 1, 2, 2026)

    assert resultado["periodo_actual"]["iva_trasladado"] == 320.0
    assert resultado["periodo_actual"]["iva_acreditable"] == 100.0
    assert resultado["periodo_actual"]["iva_retenido"] == 20.0
    assert resultado["periodo_actual"]["iva_a_cargo"] == 200.0
    assert resultado["acumulado_anual"]["iva_trasladado"] == 480.0
    assert resultado["acumulado_anual"]["iva_acreditable"] == 180.0


def test_calcular_isr_acumula_ingresos_deducciones_y_retenciones(monkeypatch):
    rfc_empresa = "AAA010101AAA"
    facturas = [
        SimpleNamespace(
            tipo_comprobante="I", rfc_emisor=rfc_empresa, rfc_receptor="BBB010101BBB",
            subtotal=1000, isr_retenido=100, es_deducible=True,
        ),
        SimpleNamespace(
            tipo_comprobante="E", rfc_emisor="CCC010101CCC", rfc_receptor=rfc_empresa,
            subtotal=300, isr_retenido=0, es_deducible=True,
        ),
    ]

    class Query:
        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return SimpleNamespace(rfc=rfc_empresa, regimen_fiscal="626_PF")

    class Db:
        def query(self, model):
            return Query()

    monkeypatch.setattr(
        "app.services.calculos_fiscales._facturas_hasta_periodo",
        lambda *_args: facturas,
    )

    resultado = calcular_isr_provisional(Db(), 1, 2, 2026, tasa_isr=10)

    assert resultado["ingresos_acumulados"] == 1000.0
    assert resultado["deducciones_acumuladas"] == 300.0
    assert resultado["retenciones_isr"] == 100.0
    assert resultado["deducciones_aplicadas"] == 0.0
    assert resultado["base_gravable"] == 1000.0
    assert resultado["isr_estimado"] == 0.0


def test_isr_resico_no_aplica_deducciones_reportadas(monkeypatch):
    rfc_empresa = "AAA010101AAA"
    factura_ingreso = SimpleNamespace(
        tipo_comprobante="I", rfc_emisor=rfc_empresa, rfc_receptor="BBB010101BBB",
        subtotal=1000, isr_retenido=0, es_deducible=True,
    )

    class Query:
        def filter(self, *args, **kwargs):
            return self

        def first(self):
            return SimpleNamespace(rfc=rfc_empresa, regimen_fiscal="626_PF")

    class Db:
        def query(self, model):
            return Query()

    monkeypatch.setattr(
        "app.services.calculos_fiscales._facturas_hasta_periodo",
        lambda *_args: [factura_ingreso],
    )

    resultado = calcular_isr_provisional(Db(), 1, 2, 2026, tasa_isr=2.5)

    assert resultado["deducciones_aplicadas"] == 0.0
    assert resultado["base_gravable"] == 1000.0
    assert resultado["isr_estimado"] == 25.0