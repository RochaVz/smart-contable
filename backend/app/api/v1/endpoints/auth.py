from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    status
)
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token
)

from app.models.usuario import Usuario

from app.schemas.usuario import (
    UsuarioCreate,
    UsuarioResponse,
    Token
)

router = APIRouter()

# ─────────────────────────────────────────
# REGISTRO
# ─────────────────────────────────────────
@router.post(
    "/registro",
    response_model=UsuarioResponse,
    status_code=201
)
def registro(
    datos: UsuarioCreate,
    db: Session = Depends(get_db)
):
    email = datos.email.lower()

    existe = db.query(Usuario).filter(
        Usuario.email == email
    ).first()

    if existe:
        raise HTTPException(
            status_code=409,
            detail="El email ya está registrado"
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

    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=str(e)
        ) from e

    return usuario


# ─────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────
@router.post(
    "/login",
    response_model=Token
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):

    usuario = db.query(Usuario).filter(
        Usuario.email == form_data.username.lower()
    ).first()

    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas"
        )

    if not verify_password(
        form_data.password,
        usuario.password_hash
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales incorrectas"
        )

    token = create_access_token({
        "sub": str(usuario.id),
        "email": usuario.email,
        "rol": usuario.rol
    })

    return {
        "access_token": token,
        "token_type": "bearer"
    }