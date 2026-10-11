import io

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List

from app.core.dependencies import get_current_user
from app.core.logger import get_logger
from app.models.usuario import Usuario
from app.core.database import get_db
from app.models.empresa import Empresa
from app.schemas.empresa import (
    EmpresaCreate,
    EmpresaUpdate,
    EmpresaResponse
)
from app.schemas.common import SuccessResponse, PaginatedResponse
from app.services.exportacion_empresa import generar_zip_exportacion_empresa

logger = get_logger(__name__)
router = APIRouter()


@router.post("/", response_model=SuccessResponse, status_code=201)
def crear_empresa(
    datos: EmpresaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Crear nueva empresa"""
    if db.query(Empresa).filter(Empresa.rfc == datos.rfc).first():
        logger.warning(f"Intento de crear empresa duplicada RFC: {datos.rfc}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya existe una empresa con ese RFC"
        )

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
    logger.info(f"Empresa creada: {datos.rfc} para usuario {current_user.email}")
    
    return SuccessResponse(
        message="Empresa creada exitosamente",
        data={"empresa_id": nueva_empresa.id}
    )


@router.get("/", response_model=PaginatedResponse)
def listar_empresas(
    skip: int = Query(0, ge=0, description="Registros a saltar"),
    limit: int = Query(50, ge=1, le=100, description="Máximo de registros por página"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Listar empresas del usuario actual con paginación"""
    query = db.query(Empresa).filter(
        Empresa.usuario_id == current_user.id,
        Empresa.activo.is_(True)
    )
    
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    
    return PaginatedResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=items
    )


@router.get("/{empresa_id}", response_model=SuccessResponse)
def ver_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtener detalles de una empresa"""
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == current_user.id
    ).first()

    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada"
        )
    
    return SuccessResponse(
        message="Empresa recuperada",
        data=empresa
    )


@router.get("/{empresa_id}/exportar")
def exportar_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Exportar datos de empresa a ZIP"""
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == current_user.id,
    ).first()
    
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada"
        )

    try:
        zip_bytes, nombre_archivo = generar_zip_exportacion_empresa(db, empresa)
        logger.info(f"Exportación de empresa: {empresa.rfc} por usuario {current_user.email}")
        
        return StreamingResponse(
            io.BytesIO(zip_bytes),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{nombre_archivo}"',
            },
        )
    except Exception as e:
        logger.error(f"Error exportando empresa {empresa_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al exportar empresa"
        )


@router.put("/{empresa_id}", response_model=SuccessResponse)
def actualizar_empresa(
    empresa_id: int,
    datos: EmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Actualizar datos de empresa"""
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == current_user.id
    ).first()

    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada"
        )

    empresa.razon_social = datos.razon_social or empresa.razon_social
    empresa.codigo_postal = datos.codigo_postal or empresa.codigo_postal
    empresa.regimen_fiscal = datos.regimen_fiscal or empresa.regimen_fiscal

    db.commit()
    db.refresh(empresa)
    logger.info(f"Empresa actualizada: {empresa.rfc} por usuario {current_user.email}")
    
    return SuccessResponse(
        message="Empresa actualizada correctamente",
        data={"empresa_id": empresa.id}
    )


@router.delete("/{empresa_id}", response_model=SuccessResponse)
def desactivar_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Desactivar (soft delete) de empresa"""
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == current_user.id
    ).first()

    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Empresa no encontrada"
        )

    empresa.activo = False
    db.commit()
    logger.info(f"Empresa desactivada: {empresa.rfc} por usuario {current_user.email}")
    
    return SuccessResponse(message="Empresa desactivada correctamente")
