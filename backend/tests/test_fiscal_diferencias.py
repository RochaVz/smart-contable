"""Pruebas del comparador CFDI vs polizas vs calculo fiscal."""

from decimal import Decimal
from types import SimpleNamespace

from app.models.poliza import TipoPoliza
from app.services.fiscal_diferencias import _diff, comparar_fuentes_fiscales


def test_diff_tolerancia_centavos():
    ok = _diff(Decimal("100.00"), Decimal("100.04"))
    assert ok["coincide"] is True
    fail = _diff(Decimal("100.00"), Decimal("100.10"))
    assert fail["coincide"] is False
    assert fail["diferencia"] == -0.1


def test_comparar_fuentes_fiscales_agrega_alertas(monkeypatch):
    rfc = "AAA010101AAA"
    facturas = [
        SimpleNamespace(
            tipo_comprobante="I",
            rfc_emisor=rfc,
            rfc_receptor="BBB010101BBB",
            subtotal=1000,
            iva_trasladado=160,
            total=1160,
        ),
        SimpleNamespace(
            tipo_comprobante="E",
            rfc_emisor="CCC010101CCC",
            rfc_receptor=rfc,
            subtotal=500,
            iva_trasladado=80,
            total=580,
        ),
    ]
    polizas = [
        SimpleNamespace(tipo=TipoPoliza.diario, total=1160),
        SimpleNamespace(tipo=TipoPoliza.egreso, total=580),
    ]

    class Query:
        def __init__(self, rows=None, scalar_val=0, first_val=None):
            self._rows = rows or []
            self._scalar = scalar_val
            self._first = first_val

        def filter(self, *args, **kwargs):
            return self

        def join(self, *args, **kwargs):
            return self

        def all(self):
            return self._rows

        def first(self):
            return self._first

        def scalar(self):
            return self._scalar

    class Db:
        def query(self, model):
            name = getattr(model, "__name__", str(model))
            if "Empresa" in name or name.endswith("Empresa"):
                return Query(first_val=SimpleNamespace(rfc=rfc))
            if "Factura" in name or name.endswith("Factura"):
                return Query(rows=facturas)
            if "Poliza" in name and "Movimiento" not in name:
                return Query(rows=polizas)
            # sumas IVA polizas
            return Query(scalar_val=0)

    monkeypatch.setattr(
        "app.services.fiscal_diferencias.calcular_iva_provisional",
        lambda *_a, **_k: {
            "periodo_actual": {
                "iva_trasladado": 160.0,
                "iva_acreditable": 80.0,
                "iva_retenido": 0.0,
                "iva_a_cargo": 80.0,
            }
        },
    )
    monkeypatch.setattr(
        "app.services.fiscal_diferencias.calcular_isr_provisional",
        lambda *_a, **_k: {
            "ingresos_acumulados": 1000.0,
            "base_gravable": 1000.0,
            "isr_estimado": 100.0,
            "parametros_faltantes": [],
            "estatus": "estimado",
        },
    )
    monkeypatch.setattr(
        "app.services.fiscal_diferencias.construir_diot",
        lambda *_a, **_k: {
            "exportable": True,
            "bloqueado_por_incompletos": False,
            "totales": {"proveedores_incompletos": 0},
        },
    )
    monkeypatch.setattr(
        "app.services.fiscal_diferencias.es_venta",
        lambda fac, r: (fac.rfc_emisor or "").upper() == r.upper(),
    )

    result = comparar_fuentes_fiscales(Db(), 1, 2, 2026)

    assert result["cfdi"]["facturas_ingreso"] == 1
    assert result["cfdi"]["facturas_egreso"] == 1
    assert result["cfdi"]["ingresos_iva"] == 160.0
    assert result["polizas"]["count"] == 2
    assert result["diferencias"]["iva_trasladado_cfdi_vs_fiscal"]["coincide"] is True
    assert result["estado_general"] in ("ok", "desvios", "pendiente")
    assert "diferencias" in result
