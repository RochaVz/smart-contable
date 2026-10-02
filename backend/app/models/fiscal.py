# pylint: disable=not-callable
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


class TipoPeriodoFiscal(str, enum.Enum):
    mensual = "mensual"
    anual = "anual"


class TipoOperacionFiscal(str, enum.Enum):
    ingreso = "ingreso"
    egreso = "egreso"
    nomina = "nomina"
    pago = "pago"
    ajuste = "ajuste"


class OrigenOperacionFiscal(str, enum.Enum):
    cfdi = "cfdi"
    poliza = "poliza"
    manual = "manual"


class TipoOperacionDiot(str, enum.Enum):
    nacional = "nacional"
    extranjero = "extranjero"
    global_ = "global"


class TipoDeclaracionFiscal(str, enum.Enum):
    isr = "isr"
    iva = "iva"
    diot = "diot"
    anual = "anual"
    ieps = "ieps"


class EstadoDeclaracionFiscal(str, enum.Enum):
    borrador = "borrador"
    calculada = "calculada"
    presentada = "presentada"
    modificada = "modificada"
    cancelada = "cancelada"


class TipoEntidadHistorialFiscal(str, enum.Enum):
    declaracion = "declaracion"
    operacion = "operacion"
    periodo = "periodo"


class AccionHistorialFiscal(str, enum.Enum):
    crear = "crear"
    actualizar = "actualizar"
    presentar = "presentar"
    modificar = "modificar"
    cancelar = "cancelar"


class PeriodoFiscal(Base):
    __tablename__ = "periodos_fiscales"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "tipo",
            "anio",
            "mes",
            name="uq_periodo_fiscal_empresa_tipo_anio_mes",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    tipo = Column(Enum(TipoPeriodoFiscal), nullable=False)
    anio = Column(Integer, nullable=False, index=True)
    mes = Column(Integer, nullable=True, index=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    actualizado_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="periodos_fiscales")
    operaciones = relationship(
        "OperacionFiscal",
        back_populates="periodo",
        cascade="all, delete-orphan",
    )
    declaraciones = relationship(
        "DeclaracionFiscal",
        back_populates="periodo",
        cascade="all, delete-orphan",
    )


class OperacionFiscal(Base):
    __tablename__ = "operaciones_fiscales"
    __table_args__ = (
        UniqueConstraint(
            "empresa_id",
            "origen",
            "referencia_origen",
            name="uq_operacion_fiscal_empresa_origen_referencia",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    periodo_id = Column(Integer, ForeignKey("periodos_fiscales.id"), nullable=False, index=True)
    factura_id = Column(Integer, ForeignKey("facturas.id"), nullable=True, index=True)
    tipo_operacion = Column(Enum(TipoOperacionFiscal), nullable=False, index=True)
    origen = Column(Enum(OrigenOperacionFiscal), nullable=False)
    referencia_origen = Column(String(100), nullable=False)
    rfc_contraparte = Column(String(13), nullable=True, index=True)
    nombre_contraparte = Column(String(255), nullable=True)
    tipo_operacion_diot = Column(Enum(TipoOperacionDiot), nullable=True, index=True)
    base_gravable = Column(Numeric(15, 2), nullable=False, default=0)
    iva_trasladado = Column(Numeric(15, 2), nullable=False, default=0)
    iva_acreditable = Column(Numeric(15, 2), nullable=False, default=0)
    iva_retenido = Column(Numeric(15, 2), nullable=False, default=0)
    isr_retenido = Column(Numeric(15, 2), nullable=False, default=0)
    ieps = Column(Numeric(15, 2), nullable=False, default=0)
    total = Column(Numeric(15, 2), nullable=False, default=0)
    notas = Column(Text, nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    actualizado_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="operaciones_fiscales")
    periodo = relationship("PeriodoFiscal", back_populates="operaciones")
    factura = relationship("Factura", back_populates="operaciones_fiscales")


class DeclaracionFiscal(Base):
    """Versión auditada de una declaración fiscal (ISR/IVA/DIOT/anual/IEPS)."""

    __tablename__ = "declaraciones_fiscales"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    periodo_id = Column(Integer, ForeignKey("periodos_fiscales.id"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    tipo = Column(Enum(TipoDeclaracionFiscal), nullable=False, index=True)
    estado = Column(
        Enum(EstadoDeclaracionFiscal),
        nullable=False,
        default=EstadoDeclaracionFiscal.borrador,
        index=True,
    )
    version = Column(Integer, nullable=False, default=1)
    es_vigente = Column(Boolean, nullable=False, default=True, index=True)
    declaracion_origen_id = Column(
        Integer,
        ForeignKey("declaraciones_fiscales.id"),
        nullable=True,
        index=True,
    )
    version_anterior_id = Column(
        Integer,
        ForeignKey("declaraciones_fiscales.id"),
        nullable=True,
        index=True,
    )
    base_gravable = Column(Numeric(15, 2), nullable=False, default=0)
    isr_causado = Column(Numeric(15, 2), nullable=False, default=0)
    iva_trasladado = Column(Numeric(15, 2), nullable=False, default=0)
    iva_acreditable = Column(Numeric(15, 2), nullable=False, default=0)
    iva_retenido = Column(Numeric(15, 2), nullable=False, default=0)
    monto_a_cargo = Column(Numeric(15, 2), nullable=False, default=0)
    monto_a_favor = Column(Numeric(15, 2), nullable=False, default=0)
    snapshot_calculo = Column(Text, nullable=True)
    motivo_modificacion = Column(String(500), nullable=True)
    notas = Column(Text, nullable=True)
    fecha_presentacion = Column(DateTime(timezone=True), nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())
    actualizado_en = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    empresa = relationship("Empresa", back_populates="declaraciones_fiscales")
    periodo = relationship("PeriodoFiscal", back_populates="declaraciones")
    usuario = relationship("Usuario")
    version_anterior = relationship(
        "DeclaracionFiscal",
        foreign_keys=[version_anterior_id],
        remote_side=[id],
        uselist=False,
    )
    declaracion_origen = relationship(
        "DeclaracionFiscal",
        foreign_keys=[declaracion_origen_id],
        remote_side=[id],
        uselist=False,
    )


class HistorialFiscal(Base):
    """Bitácora de altas y cambios sobre declaraciones, operaciones o periodos."""

    __tablename__ = "historial_fiscal"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    usuario_id = Column(Integer, ForeignKey("usuarios.id"), nullable=True, index=True)
    entidad_tipo = Column(Enum(TipoEntidadHistorialFiscal), nullable=False, index=True)
    entidad_id = Column(Integer, nullable=False, index=True)
    accion = Column(Enum(AccionHistorialFiscal), nullable=False, index=True)
    resumen = Column(String(255), nullable=False)
    detalle_antes = Column(Text, nullable=True)
    detalle_despues = Column(Text, nullable=True)
    motivo = Column(String(500), nullable=True)
    creado_en = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    empresa = relationship("Empresa", back_populates="historial_fiscal")
    usuario = relationship("Usuario")