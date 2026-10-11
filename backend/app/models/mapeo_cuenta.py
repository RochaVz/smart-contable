from sqlalchemy import Column, Integer, String, ForeignKey
from app.core.base_model import Base, TimestampMixin


class MapeoCuenta(Base, TimestampMixin):
    __tablename__ = "mapeo_cuentas"

    id = Column(Integer, primary_key=True, index=True)
    rfc_emisor = Column(String(13), index=True)
    nombre_cuenta = Column(String(100))
    codigo_cuenta = Column(String(50))
    empresa_id = Column(Integer, ForeignKey("empresas.id"))
