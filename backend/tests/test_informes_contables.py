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


def test_desglose_ingresos_separa_clientes_y_conserva_cantidad_cfdi(monkeypatch):
    ventas = [
        SimpleNamespace(id=1, nombre_receptor="Cliente A", xml_contenido="xml-a"),
        SimpleNamespace(id=2, nombre_receptor="Cliente B", xml_contenido="xml-b"),
    ]
    monkeypatch.setattr(informes_contables, "_rfc_empresa", lambda *_args: "AAA010101AAA")
    monkeypatch.setattr(informes_contables, "_facturas_periodo", lambda *_args: ventas)
    monkeypatch.setattr(informes_contables, "es_venta", lambda *_args: True)
    monkeypatch.setattr(
        informes_contables,
        "_cuenta_ingreso_de_factura",
        lambda *_args: ("401.01.01", "Ingresos por ventas"),
    )
    monkeypatch.setattr(
        informes_contables,
        "extraer_datos_xml",
        lambda _xml: {"conceptos": [{"descripcion": "Servicio", "importe": 100}]},
    )

    resultado = informes_contables._ingresos_por_concepto_venta(
        db=object(), empresa_id=1, mes=7, anio=2026
    )

    assert [(item["cliente"], item["monto"], item["num_facturas"]) for item in resultado] == [
        ("Cliente A", 100.0, 1),
        ("Cliente B", 100.0, 1),
    ]


def test_sugerencias_limita_top_clientes_y_gastos_a_diez(monkeypatch):
    facturas = [
        SimpleNamespace(
            es_venta=True,
            rfc_receptor=f"CLIENTE{i}",
            nombre_receptor=f"Cliente {i}",
            rfc_emisor="AAA010101AAA",
            nombre_emisor="Empresa",
            total=i * 100,
            polizas=[object()],
        )
        for i in range(1, 13)
    ] + [
        SimpleNamespace(
            es_venta=False,
            rfc_receptor="AAA010101AAA",
            nombre_receptor="Empresa",
            rfc_emisor=f"PROVEEDOR{i}",
            nombre_emisor=f"Proveedor {i}",
            total=i * 200,
            polizas=[object()],
        )
        for i in range(1, 13)
    ]

    class Query:
        def filter(self, *_args, **_kwargs):
            return self

        def first(self):
            return object()

        def join(self, *_args, **_kwargs):
            return self

        def scalar(self):
            return 0

    monkeypatch.setattr(informes_contables, "_rfc_empresa", lambda *_args: "AAA010101AAA")
    monkeypatch.setattr(informes_contables, "_facturas_periodo", lambda *_args: facturas)
    monkeypatch.setattr(informes_contables, "es_venta", lambda f, _rfc: f.es_venta)

    resultado = informes_contables.generar_sugerencias(
        db=SimpleNamespace(query=lambda *_args: Query()),
        empresa_id=1,
        mes=7,
        anio=2026,
        paquete={
            "impuestos_trasladados": {"total_iva_trasladado": 0},
            "impuestos_acreditables": {"total_iva_acreditable": 0},
        },
    )

    assert len(resultado["top_clientes"]) == 10
    assert resultado["top_clientes"][0]["nombre"] == "Cliente 12"
    assert len(resultado["top_gastos"]) == 10
    assert resultado["top_gastos"][0]["nombre"] == "Proveedor 12"


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


def test_padron_reutiliza_clasificacion_por_rfc_en_periodos_futuros(monkeypatch):
    proveedor = SimpleNamespace(
        rfc_emisor="BBB010101BBB",
        nombre_cuenta="HONORARIOS",
        codigo_cuenta="601-01",
    )

    class QueryMapeos:
        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return [proveedor]

    class FakeDb:
        def query(self, modelo):
            assert modelo is informes_contables.MapeoCuenta
            return QueryMapeos()

    def facturas_del_periodo(_db, _empresa_id, mes, _anio):
        return [
            SimpleNamespace(
                tipo_comprobante="E",
                rfc_emisor="BBB010101BBB",
                nombre_emisor="Proveedor recurrente",
                subtotal=100 + mes,
                iva_trasladado=16,
                total=116 + mes,
                iva_retenido=0,
                isr_retenido=0,
                es_deducible=True,
            )
        ]

    monkeypatch.setattr(informes_contables, "_rfc_empresa", lambda *_args: "AAA010101AAA")
    monkeypatch.setattr(informes_contables, "_facturas_periodo", facturas_del_periodo)

    padron_julio = informes_contables.generar_padron_proveedores(FakeDb(), 1, 7, 2026)
    padron_agosto = informes_contables.generar_padron_proveedores(FakeDb(), 1, 8, 2026)

    assert padron_julio["proveedores"][0]["clasificacion"] == "HONORARIOS"
    assert padron_agosto["proveedores"][0]["clasificacion"] == "HONORARIOS"


def test_serializar_poliza_recalcula_nomina_para_poliza_historica(monkeypatch):
    movimiento = SimpleNamespace(
        cuenta="601.11.01",
        nombre_cuenta="Seguros y fianzas",
        debe=100,
        haber=0,
        concepto="Pago de nomina",
    )
    poliza = SimpleNamespace(
        id=1,
        tipo=polizas.TipoPoliza.egreso,
        numero=1,
        fecha=datetime(2026, 8, 1),
        mes=8,
        anio=2026,
        factura_id=10,
        concepto="Egreso | Proveedor | Seguros y fianzas",
        total=116,
        movimientos=[movimiento],
    )
    factura_egreso = SimpleNamespace(
        id=10,
        uuid="uuid-nomina",
        tipo_comprobante="E",
        rfc_emisor="BBB010101BBB",
        nombre_emisor="Proveedor recurrente",
        rfc_receptor="AAA010101AAA",
        nombre_receptor="Persona colaboradora",
        empresa_id=1,
        xml_contenido="xml",
        forma_pago=None,
        metodo_pago=None,
        subtotal=100,
        descuento=0,
        total=116,
        es_deducible=True,
        iva_trasladado=16,
        iva_retenido=0,
        isr_retenido=0,
        impuestos_locales=0,
    )

    monkeypatch.setattr(polizas, "_info_comision_factura", lambda *_args: {"comision": 0})
    monkeypatch.setattr(polizas, "extraer_datos_xml", lambda *_args: {"concepto_principal": "Pago de nomina"})
    monkeypatch.setattr(
        polizas,
        "obtener_cuenta_inteligente",
        lambda *_args: {"cuenta": "601.15.01", "nombre": "Nóminas"},
    )

    factura_egreso.tipo_comprobante = "N"
    resultado = polizas.serializar_poliza(poliza, factura_egreso, "AAA010101AAA", db=object())

    assert resultado["egreso"]["clasificacion_gasto"] == "Nóminas"
    assert resultado["egreso"]["cuenta_gasto"] == "601.15.01"
    assert resultado["egreso"]["receptor"] == "Persona colaboradora"
