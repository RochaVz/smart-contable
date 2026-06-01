from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.empresa import Empresa


# ─────────────────────────────────────
# VALIDAR EMPRESA DEL USUARIO
# ─────────────────────────────────────
def validar_empresa_usuario(
    db: Session,
    empresa_id: int,
    usuario_id: int
):

    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == usuario_id
    ).first()

    if not empresa:

        raise HTTPException(
            status_code=403,
            detail="No tienes acceso a esta empresa"
        )

    return empresa


# ─────────────────────────────────────
# VALIDAR PERIODO
# ─────────────────────────────────────
def validar_periodo(
    mes: int,
    anio: int
):

    if mes < 1 or mes > 12:

        raise HTTPException(
            status_code=400,
            detail="Mes inválido"
        )

    if anio < 2000 or anio > 2100:

        raise HTTPException(
            status_code=400,
            detail="Año inválido"
        )