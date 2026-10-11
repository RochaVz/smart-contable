from sqlalchemy import (
    Column,
    Integer,
    String,
    Numeric,
    ForeignKey,
    Enum,
    Text,
    Boolean,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.core.base_model import Base, TimestampMixin
import enum


class TipoFactura(str, enum.Enum):
    ingreso = "I"
    egreso = "E"
    traslado = "T"
    nomina = "N"
    pago = "P"


class EstatusFactura(str, enum.Enum):
    vigente = "vigente"
    cancelada = "cancelada"


class Factura(Base, TimestampMixin):
    __tablename__ = "facturas"
    __table_args__ = (
        UniqueConstraint("empresa_id", "uuid", name="uq_facturas_empresa_uuid"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False)

    # Datos del CFDI
    uuid = Column(String(36), index=True, nullable=False)
    serie = Column(String(10))
    folio = Column(String(20))
    version_cfdi = Column(String(5), default="4.0")
    tipo_comprobante = Column(Enum(TipoFactura), nullable=False)
    fecha_emision = Column(String(30), nullable=False)
    fecha_timbrado = Column(String(30))

    # Emisor / Receptor
    rfc_emisor = Column(String(13), index=True, nullable=False)
    nombre_emisor = Column(String(255))
    rfc_receptor = Column(String(13), index=True, nullable=False)
    nombre_receptor = Column(String(255))
    uso_cfdi = Column(String(10))
    metodo_pago = Column(String(3))
    forma_pago = Column(String(3))

    # Importes
    subtotal = Column(Numeric(15, 2), nullable=False)
    descuento = Column(Numeric(15, 2), default=0)
    iva_trasladado = Column(Numeric(15, 2), default=0)
    iva_retenido = Column(Numeric(15, 2), default=0)
    isr_retenido = Column(Numeric(15, 2), default=0)
    impuestos_locales = Column(Numeric(15, 2), default=0)
    total = Column(Numeric(15, 2), nullable=False)
    moneda = Column(String(3), default="MXN")
    tipo_cambio = Column(Numeric(10, 4), default=1)

    # Control
    es_deducible = Column(Boolean, default=True)
    estatus = Column(Enum(EstatusFactura), default=EstatusFactura.vigente)
    xml_contenido = Column(Text)

    empresa = relationship("Empresa", back_populates="facturas")
    polizas = relationship("Poliza", back_populates="factura", cascade="all, delete-orphan")
