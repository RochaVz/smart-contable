"""Operaciones de administración de la plataforma: usuarios activos y borrado total."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.logging_config import get_logger
from app.core.permissions import es_admin_app
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.fiscal import DeclaracionFiscal, HistorialFiscal
from app.models.usuario import Usuario
from app.services.purga_datos import eliminar_empresa_definitivamente

logger = get_logger(__name__)


def listar_usuarios(db: Session) -> list[dict]:
    empresas_por_usuario = dict(
        db.query(Empresa.usuario_id, func.count(Empresa.id)).group_by(Empresa.usuario_id).all()
    )
    facturas_por_usuario = dict(
        db.query(Empresa.usuario_id, func.count(Factura.id))
        .join(Factura, Factura.empresa_id == Empresa.id)
        .group_by(Empresa.usuario_id)
        .all()
    )
    return [
        {
            "id": u.id,
            "nombre": u.nombre,
            "email": u.email,
            "rol": u.rol.value if hasattr(u.rol, "value") else u.rol,
            "activo": bool(u.activo),
            "creado_en": u.creado_en,
            "empresas": empresas_por_usuario.get(u.id, 0),
            "facturas": facturas_por_usuario.get(u.id, 0),
            "es_admin_app": es_admin_app(u),
        }
        for u in db.query(Usuario).order_by(Usuario.id).all()
    ]


def listar_empresas_por_rfc(db: Session, rfc: str) -> list[Empresa]:
    return db.query(Empresa).filter(Empresa.rfc == rfc.strip().upper()).all()


def eliminar_rfc_global(db: Session, rfc: str) -> dict:
    """Borra el RFC y todo su historial en todas las cuentas. No hace commit.

    Solo elimina empresas con ese RFC; las facturas de otras empresas que lo
    mencionan como contraparte se reportan pero no se tocan.
    """
    rfc_normalizado = rfc.strip().upper()
    empresas = listar_empresas_por_rfc(db, rfc_normalizado)
    detalle = [eliminar_empresa_definitivamente(db, e) for e in empresas]
    como_contraparte = (
        db.query(func.count(Factura.id))
        .filter((Factura.rfc_emisor == rfc_normalizado) | (Factura.rfc_receptor == rfc_normalizado))
        .scalar()
        or 0
    )
    logger.info("RFC eliminado globalmente", extra={"rfc": rfc_normalizado, "empresas": len(detalle)})
    return {
        "rfc": rfc_normalizado,
        "empresas_eliminadas": len(detalle),
        "facturas_de_otras_empresas_que_lo_mencionan": int(como_contraparte),
        "detalle": detalle,
    }


def eliminar_usuario_completo(db: Session, usuario: Usuario) -> dict:
    """Borra el usuario, sus empresas y todos sus datos. No hace commit."""
    if es_admin_app(usuario):
        raise ValueError("El administrador de la aplicación no puede eliminarse")

    empresas = db.query(Empresa).filter(Empresa.usuario_id == usuario.id).all()
    detalle = [eliminar_empresa_definitivamente(db, e) for e in empresas]

    # Autoría en registros de empresas ajenas: se desvincula, no se borra el registro.
    db.query(DeclaracionFiscal).filter(DeclaracionFiscal.usuario_id == usuario.id).update(
        {DeclaracionFiscal.usuario_id: None}, synchronize_session=False
    )
    db.query(HistorialFiscal).filter(HistorialFiscal.usuario_id == usuario.id).update(
        {HistorialFiscal.usuario_id: None}, synchronize_session=False
    )

    usuario_id, email = usuario.id, usuario.email
    db.expire(usuario)
    db.delete(usuario)
    db.flush()
    logger.info("Usuario eliminado por administrador", extra={"user_id": usuario_id})
    return {"usuario_id": usuario_id, "email": email, "empresas_eliminadas": len(detalle), "detalle": detalle}
