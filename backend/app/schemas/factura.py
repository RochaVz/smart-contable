from pydantic import BaseModel, ConfigDict

class FacturaResponse(BaseModel):
    id: int
    uuid: str
    emisor: str
    fecha: str
    cuenta_contable: str
    total: float
    tipo_operacion: str
    tipo_comprobante: str

    model_config = ConfigDict(from_attributes=True)