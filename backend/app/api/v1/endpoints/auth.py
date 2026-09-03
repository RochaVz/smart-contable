from secrets import compare_digest

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token
)
from app.core.logging_config import get_logger
from app.core.exceptions import (
    DuplicateResourceException,
    InvalidCredentialsException,
    DatabaseException,
)

from app.models.usuario import Usuario

from app.schemas.usuario import (
    UsuarioCreate,
    PasswordResetRequest,
    UsuarioResponse,
    Token
)

logger = get_logger(__name__)
router = APIRouter()


# ─────────────────────────────────────────
# REGISTRO
# ─────────────────────────────────────────
@router.post(
    "/registro",
    response_model=UsuarioResponse,
    status_code=201,
    summary="Registrar nuevo usuario",
    description="Crea una nueva cuenta de usuario",
)
def registro(
    datos: UsuarioCreate,
    db: Session = Depends(get_db)
):
    """
    Registra un nuevo usuario en el sistema.
    
    - **nombre**: Nombre completo del usuario (2-100 caracteres)
    - **email**: Email único para login
    - **password**: Contraseña (mín 8 caracteres, requerimientos validados)
    - **rol**: Rol del usuario (admin, contador, auditor, auxiliar, cliente)
    """
    email = datos.email.lower()
    
    try:
        # Check if email already exists
        existe = db.query(Usuario).filter(
            Usuario.email == email
        ).first()

        if existe:
            logger.warning(f"Intento de registro con email duplicado: {email}")
            raise DuplicateResourceException("usuario", "email")

        # Create new user
        usuario = Usuario(
            nombre=datos.nombre,
            email=email,
            password_hash=hash_password(datos.password),
            rol=datos.rol
        )

        db.add(usuario)
        db.commit()
        db.refresh(usuario)
        
        logger.info(
            "Usuario registrado exitosamente",
            extra={"user_id": usuario.id, "email": email}
        )

        return usuario
        
    except DuplicateResourceException:
        raise
    except IntegrityError as e:
        db.rollback()
        logger.error("Error de integridad al registrar usuario", exc_info=True)
        raise DuplicateResourceException("usuario", "email") from e
    except SQLAlchemyError as e:
        db.rollback()
        logger.error("Error en base de datos al registrar usuario", exc_info=True)
        raise DatabaseException("Error al crear usuario") from e
    except Exception as e:
        db.rollback()
        logger.error("Error inesperado al registrar usuario", exc_info=True)
        raise DatabaseException("Error inesperado al crear usuario") from e


# ─────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────
@router.post(
    "/login",
    response_model=Token,
    summary="Autenticarse",
    description="Obtiene un token JWT para autenticación",
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Inicia sesión con email y contraseña.
    
    Returns:
        Token JWT válido por 8 horas
    """
    try:
        email = form_data.username.lower()
        
        # Find user by email
        usuario = db.query(Usuario).filter(
            Usuario.email == email
        ).first()

        if not usuario:
            logger.warning("Intento de login con email no registrado: %s", email)
            raise InvalidCredentialsException()

        # Verify password
        if not verify_password(form_data.password, usuario.password_hash):
            logger.warning(
                "Intento de login con contraseña incorrecta",
                extra={"email": email}
            )
            raise InvalidCredentialsException()

        # Check if user is active
        if not usuario.activo:
            logger.warning("Intento de login con usuario inactivo: %s", email)
            raise InvalidCredentialsException()

        # Generate token
        token = create_access_token({
            "sub": str(usuario.id),
            "email": usuario.email,
            "rol": usuario.rol
        })
        
        logger.info(
            "Usuario autenticado exitosamente",
            extra={"user_id": usuario.id, "email": email}
        )

        return {
            "access_token": token,
            "token_type": "bearer"
        }
        
    except InvalidCredentialsException:
        raise
    except SQLAlchemyError as e:
        logger.error("Error en base de datos durante login", exc_info=True)
        raise DatabaseException("Error al procesar login") from e
    except Exception as e:
        logger.error("Error inesperado durante login", exc_info=True)
        raise DatabaseException("Error inesperado durante login") from e


@router.post(
    "/recuperar-contrasena",
    status_code=204,
    summary="Restablecer contrasena local",
    description="Actualiza una contrasena con la clave local de recuperacion",
)
def recover_password(
    datos: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    if not settings.LOCAL_PASSWORD_RESET_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="La recuperacion de contrasena local no esta configurada",
        )

    if not compare_digest(datos.recovery_key, settings.LOCAL_PASSWORD_RESET_KEY):
        raise InvalidCredentialsException("La clave de recuperación local es incorrecta")

    try:
        usuario = db.query(Usuario).filter(Usuario.email == datos.email.lower()).first()
        if not usuario or not usuario.activo:
            logger.warning("Intento de recuperacion para usuario no disponible")
            raise InvalidCredentialsException("El usuario especificado no existe o no está activo")

        usuario.password_hash = hash_password(datos.new_password)
        db.commit()
        logger.info("Contrasena local actualizada", extra={"user_id": usuario.id})
    except SQLAlchemyError as exc:
        db.rollback()
        logger.error("Error al recuperar contrasena", exc_info=True)
        raise DatabaseException("No se pudo actualizar la contrasena") from exc
