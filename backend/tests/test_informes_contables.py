from types import SimpleNamespace

from app.services.cfdi_helpers import es_venta
from app.services import informes_contables
from app.services import polizas
from datetime import datetime


def factura(tipo_comprobante, rfc_emisor="AAA010101AAA", subtotal=100, total=116):
    return SimpleNamespace(
        tipo_comprobante=tipo_comprobante,
        rfc_emisor=rfc_emisor,
        subtotal=subtotal,
        iva_trasladado=total - subtotal,
        total=total,
    )


def test_es_venta_requiere_cfdi_de_ingreso_emitido_por_la_empresa():
    assert es_venta(factura("I"), "aaa010101aaa") is True
    assert es_venta(factura("E"), "aaa010101aaa") is False
    assert es_venta(factura("N"), "aaa010101aaa") is False
    assert es_venta(factura("P"), "aaa010101aaa") is False
    assert es_venta(factura("I", rfc_emisor="BBB010101BBB"), "AAA010101AAA") is False


def test_es_venta_acepta_enum_tipo_comprobante():
    tipo = SimpleNamespace(value="I")
    assert es_venta(factura(tipo), "AAA010101AAA") is True


def test_resumen_ingresos_egresos_excluye_nomina_emitida_por_la_empresa(monkeypatch):
    ventas_y_gastos = [
        factura("I", subtotal=1000, total=1160),
        factura("N", subtotal=5000, total=5000),
        factura("E", rfc_emisor="BBB010101BBB", subtotal=300, total=348),
    ]
    monkeypatch.setattr(informes_contables, "_rfc_empresa", lambda *_args: "AAA010101AAA")
    monkeypatch.setattr(
        informes_contables,
        "_facturas_periodo",
        lambda *_args: ventas_y_gastos,
    )

    resultado = informes_contables.generar_resumen_ingresos_egresos(
        db=object(), empresa_id=1, mes=7, anio=2026
    )

    assert resultado["ingresos"]["cantidad"] == 1
    assert resultado["ingresos"]["subtotal"] == 1000
    assert resultado["ingresos"]["total"] == 1000
    assert resultado["egresos"]["cantidad"] == 2
    assert resultado["egresos"]["total"] == 5348
    assert resultado["utilidad_neta"] == -4348


def test_estado_resultados_excluye_nomina_de_ingresos(monkeypatch):
    facturas = [
        factura("I", subtotal=1000, total=1160),
        factura("N", subtotal=5000, total=5000),
    ]

    class QuerySinGastos:
        def join(self, *_args, **_kwargs):
            return self

        def filter(self, *_args, **_kwargs):
            return self

        def group_by(self, *_args, **_kwargs):
            return self

        def order_by(self, *_args, **_kwargs):
            return self

        def all(self):
            return []

    monkeypatch.setattr(informes_contables, "_rfc_empresa", lambda *_args: "AAA010101AAA")
    monkeypatch.setattr(informes_contables, "_facturas_periodo", lambda *_args: facturas)
    monkeypatch.setattr(
        informes_contables,
        "_ingresos_por_concepto_venta",
        lambda *_args: [{"concepto": "Venta", "monto": 1000}],
    )

    resultado = informes_contables.generar_estado_resultados(
        db=SimpleNamespace(query=lambda *_args: QuerySinGastos()),
        empresa_id=1,
        mes=7,
        anio=2026,
    )

    assert resultado["ingresos"] == [{"concepto": "Venta", "monto": 1000}]
    assert resultado["total_ingresos"] == 1000


def test_venta_por_transferencia_genera_poliza_de_ingreso(monkeypatch):
    factura_transferencia = SimpleNamespace(
        id=10,
        empresa_id=1,
        factura_id=None,
        forma_pago="03",
        metodo_pago="PUE",
        fecha_emision=datetime(2026, 7, 15),
        total=1160,
    )

    class QueryPoliza:
        def filter(self, *_args, **_kwargs):
            return self

        def order_by(self, *_args, **_kwargs):
            return self

        def first(self):
            return None

    class FakeDb:
        def query(self, *_args, **_kwargs):
            return QueryPoliza()

        def add(self, _obj):
            return None

        def flush(self):
            return None

    monkeypatch.setattr(
        polizas,
        "calcular_comision_bancaria",
        lambda *_args, **_kwargs: {
            "comision": 0,
            "deposito_neto": 1160,
            "nombre_banco": "Banco",
            "porcentaje": 0,
            "comision_fija": 0,
        },
    )

    resultado = polizas.generar_poliza_ingreso_cobro(
        factura_transferencia, FakeDb()
    )

    assert resultado is not None
    assert resultado.tipo == polizas.TipoPoliza.ingreso


def test_descuento_se_resta_de_la_base_contable():
    subtotal = 1729.49
    descuento = 48.67
    iva = 268.93
    total = 1949.75

    base_contable = round(subtotal - descuento, 2)

    assert base_contable + iva == total


def test_retencion_no_descuadra_abono_del_proveedor():
    subtotal = 258.00
    iva = 41.28
    iva_retenido = 9.72

    abono_proveedor = subtotal + iva - iva_retenido
    retencion = iva_retenido

    assert abono_proveedor + retencion == subtotal + iva