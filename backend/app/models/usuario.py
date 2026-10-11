from sqlalchemy import Column, Integer, String, Boolean, Enum
from sqlalchemy.orm import relationship
from app.core.base_model import Base, TimestampMixin
import enum


class RolUsuario(str, enum.Enum):
    admin = "admin"
    contador = "contador"
    auditor = "auditor"
    auxiliar = "auxiliar"
    cliente = "cliente"


class Usuario(Base, TimestampMixin):
    __tablename__ = "usuarios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    rol = Column(Enum(RolUsuario), default=RolUsuario.contador)
    activo = Column(Boolean, default=True)

    empresas = relationship("Empresa", back_populates="usuario")
