from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.logger import get_logger
from app.core.security import decode_token
from app.models.usuario import Usuario

logger = get_logger(__name__)
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Usuario:
    """Obtiene el usuario actual a partir del JWT del Authorization header."""
    token = credentials.credentials if credentials else None
    if not token:
        logger.warning("Se intentó acceder sin token de autenticación")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token requerido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)
    if not payload or not isinstance(payload, dict):
        logger.warning("Token inválido o expirado recibido")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )

    usuario_id = payload.get("sub")
    if usuario_id is None:
        logger.warning("Token sin claim 'sub'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido: faltan claims de usuario",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        usuario = db.query(Usuario).filter(Usuario.id == int(usuario_id)).first()
    except (TypeError, ValueError):
        logger.error(f"ID de usuario inválido en token: {usuario_id}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="ID de usuario inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not usuario:
        logger.warning(f"Usuario no encontrado: {usuario_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuario no encontrado",
        )

    if not usuario.activo:
        logger.warning(f"Usuario inactivo intentó acceder: {usuario_id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado",
        )

    return usuario
