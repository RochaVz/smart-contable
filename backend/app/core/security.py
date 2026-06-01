import bcrypt # <--- Usaremos esta directamente
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from app.core.config import settings

# --- ELIMINAMOS pwd_context de passlib ---

def hash_password(password: str) -> str:
    # Generamos la sal y el hash usando bcrypt nativo
    salt = bcrypt.gensalt()
    # Convertimos la contraseña a bytes, generamos hash y volvemos a string
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    try:
        # Comparamos la contraseña plana contra el hash almacenado
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None