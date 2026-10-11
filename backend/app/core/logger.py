import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path
from app.core.config import settings


def get_logger(name: str) -> logging.Logger:
    """
    Retorna un logger configurado por nombre de módulo.

    Args:
        name: Nombre del módulo (__name__)

    Returns:
        Logger configurado y listo para usar
    """
    logger = logging.getLogger(name)

    # Evitar handlers duplicados
    if logger.handlers:
        return logger

    logger.setLevel(getattr(logging, settings.LOG_LEVEL))

    # Formato estándar
    formatter = logging.Formatter(
        fmt='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # Handler: Console (siempre activo)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # Handler: File (solo en producción)
    if settings.ENVIRONMENT == "production":
        logs_dir = Path("logs")
        logs_dir.mkdir(exist_ok=True)

        file_handler = RotatingFileHandler(
            filename=logs_dir / "app.log",
            maxBytes=10_485_760,  # 10MB
            backupCount=10
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger
