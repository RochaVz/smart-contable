from pydantic import BaseModel
from typing import Optional

class FacturaResponse(BaseModel):
    id: int
    uuid: str
    emisor: str
    total: float
    fecha: str
    cuenta_contable: str
    total: float
    tipo_operacion: str
    tipo_comprobante: str

    class Config:
        from_attributes = True