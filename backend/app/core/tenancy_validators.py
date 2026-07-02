"""
Multi-tenancy validation helpers
Ensures data isolation and user authorization
"""
from sqlalchemy.orm import Session
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.poliza import Poliza
from app.core.exceptions import ForbiddenResourceException, ResourceNotFoundException
from app.core.logging_config import get_logger

logger = get_logger(__name__)


def validar_empresa_pertenece_usuario(
    empresa_id: int,
    usuario_id: int,
    db: Session
) -> Empresa:
    """
    Validate that an empresa belongs to the current user
    
    Args:
        empresa_id: ID of the empresa to validate
        usuario_id: ID of the current user
        db: Database session
    
    Returns:
        Empresa object if authorized
    
    Raises:
        ResourceNotFoundException: If empresa doesn't exist
        ForbiddenResourceException: If user doesn't own the empresa
    """
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
    ).first()
    
    if not empresa:
        logger.warning(
            "Empresa no encontrado",
            extra={"empresa_id": empresa_id, "user_id": usuario_id}
        )
        raise ResourceNotFoundException("Empresa", str(empresa_id))
    
    if empresa.usuario_id != usuario_id:
        logger.warning(
            "Intento de acceso no autorizado a empresa",
            extra={
                "empresa_id": empresa_id,
                "usuario_id": usuario_id,
                "owner_id": empresa.usuario_id
            }
        )
        raise ForbiddenResourceException("empresa")
    
    return empresa


def validar_factura_pertenece_usuario(
    factura_id: int,
    usuario_id: int,
    db: Session
) -> Factura:
    """
    Validate that a factura belongs to current user's empresas
    
    Args:
        factura_id: ID of the factura
        usuario_id: ID of the current user
        db: Database session
    
    Returns:
        Factura object if authorized
    
    Raises:
        ResourceNotFoundException: If factura doesn't exist
        ForbiddenResourceException: If user doesn't own the factura
    """
    factura = db.query(Factura).join(
        Empresa
    ).filter(
        Factura.id == factura_id,
        Empresa.usuario_id == usuario_id
    ).first()
    
    if not factura:
        logger.warning(
            "Factura no encontrado o acceso denegado",
            extra={"factura_id": factura_id, "user_id": usuario_id}
        )
        raise ResourceNotFoundException("Factura", str(factura_id))
    
    return factura


def validar_poliza_pertenece_usuario(
    poliza_id: int,
    usuario_id: int,
    db: Session
) -> Poliza:
    """
    Validate that a póliza belongs to current user's empresas
    
    Args:
        poliza_id: ID of the póliza
        usuario_id: ID of the current user
        db: Database session
    
    Returns:
        Poliza object if authorized
    
    Raises:
        ResourceNotFoundException: If póliza doesn't exist
        ForbiddenResourceException: If user doesn't own the póliza
    """
    poliza = db.query(Poliza).join(
        Empresa
    ).filter(
        Poliza.id == poliza_id,
        Empresa.usuario_id == usuario_id
    ).first()
    
    if not poliza:
        logger.warning(
            "Póliza no encontrado o acceso denegado",
            extra={"poliza_id": poliza_id, "user_id": usuario_id}
        )
        raise ResourceNotFoundException("Póliza", str(poliza_id))
    
    return poliza


def get_usuario_empresas(
    usuario_id: int,
    db: Session
) -> list[Empresa]:
    """
    Get all active empresas for a user
    
    Args:
        usuario_id: ID of the user
        db: Database session
    
    Returns:
        List of active empresas
    """
    empresas = db.query(Empresa).filter(
        Empresa.usuario_id == usuario_id,
        Empresa.activo == True  # noqa: E712
    ).all()
    
    return empresas
