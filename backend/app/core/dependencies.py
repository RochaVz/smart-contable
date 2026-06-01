from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import decode_token
from app.models.usuario import Usuario

# Usamos el estándar que FastAPI entiende nativamente
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    if not token:
        raise HTTPException(status_code=401, detail="No hay token")

    # FIX CRÍTICO: Si el token trae la palabra "Bearer ", la quitamos para poder leerlo
    if token.startswith("Bearer "):
        token = token.replace("Bearer ", "")

    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Token inválido")
        
    usuario_id = payload.get("sub")
    usuario = db.query(Usuario).filter(Usuario.id == int(usuario_id)).first()
    
    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return usuario