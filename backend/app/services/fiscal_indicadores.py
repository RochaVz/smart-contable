"""Indicadores de seguimiento del módulo fiscal (salud / calidad / avance)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models.fiscal import AccionHistorialFiscal, HistorialFiscal, TipoEntidadHistorialFiscal
from app.services.diot import construir_diot
from app.services.fiscal_diferencias import comparar_fuentes_fiscales
from app.services.historial_declaraciones import registrar_evento_historial

# Checklist de requisitos del plan fiscal 2026 (Etapas 0–6).
REQUISITOS_FISCALES: list[dict[str, Any]] = [
    {"id": "etapa0_base", "nombre": "Base multiempresa y periodos fiscales", "cumplido": True},
    {"id": "etapa1_regimen", "nombre": "Régimen fiscal y parámetros por empresa", "cumplido": True},
    {"id": "etapa2_historial", "nombre": "Historial versionado de declaraciones", "cumplido": True},
    {"id": "etapa3_complementos", "nombre": "Complementos CFDI (pago/nómina/etc.)", "cumplido": True},
    {"id": "etapa4_calculos", "nombre": "Cálculos ISR/IVA/anual/IEPS y tarifas", "cumplido": True},
    {"id": "etapa5_diot", "nombre": "DIOT y exportaciones SAT/CSV/XLSX/PDF", "cumplido": True},
    {"id": "etapa6_ui", "nombre": "Interfaz fiscal consolidada (tabs + filtros)", "cumplido": True},
]

# Inventario UX de tablas del centro fiscal (filtro / orden / paginación).
TABLAS_UX_FISCAL: list[dict[str, Any]] = [
    {
        "id": "diot_proveedores",
        "nombre": "DIOT proveedores",
        "filtro": True,
        "ordenamiento": False,
        "paginacion": False,
    },
    {
        "id": "diferencias_matriz",
        "nombre": "Matriz CFDI vs pólizas vs fiscal",
        "filtro": False,
        "ordenamiento": False,
        "paginacion": False,
    },
    {
        "id": "historial_eventos",
        "nombre": "Bitácora / historial fiscal",
        "filtro": True,
        "ordenamiento": True,
        "paginacion": True,
    },
    {
        "id": "declaraciones",
        "nombre": "Declaraciones del periodo",
        "filtro": True,
        "ordenamiento": False,
        "paginacion": False,
    },
    {
        "id": "pagos_provisionales",
        "nombre": "Pagos provisionales (anual)",
        "filtro": False,
        "ordenamiento": False,
        "paginacion": False,
    },
    {
        "id": "complementos_cfdi",
        "nombre": "Complementos CFDI",
        "filtro": True,
        "ordenamiento": False,
        "paginacion": False,
    },
]

# Cobertura de pruebas: snapshot de ingeniería (actualizar al sumar suites).
COBERTURA_PRUEBAS: dict[str, Any] = {
    "backend_archivos_test": 22,
    "backend_suites_fiscales": [
        "test_calculos_fiscales.py",
        "test_diot.py",
        "test_fiscal_diferencias.py",
        "test_fiscal_indicadores.py",
        "test_historial_declaraciones.py",
        "test_cfdi_complementos.py",
        "test_validaciones_fiscales.py",
    ],
    "backend_suites_fiscales_count": 7,
    "frontend_archivos_test": 1,
    "frontend_suites_fiscales": 0,
    "nota": (
        "La cobertura frontend fiscal aún no tiene suite automatizada; "
        "el build de Vite valida empaquetado, no reglas de negocio."
    ),
}

MODULOS_REVISION: list[dict[str, str]] = [
    {"id": "isr", "nombre": "ISR provisional"},
    {"id": "iva", "nombre": "IVA provisional"},
    {"id": "diot", "nombre": "DIOT"},
    {"id": "anual", "nombre": "Cálculo anual"},
    {"id": "diferencias", "nombre": "Conciliación de fuentes"},
    {"id": "exportaciones", "nombre": "Exportaciones SAT"},
]

MOTIVO_REVISION = "revision_contable_aprobada"
MOTIVO_EXPORT = "exportacion_fiscal"


def _pct(parte: float, total: float) -> float:
    if total <= 0:
        return 0.0
    return round(100.0 * float(parte) / float(total), 1)


def _requisitos() -> dict[str, Any]:
    total = len(REQUISITOS_FISCALES)
    hechos = sum(1 for r in REQUISITOS_FISCALES if r.get("cumplido"))
    return {
        "total": total,
        "cumplidos": hechos,
        "porcentaje": _pct(hechos, total),
        "detalle": REQUISITOS_FISCALES,
    }


def _cobertura() -> dict[str, Any]:
    data = dict(COBERTURA_PRUEBAS)
    fiscal = int(data.get("backend_suites_fiscales_count") or 0)
    total_backend = int(data.get("backend_archivos_test") or 0)
    data["porcentaje_suites_fiscales_sobre_backend"] = _pct(fiscal, total_backend)
    # Heurística simple: backend fiscal tiene suites; frontend fiscal = 0 → score mixto
    score_backend = 100.0 if fiscal >= 5 else _pct(fiscal, 5)
    score_frontend = 0.0 if not data.get("frontend_suites_fiscales") else 100.0
    data["score_combinado"] = round((score_backend * 0.8) + (score_frontend * 0.2), 1)
    return data


def _tablas_ux() -> dict[str, Any]:
    total = len(TABLAS_UX_FISCAL)
    con_filtro = sum(1 for t in TABLAS_UX_FISCAL if t.get("filtro"))
    con_orden = sum(1 for t in TABLAS_UX_FISCAL if t.get("ordenamiento"))
    con_pag = sum(1 for t in TABLAS_UX_FISCAL if t.get("paginacion"))
    completas = sum(
        1
        for t in TABLAS_UX_FISCAL
        if t.get("filtro") and t.get("ordenamiento") and t.get("paginacion")
    )
    return {
        "total": total,
        "con_filtro": con_filtro,
        "con_ordenamiento": con_orden,
        "con_paginacion": con_pag,
        "completas_filtro_orden_paginacion": completas,
        "porcentaje_con_filtro": _pct(con_filtro, total),
        "porcentaje_completas": _pct(completas, total),
        "detalle": TABLAS_UX_FISCAL,
    }


def _eventos_exportacion(db: Session, empresa_id: int, limit: int = 200) -> list[HistorialFiscal]:
    return (
        db.query(HistorialFiscal)
        .filter(
            HistorialFiscal.empresa_id == empresa_id,
            HistorialFiscal.motivo == MOTIVO_EXPORT,
        )
        .order_by(HistorialFiscal.creado_en.desc())
        .limit(limit)
        .all()
    )


def _eventos_revision(db: Session, empresa_id: int, limit: int = 200) -> list[HistorialFiscal]:
    return (
        db.query(HistorialFiscal)
        .filter(
            HistorialFiscal.empresa_id == empresa_id,
            HistorialFiscal.motivo == MOTIVO_REVISION,
        )
        .order_by(HistorialFiscal.creado_en.desc())
        .limit(limit)
        .all()
    )


def _parse_detalle(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        import json

        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _exportaciones(db: Session, empresa_id: int, mes: int, anio: int) -> dict[str, Any]:
    eventos = _eventos_exportacion(db, empresa_id)
    por_formato: dict[str, int] = {}
    del_periodo = 0
    forzadas = 0
    recientes = []
    for ev in eventos:
        det = _parse_detalle(ev.detalle_despues)
        fmt = str(det.get("formato") or "desconocido").lower()
        por_formato[fmt] = por_formato.get(fmt, 0) + 1
        if int(det.get("mes") or 0) == mes and int(det.get("anio") or 0) == anio:
            del_periodo += 1
            if det.get("forzado"):
                forzadas += 1
        recientes.append(
            {
                "id": ev.id,
                "resumen": ev.resumen,
                "formato": fmt,
                "creado_en": ev.creado_en.isoformat() if ev.creado_en else None,
                "forzado": bool(det.get("forzado")),
                "mes": det.get("mes"),
                "anio": det.get("anio"),
            }
        )
    # Los fallos HTTP de exportación no se persisten aún; se reporta como limitación.
    return {
        "total_exitosas_registradas": len(eventos),
        "exitosas_periodo": del_periodo,
        "forzadas_periodo": forzadas,
        "por_formato": por_formato,
        "errores_registrados": 0,
        "nota_errores": (
            "Hoy solo se bitacorean exportaciones exitosas. "
            "Los 409/422 del cliente no generan fila de error todavía."
        ),
        "recientes": recientes[:15],
    }


def _revisiones(db: Session, empresa_id: int, mes: int, anio: int) -> dict[str, Any]:
    eventos = _eventos_revision(db, empresa_id)
    # Última aprobación vigente por módulo (cualquier periodo o del periodo si viene en detalle)
    ultima_por_modulo: dict[str, dict] = {}
    for ev in eventos:
        det = _parse_detalle(ev.detalle_despues)
        modulo = str(det.get("modulo") or "").strip().lower()
        if not modulo:
            continue
        # Preferir match de periodo; si no hay periodo en detalle, aplica global
        det_mes = det.get("mes")
        det_anio = det.get("anio")
        if det_mes is not None and det_anio is not None:
            if int(det_mes) != mes or int(det_anio) != anio:
                continue
        if modulo in ultima_por_modulo:
            continue
        ultima_por_modulo[modulo] = {
            "modulo": modulo,
            "aprobado": True,
            "resumen": ev.resumen,
            "usuario_id": ev.usuario_id,
            "creado_en": ev.creado_en.isoformat() if ev.creado_en else None,
            "notas": det.get("notas"),
            "mes": det.get("mes"),
            "anio": det.get("anio"),
        }

    detalle = []
    aprobados = 0
    for m in MODULOS_REVISION:
        mid = m["id"]
        info = ultima_por_modulo.get(mid)
        row = {
            "id": mid,
            "nombre": m["nombre"],
            "aprobado": bool(info),
            "ultima_aprobacion": info,
        }
        if info:
            aprobados += 1
        detalle.append(row)

    return {
        "total_modulos": len(MODULOS_REVISION),
        "aprobados": aprobados,
        "porcentaje": _pct(aprobados, len(MODULOS_REVISION)),
        "detalle": detalle,
    }


def _diot_metricas(diot: dict) -> dict[str, Any]:
    tot = diot.get("totales") or {}
    proveedores = int(tot.get("proveedores") or 0)
    completos = int(tot.get("proveedores_completos") or 0)
    incompletos = int(tot.get("proveedores_incompletos") or 0)
    return {
        "proveedores": proveedores,
        "completos": completos,
        "incompletos": incompletos,
        "porcentaje_completos": _pct(completos, proveedores) if proveedores else 100.0,
        "exportable": bool(diot.get("exportable")),
        "bloqueado_por_incompletos": bool(diot.get("bloqueado_por_incompletos")),
    }


def _diferencias_metricas(diff: dict) -> dict[str, Any]:
    alertas = diff.get("alertas") or []
    diferencias = diff.get("diferencias") or {}
    total_comp = len(diferencias)
    ok = sum(1 for v in diferencias.values() if isinstance(v, dict) and v.get("coincide"))
    return {
        "estado_general": diff.get("estado_general"),
        "comparaciones": total_comp,
        "coinciden": ok,
        "desvios": len(alertas),
        "porcentaje_coinciden": _pct(ok, total_comp) if total_comp else 100.0,
        "pendientes": diff.get("pendientes") or [],
        "alertas": alertas[:20],
    }


def _score_salud(parts: dict[str, float]) -> dict[str, Any]:
    """Score 0–100 ponderado para lectura rápida del periodo."""
    weights = {
        "requisitos": 0.15,
        "pruebas": 0.10,
        "ux_tablas": 0.10,
        "diferencias": 0.25,
        "diot": 0.25,
        "revision": 0.15,
    }
    total_w = sum(weights.values())
    score = 0.0
    for k, w in weights.items():
        score += float(parts.get(k, 0.0)) * w
    score = round(score / total_w, 1) if total_w else 0.0
    if score >= 85:
        nivel = "saludable"
    elif score >= 65:
        nivel = "aceptable"
    elif score >= 40:
        nivel = "en_riesgo"
    else:
        nivel = "critico"
    return {"score": score, "nivel": nivel, "pesos": weights}


def construir_indicadores_fiscales(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
) -> dict[str, Any]:
    diff = comparar_fuentes_fiscales(db, empresa_id, mes, anio)
    diot = construir_diot(db, empresa_id, mes, anio)

    requisitos = _requisitos()
    cobertura = _cobertura()
    tablas = _tablas_ux()
    dif_m = _diferencias_metricas(diff)
    diot_m = _diot_metricas(diot)
    exports = _exportaciones(db, empresa_id, mes, anio)
    revisiones = _revisiones(db, empresa_id, mes, anio)

    salud = _score_salud(
        {
            "requisitos": float(requisitos["porcentaje"]),
            "pruebas": float(cobertura["score_combinado"]),
            "ux_tablas": float(tablas["porcentaje_con_filtro"]),
            "diferencias": float(dif_m["porcentaje_coinciden"]),
            "diot": float(diot_m["porcentaje_completos"]),
            "revision": float(revisiones["porcentaje"]),
        }
    )

    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "generado_en": datetime.now(timezone.utc).isoformat(),
        "salud": salud,
        "requisitos_fiscales": requisitos,
        "cobertura_pruebas": cobertura,
        "tablas_ux": tablas,
        "diferencias": dif_m,
        "diot": diot_m,
        "exportaciones": exports,
        "revision_contable": revisiones,
        "criterio": (
            "Indicadores de seguimiento del roadmap fiscal: avance de requisitos, "
            "calidad de pruebas/UX, desvíos CFDI-pólizas-cálculo, completitud DIOT, "
            "exportaciones bitacoreadas y módulos firmados por revisión contable."
        ),
    }


def registrar_revision_contable(
    db: Session,
    *,
    empresa_id: int,
    usuario_id: int | None,
    modulo: str,
    mes: int,
    anio: int,
    notas: str | None = None,
    commit: bool = True,
) -> dict[str, Any]:
    modulo_norm = (modulo or "").strip().lower()
    validos = {m["id"] for m in MODULOS_REVISION}
    if modulo_norm not in validos:
        raise ValueError(f"modulo inválido; use uno de: {sorted(validos)}")

    nombre = next(m["nombre"] for m in MODULOS_REVISION if m["id"] == modulo_norm)
    evento = registrar_evento_historial(
        db,
        empresa_id=empresa_id,
        entidad_tipo=TipoEntidadHistorialFiscal.periodo,
        entidad_id=anio * 100 + mes,
        accion=AccionHistorialFiscal.presentar,
        resumen=f"Revisión contable aprobada: {nombre} ({anio}-{mes:02d})",
        usuario_id=usuario_id,
        detalle_despues={
            "modulo": modulo_norm,
            "mes": mes,
            "anio": anio,
            "notas": notas,
            "tipo": "revision_contable",
        },
        motivo=MOTIVO_REVISION,
        commit=commit,
    )
    return {
        "id": evento.id,
        "modulo": modulo_norm,
        "mes": mes,
        "anio": anio,
        "resumen": evento.resumen,
        "creado_en": evento.creado_en.isoformat() if evento.creado_en else None,
    }
