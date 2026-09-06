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

    movimientos_banco = relationship(
        "MovimientoBanco",
        back_populates="empresa",
        cascade="all, delete-orphan",
    )

    def __repr__(self):
        return f"<Empresa {self.rfc} - {self.razon_social}>"
