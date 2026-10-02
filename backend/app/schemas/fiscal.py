from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.ajustes_fiscales import TipoImpuestoProvisional
from app.models.fiscal import (
    AccionHistorialFiscal,
    EstadoDeclaracionFiscal,
    OrigenOperacionFiscal,
    TipoDeclaracionFiscal,
    TipoEntidadHistorialFiscal,
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


class DeclaracionFiscalCreate(BaseModel):
    empresa_id: int
    periodo_id: int
    tipo: TipoDeclaracionFiscal
    estado: EstadoDeclaracionFiscal = EstadoDeclaracionFiscal.borrador
    base_gravable: Decimal = Field(default=0, ge=0)
    isr_causado: Decimal = Field(default=0, ge=0)
    iva_trasladado: Decimal = Field(default=0, ge=0)
    iva_acreditable: Decimal = Field(default=0, ge=0)
    iva_retenido: Decimal = Field(default=0, ge=0)
    monto_a_cargo: Decimal = Field(default=0, ge=0)
    monto_a_favor: Decimal = Field(default=0, ge=0)
    snapshot_calculo: dict[str, Any] | list[Any] | None = None
    notas: str | None = None


class DeclaracionFiscalModificar(BaseModel):
    motivo: str = Field(min_length=3, max_length=500)
    estado: EstadoDeclaracionFiscal | None = None
    base_gravable: Decimal | None = Field(default=None, ge=0)
    isr_causado: Decimal | None = Field(default=None, ge=0)
    iva_trasladado: Decimal | None = Field(default=None, ge=0)
    iva_acreditable: Decimal | None = Field(default=None, ge=0)
    iva_retenido: Decimal | None = Field(default=None, ge=0)
    monto_a_cargo: Decimal | None = Field(default=None, ge=0)
    monto_a_favor: Decimal | None = Field(default=None, ge=0)
    snapshot_calculo: dict[str, Any] | list[Any] | None = None
    notas: str | None = None


class DeclaracionFiscalResponse(BaseModel):
    id: int
    empresa_id: int
    periodo_id: int
    usuario_id: int | None = None
    tipo: TipoDeclaracionFiscal
    estado: EstadoDeclaracionFiscal
    version: int
    es_vigente: bool
    declaracion_origen_id: int | None = None
    version_anterior_id: int | None = None
    base_gravable: Decimal
    isr_causado: Decimal
    iva_trasladado: Decimal
    iva_acreditable: Decimal
    iva_retenido: Decimal
    monto_a_cargo: Decimal
    monto_a_favor: Decimal
    snapshot_calculo: dict[str, Any] | list[Any] | None = None
    motivo_modificacion: str | None = None
    notas: str | None = None
    fecha_presentacion: datetime | None = None
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class HistorialFiscalResponse(BaseModel):
    id: int
    empresa_id: int
    usuario_id: int | None = None
    entidad_tipo: TipoEntidadHistorialFiscal
    entidad_id: int
    accion: AccionHistorialFiscal
    resumen: str
    detalle_antes: dict[str, Any] | list[Any] | None = None
    detalle_despues: dict[str, Any] | list[Any] | None = None
    motivo: str | None = None
    creado_en: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class PagoProvisionalCreate(BaseModel):
    empresa_id: int
    tipo_impuesto: TipoImpuestoProvisional
    ejercicio: int = Field(ge=2000, le=2100)
    mes: int = Field(ge=1, le=12)
    monto: Decimal = Field(ge=0)
    notas: str | None = Field(default=None, max_length=500)


class PagoProvisionalResponse(PagoProvisionalCreate):
    id: int
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class PerdidaFiscalCreate(BaseModel):
    empresa_id: int
    ejercicio_origen: int = Field(ge=2000, le=2100)
    monto_original: Decimal = Field(gt=0)
    monto_pendiente: Decimal | None = Field(default=None, ge=0)
    ejercicio_limite: int | None = Field(default=None, ge=2000, le=2100)
    activa: bool = True
    notas: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def default_pendiente(self):
        if self.monto_pendiente is None:
            self.monto_pendiente = self.monto_original
        if self.monto_pendiente > self.monto_original:
            raise ValueError("monto_pendiente no puede exceder monto_original")
        return self


class PerdidaFiscalResponse(BaseModel):
    id: int
    empresa_id: int
    ejercicio_origen: int
    monto_original: Decimal
    monto_pendiente: Decimal
    ejercicio_limite: int | None = None
    activa: bool
    notas: str | None = None
    creado_en: datetime | None = None
    actualizado_en: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

