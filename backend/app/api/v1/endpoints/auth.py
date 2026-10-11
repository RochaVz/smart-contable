from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.core.logger import get_logger
from app.models.usuario import Usuario
from app.schemas.usuario import UsuarioCreate, UsuarioResponse, Token
from app.schemas.common import SuccessResponse

logger = get_logger(__name__)
router = APIRouter()


@router.post("/registro", response_model=SuccessResponse, status_code=201)
def registro(
    datos: UsuarioCreate,
    db: Session = Depends(get_db)
):
    """Registrar nuevo usuario"""
    email = datos.email.lower()

    # Verificar si email ya existe
    existe = db.query(Usuario).filter(
        Usuario.email == email
    ).first()

    if existe:
        logger.warning(f"Intento de registro con email duplicado: {email}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email duplicado: el email ya está registrado"
        )

    usuario = Usuario(
        nombre=datos.nombre,
        email=email,
        password_hash=hash_password(datos.password),
        rol=datos.rol
    )

    try:
        db.add(usuario)
        db.commit()
        db.refresh(usuario)
        logger.info(f"Usuario registrado exitosamente: {email}")

        return SuccessResponse(
            message="Usuario registrado exitosamente",
            data={
                "usuario_id": usuario.id,
                "email": usuario.email,
                "nombre": usuario.nombre,
                "rol": usuario.rol
            }
        )

    except IntegrityError as e:
        db.rollback()
        logger.error(f"IntegrityError en registro: {e}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email duplicado o datos inválidos"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"Error inesperado en registro: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al registrar usuario"
        )


@router.post("/login", response_model=SuccessResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Autenticar usuario y obtener token JWT"""

    usuario = db.query(Usuario).filter(
        Usuario.email == form_data.username.lower()
    ).first()

    if not usuario:
        logger.warning(f"Intento de login con email inexistente: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas"
        )

    if not verify_password(form_data.password, usuario.password_hash):
        logger.warning(f"Login fallido por contraseña incorrecta: {usuario.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas"
        )

    if not usuario.activo:
        logger.warning(f"Login fallido: usuario desactivado: {usuario.email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario desactivado"
        )

    token = create_access_token({
        "sub": str(usuario.id),
        "email": usuario.email,
        "rol": usuario.rol
    })

    logger.info(f"Login exitoso: {usuario.email}")

    return SuccessResponse(
        message="Login exitoso",
        data={
            "access_token": token,
            "token_type": "bearer",
            "usuario_id": usuario.id,
            "email": usuario.email
        }
    )
