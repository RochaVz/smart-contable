"""Tests de consulta fiscal con importes fiscales persistidos."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.resumen_fiscal_sat import construir_resumen_fiscal_sat


def _db_con_empresa(empresa):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = empresa
    return db


def _declaracion(tipo, monto_a_cargo, monto_a_favor=0):
    return SimpleNamespace(
        id=tipo,
        tipo=tipo,
        estado="calculada",
        version=1,
        monto_a_cargo=monto_a_cargo,
        monto_a_favor=monto_a_favor,
    )


def _reportes(monkeypatch, ish_cfdi=0, iva=0, acreditable=0, ret_isr=0, ret_iva=0):
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.generar_impuestos_trasladados",
        lambda *_args: {
            "total_impuestos_locales_cfdi": ish_cfdi,
            "total_impuestos_locales": 999999,
            "total_iva_trasladado": iva,
            "iva_desde_polizas": iva,
        },
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.generar_impuestos_acreditables",
        lambda *_args: {
            "total_iva_acreditable": acreditable,
            "iva_desde_polizas": acreditable,
        },
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.generar_impuestos_retenidos",
        lambda *_args: {
            "total_isr_retenido": ret_isr,
            "total_iva_retenido": ret_iva,
            "total_retenciones": ret_isr + ret_iva,
        },
    )


def _empresa(regimen="601"):
    return SimpleNamespace(
        id=1,
        razon_social="Hotel Demo SA",
        rfc="AAA010101AAA",
        tipo_persona="moral",
        regimen_fiscal=regimen,
        nombre="Hotel Demo",
    )


def test_resumen_usa_importes_declarados_y_mantiene_ceros(monkeypatch):
    db = _db_con_empresa(_empresa())
    declaracion_isr = _declaracion("isr", 0)
    declaracion_iva = _declaracion("iva", 800, 0)
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat._declaraciones_registradas",
        lambda *_args: {"isr": declaracion_isr, "iva": declaracion_iva},
    )
    _reportes(monkeypatch, ish_cfdi=1250.75, iva=11200, acreditable=3000, ret_isr=100, ret_iva=50)

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=3, anio=2026)

    assert resumen["totales"]["isr_a_cargo"] == 0
    assert resumen["totales"]["iva_a_cargo"] == 800
    assert resumen["totales"]["iva_a_favor"] == 0
    assert resumen["totales"]["ish"] == 1250.75
    assert resumen["totales"]["retenciones"] == 150
    assert resumen["totales"]["total_a_pagar"] is None
    assert resumen["impuestos"]["iva"]["detalle"]["trasladado"] == 11200
    assert resumen["impuestos"]["iva"]["detalle"]["acreditable"] == 3000
    assert resumen["impuestos"]["ish"]["detalle"]["origen"] == "cfdi_ingreso"
    assert resumen["sugerencias_pago"] == []
    assert resumen["acciones"] == []
    assert len(resumen["declaraciones_registradas"]) == 2


def test_resumen_no_infiere_importes_netos_sin_declaraciones(monkeypatch):
    db = _db_con_empresa(_empresa())
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat._declaraciones_registradas",
        lambda *_args: {},
    )
    _reportes(monkeypatch, ish_cfdi=250, iva=1000, acreditable=200, ret_isr=30, ret_iva=20)

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=4, anio=2026)

    assert resumen["totales"]["isr_a_cargo"] is None
    assert resumen["totales"]["iva_a_cargo"] is None
    assert resumen["totales"]["iva_a_favor"] is None
    assert resumen["totales"]["total_a_pagar"] is None
    assert resumen["totales"]["ish"] == 250
    assert resumen["totales"]["retenciones"] == 50
    assert resumen["declaraciones_registradas"] == []


def test_ish_usa_cfdi_de_ingreso_no_el_total_de_polizas(monkeypatch):
    db = _db_con_empresa(_empresa())
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat._declaraciones_registradas",
        lambda *_args: {},
    )
    _reportes(monkeypatch, ish_cfdi=1250.75)

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=8, anio=2026)

    assert resumen["totales"]["ish"] == 1250.75


def test_resumen_no_oculta_importes_declarados_por_regimen(monkeypatch):
    db = _db_con_empresa(_empresa(regimen="605"))
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat._declaraciones_registradas",
        lambda *_args: {"iva": _declaracion("iva", 700)},
    )
    _reportes(monkeypatch)

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=1, anio=2026)

    assert resumen["impuestos"]["iva"]["aplica"] is False
    assert resumen["totales"]["iva_a_cargo"] == 700
