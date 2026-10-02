from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Enum,
    UniqueConstraint
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
from app.core.sat_fiscal import SatRegimenEnum
import enum


class TipoPersona(str, enum.Enum):
    fisica = "fisica"
    moral = "moral"


RegimenFiscal = SatRegimenEnum


class OpcionDeduccion(str, enum.Enum):
    ciega = "CIEGA"
    real = "REAL"


class Empresa(Base):
    __tablename__ = "empresas"
    __table_args__ = (
        UniqueConstraint("usuario_id", "rfc", name="uq_empresa_usuario_rfc"),
    )

    id = Column(Integer, primary_key=True, index=True)

    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id"),
        nullable=False,
        index=True
    )

    rfc = Column(
        String(13),
        index=True,
        nullable=False
    )

    razon_social = Column(
        String(255),
        nullable=False
    )

    tipo_persona = Column(
        Enum(TipoPersona),
        nullable=False
    )

    regimen_fiscal = Column(
        Enum(RegimenFiscal),
        nullable=False
    )

    opcion_deduccion = Column(Enum(OpcionDeduccion), nullable=True)

    codigo_postal = Column(String(10))

    activo = Column(
        Boolean,
        default=True
    )
    # pylint: disable=not-callable
    creado_en = Column(
        DateTime(timezone=True),
        server_default=func.now()
    ) # pylint: disable=not-callable

    actualizado_en = Column(
        DateTime,
        server_default=func.now(),
        onupdate=func.now()
    )

    usuario = relationship(
        "Usuario",
        back_populates="empresas"
    )

    facturas = relationship(
        "Factura",
        back_populates="empresa",
        cascade="all, delete-orphan"
    )

    polizas = relationship(
        "Poliza",
        back_populates="empresa",
        cascade="all, delete-orphan"
    )

    comisiones_banco = relationship(
        "ComisionBanco",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    estados_cuenta = relationship(
        "EstadoCuentaCarga",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    periodos_fiscales = relationship(
        "PeriodoFiscal",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    operaciones_fiscales = relationship(
        "OperacionFiscal",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    declaraciones_fiscales = relationship(
        "DeclaracionFiscal",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    historial_fiscal = relationship(
        "HistorialFiscal",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    movimientos_banco = relationship(
        "MovimientoBanco",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    complementos_pago = relationship(
        "CfdiComplementoPago",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    nominas_cfdi = relationship(
        "CfdiNomina",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    clasificaciones_especiales = relationship(
        "CfdiClasificacionEspecial",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    pagos_provisionales_anteriores = relationship(
        "PagoProvisionalAnterior",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    perdidas_fiscales = relationship(
        "PerdidaFiscal",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Empresa {self.rfc} - {self.razon_social}>"

