from fastapi import Depends, HTTPException

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.models.usuario import Usuario


def es_admin_app(usuario: Usuario) -> bool:
    """El administrador de la plataforma se identifica por email, no por el campo rol,
    porque el registro público permite elegir cualquier rol."""
    admin_email = (settings.ADMIN_EMAIL or "").strip().lower()
    return bool(admin_email) and (usuario.email or "").strip().lower() == admin_email


def require_admin_app(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if not es_admin_app(current_user):
        raise HTTPException(status_code=403, detail="Solo el administrador de la aplicación")
    return current_user


def require_roles(*roles_permitidos):

    def validator(
        current_user: Usuario = Depends(get_current_user)
    ):

        if current_user.rol not in roles_permitidos:

            raise HTTPException(
                status_code=403,
                detail="No tienes permisos"
            )

        return current_user

    return validator