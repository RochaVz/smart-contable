"""Tests del resumen informativo del motor fiscal SAT."""
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.resumen_fiscal_sat import construir_resumen_fiscal_sat


def _db_con_empresa(empresa):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = empresa
    return db


def _isr(isr_a_cargo, retenciones_isr=0.0, isr_causado=0.0, retenciones_acumuladas=None):
    """Estructura real de `calcular_isr_provisional`: los importes van anidados en `saldo`."""
    return {
        "isr_estimado": isr_a_cargo,
        "retenciones_isr": (
            retenciones_acumuladas if retenciones_acumuladas is not None else retenciones_isr
        ),
        "saldo": {
            "isr_causado": isr_causado,
            "pagos_provisionales_anteriores": 0.0,
            "retenciones_isr": retenciones_isr,
            "isr_a_cargo": isr_a_cargo,
            "saldo_a_favor": 0.0,
        },
        "parametros_faltantes": [],
    }


def _iva(iva_a_cargo, iva_trasladado=None, iva_retenido=0.0, ish=0.0):
    """Estructura real de `calcular_iva_provisional`: los importes van en `periodo_actual`."""
    return {
        "periodo_actual": {
            "iva_trasladado": iva_trasladado if iva_trasladado is not None else iva_a_cargo,
            "iva_acreditable": 0.0,
            "iva_retenido": iva_retenido,
            "iva_a_cargo": iva_a_cargo,
            "saldo_a_favor": 0.0,
            "ish": ish,
        },
        "acumulado_anual": {},
    }


def test_construir_resumen_fiscal_sat_estructura(monkeypatch):
    empresa = SimpleNamespace(
        id=1,
        razon_social="Demo SA",
        rfc="AAA010101AAA",
        tipo_persona="moral",
        regimen_fiscal="601",
        nombre="Demo",
    )

    db = _db_con_empresa(empresa)

    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_isr_provisional",
        lambda *_a, **_k: _isr(1500.5, retenciones_isr=100),
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_iva_provisional",
        lambda *_a, **_k: _iva(800, iva_retenido=50),
    )

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=3, anio=2026)

    assert "informativo" in resumen["aviso"].lower() or "no sustituye" in resumen["aviso"].lower()
    assert resumen["periodo"]["mes"] == 3
    assert resumen["periodo"]["anio"] == 2026
    assert resumen["impuestos"]["isr"]["a_cargo"] == 1500.5
    assert resumen["impuestos"]["iva"]["a_cargo"] == 800
    assert resumen["impuestos"]["retenciones"]["total"] == 150.0
    assert any(d["tipo"] == "IVA" for d in resumen["declaraciones"])
    assert any(d["tipo"] == "ISR" for d in resumen["declaraciones"])
    assert any(d["periodicidad"] == "anual" for d in resumen["declaraciones"])
    assert any(s["concepto"] == "ISR provisional" for s in resumen["sugerencias_pago"])
    assert any(s["concepto"] == "IVA a cargo" for s in resumen["sugerencias_pago"])
    # Vencimiento aproximado: día 17 del mes siguiente
    assert resumen["declaraciones"][0]["proximo_vencimiento"] == "2026-04-17"
    assert resumen["totales"]["total_a_pagar"] == 2450.5  # 1500.5 + 800 + 150 retenciones
    assert any(i["clave"] == "ish" for i in resumen["impuestos_no_aplicables"])
    assert resumen["obligaciones_regimen"]["aplica_ish"] is False
    assert any(a["tipo"] == "pago_provisional_isr" for a in resumen["acciones"])


def test_resumen_sueldos_no_aplica_iva_ni_ish(monkeypatch):
    empresa = SimpleNamespace(
        id=2,
        razon_social="Empleado",
        rfc="XAXX010101000",
        tipo_persona="fisica",
        regimen_fiscal="605",
        nombre="Empleado",
    )
    db = _db_con_empresa(empresa)
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_isr_provisional",
        lambda *_a, **_k: _isr(200, retenciones_isr=0),
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_iva_provisional",
        lambda *_a, **_k: _iva(999, iva_retenido=0),
    )

    resumen = construir_resumen_fiscal_sat(db, empresa_id=2, mes=1, anio=2026)
    assert resumen["impuestos"]["iva"]["aplica"] is False
    assert resumen["impuestos"]["iva"]["a_cargo"] == 0
    assert any(i["clave"] == "ish" for i in resumen["impuestos_no_aplicables"])
    assert not any(d["tipo"] == "IVA" for d in resumen["declaraciones"])
    assert not any(s["concepto"] == "IVA a cargo" for s in resumen["sugerencias_pago"])


def test_totales_reflejan_el_calculo_anidado_saldo_y_periodo_actual(monkeypatch):
    """Regresión: los totales deben tomar los importes de `saldo`/`periodo_actual`.

    Si el resumen leyera claves inexistentes (respuesta plana) devolvería ceros
    y el dashboard mostraría $0.00 pese a que el motor sí calculó el impuesto.
    """
    empresa = SimpleNamespace(
        id=1,
        razon_social="Demo SA",
        rfc="AAA010101AAA",
        tipo_persona="moral",
        regimen_fiscal="601",
        nombre="Demo",
    )
    db = _db_con_empresa(empresa)

    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_isr_provisional",
        lambda *_a, **_k: _isr(8450.5, retenciones_isr=300, isr_causado=9000.0),
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_iva_provisional",
        lambda *_a, **_k: _iva(9713.03, iva_trasladado=11200.0, iva_retenido=200),
    )

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=8, anio=2026)

    assert resumen["totales"]["isr_a_cargo"] == 8450.5
    assert resumen["totales"]["iva_a_cargo"] == 9713.03
    assert resumen["totales"]["retenciones"] == 500.0
    assert resumen["impuestos"]["isr"]["a_cargo"] == 8450.5
    assert resumen["impuestos"]["iva"]["a_cargo"] == 9713.03
    assert resumen["impuestos"]["iva"]["detalle"]["periodo_actual"]["iva_a_cargo"] == 9713.03
    assert resumen["totales"]["total_a_pagar"] > 0


def test_retenciones_isr_tienen_precedencia_el_saldo_del_periodo(monkeypatch):
    """`saldo.retenciones_isr` es el importe del periodo; el nivel superior es el acumulado."""
    empresa = SimpleNamespace(
        id=1,
        razon_social="Demo SA",
        rfc="AAA010101AAA",
        tipo_persona="moral",
        regimen_fiscal="601",
        nombre="Demo",
    )
    db = _db_con_empresa(empresa)

    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_isr_provisional",
        lambda *_a, **_k: _isr(1500.5, retenciones_isr=100, retenciones_acumuladas=900.0),
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_iva_provisional",
        lambda *_a, **_k: _iva(800),
    )

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=3, anio=2026)

    assert resumen["impuestos"]["retenciones"]["isr"] == 100.0
    assert resumen["totales"]["retenciones"] == 100.0


def test_resumen_expone_ish_calculado_desde_los_cfdi(monkeypatch):
    """El ISH se expone en totales, en el bloque de impuestos y como sugerencia de pago."""
    empresa = SimpleNamespace(
        id=1,
        razon_social="Hotel Demo SA",
        rfc="AAA010101AAA",
        tipo_persona="moral",
        regimen_fiscal="601",
        nombre="Hotel Demo",
    )
    db = _db_con_empresa(empresa)

    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_isr_provisional",
        lambda *_a, **_k: _isr(1500.5, retenciones_isr=100),
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_iva_provisional",
        lambda *_a, **_k: _iva(800, iva_retenido=50, ish=1250.75),
    )

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=3, anio=2026)

    assert resumen["totales"]["ish"] == 1250.75
    assert resumen["impuestos"]["ish"]["a_cargo"] == 1250.75
    assert resumen["impuestos"]["ish"]["detalle"]["ish"] == 1250.75
    # El importe del CFDI es autoritativo: no se anula aunque el régimen no marque ISH.
    assert resumen["totales"]["ish"] > 0

    ish_sug = next(s for s in resumen["sugerencias_pago"] if s["clave"] == "ish")
    assert ish_sug["monto"] == 1250.75
    assert ish_sug["accion"] == "pagar"
    assert any(a["tipo"] == "pago_ish" for a in resumen["acciones"])
    # El ISH es exigible: entra en el total a pagar.
    assert resumen["totales"]["total_a_pagar"] == 2450.5 + 1250.75


def test_resumen_sin_ish_no_agrega_concepto_ni_total(monkeypatch):
    empresa = SimpleNamespace(
        id=1,
        razon_social="Demo SA",
        rfc="AAA010101AAA",
        tipo_persona="moral",
        regimen_fiscal="601",
        nombre="Demo",
    )
    db = _db_con_empresa(empresa)

    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_isr_provisional",
        lambda *_a, **_k: _isr(1500.5, retenciones_isr=100),
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_iva_provisional",
        lambda *_a, **_k: _iva(800, iva_retenido=50),
    )

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=3, anio=2026)

    assert resumen["totales"]["ish"] == 0
    assert resumen["impuestos"]["ish"]["a_cargo"] == 0
    assert not any(s["clave"] == "ish" for s in resumen["sugerencias_pago"])
    assert resumen["totales"]["total_a_pagar"] == 2450.5


def test_resumen_acepta_estructura_plana_legacy(monkeypatch):
    """Los fixtures planos de versiones anteriores deben seguir produciendo importes."""
    empresa = SimpleNamespace(
        id=1,
        razon_social="Demo SA",
        rfc="AAA010101AAA",
        tipo_persona="moral",
        regimen_fiscal="601",
        nombre="Demo",
    )
    db = _db_con_empresa(empresa)

    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_isr_provisional",
        lambda *_a, **_k: {"isr_a_cargo": 1500.5, "isr_retenido": 100},
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_iva_provisional",
        lambda *_a, **_k: {"iva_a_cargo": 800, "iva_a_favor": 0, "iva_retenido": 50},
    )

    resumen = construir_resumen_fiscal_sat(db, empresa_id=1, mes=3, anio=2026)

    assert resumen["totales"]["isr_a_cargo"] == 1500.5
    assert resumen["totales"]["iva_a_cargo"] == 800
    assert resumen["impuestos"]["retenciones"]["total"] == 150.0
    assert resumen["totales"]["total_a_pagar"] == 2450.5
