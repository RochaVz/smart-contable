from pydantic import BaseModel
from typing import Optional

class MapeoCuentaBase(BaseModel):
    rfc_emisor: str
    nombre_cuenta: str
    codigo_cuenta: Optional[str] = None
    empresa_id: int

class MapeoCuentaCreate(MapeoCuentaBase):
    pass

class MapeoCuentaResponse(MapeoCuentaBase):
    id: int

    class Config:
        from_attributes = True