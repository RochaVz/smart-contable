from types import SimpleNamespace
from unittest.mock import Mock

from app.api.v1.endpoints.empresas import crear_empresa
from app.schemas.empresa import EmpresaCreate


import pytest
from app.core.exceptions import DuplicateResourceException
from app.models.empresa import Empresa


def test_crear_empresa_reactiva_empresa_inactiva_del_mismo_usuario():
    empresa_inactiva = SimpleNamespace(
        id=14,
        usuario_id=7,
        activo=False,
        razon_social="Nombre anterior",
        regimen_fiscal="601",
        tipo_persona="moral",
        opcion_deduccion=None,
        codigo_postal="01000",
    )
    resultado_consulta = Mock()
    resultado_consulta.first.return_value = empresa_inactiva
    db = Mock()
    db.query.return_value.filter.return_value = resultado_consulta

    datos = EmpresaCreate(
        rfc="ABC010203AB1",
        razon_social="Nombre actualizado",
        regimen_fiscal="612",
        tipo_persona="fisica",
        opcion_deduccion=None,
        codigo_postal="64000",
    )

    resultado = crear_empresa(datos, db, SimpleNamespace(id=7))

    assert resultado is empresa_inactiva
    assert empresa_inactiva.activo is True
    assert empresa_inactiva.razon_social == "Nombre actualizado"
    assert empresa_inactiva.regimen_fiscal == "612"
    assert empresa_inactiva.tipo_persona == "fisica"
    assert empresa_inactiva.codigo_postal == "64000"
    db.add.assert_not_called()
    db.commit.assert_called_once()
    db.refresh.assert_called_once_with(empresa_inactiva)


def test_crear_empresa_permite_mismo_rfc_para_distintos_usuarios():
    # Para el usuario 8, no existe esa empresa
    resultado_consulta = Mock()
    resultado_consulta.first.return_value = None
    db = Mock()
    db.query.return_value.filter.return_value = resultado_consulta

    datos = EmpresaCreate(
        rfc="ABC010203AB1",
        razon_social="Despacho Contable B",
        regimen_fiscal="601",
        tipo_persona="moral",
        opcion_deduccion=None,
        codigo_postal="01000",
    )

    resultado = crear_empresa(datos, db, SimpleNamespace(id=8))

    assert resultado.usuario_id == 8
    assert resultado.rfc == "ABC010203AB1"
    db.add.assert_called_once()
    db.commit.assert_called_once()


def test_crear_empresa_rechaza_rfc_duplicado_para_mismo_usuario():
    empresa_activa = SimpleNamespace(
        id=10,
        usuario_id=7,
        activo=True,
        rfc="ABC010203AB1",
    )
    resultado_consulta = Mock()
    resultado_consulta.first.return_value = empresa_activa
    db = Mock()
    db.query.return_value.filter.return_value = resultado_consulta

    datos = EmpresaCreate(
        rfc="ABC010203AB1",
        razon_social="Empresa repetida",
        regimen_fiscal="601",
        tipo_persona="moral",
        opcion_deduccion=None,
        codigo_postal="01000",
    )

    with pytest.raises(DuplicateResourceException):
        crear_empresa(datos, db, SimpleNamespace(id=7))
