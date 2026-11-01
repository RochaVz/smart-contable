from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.exceptions import DatabaseException
from app.core.logging_config import get_logger
from app.core.permissions import require_admin_app
from app.models.usuario import Usuario
from app.services.admin_usuarios import (
    eliminar_rfc_global,
    eliminar_usuario_completo,
    listar_empresas_por_rfc,
    listar_usuarios,
)

logger = get_logger(__name__)
router = APIRouter()


class UsuarioAdmin(BaseModel):
    id: int
    nombre: str
    email: str
    rol: str
    activo: bool
    creado_en: datetime | None = None
    empresas: int
    facturas: int
    es_admin_app: bool


class ActivoPayload(BaseModel):
    activo: bool


def _commit(db: Session, accion: str) -> None:
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("Error de base de datos en administración: %s", accion, exc_info=True)
        raise DatabaseException(f"No se pudo {accion}") from exc


@router.get("/usuarios", response_model=list[UsuarioAdmin], summary="Listar usuarios (solo administrador)")
def usuarios(db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin_app)):
    return listar_usuarios(db)


@router.patch("/usuarios/{usuario_id}/activo", summary="Activar o desactivar un usuario")
def cambiar_activo(
    usuario_id: int,
    datos: ActivoPayload,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(require_admin_app),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if usuario.id == admin.id and not datos.activo:
        raise HTTPException(status_code=400, detail="No puedes desactivar tu propia cuenta")
    usuario.activo = datos.activo
    _commit(db, "actualizar el usuario")
    logger.info("Usuario %s por administrador", "activado" if datos.activo else "desactivado",
                extra={"user_id": usuario_id})
    return {"id": usuario.id, "activo": bool(usuario.activo)}


@router.delete("/usuarios/{usuario_id}", summary="Eliminar por completo un usuario y su información")
def eliminar_usuario(
    usuario_id: int,
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(require_admin_app),
):
    usuario = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    try:
        resumen = eliminar_usuario_completo(db, usuario)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("Error al eliminar usuario", exc_info=True)
        raise DatabaseException("No se pudo eliminar el usuario") from exc
    _commit(db, "eliminar el usuario")
    return {"mensaje": "Usuario eliminado por completo", **resumen}


@router.get("/rfc/{rfc}", summary="Ver empresas registradas con un RFC en todas las cuentas")
def consultar_rfc(rfc: str, db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin_app)):
    empresas = listar_empresas_por_rfc(db, rfc)
    return [
        {"empresa_id": e.id, "usuario_id": e.usuario_id, "razon_social": e.razon_social, "rfc": e.rfc}
        for e in empresas
    ]


@router.delete("/rfc/{rfc}", summary="Eliminar un RFC y toda su información en todas las cuentas")
def eliminar_rfc(rfc: str, db: Session = Depends(get_db), _admin: Usuario = Depends(require_admin_app)):
    try:
        resumen = eliminar_rfc_global(db, rfc)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("Error al eliminar RFC", exc_info=True)
        raise DatabaseException("No se pudo eliminar el RFC") from exc
    _commit(db, "eliminar el RFC")
    return {"mensaje": "RFC eliminado", **resumen}
