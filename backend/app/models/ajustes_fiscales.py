"""Pagos provisionales previos y perdidas fiscales aplicables."""

from __future__ import annotations

import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.core.database import Base


class TipoImpuestoProvisional(str, enum.Enum):
    isr = "isr"
    iva = "iva"
    ieps = "ieps"


class PagoProvisionalAnterior(Base):
    """Pagos provisionales ya enterados (anteriores al mes/anio en calculo)."""

    __tablename__ = "pagos_provisionales_anteriores"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "tipo_impuesto",
            "ejercicio",
            "mes",
            name="uq_pago_provisional_empresa_tipo_ejercicio_mes",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    tipo_impuesto = Column(Enum(TipoImpuestoProvisional), nullable=False, index=True)
    ejercicio = Column(Integer, nullable=False, index=True)
    mes = Column(Integer, nullable=False)  # 1-12
    monto = Column(Numeric(15, 2), nullable=False, default=0)
    notas = Column(String(500), nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    actualizado_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="pagos_provisionales_anteriores")


class PerdidaFiscal(Base):
    """Perdidas fiscales pendientes de aplicar contra utilidad del ejercicio."""

    __tablename__ = "perdidas_fiscales"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    ejercicio_origen = Column(Integer, nullable=False, index=True)
    monto_original = Column(Numeric(15, 2), nullable=False, default=0)
    monto_pendiente = Column(Numeric(15, 2), nullable=False, default=0)
    ejercicio_limite = Column(Integer, nullable=True)  # ultimo ejercicio aplicable
    activa = Column(Boolean, nullable=False, default=True)
    notas = Column(String(500), nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    actualizado_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="perdidas_fiscales")
