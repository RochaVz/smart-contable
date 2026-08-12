from sqlalchemy import Column, Integer, String, ForeignKey
from app.core.database import Base


class MapeoCuenta(Base):
    __tablename__ = "mapeo_cuentas"

    id = Column(Integer, primary_key=True, index=True)
    rfc_emisor = Column(String(13), index=True)  # Compatibilidad con reglas RFC existentes
    tipo_regla = Column(String(20), nullable=False, default="rfc")
    patron = Column(String(120), nullable=True)  # keyword concepto o prefijo clave SAT
    nombre_cuenta = Column(String(100))  # Ej: "Papelería", "Viáticos", "Combustible"
    codigo_cuenta = Column(String(50))  # El código contable (opcional)
    empresa_id = Column(Integer, ForeignKey("empresas.id"))