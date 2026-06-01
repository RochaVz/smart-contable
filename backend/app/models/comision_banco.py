from sqlalchemy import Column, Integer, String, Boolean, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class ComisionBanco(Base):
    """Comisión por banco y tipo de tarjeta (crédito / débito) por empresa."""

    __tablename__ = "comisiones_banco"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    nombre_banco = Column(String(100), nullable=False)
    # Porcentajes en puntos (ej. 3.5 = 3.5%)
    porcentaje_credito = Column(Numeric(6, 3), nullable=False, default=2.5)
    porcentaje_debito = Column(Numeric(6, 3), nullable=False, default=1.8)
    porcentaje_servicios = Column(Numeric(6, 3), nullable=False, default=2.0)
    comision_fija = Column(Numeric(10, 2), nullable=False, default=0)
    es_default = Column(Boolean, default=False)

    empresa = relationship("Empresa", back_populates="comisiones_banco")
