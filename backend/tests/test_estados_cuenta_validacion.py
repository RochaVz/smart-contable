"""Tests de validación RFC y catálogo de bancos para estados de cuenta."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.core.bancos import listar_bancos_catalogo, resolver_banco_catalogo
from app.services.estados_cuenta_validacion import (
    buscar_carga_duplicada,
    extraer_rfcs_de_texto,
    validar_rfc_estado_cuenta,
)


def test_extraer_rfc_titular_desde_texto():
    texto = "ESTADO DE CUENTA\nRFC titular: ABC010203AB1\nSaldo: 1000"
    rfcs = extraer_rfcs_de_texto(texto)
    assert "ABC010203AB1" in rfcs


def test_validar_rfc_coincide():
    empresa = SimpleNamespace(rfc="ABC010203AB1")
    result = validar_rfc_estado_cuenta(empresa, ["ABC010203AB1"])
    assert result["ok"] is True
    assert result["coincide"] is True


def test_validar_rfc_no_coincide_lanza():
    empresa = SimpleNamespace(rfc="ABC010203AB1")
    with pytest.raises(ValueError, match="no corresponde"):
        validar_rfc_estado_cuenta(empresa, ["XYZ010203XY9"])


def test_validar_sin_rfc_permite():
    empresa = SimpleNamespace(rfc="ABC010203AB1")
    result = validar_rfc_estado_cuenta(empresa, [])
    assert result["ok"] is True
    assert result["coincide"] is None


def test_buscar_carga_duplicada():
    carga = SimpleNamespace(id=9, nombre_archivo="edo.pdf")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = carga
    found = buscar_carga_duplicada(db, empresa_id=1, hash_archivo_value="abc")
    assert found is carga


def test_catalogo_bancos_incluye_principales():
    catalogo = listar_bancos_catalogo()
    nombres = {b["nombre"].lower() for b in catalogo}
    assert any("bbva" in n or "bancomer" in n for n in nombres)
    assert any("banamex" in n for n in nombres)
    assert any("hsbc" in n for n in nombres)
    assert any("santander" in n for n in nombres)
    assert resolver_banco_catalogo("bancomer")["clave"] == "bbva"
