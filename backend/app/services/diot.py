"""Servicio DIOT: agregacion de operaciones con terceros y exportaciones SAT."""

from __future__ import annotations

import csv
import io
import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.models.empresa import Empresa
from app.models.factura import Factura, TipoFactura
from app.models.fiscal import (
    OperacionFiscal,
    PeriodoFiscal,
    TipoOperacionDiot,
    TipoOperacionFiscal,
)
from app.services.cfdi_helpers import es_venta

CENTAVOS = Decimal("0.01")

# Codigos tipicos del layout DIOT (Anexo 1 / carga masiva historica SAT).
TIPO_TERCERO = {
    "nacional": "04",
    "extranjero": "05",
    "global": "15",  # operaciones globales / publico en general
}
# Tipo de operacion generico de adquisicion de bienes/servicios.
TIPO_OPERACION_DEFAULT = "85"

RFC_EXTRANJERO = "XEXX010101000"
RFC_PUBLICO_GENERAL = "XAXX010101000"
RFC_PATTERN = re.compile(r"^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$")


def _moneda(valor) -> Decimal:
    return Decimal(str(valor or 0)).quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def _rfc_norm(rfc: str | None) -> str:
    return (rfc or "").strip().upper()


def clasificar_tipo_diot(rfc: str | None) -> TipoOperacionDiot | None:
    """Clasifica contraparte DIOT. None = no clasificable (dato incompleto)."""
    valor = _rfc_norm(rfc)
    if not valor:
        return None
    if valor == RFC_PUBLICO_GENERAL:
        return TipoOperacionDiot.global_
    if valor == RFC_EXTRANJERO or valor.startswith("XEXX"):
        return TipoOperacionDiot.extranjero
    if RFC_PATTERN.match(valor) and len(valor) in (12, 13):
        return TipoOperacionDiot.nacional
    # RFC no estandar mexicano: tratar como extranjero para revision
    if len(valor) >= 5:
        return TipoOperacionDiot.extranjero
    return None


def _tipo_diot_valor(tipo: TipoOperacionDiot | str | None) -> str | None:
    if tipo is None:
        return None
    if isinstance(tipo, TipoOperacionDiot):
        return tipo.value
    raw = str(tipo)
    if raw.endswith("global_"):
        return "global"
    return raw


def _rfc_empresa(db: Session, empresa_id: int) -> str:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return _rfc_norm(empresa.rfc if empresa else None)


def _facturas_egreso_periodo(
    db: Session, empresa_id: int, mes: int, anio: int
) -> list[Factura]:
    return (
        db.query(Factura)
        .filter(
            Factura.empresa_id == empresa_id,
            extract("year", Factura.fecha_emision) == anio,
            extract("month", Factura.fecha_emision) == mes,
            Factura.tipo_comprobante == TipoFactura.egreso,
        )
        .all()
    )


def _operaciones_diot_periodo(
    db: Session, empresa_id: int, mes: int, anio: int
) -> list[OperacionFiscal]:
    periodos = (
        db.query(PeriodoFiscal)
        .filter(
            PeriodoFiscal.empresa_id == empresa_id,
            PeriodoFiscal.anio == anio,
            PeriodoFiscal.mes == mes,
        )
        .all()
    )
    if not periodos:
        # periodo anual del mismo ejercicio no aplica a DIOT mensual
        return []
    ids = [p.id for p in periodos]
    return (
        db.query(OperacionFiscal)
        .filter(
            OperacionFiscal.empresa_id == empresa_id,
            OperacionFiscal.periodo_id.in_(ids),
            OperacionFiscal.tipo_operacion.in_(
                [TipoOperacionFiscal.egreso, TipoOperacionFiscal.pago]
            ),
        )
        .all()
    )


def _fila_base(rfc: str, nombre: str | None, tipo: str | None) -> dict[str, Any]:
    return {
        "rfc": rfc or None,
        "nombre": (nombre or "").strip() or None,
        "tipo_operacion_diot": tipo,
        "base_gravable": Decimal("0"),
        "iva_acreditable": Decimal("0"),
        "iva_retenido": Decimal("0"),
        "iva_trasladado": Decimal("0"),
        "total": Decimal("0"),
        "operaciones": 0,
        "origenes": set(),
        "datos_incompletos": [],
    }


def _acumular(fila: dict, **montos) -> None:
    for key, val in montos.items():
        fila[key] += _moneda(val)
    fila["operaciones"] += 1


def construir_diot(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
    *,
    incluir_cfdi: bool = True,
) -> dict[str, Any]:
    """
    Construye DIOT del periodo agrupando por RFC + tipo de operacion DIOT.

    Fuentes:
    1. Operaciones fiscales de egreso/pago del periodo.
    2. CFDIs tipo E recibidos (no ventas) del mismo mes/anio, si incluir_cfdi.
    """
    rfc_emp = _rfc_empresa(db, empresa_id)
    grupos: dict[tuple[str, str | None], dict] = {}

    def key_of(rfc: str | None, tipo: str | None) -> tuple[str, str | None]:
        return (_rfc_norm(rfc) or "__SIN_RFC__", tipo)

    ops = _operaciones_diot_periodo(db, empresa_id, mes, anio)
    for op in ops:
        rfc = _rfc_norm(op.rfc_contraparte)
        tipo = _tipo_diot_valor(op.tipo_operacion_diot) or (
            _tipo_diot_valor(clasificar_tipo_diot(rfc)) if rfc else None
        )
        k = key_of(rfc, tipo)
        if k not in grupos:
            grupos[k] = _fila_base(rfc, op.nombre_contraparte, tipo)
        fila = grupos[k]
        if not fila["nombre"] and op.nombre_contraparte:
            fila["nombre"] = op.nombre_contraparte.strip()
        if not fila["tipo_operacion_diot"] and tipo:
            fila["tipo_operacion_diot"] = tipo
        _acumular(
            fila,
            base_gravable=op.base_gravable or 0,
            iva_acreditable=op.iva_acreditable or op.iva_trasladado or 0,
            iva_retenido=op.iva_retenido or 0,
            iva_trasladado=op.iva_trasladado or 0,
            total=op.total or 0,
        )
        fila["origenes"].add("operacion_fiscal")

    cfdi_count = 0
    if incluir_cfdi:
        for fac in _facturas_egreso_periodo(db, empresa_id, mes, anio):
            if es_venta(fac, rfc_emp):
                continue
            # Egreso recibido: proveedor = emisor
            rfc = _rfc_norm(fac.rfc_emisor)
            tipo = _tipo_diot_valor(clasificar_tipo_diot(rfc))
            k = key_of(rfc, tipo)
            # Evitar doble conteo si ya hay operacion fiscal ligada a la factura
            if any(
                getattr(o, "factura_id", None) == fac.id for o in ops
            ):
                continue
            if k not in grupos:
                grupos[k] = _fila_base(rfc, fac.nombre_emisor, tipo)
            fila = grupos[k]
            if not fila["nombre"] and fac.nombre_emisor:
                fila["nombre"] = fac.nombre_emisor.strip()
            base = _moneda(fac.subtotal)
            iva = _moneda(fac.iva_trasladado)
            ret = _moneda(fac.iva_retenido)
            _acumular(
                fila,
                base_gravable=base,
                iva_acreditable=iva,
                iva_retenido=ret,
                iva_trasladado=iva,
                total=fac.total or 0,
            )
            fila["origenes"].add("cfdi")
            cfdi_count += 1

    filas = []
    incompletos = []
    for fila in grupos.values():
        faltantes = []
        if not fila["rfc"] or fila["rfc"] == "__SIN_RFC__":
            faltantes.append("rfc")
            fila["rfc"] = None
        if not fila["tipo_operacion_diot"]:
            faltantes.append("tipo_operacion_diot")
        if fila["tipo_operacion_diot"] == "extranjero" and not fila["nombre"]:
            faltantes.append("nombre_extranjero")
        if fila["base_gravable"] <= 0 and fila["total"] <= 0:
            faltantes.append("montos")
        fila["datos_incompletos"] = faltantes
        fila["origenes"] = sorted(fila["origenes"])
        serial = {
            **fila,
            "base_gravable": float(fila["base_gravable"]),
            "iva_acreditable": float(fila["iva_acreditable"]),
            "iva_retenido": float(fila["iva_retenido"]),
            "iva_trasladado": float(fila["iva_trasladado"]),
            "total": float(fila["total"]),
            "listo_para_exportar": len(faltantes) == 0,
        }
        filas.append(serial)
        if faltantes:
            incompletos.append(
                {
                    "rfc": serial["rfc"],
                    "nombre": serial["nombre"],
                    "faltantes": faltantes,
                }
            )

    filas.sort(key=lambda x: (x.get("rfc") or "", x.get("tipo_operacion_diot") or ""))

    totales = {
        "proveedores": len(filas),
        "proveedores_completos": sum(1 for f in filas if f["listo_para_exportar"]),
        "proveedores_incompletos": len(incompletos),
        "base_gravable": float(sum((_moneda(f["base_gravable"]) for f in filas), Decimal("0"))),
        "iva_acreditable": float(sum((_moneda(f["iva_acreditable"]) for f in filas), Decimal("0"))),
        "iva_retenido": float(sum((_moneda(f["iva_retenido"]) for f in filas), Decimal("0"))),
        "total": float(sum((_moneda(f["total"]) for f in filas), Decimal("0"))),
        "operaciones_fiscales": len(ops),
        "cfdi_egreso_incluidos": cfdi_count,
    }

    exportable = len(incompletos) == 0 and len(filas) > 0
    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "rfc_empresa": rfc_emp or None,
        "proveedores": filas,
        "datos_incompletos": incompletos,
        "totales": totales,
        "exportable": exportable,
        "bloqueado_por_incompletos": len(incompletos) > 0,
        "criterio": (
            "DIOT informativa: egresos/pagos del periodo agrupados por RFC. "
            "Tipo nacional/extranjero/global inferido por RFC si no esta clasificado. "
            "Layout SAT de referencia para carga; requiere revision contable."
        ),
    }


def _lineas_layout_sat(diot: dict) -> list[str]:
    """
    Layout texto SAT (pipe) simplificado vigente en practicas de despacho.

    Columnas:
    tipo_tercero|tipo_operacion|rfc|num_id_fiscal|nombre_extranjero|pais|nacionalidad|
    valor_actos_16|valor_actos_0|valor_actos_exento|iva_16|iva_retenido
    """
    lineas = []
    for p in diot.get("proveedores") or []:
        tipo = p.get("tipo_operacion_diot") or "nacional"
        tipo_tercero = TIPO_TERCERO.get(tipo, "04")
        rfc = p.get("rfc") or ""
        nombre_ext = ""
        pais = ""
        nacionalidad = ""
        id_fiscal = ""
        if tipo == "extranjero":
            nombre_ext = (p.get("nombre") or "")[:255]
            pais = "99"  # otro / por definir
            nacionalidad = "Extranjera"
            id_fiscal = rfc if rfc and rfc != RFC_EXTRANJERO else ""
            rfc_campo = RFC_EXTRANJERO
        elif tipo == "global":
            rfc_campo = RFC_PUBLICO_GENERAL
        else:
            rfc_campo = rfc

        base = f"{_moneda(p.get('base_gravable')):.2f}"
        iva = f"{_moneda(p.get('iva_acreditable')):.2f}"
        ret = f"{_moneda(p.get('iva_retenido')):.2f}"
        # valor_actos_0 y exento en 0 salvo que se refine por tasa
        linea = "|".join(
            [
                tipo_tercero,
                TIPO_OPERACION_DEFAULT,
                rfc_campo,
                id_fiscal,
                nombre_ext,
                pais,
                nacionalidad,
                base,  # 16%
                "0.00",  # 0%
                "0.00",  # exento
                iva,
                ret,
            ]
        )
        lineas.append(linea)
    return lineas


def generar_layout_sat(diot: dict) -> str:
    return "\n".join(_lineas_layout_sat(diot)) + ("\n" if diot.get("proveedores") else "")


def generar_csv_diot(diot: dict) -> bytes:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "rfc",
            "nombre",
            "tipo_operacion_diot",
            "base_gravable",
            "iva_acreditable",
            "iva_retenido",
            "total",
            "operaciones",
            "listo_para_exportar",
            "datos_incompletos",
            "origenes",
        ]
    )
    for p in diot.get("proveedores") or []:
        writer.writerow(
            [
                p.get("rfc") or "",
                p.get("nombre") or "",
                p.get("tipo_operacion_diot") or "",
                f"{_moneda(p.get('base_gravable')):.2f}",
                f"{_moneda(p.get('iva_acreditable')):.2f}",
                f"{_moneda(p.get('iva_retenido')):.2f}",
                f"{_moneda(p.get('total')):.2f}",
                p.get("operaciones") or 0,
                "si" if p.get("listo_para_exportar") else "no",
                ",".join(p.get("datos_incompletos") or []),
                ",".join(p.get("origenes") or []),
            ]
        )
    return buffer.getvalue().encode("utf-8-sig")


def generar_xlsx_diot(diot: dict) -> bytes:
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "DIOT"
    headers = [
        "RFC",
        "Nombre",
        "Tipo DIOT",
        "Base gravable",
        "IVA acreditable",
        "IVA retenido",
        "Total",
        "Operaciones",
        "Listo",
        "Faltantes",
    ]
    ws.append(headers)
    for p in diot.get("proveedores") or []:
        ws.append(
            [
                p.get("rfc") or "",
                p.get("nombre") or "",
                p.get("tipo_operacion_diot") or "",
                float(_moneda(p.get("base_gravable"))),
                float(_moneda(p.get("iva_acreditable"))),
                float(_moneda(p.get("iva_retenido"))),
                float(_moneda(p.get("total"))),
                p.get("operaciones") or 0,
                "si" if p.get("listo_para_exportar") else "no",
                ",".join(p.get("datos_incompletos") or []),
            ]
        )
    ws2 = wb.create_sheet("Resumen")
    tot = diot.get("totales") or {}
    periodo = diot.get("periodo") or {}
    ws2.append(["Empresa ID", diot.get("empresa_id")])
    ws2.append(["RFC empresa", diot.get("rfc_empresa") or ""])
    ws2.append(["Periodo", f"{periodo.get('mes')}/{periodo.get('anio')}"])
    for k, v in tot.items():
        ws2.append([k, v])
    ws2.append(["Exportable", "si" if diot.get("exportable") else "no"])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def generar_pdf_diot(diot: dict) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(letter), leftMargin=24, rightMargin=24)
    styles = getSampleStyleSheet()
    periodo = diot.get("periodo") or {}
    story = [
        Paragraph("DIOT — Declaración Informativa de Operaciones con Terceros", styles["Title"]),
        Paragraph(
            f"Empresa ID {diot.get('empresa_id')} · RFC {diot.get('rfc_empresa') or 'N/D'} · "
            f"Periodo {periodo.get('mes')}/{periodo.get('anio')}",
            styles["Normal"],
        ),
        Spacer(1, 12),
    ]
    data = [["RFC", "Nombre", "Tipo", "Base", "IVA acr.", "IVA ret.", "OK"]]
    for p in diot.get("proveedores") or []:
        data.append(
            [
                p.get("rfc") or "—",
                (p.get("nombre") or "—")[:40],
                p.get("tipo_operacion_diot") or "—",
                f"{_moneda(p.get('base_gravable')):,.2f}",
                f"{_moneda(p.get('iva_acreditable')):,.2f}",
                f"{_moneda(p.get('iva_retenido')):,.2f}",
                "Sí" if p.get("listo_para_exportar") else "No",
            ]
        )
    table = Table(data, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
            ]
        )
    )
    story.append(table)
    tot = diot.get("totales") or {}
    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            f"Proveedores: {tot.get('proveedores', 0)} · "
            f"Completos: {tot.get('proveedores_completos', 0)} · "
            f"Incompletos: {tot.get('proveedores_incompletos', 0)} · "
            f"Base: {_moneda(tot.get('base_gravable')):,.2f} · "
            f"IVA acreditable: {_moneda(tot.get('iva_acreditable')):,.2f}",
            styles["Normal"],
        )
    )
    if diot.get("bloqueado_por_incompletos"):
        story.append(
            Paragraph(
                "Advertencia: hay datos incompletos; el layout SAT no debe presentarse sin revision.",
                styles["Normal"],
            )
        )
    doc.build(story)
    return buffer.getvalue()


def exportar_diot(diot: dict, formato: str) -> tuple[bytes, str, str]:
    """Retorna (contenido, media_type, filename)."""
    periodo = diot.get("periodo") or {}
    mes = periodo.get("mes") or 0
    anio = periodo.get("anio") or 0
    base = f"diot_{anio}_{mes:02d}"
    fmt = (formato or "sat").lower()
    if fmt == "sat":
        return generar_layout_sat(diot).encode("utf-8"), "text/plain; charset=utf-8", f"{base}.txt"
    if fmt == "csv":
        return generar_csv_diot(diot), "text/csv; charset=utf-8", f"{base}.csv"
    if fmt in {"xlsx", "excel"}:
        return (
            generar_xlsx_diot(diot),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            f"{base}.xlsx",
        )
    if fmt == "pdf":
        return generar_pdf_diot(diot), "application/pdf", f"{base}.pdf"
    raise ValueError(f"Formato no soportado: {formato}")
