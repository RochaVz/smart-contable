"""Administración de plataforma: control de acceso y borrado completo."""

from datetime import datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401  registra todos los modelos en Base
from app.core.config import settings
from app.core.database import Base
from app.core.permissions import es_admin_app, require_admin_app
from app.models.empresa import Empresa, OpcionDeduccion, TipoPersona
from app.models.factura import EstatusFactura, Factura, TipoFactura
from app.models.usuario import RolUsuario, Usuario
from app.services.admin_usuarios import (
    eliminar_rfc_global,
    eliminar_usuario_completo,
    listar_usuarios,
)

ADMIN_EMAIL = "roca_car.t@hotmail.com"
RFC = "MABE810425T78"


@pytest.fixture()
def db(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_EMAIL", ADMIN_EMAIL)
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def _usuario(db, email, rol=RolUsuario.contador):
    u = Usuario(nombre=email, email=email, password_hash="x", rol=rol)
    db.add(u)
    db.flush()
    return u


def _empresa(db, usuario, rfc, regimen):
    e = Empresa(
        usuario_id=usuario.id,
        rfc=rfc,
        razon_social=f"Empresa {rfc}",
        tipo_persona=TipoPersona.fisica,
        regimen_fiscal=regimen,
        opcion_deduccion=OpcionDeduccion.ciega,
    )
    db.add(e)
    db.flush()
    return e


def _factura(db, empresa, uuid, rfc_receptor="XAXX010101000"):
    db.add(
        Factura(
            empresa_id=empresa.id,
            uuid=uuid,
            tipo_comprobante=TipoFactura.ingreso if hasattr(TipoFactura, "ingreso") else list(TipoFactura)[0],
            fecha_emision=datetime(2026, 9, 1),
            rfc_emisor=empresa.rfc,
            rfc_receptor=rfc_receptor,
            subtotal=100,
            total=116,
            estatus=EstatusFactura.vigente,
        )
    )
    db.flush()


def _regimen():
    from app.core.sat_fiscal import SatRegimenEnum

    return list(SatRegimenEnum)[0]


def test_solo_el_email_configurado_es_administrador(db):
    admin = _usuario(db, ADMIN_EMAIL.upper())
    otro = _usuario(db, "otro@example.com", rol=RolUsuario.admin)

    assert es_admin_app(admin)
    assert not es_admin_app(otro)
    assert require_admin_app(admin) is admin
    with pytest.raises(HTTPException) as exc:
        require_admin_app(otro)
    assert exc.value.status_code == 403


def test_eliminar_usuario_borra_empresas_facturas_y_cuenta(db):
    admin = _usuario(db, ADMIN_EMAIL)
    cliente = _usuario(db, "cliente@example.com")
    sobreviviente = _usuario(db, "otro@example.com")
    emp = _empresa(db, cliente, RFC, _regimen())
    _factura(db, emp, "11111111-1111-1111-1111-111111111111")
    otra = _empresa(db, sobreviviente, "AAA010101AAA", _regimen())
    _factura(db, otra, "22222222-2222-2222-2222-222222222222")

    resumen = eliminar_usuario_completo(db, cliente)
    db.commit()

    assert resumen["empresas_eliminadas"] == 1
    assert db.query(Usuario).filter_by(email="cliente@example.com").count() == 0
    assert db.query(Empresa).filter_by(rfc=RFC).count() == 0
    assert db.query(Factura).count() == 1
    assert db.query(Usuario).filter_by(id=admin.id).count() == 1


def test_no_se_puede_eliminar_al_administrador(db):
    admin = _usuario(db, ADMIN_EMAIL)
    with pytest.raises(ValueError):
        eliminar_usuario_completo(db, admin)


def test_eliminar_rfc_global_borra_en_todas_las_cuentas_sin_tocar_contrapartes(db):
    u1 = _usuario(db, "a@example.com")
    u2 = _usuario(db, "b@example.com")
    _empresa(db, u1, RFC, _regimen())
    _empresa(db, u2, RFC, _regimen())
    ajena = _empresa(db, u2, "AAA010101AAA", _regimen())
    _factura(db, ajena, "33333333-3333-3333-3333-333333333333", rfc_receptor=RFC)

    resumen = eliminar_rfc_global(db, RFC.lower())
    db.commit()

    assert resumen["empresas_eliminadas"] == 2
    assert resumen["facturas_de_otras_empresas_que_lo_mencionan"] == 1
    assert db.query(Empresa).filter_by(rfc=RFC).count() == 0
    assert db.query(Factura).count() == 1


def test_listado_incluye_conteos_y_marca_administrador(db):
    admin = _usuario(db, ADMIN_EMAIL)
    cliente = _usuario(db, "cliente@example.com")
    emp = _empresa(db, cliente, RFC, _regimen())
    _factura(db, emp, "44444444-4444-4444-4444-444444444444")

    por_email = {u["email"]: u for u in listar_usuarios(db)}

    assert por_email[ADMIN_EMAIL]["es_admin_app"] is True
    assert por_email["cliente@example.com"]["empresas"] == 1
    assert por_email["cliente@example.com"]["facturas"] == 1
    assert admin.id == por_email[ADMIN_EMAIL]["id"]
