from pydantic import BaseModel, Field


class ComisionBancoBase(BaseModel):
    nombre_banco: str = Field(..., min_length=1, max_length=100)
    porcentaje_credito: float = Field(2.5, ge=0, le=100, description="% tarjeta crédito (SAT 04)")
    porcentaje_debito: float = Field(1.8, ge=0, le=100, description="% tarjeta débito (SAT 28)")
    porcentaje_servicios: float = Field(2.0, ge=0, le=100, description="% tarjeta servicios (SAT 29)")
    comision_fija: float = Field(0, ge=0, description="Cargo fijo por operación en MXN")
    es_default: bool = False


class ComisionBancoCreate(ComisionBancoBase):
    empresa_id: int


class ComisionBancoUpdate(BaseModel):
    nombre_banco: str | None = None
    porcentaje_credito: float | None = Field(None, ge=0, le=100)
    porcentaje_debito: float | None = Field(None, ge=0, le=100)
    porcentaje_servicios: float | None = Field(None, ge=0, le=100)
    comision_fija: float | None = Field(None, ge=0)
    es_default: bool | None = None


class ComisionBancoResponse(ComisionBancoBase):
    id: int
    empresa_id: int

    class Config:
        from_attributes = True
