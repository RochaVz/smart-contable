from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.usuario import Usuario
from app.models.empresa import Empresa
from app.models.mapeo_cuenta import MapeoCuenta
from app.models.comision_banco import ComisionBanco
from app.schemas.mapeo_cuenta import MapeoCuentaCreate, MapeoCuentaResponse
from app.schemas.comision_banco import (
    ComisionBancoCreate,
    ComisionBancoUpdate,
    ComisionBancoResponse,
)
from app.services.comisiones import asegurar_banco_default

router = APIRouter()


def _validar_empresa(db: Session, empresa_id: int, user: Usuario) -> Empresa:
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == user.id,
    ).first()
    if not empresa:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta empresa")
    return empresa


def _marcar_unico_default(db: Session, empresa_id: int, banco_id: int) -> None:
    db.query(ComisionBanco).filter(
        ComisionBanco.empresa_id == empresa_id,
        ComisionBanco.id != banco_id,
    ).update({ComisionBanco.es_default: False})

@router.post("/mapeos", response_model=MapeoCuentaResponse)
def crear_o_actualizar_mapeo(
    datos: MapeoCuentaCreate,
    db: Session = Depends(get_db),
    _current_user: Usuario = Depends(get_current_user)
):
    # 1. Verificar que la empresa pertenece al usuario (Seguridad Multi-tenant)
    # (Asumiendo que tienes esta lógica o el usuario tiene permiso)
    
    # 2. Buscar si ya existe un mapeo para este RFC en esta empresa
    mapeo_existente = db.query(MapeoCuenta).filter(
        MapeoCuenta.rfc_emisor == datos.rfc_emisor,
        MapeoCuenta.empresa_id == datos.empresa_id
    ).first()

    if mapeo_existente:
        # Actualizar
        mapeo_existente.nombre_cuenta = datos.nombre_cuenta
        mapeo_existente.codigo_cuenta = datos.codigo_cuenta
        db.commit()
        db.refresh(mapeo_existente)
        return mapeo_existente
    else:
        # Crear nuevo
        nuevo_mapeo = MapeoCuenta(**datos.model_dump())
        db.add(nuevo_mapeo)
        db.commit()
        db.refresh(nuevo_mapeo)
        return nuevo_mapeo

@router.get("/mapeos/{empresa_id}", response_model=List[MapeoCuentaResponse])
def listar_mapeos(
    empresa_id: int,
    db: Session = Depends(get_db),
    _current_user: Usuario = Depends(get_current_user)
):
    return db.query(MapeoCuenta).filter(MapeoCuenta.empresa_id == empresa_id).all()


@router.get("/comisiones-banco/{empresa_id}", response_model=List[ComisionBancoResponse])
def listar_comisiones_banco(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _validar_empresa(db, empresa_id, current_user)
    return (
        db.query(ComisionBanco)
        .filter(ComisionBanco.empresa_id == empresa_id)
        .order_by(ComisionBanco.es_default.desc(), ComisionBanco.nombre_banco)
        .all()
    )


@router.post("/comisiones-banco", response_model=ComisionBancoResponse, status_code=201)
def crear_comision_banco(
    datos: ComisionBancoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _validar_empresa(db, datos.empresa_id, current_user)
    banco = ComisionBanco(**datos.model_dump())
    db.add(banco)
    db.flush()

    if datos.es_default or not db.query(ComisionBanco).filter(
        ComisionBanco.empresa_id == datos.empresa_id,
        ComisionBanco.es_default.is_(True),
    ).first():
        banco.es_default = True
        _marcar_unico_default(db, datos.empresa_id, banco.id)

    db.commit()
    db.refresh(banco)
    return banco


@router.put("/comisiones-banco/{banco_id}", response_model=ComisionBancoResponse)
def actualizar_comision_banco(
    banco_id: int,
    datos: ComisionBancoUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    banco = db.query(ComisionBanco).filter(ComisionBanco.id == banco_id).first()
    if not banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    _validar_empresa(db, banco.empresa_id, current_user)

    for campo, valor in datos.model_dump(exclude_unset=True).items():
        setattr(banco, campo, valor)

    if datos.es_default:
        _marcar_unico_default(db, banco.empresa_id, banco.id)

    db.commit()
    db.refresh(banco)
    asegurar_banco_default(db, banco.empresa_id)
    db.commit()
    return banco


@router.delete("/comisiones-banco/{banco_id}", status_code=204)
def eliminar_comision_banco(
    banco_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    banco = db.query(ComisionBanco).filter(ComisionBanco.id == banco_id).first()
    if not banco:
        raise HTTPException(status_code=404, detail="Banco no encontrado")
    _validar_empresa(db, banco.empresa_id, current_user)
    era_default = banco.es_default
    empresa_id = banco.empresa_id
    db.delete(banco)
    db.commit()
    if era_default:
        asegurar_banco_default(db, empresa_id)
        db.commit()