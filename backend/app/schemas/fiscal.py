from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.fiscal import (
    OrigenOperacionFiscal,
    TipoOperacionDiot,
    TipoOperacionFiscal,
    TipoPeriodoFiscal,
)


class PeriodoFiscalCreate(BaseModel):
    empresa_id: int
    tipo: TipoPeriodoFiscal
    anio: int = Field(ge=2000, le=2100)
    mes: int | None = Field(default=None, ge=1, le=12)

    @model_validator(mode="after")
    def validar_mes(self):
        if self.tipo == TipoPeriodoFiscal.mensual and self.mes is None:
            raise ValueError("mes es obligatorio para un periodo mensual")
        if self.tipo == TipoPeriodoFiscal.anual and self.mes is not None:
            raise ValueError("mes debe omitirse para un periodo anual")
        return self


class PeriodoFiscalResponse(PeriodoFiscalCreate):
    id: int
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class OperacionFiscalCreate(BaseModel):
    empresa_id: int
    periodo_id: int
    factura_id: int | None = None
    tipo_operacion: TipoOperacionFiscal
    origen: OrigenOperacionFiscal
    referencia_origen: str = Field(min_length=1, max_length=100)
    rfc_contraparte: str | None = Field(default=None, min_length=12, max_length=13)
    nombre_contraparte: str | None = None
    tipo_operacion_diot: TipoOperacionDiot | None = None
    base_gravable: Decimal = Field(default=0, ge=0)
    iva_trasladado: Decimal = Field(default=0, ge=0)
    iva_acreditable: Decimal = Field(default=0, ge=0)
    iva_retenido: Decimal = Field(default=0, ge=0)
    isr_retenido: Decimal = Field(default=0, ge=0)
    ieps: Decimal = Field(default=0, ge=0)
    total: Decimal = Field(default=0, ge=0)
    notas: str | None = None


class OperacionFiscalResponse(OperacionFiscalCreate):
    id: int
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None

    model_config = ConfigDict(from_attributes=True)