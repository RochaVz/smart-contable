import io

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from typing import List

from app.core.dependencies import get_current_user
from app.core.database import get_db
from app.core.logging_config import get_logger
from app.core.exceptions import (
    DuplicateResourceException,
    ResourceNotFoundException,
    DatabaseException,
)
from app.core.tenancy_validators import (
    validar_empresa_pertenece_usuario,
)

from app.models.usuario import Usuario
from app.models.empresa import Empresa
from app.schemas.empresa import (
    EmpresaCreate,
    EmpresaUpdate,
    EmpresaResponse
)
from app.services.exportacion_empresa import (  # noqa: F401
    generar_zip_exportacion_empresa,
    generar_csv_consolidado_exportacion,
)

logger = get_logger(__name__)
router = APIRouter()


# ─────────────────────────────────────────
# CREAR EMPRESA
# ─────────────────────────────────────────
@router.post(
    "/",
    response_model=EmpresaResponse,
    status_code=201,
    summary="Crear nueva empresa",
    description="Crea una nueva empresa para el usuario actual"
)
def crear_empresa(
    datos: EmpresaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Crea una nueva empresa.
    
    - **rfc**: RFC único de la empresa (13 caracteres)
    - **razon_social**: Razón social de la empresa
    - **tipo_persona**: Física o Moral
    - **regimen_fiscal**: Régimen fiscal del SAT
    - **codigo_postal**: Código postal
    """
    try:
        rfc = datos.rfc.upper()
        
        # Check if RFC already exists
        existe = db.query(Empresa).filter(
            Empresa.rfc == rfc
        ).first()

        if existe:
            logger.warning(
                "Intento de crear empresa con RFC duplicado",
                extra={"rfc": rfc, "user_id": current_user.id}
            )
            raise DuplicateResourceException("empresa", "RFC")

        # Create empresa
        nueva_empresa = Empresa(
            rfc=rfc,
            razon_social=datos.razon_social,
            regimen_fiscal=datos.regimen_fiscal,
            tipo_persona=datos.tipo_persona,
            codigo_postal=datos.codigo_postal,
            usuario_id=current_user.id
        )
        
        db.add(nueva_empresa)
        db.commit()
        db.refresh(nueva_empresa)
        
        logger.info(
            "Empresa creada exitosamente",
            extra={
                "empresa_id": nueva_empresa.id,
                "rfc": rfc,
                "user_id": current_user.id
            }
        )
        
        return nueva_empresa
        
    except DuplicateResourceException:
        raise
    except IntegrityError as e:
        db.rollback()
        logger.error("Error de integridad al crear empresa", exc_info=True)
        raise DuplicateResourceException("empresa", "RFC") from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.error("Error en base de datos al crear empresa", exc_info=True)
        raise DatabaseException("Error al crear empresa") from e
    except Exception as e:
        db.rollback()
        logger.error("Error inesperado al crear empresa", exc_info=True)
        raise DatabaseException("Error inesperado al crear empresa") from e


# ─────────────────────────────────────────
# LISTAR EMPRESAS
# ─────────────────────────────────────────
@router.get(
    "/",
    response_model=List[EmpresaResponse],
    summary="Listar empresas",
    description="Lista todas las empresas activas del usuario actual"
)
def listar_empresas(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Lista las empresas del usuario actual con paginación.
    
    - **skip**: Número de registros a saltar (default: 0)
    - **limit**: Número de registros a retornar (default: 10, máx: 100)
    """
    try:
        # Limit maximum results
        limit = min(limit, 100)
        
        # Get total count
        total = db.query(Empresa).filter(
            Empresa.usuario_id == current_user.id,
            Empresa.activo == True  # noqa: E712
        ).count()
        
        # Get paginated results
        empresas = db.query(Empresa).filter(
            Empresa.usuario_id == current_user.id,
            Empresa.activo == True  # noqa: E712
        ).offset(skip).limit(limit).all()
        
        logger.info(
            "Empresas listadas",
            extra={
                "user_id": current_user.id,
                "total": total,
                "returned": len(empresas)
            }
        )
        
        return empresas
        
    except SQLAlchemyError as e:
        logger.error("Error en base de datos al listar empresas", exc_info=True)
        raise DatabaseException("Error al listar empresas") from e
    except Exception as e:
        logger.error("Error inesperado al listar empresas", exc_info=True)
        raise DatabaseException("Error inesperado al listar empresas") from e


# ─────────────────────────────────────────
# VER EMPRESA
# ─────────────────────────────────────────
@router.get(
    "/{empresa_id}",
    response_model=EmpresaResponse,
    summary="Obtener empresa",
    description="Obtiene los detalles de una empresa específica"
)
def ver_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """Obtiene los detalles de una empresa si el usuario tiene acceso."""
    try:
        empresa = validar_empresa_pertenece_usuario(
            empresa_id,
            current_user.id,
            db
        )
        
        logger.info(
            "Empresa consultada",
            extra={"empresa_id": empresa_id, "user_id": current_user.id}
        )
        
        return empresa
        
    except SQLAlchemyError as e:
        logger.error("Error en base de datos al obtener empresa", exc_info=True)
        raise DatabaseException("Error al obtener empresa") from e


# ─────────────────────────────────────────
# EXPORTAR EMPRESA
# ─────────────────────────────────────────
@router.get(
    "/{empresa_id}/exportar",
    summary="Exportar empresa",
    description="Exporta los datos de la empresa como ZIP"
)
def exportar_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Exporta todos los datos de una empresa como archivo ZIP."""
    try:
        empresa = validar_empresa_pertenece_usuario(
            empresa_id,
            current_user.id,
            db
        )

        zip_bytes, nombre_archivo = generar_zip_exportacion_empresa(db, empresa)
        
        logger.info(
            "Empresa exportada",
            extra={"empresa_id": empresa_id, "user_id": current_user.id}
        )
        
        return StreamingResponse(
            io.BytesIO(zip_bytes),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{nombre_archivo}"',
            },
        )
        
    except SQLAlchemyError as e:
        logger.error("Error en base de datos al exportar empresa", exc_info=True)
        raise DatabaseException("Error al exportar empresa") from e


# ─────────────────────────────────────────
# EXPORTAR EMPRESA COMO CSV CONSOLIDADO
# ─────────────────────────────────────────
@router.get(
    "/{empresa_id}/exportar-csv",
    summary="Exportar empresa como CSV",
    description="Exporta los datos de la empresa como CSV consolidado (compatible con Google Sheets)"
)
def exportar_empresa_csv(
    empresa_id: int,
    tipo: str | None = Query(default=None, description="Tipo de exportación: todo, facturas, polizas, movimientos, mapeos, comisiones o contable"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Exporta los datos de una empresa como CSV consolidado, con opción de seleccionar el tipo de información."""
    try:
        empresa = validar_empresa_pertenece_usuario(
            empresa_id,
            current_user.id,
            db
        )

        csv_bytes, nombre_archivo = generar_csv_consolidado_exportacion(db, empresa, tipo)
        
        logger.info(
            "Empresa exportada como CSV",
            extra={"empresa_id": empresa_id, "user_id": current_user.id}
        )
        
        return StreamingResponse(
            io.BytesIO(csv_bytes),
            media_type="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{nombre_archivo}"',
            },
        )
        
    except SQLAlchemyError as e:
        logger.error("Error en base de datos al exportar empresa como CSV", exc_info=True)
        raise DatabaseException("Error al exportar empresa como CSV") from e


# ─────────────────────────────────────────
# ACTUALIZAR EMPRESA
# ─────────────────────────────────────────
@router.put(
    "/{empresa_id}",
    summary="Actualizar empresa",
    description="Actualiza los datos de una empresa"
)
def actualizar_empresa(
    empresa_id: int,
    datos: EmpresaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Actualiza los datos de una empresa.
    
    Solo se actualizan los campos proporcionados.
    """
    try:
        empresa = validar_empresa_pertenece_usuario(
            empresa_id,
            current_user.id,
            db
        )

        # Update only provided fields
        if datos.razon_social:
            empresa.razon_social = datos.razon_social
        if datos.codigo_postal:
            empresa.codigo_postal = datos.codigo_postal
        if datos.regimen_fiscal:
            empresa.regimen_fiscal = datos.regimen_fiscal

        db.commit()
        db.refresh(empresa)
        
        logger.info(
            "Empresa actualizada",
            extra={"empresa_id": empresa_id, "user_id": current_user.id}
        )
        
        return {
            "mensaje": "Empresa actualizada correctamente",
            "empresa_id": empresa.id
        }
        
    except (ResourceNotFoundException, DuplicateResourceException):
        raise
    except IntegrityError as e:
        db.rollback()
        logger.error("Error de integridad al actualizar empresa", exc_info=True)
        raise DatabaseException("Error de integridad al actualizar") from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.error("Error en base de datos al actualizar empresa", exc_info=True)
        raise DatabaseException("Error al actualizar empresa") from e
    except Exception as e:
        db.rollback()
        logger.error("Error inesperado al actualizar empresa", exc_info=True)
        raise DatabaseException("Error inesperado al actualizar empresa") from e


# ─────────────────────────────────────────
# DESACTIVAR EMPRESA (Soft Delete)
# ─────────────────────────────────────────
@router.delete(
    "/{empresa_id}",
    summary="Desactivar empresa",
    description="Desactiva una empresa (soft delete)"
)
def desactivar_empresa(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user)
):
    """
    Desactiva una empresa.
    
    La empresa no se elimina de la base de datos, solo se marca como inactiva.
    """
    try:
        empresa = validar_empresa_pertenece_usuario(
            empresa_id,
            current_user.id,
            db
        )

        empresa.activo = False
        db.commit()
        
        logger.info(
            "Empresa desactivada",
            extra={"empresa_id": empresa_id, "user_id": current_user.id}
        )
        
        return {"mensaje": "Empresa desactivada correctamente"}
        
    except (ResourceNotFoundException, DuplicateResourceException):
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error("Error en base de datos al desactivar empresa", exc_info=True)
        raise DatabaseException("Error al desactivar empresa") from e
    except Exception as e:
        db.rollback()
        logger.error("Error inesperado al desactivar empresa", exc_info=True)
        raise DatabaseException("Error inesperado al desactivar empresa") from e