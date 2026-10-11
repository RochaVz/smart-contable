from sqlalchemy import Column, DateTime, func
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base declarativa compartida para todos los modelos."""


class TimestampMixin:
    """Mixin que agrega timestamps automáticos a todos los modelos.

    Proporciona:
    - creado_en: Timestamp de creación (automático)
    - actualizado_en: Timestamp de última actualización (automático)
    """

    creado_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        comment="Timestamp de creación del registro"
    )

    actualizado_en = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
        comment="Timestamp de última actualización"
    )
