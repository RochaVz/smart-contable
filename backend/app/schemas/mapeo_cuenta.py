from pydantic import BaseModel
from typing import Optional


class MapeoCuentaBase(BaseModel):
    rfc_emisor: Optional[str] = None
    tipo_regla: str = "rfc"  # rfc | concepto | clave_sat
    patron: Optional[str] = None
    nombre_cuenta: str
    codigo_cuenta: Optional[str] = None
    empresa_id: int

class MapeoCuentaCreate(MapeoCuentaBase):
    pass

class MapeoCuentaResponse(MapeoCuentaBase):
    id: int

    class Config:
        from_attributes = True