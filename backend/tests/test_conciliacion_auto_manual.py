"""Tests de clasificación y vínculo de conciliación automática/manual."""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.models.poliza import TipoPoliza
from app.services.conciliacion import (
    clasificar_tipo_poliza_movimiento,
    vincular_movimiento_poliza,
)


def _mov(tipo: str, descripcion: str = "") -> SimpleNamespace:
    return SimpleNamespace(tipo=tipo, descripcion=descripcion)


@pytest.mark.parametrize(
    "tipo,descripcion,esperado",
    [
        ("abono", "DEPOSITO CLIENTE SPEI", TipoPoliza.ingreso.value),
        ("abono", "Transferencia recibida", TipoPoliza.ingreso.value),
        ("cargo", "Pago proveedor factura", TipoPoliza.egreso.value),
        ("cargo", "COMPRA SUPERMERCADO", TipoPoliza.egreso.value),
        ("cargo", "AJUSTE contable mes", TipoPoliza.diario.value),
        ("abono", "RECLASIFICACION de saldos", TipoPoliza.diario.value),
        ("cargo", "TRASPASO entre cuentas propias", TipoPoliza.diario.value),
        ("abono", "COMPENSACIÓN de saldos", TipoPoliza.diario.value),
        ("cargo", "ASIENTO de diario", TipoPoliza.diario.value),
        ("cargo", "CORRECCIÓN bancaria", TipoPoliza.diario.value),
    ],
)
def test_clasificar_tipo_poliza_movimiento(tipo, descripcion, esperado):
    assert clasificar_tipo_poliza_movimiento(_mov(tipo, descripcion)) == esperado


def test_vincular_movimiento_poliza_marca_modo_y_tipo():
    mov = SimpleNamespace(
        poliza_id=None,
        modo_conciliacion=None,
        tipo_asignacion=None,
        conciliado_en=None,
    )
    poliza = {"poliza_id": 42, "tipo": "ingreso"}

    vincular_movimiento_poliza(mov, poliza, modo="automatico", tipo_asignacion="ingreso")

    assert mov.poliza_id == 42
    assert mov.modo_conciliacion == "automatico"
    assert mov.tipo_asignacion == "ingreso"
    assert mov.conciliado_en is not None


def test_vincular_movimiento_manual_desde_objeto_poliza():
    mov = SimpleNamespace(
        poliza_id=None,
        modo_conciliacion=None,
        tipo_asignacion=None,
        conciliado_en=None,
    )
    poliza = SimpleNamespace(id=99, tipo=TipoPoliza.diario)

    vincular_movimiento_poliza(mov, poliza, modo="manual")

    assert mov.poliza_id == 99
    assert mov.modo_conciliacion == "manual"
    assert mov.tipo_asignacion == "diario"


def test_asignar_conciliacion_manual_valida_tipo(monkeypatch):
    from app.services import conciliacion as mod

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(
        id=1,
        empresa_id=1,
        descripcion="Pago",
        tipo="cargo",
        fecha=datetime(2026, 3, 1),
        monto=100,
        poliza_id=None,
    )

    fake_poliza = SimpleNamespace(
        id=7,
        tipo=TipoPoliza.egreso,
        numero=1,
        fecha=datetime(2026, 3, 1).date(),
        concepto="Pago",
        empresa_id=1,
    )
    monkeypatch.setattr(
        "app.services.polizas.generar_poliza_movimiento_banco",
        lambda **kwargs: fake_poliza,
    )
    # _monto_banco_poliza / serialización dependen de asientos; stub serializar
    monkeypatch.setattr(mod, "_serializar_poliza_obj", lambda p: {"poliza_id": p.id, "tipo": "egreso"})
    monkeypatch.setattr(
        mod,
        "_serializar_movimiento",
        lambda m: {"id": m.id, "modo_conciliacion": m.modo_conciliacion, "tipo_asignacion": m.tipo_asignacion},
    )

    resultado = mod.asignar_conciliacion_manual(
        db=db,
        empresa_id=1,
        movimiento_id=1,
        tipo_poliza="egreso",
    )

    assert resultado["modo_conciliacion"] == "manual"
    assert resultado["movimiento"]["tipo_asignacion"] == "egreso"
    db.commit.assert_called()


def test_asignar_conciliacion_manual_rechaza_tipo_invalido():
    from app.services.conciliacion import asignar_conciliacion_manual

    with pytest.raises(ValueError, match="tipo_poliza"):
        asignar_conciliacion_manual(
            db=MagicMock(),
            empresa_id=1,
            movimiento_id=1,
            tipo_poliza="otro",
        )
