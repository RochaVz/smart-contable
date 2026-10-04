"""Tests del resumen informativo del motor fiscal SAT."""
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.resumen_fiscal_sat import construir_resumen_fiscal_sat


def test_construir_resumen_fiscal_sat_estructura(monkeypatch):
    empresa = SimpleNamespace(
        id=1,
        razon_social="Demo SA",
        rfc="AAA010101AAA",
        tipo_persona="moral",
        regimen_fiscal="601",
        nombre="Demo",
    )

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = empresa

    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_isr_provisional",
        lambda *_a, **_k: {"isr_a_cargo": 1500.5, "isr_retenido": 100},
    )
    monkeypatch.setattr(
        "app.services.resumen_fiscal_sat.calcular_iva_provisional",
        lambda *_a, **_k: {
            "iva_a_cargo": 800,
            "iva_a_favor": 0,
            "iva_retenido": 50,
        },
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
