"""Modelos para complementos CFDI: nomina, pagos y clasificaciones especiales."""

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


class TipoLineaNomina(str, enum.Enum):
    percepcion = "percepcion"
    deduccion = "deduccion"
    otro_pago = "otro_pago"


class TipoClasificacionEspecial(str, enum.Enum):
    arrendamiento = "arrendamiento"
    intereses = "intereses"
    dividendos = "dividendos"


class CfdiComplementoPago(Base):
    __tablename__ = "cfdi_complementos_pago"
    __table_args__ = (
        UniqueConstraint("empresa_id", "uuid", name="uq_cfdi_complemento_pago_empresa_uuid"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    uuid = Column(String(36), nullable=False, index=True)
    serie = Column(String(50), nullable=True)
    folio = Column(String(40), nullable=True)
    version_cfdi = Column(String(5), nullable=True)
    version_pagos = Column(String(10), nullable=True)
    fecha_emision = Column(DateTime, nullable=True)
    fecha_timbrado = Column(DateTime, nullable=True)
    rfc_emisor = Column(String(13), nullable=False, index=True)
    nombre_emisor = Column(String(255), nullable=True)
    rfc_receptor = Column(String(13), nullable=False, index=True)
    nombre_receptor = Column(String(255), nullable=True)
    moneda = Column(String(3), default="MXN")
    total = Column(Numeric(15, 2), nullable=False, default=0)
    total_pagos = Column(Numeric(15, 2), nullable=False, default=0)
    num_documentos = Column(Integer, nullable=False, default=0)
    xml_contenido = Column(Text, nullable=True)
    archivo_s3_key = Column(String(512), nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    actualizado_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="complementos_pago")
    documentos = relationship(
        "CfdiPagoDocumento",
        back_populates="complemento_pago",
        cascade="all, delete-orphan",
    )


class CfdiPagoDocumento(Base):
    __tablename__ = "cfdi_pago_documentos"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    complemento_pago_id = Column(
        Integer,
        ForeignKey("cfdi_complementos_pago.id"),
        nullable=False,
        index=True,
    )
    factura_id = Column(Integer, ForeignKey("facturas.id"), nullable=True, index=True)
    uuid_cfdi_relacionado = Column(String(36), nullable=True, index=True)
    serie = Column(String(50), nullable=True)
    folio = Column(String(40), nullable=True)
    moneda_dr = Column(String(3), nullable=True)
    num_parcialidad = Column(Integer, nullable=True)
    importe_saldo_anterior = Column(Numeric(15, 2), nullable=False, default=0)
    importe_pagado = Column(Numeric(15, 2), nullable=False, default=0)
    importe_saldo_insoluto = Column(Numeric(15, 2), nullable=False, default=0)
    metodo_pago_dr = Column(String(5), nullable=True)
    objeto_imp_dr = Column(String(5), nullable=True)
    fecha_pago = Column(DateTime, nullable=True)
    forma_pago_p = Column(String(5), nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    complemento_pago = relationship("CfdiComplementoPago", back_populates="documentos")
    factura = relationship("Factura", back_populates="pagos_relacionados")
    empresa = relationship("Empresa")


class CfdiNomina(Base):
    __tablename__ = "cfdi_nominas"
    __table_args__ = (
        UniqueConstraint("factura_id", name="uq_cfdi_nomina_factura"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    factura_id = Column(Integer, ForeignKey("facturas.id"), nullable=False, index=True)
    version = Column(String(10), nullable=True)
    tipo_nomina = Column(String(5), nullable=True)
    fecha_pago = Column(DateTime, nullable=True)
    fecha_inicial_pago = Column(DateTime, nullable=True)
    fecha_final_pago = Column(DateTime, nullable=True)
    num_dias_pagados = Column(Numeric(8, 2), nullable=False, default=0)
    total_percepciones = Column(Numeric(15, 2), nullable=False, default=0)
    total_deducciones = Column(Numeric(15, 2), nullable=False, default=0)
    total_otros_pagos = Column(Numeric(15, 2), nullable=False, default=0)
    total_sueldos = Column(Numeric(15, 2), nullable=False, default=0)
    total_gravado = Column(Numeric(15, 2), nullable=False, default=0)
    total_exento = Column(Numeric(15, 2), nullable=False, default=0)
    isr_retenido = Column(Numeric(15, 2), nullable=False, default=0)
    subsidio_causado = Column(Numeric(15, 2), nullable=False, default=0)
    subsidio_entregado = Column(Numeric(15, 2), nullable=False, default=0)
    snapshot_json = Column(Text, nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    actualizado_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="nominas_cfdi")
    factura = relationship("Factura", back_populates="nomina_detalle")
    lineas = relationship(
        "CfdiNominaLinea",
        back_populates="nomina",
        cascade="all, delete-orphan",
    )


class CfdiNominaLinea(Base):
    __tablename__ = "cfdi_nomina_lineas"

    id = Column(Integer, primary_key=True, index=True)
    nomina_id = Column(Integer, ForeignKey("cfdi_nominas.id"), nullable=False, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    tipo_linea = Column(Enum(TipoLineaNomina), nullable=False, index=True)
    tipo_clave = Column(String(10), nullable=True)
    clave = Column(String(30), nullable=True)
    concepto = Column(String(255), nullable=True)
    importe_gravado = Column(Numeric(15, 2), nullable=False, default=0)
    importe_exento = Column(Numeric(15, 2), nullable=False, default=0)
    importe = Column(Numeric(15, 2), nullable=False, default=0)
    es_subsidio = Column(Boolean, nullable=False, default=False)
    subsidio_causado = Column(Numeric(15, 2), nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    nomina = relationship("CfdiNomina", back_populates="lineas")
    empresa = relationship("Empresa")


class CfdiClasificacionEspecial(Base):
    __tablename__ = "cfdi_clasificaciones_especiales"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    factura_id = Column(Integer, ForeignKey("facturas.id"), nullable=False, index=True)
    tipo = Column(Enum(TipoClasificacionEspecial), nullable=False, index=True)
    clave_prod_serv = Column(String(20), nullable=True)
    descripcion = Column(String(500), nullable=True)
    importe = Column(Numeric(15, 2), nullable=False, default=0)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    empresa = relationship("Empresa", back_populates="clasificaciones_especiales")
    factura = relationship("Factura", back_populates="clasificaciones_especiales")
