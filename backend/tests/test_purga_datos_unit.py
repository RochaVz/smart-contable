"""Tests unitarios de purga de carga de estado de cuenta."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.purga_datos import eliminar_carga_estado_cuenta


def test_eliminar_carga_no_encontrada():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    with pytest.raises(LookupError):
        eliminar_carga_estado_cuenta(db, empresa_id=1, carga_id=99)


def test_eliminar_carga_ok(monkeypatch):
    carga = SimpleNamespace(id=5, empresa_id=1, archivo_s3_key=None, nombre_archivo="edo.pdf")
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = carga
    db.query.return_value.filter.return_value.count.return_value = 2

    monkeypatch.setattr("app.services.purga_datos._borrar_archivos", lambda keys: 0)

    result = eliminar_carga_estado_cuenta(db, empresa_id=1, carga_id=5)
    assert result["carga_id"] == 5
    assert result["movimientos_eliminados"] == 2
    db.delete.assert_called_once_with(carga)
