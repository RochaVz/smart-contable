from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Enum
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum


class TipoPersona(str, enum.Enum):
    fisica = "fisica"
    moral = "moral"


class RegimenFiscal(str, enum.Enum):
    actividad_empresarial = "612"
    sueldos_salarios = "605"
    arrendamiento = "606"
    general_de_ley = "601"


class Empresa(Base):
    __tablename__ = "empresas"

    id = Column(Integer, primary_key=True, index=True)

    usuario_id = Column(
        Integer,
        ForeignKey("usuarios.id"),
        nullable=False,
        index=True
    )

    rfc = Column(
        String(13),
        unique=True,
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

    movimientos_banco = relationship(
        "MovimientoBanco",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Empresa {self.rfc} - {self.razon_social}>"
