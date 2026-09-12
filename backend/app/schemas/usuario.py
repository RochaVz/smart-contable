from pydantic import BaseModel, ConfigDict, EmailStr, Field
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
    password: str = Field(min_length=8)
    rol: RolUsuario = RolUsuario.contador


class UsuarioLogin(BaseModel):
    email: EmailStr
    password: str


class PasswordResetRequest(BaseModel):
    email: EmailStr
    recovery_key: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class UsuarioResponse(BaseModel):
    id: int
    nombre: str
    email: str
    rol: RolUsuario
    activo: bool

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"