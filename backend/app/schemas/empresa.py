from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class EmpresaBase(BaseModel):
    rfc: str = Field(..., min_length=12, max_length=13)
    razon_social: str
    tipo_persona: str
    regimen_fiscal: str
    codigo_postal: Optional[str] = None


class EmpresaCreate(EmpresaBase):
    pass


class EmpresaUpdate(BaseModel):
    razon_social: Optional[str] = None
    codigo_postal: Optional[str] = None
    activo: Optional[bool] = None


class EmpresaResponse(EmpresaBase):
    id: int
    usuario_id: int
    activo: bool
    creado_en: Optional[datetime]

    class Config:
        from_attributes = True