from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import date
from typing import List
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.poliza import Poliza, TipoPoliza
from app.models.factura import Factura
from app.models.empresa import Empresa
from app.models.usuario import Usuario
from app.services.polizas import (
    generar_poliza_diario,
    serializar_poliza,
    preview_poliza_desde_factura,
    generar_poliza_desde_factura,
    generar_polizas_automaticas,
    obtener_facturas_pendientes_poliza,
)
from app.services.comisiones import obtener_banco_default_id
from app.services.cfdi_helpers import es_venta

router = APIRouter()


class MovimientoInput(BaseModel):
    cuenta: str
    nombre_cuenta: str
    debe: float = 0.0
    haber: float = 0.0
    concepto: str = ""


class PolizaDiarioInput(BaseModel):
    empresa_id: int
    fecha: date
    concepto: str
    movimientos: List[MovimientoInput]


def _validar_empresa(db: Session, empresa_id: int, user: Usuario) -> Empresa:
    empresa = db.query(Empresa).filter(
        Empresa.id == empresa_id,
        Empresa.usuario_id == user.id,
    ).first()
    if not empresa:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta empresa")
    return empresa


@router.post("/diario", status_code=201)
def crear_poliza_diario(
    datos: PolizaDiarioInput,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _validar_empresa(db, datos.empresa_id, current_user)
    try:
        poliza = generar_poliza_diario(
            empresa_id=datos.empresa_id,
            fecha=datos.fecha,
            concepto=datos.concepto,
            movimientos=[m.model_dump() for m in datos.movimientos],
            db=db,
        )
        db.commit()
        db.refresh(poliza)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e

    empresa = db.query(Empresa).filter(Empresa.id == datos.empresa_id).first()
    return serializar_poliza(poliza, None, empresa.rfc if empresa else "")


@router.get("/organizadas", status_code=200)
def listar_polizas_organizadas(
    empresa_id: int,
    mes: int | None = None,
    anio: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    empresa = _validar_empresa(db, empresa_id, current_user)
    rfc = empresa.rfc or ""

    q_polizas = db.query(Poliza).filter(Poliza.empresa_id == empresa_id)
    if mes is not None and anio is not None:
        q_polizas = q_polizas.filter(Poliza.mes == mes, Poliza.anio == anio)
    polizas = q_polizas.order_by(Poliza.anio.desc(), Poliza.mes.desc(), Poliza.numero.asc()).all()

    diario, ingresos, egresos = [], [], []
    for p in polizas:
        factura = db.query(Factura).filter(Factura.id == p.factura_id).first() if p.factura_id else None
        item = serializar_poliza(p, factura, rfc, db)
        if p.tipo == TipoPoliza.diario:
            diario.append(item)
        elif p.tipo == TipoPoliza.ingreso:
            ingresos.append(item)
        elif p.tipo == TipoPoliza.egreso:
            egresos.append(item)

    facturas_pendientes = obtener_facturas_pendientes_poliza(
        db, empresa_id, rfc, mes, anio
    )
    pendientes = [preview_poliza_desde_factura(f, rfc, db) for f in facturas_pendientes]

    return {
        "diario": diario,
        "ingresos": ingresos,
        "egresos": egresos,
        "pendientes": pendientes,
        "filtro": {"mes": mes, "anio": anio},
        "pendientes_count": len(pendientes),
    }


@router.post("/generar-automatico", status_code=201)
def generar_polizas_automatico(
    empresa_id: int,
    mes: int | None = None,
    anio: int | None = None,
    banco_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    _validar_empresa(db, empresa_id, current_user)
    if banco_id is None:
        banco_id = obtener_banco_default_id(db, empresa_id)

    try:
        resultado = generar_polizas_automaticas(
            db, empresa_id, banco_id=banco_id, mes=mes, anio=anio
        )
        if resultado["total_polizas"] == 0 and not resultado["errores"]:
            raise HTTPException(
                status_code=409,
                detail="No hay facturas pendientes de póliza para el periodo indicado",
            )
        db.commit()
        return {
            "mensaje": f"{resultado['total_polizas']} póliza(s) generada(s) en {resultado['facturas_procesadas']} factura(s)",
            **resultado,
        }
    except HTTPException:
        raise
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/", status_code=200)
def listar_polizas(
    empresa_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    empresa = _validar_empresa(db, empresa_id, current_user)
    polizas = (
        db.query(Poliza)
        .filter(Poliza.empresa_id == empresa_id)
        .order_by(Poliza.fecha.desc())
        .all()
    )
    return [
        serializar_poliza(
            p,
            db.query(Factura).filter(Factura.id == p.factura_id).first() if p.factura_id else None,
            empresa.rfc,
            db,
        )
        for p in polizas
    ]


@router.get("/{poliza_id}", status_code=200)
def ver_poliza(
    poliza_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    poliza = db.query(Poliza).filter(Poliza.id == poliza_id).first()
    if not poliza:
        raise HTTPException(status_code=404, detail="Póliza no encontrada")

    empresa = db.query(Empresa).filter(
        Empresa.id == poliza.empresa_id,
        Empresa.usuario_id == current_user.id,
    ).first()
    if not empresa:
        raise HTTPException(status_code=403, detail="Sin acceso")

    factura = None
    if poliza.factura_id:
        factura = db.query(Factura).filter(Factura.id == poliza.factura_id).first()

    return serializar_poliza(poliza, factura, empresa.rfc, db)


@router.post("/generar-desde-factura/{factura_id}", status_code=201)
def generar_poliza_factura(
    factura_id: int,
    banco_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    factura = (
        db.query(Factura)
        .filter(
            Factura.id == factura_id,
            Factura.empresa.has(usuario_id=current_user.id),
        )
        .first()
    )
    if not factura:
        raise HTTPException(status_code=404, detail="Factura no encontrada")

    try:
        creadas = generar_poliza_desde_factura(factura, db, banco_id)
        if not creadas:
            raise HTTPException(status_code=409, detail="La factura ya tiene todas sus pólizas")
        db.commit()
        empresa = db.query(Empresa).filter(Empresa.id == factura.empresa_id).first()
        rfc = empresa.rfc if empresa else ""
        return {
            "mensaje": f"{len(creadas)} póliza(s) generada(s)",
            "polizas": [serializar_poliza(p, factura, rfc, db) for p in creadas],
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e)) from e
