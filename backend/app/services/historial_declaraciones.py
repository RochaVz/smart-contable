"""Historial versionado de declaraciones fiscales y bitácora de cambios."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.fiscal import (
    AccionHistorialFiscal,
    DeclaracionFiscal,
    EstadoDeclaracionFiscal,
    HistorialFiscal,
    PeriodoFiscal,
    TipoDeclaracionFiscal,
    TipoEntidadHistorialFiscal,
)

CAMPOS_MONETARIOS = (
    "base_gravable",
    "isr_causado",
    "iva_trasladado",
    "iva_acreditable",
    "iva_retenido",
    "monto_a_cargo",
    "monto_a_favor",
)


def _json_dump(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def _json_load(value: str | None) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value


def _decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    return Decimal(str(value))


def serializar_declaracion(declaracion: DeclaracionFiscal) -> dict[str, Any]:
    return {
        "id": declaracion.id,
        "empresa_id": declaracion.empresa_id,
        "periodo_id": declaracion.periodo_id,
        "usuario_id": declaracion.usuario_id,
        "tipo": declaracion.tipo.value if hasattr(declaracion.tipo, "value") else declaracion.tipo,
        "estado": declaracion.estado.value if hasattr(declaracion.estado, "value") else declaracion.estado,
        "version": declaracion.version,
        "es_vigente": bool(declaracion.es_vigente),
        "declaracion_origen_id": declaracion.declaracion_origen_id,
        "version_anterior_id": declaracion.version_anterior_id,
        "base_gravable": str(declaracion.base_gravable or 0),
        "isr_causado": str(declaracion.isr_causado or 0),
        "iva_trasladado": str(declaracion.iva_trasladado or 0),
        "iva_acreditable": str(declaracion.iva_acreditable or 0),
        "iva_retenido": str(declaracion.iva_retenido or 0),
        "monto_a_cargo": str(declaracion.monto_a_cargo or 0),
        "monto_a_favor": str(declaracion.monto_a_favor or 0),
        "snapshot_calculo": _json_load(declaracion.snapshot_calculo),
        "motivo_modificacion": declaracion.motivo_modificacion,
        "notas": declaracion.notas,
        "fecha_presentacion": (
            declaracion.fecha_presentacion.isoformat()
            if declaracion.fecha_presentacion
            else None
        ),
        "creado_en": declaracion.creado_en.isoformat() if declaracion.creado_en else None,
        "actualizado_en": (
            declaracion.actualizado_en.isoformat() if declaracion.actualizado_en else None
        ),
    }


def serializar_historial(evento: HistorialFiscal) -> dict[str, Any]:
    return {
        "id": evento.id,
        "empresa_id": evento.empresa_id,
        "usuario_id": evento.usuario_id,
        "entidad_tipo": (
            evento.entidad_tipo.value
            if hasattr(evento.entidad_tipo, "value")
            else evento.entidad_tipo
        ),
        "entidad_id": evento.entidad_id,
        "accion": evento.accion.value if hasattr(evento.accion, "value") else evento.accion,
        "resumen": evento.resumen,
        "detalle_antes": _json_load(evento.detalle_antes),
        "detalle_despues": _json_load(evento.detalle_despues),
        "motivo": evento.motivo,
        "creado_en": evento.creado_en.isoformat() if evento.creado_en else None,
    }


def registrar_evento_historial(
    db: Session,
    *,
    empresa_id: int,
    entidad_tipo: TipoEntidadHistorialFiscal,
    entidad_id: int,
    accion: AccionHistorialFiscal,
    resumen: str,
    usuario_id: int | None = None,
    detalle_antes: Any = None,
    detalle_despues: Any = None,
    motivo: str | None = None,
    commit: bool = False,
) -> HistorialFiscal:
    evento = HistorialFiscal(
        empresa_id=empresa_id,
        usuario_id=usuario_id,
        entidad_tipo=entidad_tipo,
        entidad_id=entidad_id,
        accion=accion,
        resumen=resumen[:255],
        detalle_antes=_json_dump(detalle_antes),
        detalle_despues=_json_dump(detalle_despues),
        motivo=(motivo[:500] if motivo else None),
    )
    db.add(evento)
    if commit:
        db.commit()
        db.refresh(evento)
    else:
        db.flush()
    return evento


def _obtener_periodo(db: Session, empresa_id: int, periodo_id: int) -> PeriodoFiscal:
    periodo = (
        db.query(PeriodoFiscal)
        .filter(PeriodoFiscal.id == periodo_id, PeriodoFiscal.empresa_id == empresa_id)
        .first()
    )
    if not periodo:
        raise HTTPException(status_code=404, detail="Periodo fiscal no encontrado")
    return periodo


def _declaracion_vigente(
    db: Session,
    empresa_id: int,
    periodo_id: int,
    tipo: TipoDeclaracionFiscal,
) -> DeclaracionFiscal | None:
    return (
        db.query(DeclaracionFiscal)
        .filter(
            DeclaracionFiscal.empresa_id == empresa_id,
            DeclaracionFiscal.periodo_id == periodo_id,
            DeclaracionFiscal.tipo == tipo,
            DeclaracionFiscal.es_vigente.is_(True),
        )
        .first()
    )


def crear_declaracion(
    db: Session,
    *,
    empresa_id: int,
    periodo_id: int,
    tipo: TipoDeclaracionFiscal,
    usuario_id: int | None = None,
    estado: EstadoDeclaracionFiscal = EstadoDeclaracionFiscal.borrador,
    snapshot_calculo: Any = None,
    notas: str | None = None,
    commit: bool = True,
    **montos: Any,
) -> DeclaracionFiscal:
    _obtener_periodo(db, empresa_id, periodo_id)

    if estado == EstadoDeclaracionFiscal.cancelada:
        raise HTTPException(status_code=422, detail="No se puede crear una declaración cancelada")
    if estado == EstadoDeclaracionFiscal.modificada:
        raise HTTPException(
            status_code=422,
            detail="Use modificar_declaracion para generar una versión modificada",
        )

    vigente = _declaracion_vigente(db, empresa_id, periodo_id, tipo)
    if vigente and vigente.estado != EstadoDeclaracionFiscal.cancelada:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Ya existe una declaración vigente de tipo {tipo.value} "
                f"(id={vigente.id}, v{vigente.version}). Use modificar."
            ),
        )

    payload = {campo: _decimal(montos.get(campo)) for campo in CAMPOS_MONETARIOS}
    declaracion = DeclaracionFiscal(
        empresa_id=empresa_id,
        periodo_id=periodo_id,
        usuario_id=usuario_id,
        tipo=tipo,
        estado=estado,
        version=1,
        es_vigente=True,
        declaracion_origen_id=None,
        version_anterior_id=None,
        snapshot_calculo=_json_dump(snapshot_calculo),
        notas=notas,
        fecha_presentacion=(
            datetime.now(timezone.utc) if estado == EstadoDeclaracionFiscal.presentada else None
        ),
        **payload,
    )
    db.add(declaracion)
    db.flush()
    declaracion.declaracion_origen_id = declaracion.id
    db.flush()

    registrar_evento_historial(
        db,
        empresa_id=empresa_id,
        usuario_id=usuario_id,
        entidad_tipo=TipoEntidadHistorialFiscal.declaracion,
        entidad_id=declaracion.id,
        accion=AccionHistorialFiscal.crear,
        resumen=f"Declaración {tipo.value} v1 creada ({estado.value})",
        detalle_despues=serializar_declaracion(declaracion),
    )

    if commit:
        db.commit()
        db.refresh(declaracion)
    return declaracion


def listar_declaraciones(
    db: Session,
    empresa_id: int,
    *,
    periodo_id: int | None = None,
    tipo: TipoDeclaracionFiscal | None = None,
    solo_vigentes: bool = False,
) -> list[DeclaracionFiscal]:
    query = db.query(DeclaracionFiscal).filter(DeclaracionFiscal.empresa_id == empresa_id)
    if periodo_id is not None:
        query = query.filter(DeclaracionFiscal.periodo_id == periodo_id)
    if tipo is not None:
        query = query.filter(DeclaracionFiscal.tipo == tipo)
    if solo_vigentes:
        query = query.filter(DeclaracionFiscal.es_vigente.is_(True))
    return query.order_by(
        DeclaracionFiscal.periodo_id.desc(),
        DeclaracionFiscal.tipo.asc(),
        DeclaracionFiscal.version.desc(),
    ).all()


def _obtener_declaracion_empresa(
    db: Session, declaracion_id: int, empresa_id: int
) -> DeclaracionFiscal:
    declaracion = (
        db.query(DeclaracionFiscal)
        .filter(
            DeclaracionFiscal.id == declaracion_id,
            DeclaracionFiscal.empresa_id == empresa_id,
        )
        .first()
    )
    if not declaracion:
        raise HTTPException(status_code=404, detail="Declaración fiscal no encontrada")
    return declaracion


def presentar_declaracion(
    db: Session,
    *,
    declaracion_id: int,
    empresa_id: int,
    usuario_id: int | None = None,
    commit: bool = True,
) -> DeclaracionFiscal:
    declaracion = _obtener_declaracion_empresa(db, declaracion_id, empresa_id)
    if not declaracion.es_vigente:
        raise HTTPException(status_code=409, detail="Solo se puede presentar la versión vigente")
    if declaracion.estado == EstadoDeclaracionFiscal.cancelada:
        raise HTTPException(status_code=409, detail="La declaración está cancelada")
    if declaracion.estado == EstadoDeclaracionFiscal.presentada:
        return declaracion

    antes = serializar_declaracion(declaracion)
    declaracion.estado = EstadoDeclaracionFiscal.presentada
    declaracion.fecha_presentacion = datetime.now(timezone.utc)
    declaracion.usuario_id = usuario_id or declaracion.usuario_id
    db.flush()

    registrar_evento_historial(
        db,
        empresa_id=empresa_id,
        usuario_id=usuario_id,
        entidad_tipo=TipoEntidadHistorialFiscal.declaracion,
        entidad_id=declaracion.id,
        accion=AccionHistorialFiscal.presentar,
        resumen=f"Declaración {declaracion.tipo.value} v{declaracion.version} presentada",
        detalle_antes=antes,
        detalle_despues=serializar_declaracion(declaracion),
    )

    if commit:
        db.commit()
        db.refresh(declaracion)
    return declaracion


def modificar_declaracion(
    db: Session,
    *,
    declaracion_id: int,
    empresa_id: int,
    motivo: str,
    usuario_id: int | None = None,
    commit: bool = True,
    **cambios: Any,
) -> DeclaracionFiscal:
    actual = _obtener_declaracion_empresa(db, declaracion_id, empresa_id)
    if not actual.es_vigente:
        raise HTTPException(status_code=409, detail="Solo se puede modificar la versión vigente")
    if actual.estado == EstadoDeclaracionFiscal.cancelada:
        raise HTTPException(status_code=409, detail="No se puede modificar una declaración cancelada")

    motivo_limpio = (motivo or "").strip()
    if len(motivo_limpio) < 3:
        raise HTTPException(status_code=422, detail="motivo debe tener al menos 3 caracteres")

    antes = serializar_declaracion(actual)
    actual.es_vigente = False
    if actual.estado != EstadoDeclaracionFiscal.modificada:
        # La versión anterior queda marcada como sustituida por modificación.
        if actual.estado == EstadoDeclaracionFiscal.presentada:
            actual.estado = EstadoDeclaracionFiscal.modificada
    db.flush()

    estado_nuevo = cambios.get("estado") or EstadoDeclaracionFiscal.calculada
    if isinstance(estado_nuevo, str):
        estado_nuevo = EstadoDeclaracionFiscal(estado_nuevo)
    if estado_nuevo in {EstadoDeclaracionFiscal.cancelada, EstadoDeclaracionFiscal.modificada}:
        raise HTTPException(
            status_code=422,
            detail="Estado inválido para la nueva versión; use cancelar o deje calculada/borrador/presentada",
        )

    payload = {
        campo: _decimal(cambios[campo]) if campo in cambios and cambios[campo] is not None else getattr(actual, campo)
        for campo in CAMPOS_MONETARIOS
    }
    snapshot = cambios.get("snapshot_calculo", _json_load(actual.snapshot_calculo))
    notas = cambios["notas"] if "notas" in cambios else actual.notas

    nueva = DeclaracionFiscal(
        empresa_id=actual.empresa_id,
        periodo_id=actual.periodo_id,
        usuario_id=usuario_id,
        tipo=actual.tipo,
        estado=estado_nuevo,
        version=int(actual.version) + 1,
        es_vigente=True,
        declaracion_origen_id=actual.declaracion_origen_id or actual.id,
        version_anterior_id=actual.id,
        snapshot_calculo=_json_dump(snapshot),
        motivo_modificacion=motivo_limpio,
        notas=notas,
        fecha_presentacion=(
            datetime.now(timezone.utc)
            if estado_nuevo == EstadoDeclaracionFiscal.presentada
            else None
        ),
        **payload,
    )
    db.add(nueva)
    db.flush()

    registrar_evento_historial(
        db,
        empresa_id=empresa_id,
        usuario_id=usuario_id,
        entidad_tipo=TipoEntidadHistorialFiscal.declaracion,
        entidad_id=nueva.id,
        accion=AccionHistorialFiscal.modificar,
        resumen=(
            f"Declaración {nueva.tipo.value} v{actual.version} → v{nueva.version} "
            f"({motivo_limpio[:80]})"
        ),
        detalle_antes=antes,
        detalle_despues=serializar_declaracion(nueva),
        motivo=motivo_limpio,
    )

    if commit:
        db.commit()
        db.refresh(nueva)
    return nueva


def cancelar_declaracion(
    db: Session,
    *,
    declaracion_id: int,
    empresa_id: int,
    motivo: str | None = None,
    usuario_id: int | None = None,
    commit: bool = True,
) -> DeclaracionFiscal:
    declaracion = _obtener_declaracion_empresa(db, declaracion_id, empresa_id)
    if not declaracion.es_vigente:
        raise HTTPException(status_code=409, detail="Solo se puede cancelar la versión vigente")
    if declaracion.estado == EstadoDeclaracionFiscal.cancelada:
        return declaracion

    antes = serializar_declaracion(declaracion)
    declaracion.estado = EstadoDeclaracionFiscal.cancelada
    declaracion.es_vigente = False
    if motivo:
        declaracion.motivo_modificacion = motivo.strip()[:500]
    db.flush()

    registrar_evento_historial(
        db,
        empresa_id=empresa_id,
        usuario_id=usuario_id,
        entidad_tipo=TipoEntidadHistorialFiscal.declaracion,
        entidad_id=declaracion.id,
        accion=AccionHistorialFiscal.cancelar,
        resumen=f"Declaración {declaracion.tipo.value} v{declaracion.version} cancelada",
        detalle_antes=antes,
        detalle_despues=serializar_declaracion(declaracion),
        motivo=motivo,
    )

    if commit:
        db.commit()
        db.refresh(declaracion)
    return declaracion


def listar_historial(
    db: Session,
    empresa_id: int,
    *,
    entidad_tipo: TipoEntidadHistorialFiscal | None = None,
    entidad_id: int | None = None,
    limit: int = 100,
) -> list[HistorialFiscal]:
    query = db.query(HistorialFiscal).filter(HistorialFiscal.empresa_id == empresa_id)
    if entidad_tipo is not None:
        query = query.filter(HistorialFiscal.entidad_tipo == entidad_tipo)
    if entidad_id is not None:
        query = query.filter(HistorialFiscal.entidad_id == entidad_id)
    safe_limit = max(1, min(int(limit or 100), 500))
    return query.order_by(HistorialFiscal.creado_en.desc()).limit(safe_limit).all()
