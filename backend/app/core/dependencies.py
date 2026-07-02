from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.core.logging_config import get_logger
from app.core.exceptions import (
    InvalidTokenException,
    ResourceNotFoundException,
)
from app.models.usuario import Usuario

logger = get_logger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Usuario:
    """
    Validate JWT token and return current user.
    
    Args:
        token: JWT token from Authorization header
        db: Database session
    
    Returns:
        Usuario object if token is valid
    
    Raises:
        InvalidTokenException: If token is invalid or expired
        ResourceNotFoundException: If user not found
    """
    try:
        # Remove "Bearer " prefix if present
        if token.startswith("Bearer "):
            token = token.replace("Bearer ", "")

        # Decode and validate token
        payload = decode_token(token)
        
    except JWTError as e:
        logger.warning(f"Token validation failed: {str(e)}")
        raise InvalidTokenException("Token inválido o expirado") from e
    except Exception as e:
        logger.warning(f"Token decoding error: {str(e)}")
        raise InvalidTokenException("Token inválido") from e

    # Extract user ID from token
    usuario_id = payload.get("sub")
    if not usuario_id:
        logger.warning("Token missing 'sub' claim")
        raise InvalidTokenException("Token inválido")

    try:
        usuario_id = int(usuario_id)
    except (ValueError, TypeError) as e:
        logger.warning(f"Invalid user ID in token: {usuario_id}")
        raise InvalidTokenException("Token inválido") from e

    # Get user from database
    try:
        usuario = db.query(Usuario).filter(
            Usuario.id == usuario_id
        ).first()
        
    except Exception as e:
        logger.error("Database error while fetching user", exc_info=True)
        raise Exception("Error al obtener usuario") from e

    if not usuario:
        logger.warning(f"User not found: {usuario_id}")
        raise ResourceNotFoundException("Usuario", str(usuario_id))
    
    if not usuario.activo:
        logger.warning(f"User is inactive: {usuario_id}")
        raise InvalidTokenException("Usuario inactivo")
    
    logger.debug(f"User authenticated: {usuario_id}")
    return usuario