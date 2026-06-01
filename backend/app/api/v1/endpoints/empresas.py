import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List
from app.core.dependencies import get_current_user
from app.models.usuario import Usuario
from app.core.database import get_db
from app.models.empresa import Empresa
from app.schemas.empresa import (
    EmpresaCreate,
    EmpresaUpdate,
    EmpresaResponse
)
from app.services.exportacion_empresa import generar_zip_exportacion_empresa

router = APIRouter()

# ─────────────────────────────────────────
# CREAR EMPRESA
# ─────────────────────────────────────────
@router.post("/", response_model=EmpresaResponse, status_code=201)
def crear_empresa(
    datos: EmpresaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    if db.query(Empresa).filter(Empresa.rfc == datos.rfc).first():
        raise HTTPException(status_code=409, detail="Ya existe una empresa con ese RFC")

    nueva_empresa = Empresa(
        rfc=datos.rfc,
        razon_social=datos.razon_social,
        regimen_fiscal=datos.regimen_fiscal,
        tipo_persona=datos.tipo_persona,
        codigo_postal=datos.codigo_postal,
        usuario_id=current_user.id
    )
    db.add(nueva_empresa)
    db.commit()
    db.refresh(nueva_empresa)
    return nueva_empresa

# ─────────────────────────────────────────
# LISTAR EMPRESAS
# ─────────────────────────────────────────
@router.get("/", response_model=List[EmpresaResponse])
def listar_empresas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    return db.query(Empresa).filter(
        Empresa.usuario_id == current_user.id,
        Empresa.activo == True
    ).all()

# ─────────────────────────────────────────
# VER EMPRESA
# ─────────────────────────────────────────
@router.get("/{empresa_id}", response_model=EmpresaResponse)
def ver_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == current_user.id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    return empresa


@router.get("/{empresa_id}/exportar")
def exportar_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == current_user.id,
    ).first()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    zip_bytes, nombre_archivo = generar_zip_exportacion_empresa(db, empresa)
    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre_archivo}"',
        },
    )


# ─────────────────────────────────────────
# ACTUALIZAR EMPRESA
# ─────────────────────────────────────────
@router.put("/{empresa_id}")
def actualizar_empresa(
    empresa_id: int,
    datos: EmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == current_user.id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    empresa.razon_social = datos.razon_social or empresa.razon_social
    empresa.codigo_postal = datos.codigo_postal or empresa.codigo_postal
    empresa.regimen_fiscal = datos.regimen_fiscal or empresa.regimen_fiscal

    db.commit()
    db.refresh(empresa)
    return {"mensaje": "Empresa actualizada correctamente", "empresa_id": empresa.id}

# ─────────────────────────────────────────
# DESACTIVAR EMPRESA
# ─────────────────────────────────────────
@router.delete("/{empresa_id}")
def desactivar_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == current_user.id
    ).first()

    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    empresa.activo = False
    db.commit()
    return {"mensaje": "Empresa desactivada correctamente"}