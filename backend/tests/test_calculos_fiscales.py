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

        def all(self):
            return []

        def first(self):
            return SimpleNamespace(rfc=rfc_empresa, regimen_fiscal="626_PF")

    class Db:
        def query(self, model):
            return Query()

    monkeypatch.setattr(
        "app.services.calculos_fiscales._facturas_hasta_periodo",
        lambda *_args: facturas,
    )
    monkeypatch.setattr(
        "app.services.calculos_fiscales._pagos_provisionales_isr",
        lambda *_args, **_kwargs: __import__("decimal").Decimal("0"),
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

        def all(self):
            return []

        def first(self):
            return SimpleNamespace(rfc=rfc_empresa, regimen_fiscal="626_PF")

    class Db:
        def query(self, model):
            return Query()

    monkeypatch.setattr(
        "app.services.calculos_fiscales._facturas_hasta_periodo",
        lambda *_args: [factura_ingreso],
    )
    monkeypatch.setattr(
        "app.services.calculos_fiscales._pagos_provisionales_isr",
        lambda *_args, **_kwargs: __import__("decimal").Decimal("0"),
    )

    resultado = calcular_isr_provisional(Db(), 1, 2, 2026, tasa_isr=2.5)

    assert resultado["deducciones_aplicadas"] == 0.0
    assert resultado["base_gravable"] == 1000.0
    assert resultado["isr_estimado"] == 25.0
from decimal import Decimal
from types import SimpleNamespace

from app.core.tarifas_isr_oficiales import aplicar_tarifa_progresiva
from app.services.calculos_fiscales import (
    calcular_ieps_provisional,
    calcular_isr_anual,
    calcular_isr_provisional,
)


def test_tarifa_progresiva_2025_tramo_conocido():
    # Caso revisable: base 10,000 en tarifa mensual 2025
    # excedente = 10000 - 6563.51 = 3436.49; isr = 385.33 + 3436.49 * 10.88% = 759.22
    r = aplicar_tarifa_progresiva(Decimal("10000"), 2025, "mensual")
    assert r["disponible"] is True
    assert r["isr_causado"] == 759.22
    assert r["tramo_aplicado"]["porcentaje_excedente"] == 10.88


def test_tarifa_anual_cero_base():
    r = aplicar_tarifa_progresiva(0, 2024, "anual")
    assert r["isr_causado"] == 0.0
    assert r["disponible"] is True


def test_isr_provisional_usa_tarifa_cuando_regimen_progresivo(monkeypatch):
    rfc = "AAA010101AAA"
    facturas = [
        SimpleNamespace(
            tipo_comprobante="I",
            rfc_emisor=rfc,
            rfc_receptor="BBB010101BBB",
            subtotal=10000,
            isr_retenido=0,
            es_deducible=True,
        )
    ]

    class Query:
        def __init__(self, model=None):
            self.model = model

        def filter(self, *a, **k):
            return self

        def order_by(self, *a, **k):
            return self

        def all(self):
            name = getattr(self.model, "__name__", "")
            if name == "PagoProvisionalAnterior":
                return []
            if name == "PerdidaFiscal":
                return []
            return []

        def first(self):
            return SimpleNamespace(rfc=rfc, regimen_fiscal="612", opcion_deduccion=None)

    class Db:
        def query(self, model):
            return Query(model)

    monkeypatch.setattr(
        "app.services.calculos_fiscales._facturas_hasta_periodo",
        lambda *_: facturas,
    )
    monkeypatch.setattr(
        "app.services.calculos_fiscales._pagos_provisionales_isr",
        lambda *_args, **_kw: Decimal("100"),
    )

    r = calcular_isr_provisional(Db(), 1, 3, 2025)
    assert r["calculo_isr_tipo"] == "TARIFA_PROGRESIVA"
    assert r["tarifa_progresiva"]["disponible"] is True
    assert r["isr_estimado"] == 659.22  # 759.22 - 0 retenciones - 100 pagos
    assert r["saldo"]["isr_a_cargo"] == 659.22
    assert r["saldo"]["pagos_provisionales_anteriores"] == 100.0
    assert r["estatus"] == "estimado"


def test_isr_anual_aplica_perdidas_y_saldo_favor(monkeypatch):
    rfc = "AAA010101AAA"
    facturas = [
        SimpleNamespace(
            tipo_comprobante="I",
            rfc_emisor=rfc,
            rfc_receptor="BBB010101BBB",
            subtotal=5000,
            isr_retenido=200,
            es_deducible=True,
            iva_trasladado=800,
            iva_retenido=0,
        ),
        SimpleNamespace(
            tipo_comprobante="E",
            rfc_emisor="CCC010101CCC",
            rfc_receptor=rfc,
            subtotal=1000,
            isr_retenido=0,
            es_deducible=True,
            iva_trasladado=160,
            iva_retenido=0,
        ),
    ]

    class Query:
        def __init__(self, model=None):
            self.model = model

        def filter(self, *a, **k):
            return self

        def order_by(self, *a, **k):
            return self

        def all(self):
            return []

        def first(self):
            return SimpleNamespace(rfc=rfc, regimen_fiscal="612", opcion_deduccion=None)

    class Db:
        def query(self, model):
            return Query(model)

    monkeypatch.setattr(
        "app.services.calculos_fiscales._facturas_ejercicio",
        lambda *_: facturas,
    )
    monkeypatch.setattr(
        "app.services.calculos_fiscales._perdidas_aplicables",
        lambda *_args, **_kw: {
            "perdidas_aplicadas": [{"id": 1, "ejercicio_origen": 2023, "monto_aplicado": 500.0, "monto_pendiente_antes": 500.0}],
            "total_perdidas_aplicadas": Decimal("500"),
            "base_despues_perdidas": Decimal("3500"),  # 4000 utilidad - 500
        },
    )
    monkeypatch.setattr(
        "app.services.calculos_fiscales._pagos_provisionales_isr",
        lambda *_args, **_kw: Decimal("500"),
    )
    monkeypatch.setattr(
        "app.services.calculos_fiscales.calcular_ieps_provisional",
        lambda *_: {"ieps_acumulado": 0.0, "aplica": False},
    )

    r = calcular_isr_anual(Db(), 1, 2025)
    assert r["ingresos_acumulados"] == 5000.0
    assert r["deducciones_acumuladas"] == 1000.0
    assert r["perdidas_fiscales"]["total_aplicado"] == 500.0
    assert r["base_gravable"] == 3500.0
    assert r["tarifa_progresiva"]["disponible"] is True
    assert r["saldo"] is not None
    # isr_causado tarifa anual sobre 3500 + retenciones 200 + pagos 500 => favor o cargo
    assert r["saldo"]["retenciones_isr"] == 200.0
    assert r["saldo"]["pagos_provisionales_anteriores"] == 500.0
    assert r["estatus"] == "estimado"


def test_ieps_sin_operaciones(monkeypatch):
    class Query:
        def filter(self, *a, **k):
            return self

        def all(self):
            return []

    class Db:
        def query(self, model):
            return Query()

    r = calcular_ieps_provisional(Db(), 1, 6, 2025)
    assert r["aplica"] is False
    assert r["ieps_periodo"] == 0.0
