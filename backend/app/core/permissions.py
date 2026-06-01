from fastapi import Depends, HTTPException

from app.core.dependencies import get_current_user
from app.models.usuario import Usuario


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