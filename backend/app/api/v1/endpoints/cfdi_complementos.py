"""Endpoints de complementos CFDI (pagos, nomina, retenciones terceros)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.permissions import require_roles
from app.models.cfdi_complementos import CfdiComplementoPago, CfdiNomina
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.services.cfdi_complementos import (
    consolidar_retenciones_terceros,
    listar_complementos_pago,
    listar_nominas,
    serializar_complemento_pago,
    serializar_nomina,
)
from fastapi import HTTPException

router = APIRouter()


def _empresa_del_usuario(db: Session, empresa_id: int, user: Usuario) -> Empresa:
    empresa = (
        db.query(Empresa)
        .filter(Empresa.id == empresa_id, Empresa.usuario_id == user.id)
        .first()
    )
    if not empresa:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta empresa")
    return empresa


@router.get("/pagos")
def get_complementos_pago(
    empresa_id: int = Query(...),
    anio: int | None = Query(None),
    mes: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    _: None = Depends(require_roles("admin", "contador", "auxiliar")),
):
    _empresa_del_usuario(db, empresa_id, current_user)
    items = (
        db.query(CfdiComplementoPago)
        .options(joinedload(CfdiComplementoPago.documentos))
        .filter(CfdiComplementoPago.empresa_id == empresa_id)
    )
    from sqlalchemy import extract

    if anio is not None:
        items = items.filter(extract("year", CfdiComplementoPago.fecha_emision) == anio)
    if mes is not None:
        items = items.filter(extract("month", CfdiComplementoPago.fecha_emision) == mes)
    rows = items.order_by(CfdiComplementoPago.fecha_emision.desc(), CfdiComplementoPago.id.desc()).all()
    return {
        "total": len(rows),
        "items": [serializar_complemento_pago(r) for r in rows],
    }


@router.get("/nominas")
def get_nominas(
    empresa_id: int = Query(...),
    anio: int | None = Query(None),
    mes: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    _: None = Depends(require_roles("admin", "contador", "auxiliar")),
):
    _empresa_del_usuario(db, empresa_id, current_user)
    rows = listar_nominas(db, empresa_id, anio=anio, mes=mes)
    # eager lineas
    ids = [r.id for r in rows]
    if ids:
        rows = (
            db.query(CfdiNomina)
            .options(joinedload(CfdiNomina.lineas))
            .filter(CfdiNomina.id.in_(ids))
            .order_by(CfdiNomina.fecha_pago.desc(), CfdiNomina.id.desc())
            .all()
        )
    return {
        "total": len(rows),
        "items": [serializar_nomina(r) for r in rows],
    }


@router.get("/retenciones-terceros")
def get_retenciones_terceros(
    empresa_id: int = Query(...),
    anio: int | None = Query(None),
    mes: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
    _: None = Depends(require_roles("admin", "contador", "auxiliar")),
):
    _empresa_del_usuario(db, empresa_id, current_user)
    return consolidar_retenciones_terceros(db, empresa_id, mes=mes, anio=anio)
