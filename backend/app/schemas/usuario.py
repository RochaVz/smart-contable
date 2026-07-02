from pydantic import BaseModel, EmailStr
from enum import Enum


class RolUsuario(str, Enum):
    admin = "admin"
    contador = "contador"
    auditor = "auditor"
    auxiliar = "auxiliar"
    cliente = "cliente"


class UsuarioCreate(BaseModel):
    nombre: str
    email: EmailStr
    password: str
    rol: RolUsuario = RolUsuario.contador


class UsuarioLogin(BaseModel):
    email: EmailStr
    password: str


class UsuarioResponse(BaseModel):
    id: int
    nombre: str
    email: str
    rol: RolUsuario
    activo: bool

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"