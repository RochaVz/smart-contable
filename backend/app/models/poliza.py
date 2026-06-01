from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Enum, Text, func, text
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class TipoPoliza(str, enum.Enum):
    ingreso = "ingreso"
    egreso  = "egreso"
    diario  = "diario"

class Poliza(Base):
    __tablename__ = "polizas"

    id           = Column(Integer, primary_key=True, index=True)
    empresa_id   = Column(Integer, ForeignKey("empresas.id"), nullable=False)
    factura_id   = Column(Integer, ForeignKey("facturas.id"), nullable=True)
    tipo         = Column(Enum(TipoPoliza), nullable=False)
    numero       = Column(Integer, nullable=False)
    fecha        = Column(DateTime, nullable=False)
    mes  = Column(Integer)
    anio = Column(Integer)
    concepto     = Column(String(500))
    total        = Column(Numeric(15, 2), nullable=False)
    creado_en    = Column(DateTime(timezone=True), server_default=text('NOW()'))

    empresa      = relationship("Empresa", back_populates="polizas")
    factura      = relationship("Factura", back_populates="polizas")
    movimientos  = relationship("MovimientoPoliza", back_populates="poliza")

class MovimientoPoliza(Base):
    __tablename__ = "movimientos_poliza"

    id           = Column(Integer, primary_key=True, index=True)
    poliza_id    = Column(Integer, ForeignKey("polizas.id"), nullable=False)
    cuenta       = Column(String(20), nullable=False)   # Ej: 102.01.01
    nombre_cuenta= Column(String(255))
    debe         = Column(Numeric(15, 2), default=0)
    haber        = Column(Numeric(15, 2), default=0)
    concepto     = Column(String(500))

    poliza       = relationship("Poliza", back_populates="movimientos")
