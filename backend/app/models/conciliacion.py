from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import relationship
from app.core.database import Base


class EstadoCuentaCarga(Base):
    __tablename__ = "estados_cuenta_cargas"

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    banco_id = Column(Integer, ForeignKey("comisiones_banco.id"), nullable=True, index=True)
    nombre_archivo = Column(String(255), nullable=False)
    hash_archivo = Column(String(64), nullable=False, index=True)
    movimientos_count = Column(Integer, default=0)
    creado_en = Column(DateTime(timezone=True), server_default=func.now())

    empresa = relationship("Empresa", back_populates="estados_cuenta")
    movimientos = relationship(
        "MovimientoBanco",
        back_populates="carga",
        cascade="all, delete-orphan",
    )


class MovimientoBanco(Base):
    __tablename__ = "movimientos_banco"
    __table_args__ = (
        UniqueConstraint("empresa_id", "hash_movimiento", name="uq_movimiento_banco_empresa_hash"),
    )

    id = Column(Integer, primary_key=True, index=True)
    empresa_id = Column(Integer, ForeignKey("empresas.id"), nullable=False, index=True)
    carga_id = Column(Integer, ForeignKey("estados_cuenta_cargas.id"), nullable=False, index=True)
    banco_id = Column(Integer, ForeignKey("comisiones_banco.id"), nullable=True, index=True)
    fecha = Column(DateTime, nullable=False, index=True)
    tipo = Column(String(10), nullable=False)  # abono | cargo
    descripcion = Column(Text)
    referencia = Column(String(120))
    monto = Column(Numeric(15, 2), nullable=False)
    saldo = Column(Numeric(15, 2), nullable=True)
    hash_movimiento = Column(String(64), nullable=False, index=True)

    carga = relationship("EstadoCuentaCarga", back_populates="movimientos")
    empresa = relationship("Empresa", back_populates="movimientos_banco")
