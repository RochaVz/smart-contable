"""Pruebas de indicadores de seguimiento fiscal."""

from types import SimpleNamespace

import pytest

from app.services.fiscal_indicadores import (
    MODULOS_REVISION,
    _pct,
    _score_salud,
    construir_indicadores_fiscales,
    registrar_revision_contable,
)


def test_pct_basico():
    assert _pct(1, 2) == 50.0
    assert _pct(0, 0) == 0.0
    assert _pct(3, 3) == 100.0


def test_score_salud_niveles():
    alto = _score_salud(
        {
            "requisitos": 100,
            "pruebas": 100,
            "ux_tablas": 100,
            "diferencias": 100,
            "diot": 100,
            "revision": 100,
        }
    )
    assert alto["nivel"] == "saludable"
    assert alto["score"] == 100.0

    bajo = _score_salud(
        {
            "requisitos": 10,
            "pruebas": 10,
            "ux_tablas": 10,
            "diferencias": 10,
            "diot": 10,
            "revision": 10,
        }
    )
    assert bajo["nivel"] == "critico"


def test_construir_indicadores_agrega_bloques(monkeypatch):
    monkeypatch.setattr(
        "app.services.fiscal_indicadores.comparar_fuentes_fiscales",
        lambda *_a, **_k: {
            "estado_general": "ok",
            "pendientes": [],
            "alertas": [],
            "diferencias": {
                "a": {"coincide": True, "diferencia": 0},
                "b": {"coincide": False, "diferencia": 1.5},
            },
        },
    )
    monkeypatch.setattr(
        "app.services.fiscal_indicadores.construir_diot",
        lambda *_a, **_k: {
            "exportable": False,
            "bloqueado_por_incompletos": True,
            "totales": {
                "proveedores": 4,
                "proveedores_completos": 3,
                "proveedores_incompletos": 1,
            },
        },
    )

    class Q:
        def filter(self, *a, **k):
            return self

        def order_by(self, *a, **k):
            return self

        def limit(self, *a, **k):
            return self

        def all(self):
            return []

    class Db:
        def query(self, *a, **k):
            return Q()

    result = construir_indicadores_fiscales(Db(), 7, 3, 2026)

    assert result["empresa_id"] == 7
    assert result["periodo"] == {"mes": 3, "anio": 2026}
    assert result["requisitos_fiscales"]["porcentaje"] == 100.0
    assert result["diot"]["incompletos"] == 1
    assert result["diot"]["porcentaje_completos"] == 75.0
    assert result["diferencias"]["desvios"] == 0 or result["diferencias"]["comparaciones"] == 2
    assert result["diferencias"]["coinciden"] == 1
    assert "salud" in result
    assert result["revision_contable"]["total_modulos"] == len(MODULOS_REVISION)
    assert result["exportaciones"]["errores_registrados"] == 0


def test_registrar_revision_contable_valida_modulo(monkeypatch):
    class Db:
        pass

    called = {}

    def fake_reg(*args, **kwargs):
        called.update(kwargs)
        return SimpleNamespace(id=99, resumen=kwargs["resumen"], creado_en=None)

    monkeypatch.setattr(
        "app.services.fiscal_indicadores.registrar_evento_historial",
        fake_reg,
    )

    out = registrar_revision_contable(
        Db(),
        empresa_id=1,
        usuario_id=2,
        modulo="diot",
        mes=1,
        anio=2026,
        notas="OK contador",
        commit=True,
    )
    assert out["modulo"] == "diot"
    assert out["id"] == 99
    assert called["motivo"] == "revision_contable_aprobada"

    with pytest.raises(ValueError):
        registrar_revision_contable(
            Db(),
            empresa_id=1,
            usuario_id=2,
            modulo="no_existe",
            mes=1,
            anio=2026,
        )
