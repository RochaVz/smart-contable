"""Exportación ZIP con varios archivos CSV por empresa."""

import csv
import io
import json
import zipfile
from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.comision_banco import ComisionBanco
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.mapeo_cuenta import MapeoCuenta
from app.models.poliza import MovimientoPoliza, Poliza
from app.services.cfdi_helpers import es_venta, etiqueta_forma_pago

_MESES_ES = {
    1: "Enero", 2: "Febrero", 3: "Marzo", 4: "Abril",
    5: "Mayo", 6: "Junio", 7: "Julio", 8: "Agosto",
    9: "Septiembre", 10: "Octubre", 11: "Noviembre", 12: "Diciembre",
}


def obtener_secciones_exportacion(tipo: str | None) -> list[str]:
    """Devuelve las secciones que deben incluirse en la exportación solicitada."""
    tipo_normalizado = (tipo or "todo").strip().lower()

    if tipo_normalizado in {"resumen", "empresa", "facturas", "polizas", "movimientos", "mapeos", "comisiones"}:
        return [tipo_normalizado]

    if tipo_normalizado in {"todo", "completo", "full", "all"}:
        return ["resumen", "empresa", "facturas", "polizas", "movimientos", "mapeos", "comisiones"]

    if tipo_normalizado in {"facturas_polizas", "facturas-y-polizas", "facturasypolizas"}:
        return ["facturas", "polizas"]

    if tipo_normalizado in {"ingresos", "ingreso"}:
        return ["resumen", "empresa", "facturas"]

    if tipo_normalizado in {"egresos", "egreso"}:
        return ["resumen", "empresa", "facturas"]

    if tipo_normalizado in {"contable", "contabilidad"}:
        return ["resumen", "empresa", "polizas", "movimientos", "mapeos", "comisiones"]

    return ["resumen", "empresa", "facturas", "polizas", "movimientos", "mapeos", "comisiones"]


def _enum_val(value) -> str:
    if value is None:
        return ""
    return value.value if hasattr(value, "value") else str(value)


def _float_val(value) -> float:
    return float(value or 0)


def _csv_bytes(rows: list[dict]) -> bytes:
    if not rows:
        return "\ufeff".encode("utf-8")
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
    writer.writeheader()
    writer.writerows(rows)
    return f"\ufeff{buf.getvalue()}".encode("utf-8")


def _recolectar_datos_exportacion(
    db: Session,
    empresa: Empresa,
    mes: int | None = None,
    anio: int | None = None,
) -> dict:
    from sqlalchemy import extract

    empresa_id = empresa.id
    rfc_empresa = (empresa.rfc or "").strip().upper()
    generado = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ── Consultas ordenadas cronológicamente ──────────────────────────────────
    q_facturas = db.query(Factura).filter(Factura.empresa_id == empresa_id)
    if mes and anio:
        q_facturas = q_facturas.filter(
            extract("month", Factura.fecha_emision) == mes,
            extract("year", Factura.fecha_emision) == anio,
        )
    facturas = q_facturas.order_by(Factura.fecha_emision.asc()).all()

    q_polizas = db.query(Poliza).filter(Poliza.empresa_id == empresa_id)
    if mes and anio:
        q_polizas = q_polizas.filter(Poliza.mes == mes, Poliza.anio == anio)
    polizas = q_polizas.order_by(
        Poliza.anio.asc(), Poliza.mes.asc(), Poliza.tipo.asc(), Poliza.numero.asc()
    ).all()

    poliza_ids = [p.id for p in polizas]
    movimientos = []
    if poliza_ids:
        movimientos = (
            db.query(MovimientoPoliza)
            .filter(MovimientoPoliza.poliza_id.in_(poliza_ids))
            .order_by(MovimientoPoliza.poliza_id, MovimientoPoliza.id)
            .all()
        )

    mapeos = (
        db.query(MapeoCuenta)
        .filter(MapeoCuenta.empresa_id == empresa_id)
        .order_by(MapeoCuenta.rfc_emisor)
        .all()
    )
    comisiones = (
        db.query(ComisionBanco)
        .filter(ComisionBanco.empresa_id == empresa_id)
        .order_by(ComisionBanco.nombre_banco)
        .all()
    )

    # ── Filas empresa ─────────────────────────────────────────────────────────
    filas_empresa = [{
        "id": empresa.id,
        "rfc": empresa.rfc,
        "razon_social": empresa.razon_social,
        "tipo_persona": _enum_val(empresa.tipo_persona),
        "regimen_fiscal": _enum_val(empresa.regimen_fiscal),
        "codigo_postal": empresa.codigo_postal or "",
        "activo": "Si" if empresa.activo else "No",
        "exportado_en": generado,
    }]

    # ── Filas facturas (con columnas periodo/mes/anio) ────────────────────────
    filas_facturas = []
    total_ingresos = 0.0
    total_egresos = 0.0
    for f in facturas:
        venta = es_venta(f, rfc_empresa)
        total = _float_val(f.total)
        fecha_em = f.fecha_emision
        periodo_f = f"{fecha_em.year}-{fecha_em.month:02d}" if fecha_em else ""
        if venta:
            total_ingresos += total
        else:
            total_egresos += total
        filas_facturas.append({
            "periodo": periodo_f,
            "anio": fecha_em.year if fecha_em else "",
            "mes": fecha_em.month if fecha_em else "",
            "mes_nombre": _MESES_ES.get(fecha_em.month, "") if fecha_em else "",
            "id": f.id,
            "uuid": f.uuid,
            "tipo_movimiento": "Ingreso" if venta else "Egreso",
            "tipo_comprobante": _enum_val(f.tipo_comprobante),
            "fecha_emision": str(fecha_em or ""),
            "fecha_timbrado": str(f.fecha_timbrado or ""),
            "rfc_emisor": f.rfc_emisor,
            "nombre_emisor": f.nombre_emisor or "",
            "rfc_receptor": f.rfc_receptor,
            "nombre_receptor": f.nombre_receptor or "",
            "serie": f.serie or "",
            "folio": f.folio or "",
            "uso_cfdi": f.uso_cfdi or "",
            "metodo_pago": f.metodo_pago or "",
            "forma_pago": f.forma_pago or "",
            "forma_pago_label": etiqueta_forma_pago(f.forma_pago),
            "subtotal": _float_val(f.subtotal),
            "descuento": _float_val(f.descuento),
            "iva_trasladado": _float_val(f.iva_trasladado),
            "iva_retenido": _float_val(f.iva_retenido),
            "isr_retenido": _float_val(f.isr_retenido),
            "impuestos_locales": _float_val(f.impuestos_locales),
            "total": total,
            "moneda": f.moneda or "MXN",
            "estatus": _enum_val(f.estatus),
            "es_deducible": "Si" if f.es_deducible else "No",
            "tiene_xml": "Si" if f.xml_contenido else "No",
        })

    # ── Filas pólizas (con columna periodo) ──────────────────────────────────
    filas_polizas = []
    for p in polizas:
        periodo_p = f"{p.anio}-{p.mes:02d}" if p.mes and p.anio else ""
        filas_polizas.append({
            "periodo": periodo_p,
            "anio": p.anio or "",
            "mes": p.mes or "",
            "mes_nombre": _MESES_ES.get(p.mes, "") if p.mes else "",
            "id": p.id,
            "factura_id": p.factura_id or "",
            "tipo": _enum_val(p.tipo),
            "numero": p.numero,
            "fecha": str(p.fecha or ""),
            "concepto": p.concepto or "",
            "total": _float_val(p.total),
        })

    # ── Filas movimientos (con columna periodo heredada de póliza) ────────────
    poliza_periodo: dict[int, str] = {
        p.id: (f"{p.anio}-{p.mes:02d}" if p.mes and p.anio else "")
        for p in polizas
    }
    filas_movimientos = [{
        "periodo": poliza_periodo.get(m.poliza_id, ""),
        "id": m.id,
        "poliza_id": m.poliza_id,
        "cuenta": m.cuenta,
        "nombre_cuenta": m.nombre_cuenta or "",
        "debe": _float_val(m.debe),
        "haber": _float_val(m.haber),
        "concepto": m.concepto or "",
    } for m in movimientos]

    filas_mapeos = [{
        "id": m.id,
        "rfc_proveedor": m.rfc_emisor,
        "nombre_cuenta": m.nombre_cuenta or "",
        "codigo_cuenta": m.codigo_cuenta or "",
    } for m in mapeos]

    filas_comisiones = [{
        "id": c.id,
        "nombre_banco": c.nombre_banco,
        "porcentaje_credito": _float_val(c.porcentaje_credito),
        "porcentaje_debito": _float_val(c.porcentaje_debito),
        "porcentaje_servicios": _float_val(c.porcentaje_servicios),
        "comision_fija": _float_val(c.comision_fija),
        "es_default": "Si" if c.es_default else "No",
    } for c in comisiones]

    # ── Resumen por mes ───────────────────────────────────────────────────────
    resumen_por_mes: dict[str, dict] = {}
    for fila in filas_facturas:
        p = fila["periodo"] or "sin-periodo"
        if p not in resumen_por_mes:
            resumen_por_mes[p] = {
                "periodo": p,
                "mes_nombre": fila["mes_nombre"],
                "facturas": 0,
                "ingresos": 0.0,
                "egresos": 0.0,
            }
        resumen_por_mes[p]["facturas"] += 1
        if fila["tipo_movimiento"] == "Ingreso":
            resumen_por_mes[p]["ingresos"] = round(
                resumen_por_mes[p]["ingresos"] + fila["total"], 2
            )
        else:
            resumen_por_mes[p]["egresos"] = round(
                resumen_por_mes[p]["egresos"] + fila["total"], 2
            )
    for v in resumen_por_mes.values():
        v["resultado_neto"] = round(v["ingresos"] - v["egresos"], 2)

    filas_resumen = [
        {"concepto": "empresa", "valor": empresa.razon_social},
        {"concepto": "rfc", "valor": empresa.rfc},
        {"concepto": "exportado_en", "valor": generado},
        {"concepto": "total_facturas", "valor": len(facturas)},
        {"concepto": "ingresos_mxn", "valor": round(total_ingresos, 2)},
        {"concepto": "egresos_mxn", "valor": round(total_egresos, 2)},
        {"concepto": "resultado_neto_mxn", "valor": round(total_ingresos - total_egresos, 2)},
        {"concepto": "total_polizas", "valor": len(polizas)},
        {"concepto": "total_movimientos_poliza", "valor": len(movimientos)},
        {"concepto": "total_clasificaciones", "valor": len(mapeos)},
        {"concepto": "total_comisiones_banco", "valor": len(comisiones)},
    ]

    return {
        "generado": generado,
        "empresa": empresa,
        "filas_empresa": filas_empresa,
        "filas_facturas": filas_facturas,
        "filas_polizas": filas_polizas,
        "filas_movimientos": filas_movimientos,
        "filas_mapeos": filas_mapeos,
        "filas_comisiones": filas_comisiones,
        "filas_resumen": filas_resumen,
        "resumen_por_mes": resumen_por_mes,
    }


def _escribir_filas_planas(writer: csv.writer, filas: list[dict]) -> None:
    """Escribe filas como CSV plano: encabezados + datos, sin decoración."""
    if not filas:
        return
    headers = list(filas[0].keys())
    writer.writerow(headers)
    for fila in filas:
        writer.writerow([fila.get(h, "") for h in headers])


def _escribir_seccion_por_mes(
    writer: csv.writer,
    filas: list[dict],
    campo_total: str = "total",
    campo_tipo: str | None = "tipo_movimiento",
) -> None:
    """Agrupa filas por periodo y escribe secciones mensuales con subtotales."""
    if not filas:
        return

    headers = list(filas[0].keys())
    por_periodo: dict[str, list[dict]] = defaultdict(list)
    for fila in filas:
        por_periodo[fila.get("periodo") or "sin-periodo"].append(fila)

    for periodo in sorted(por_periodo.keys()):
        grupo = por_periodo[periodo]
        total_p = round(sum(f.get(campo_total, 0) for f in grupo), 2)
        mes_num = grupo[0].get("mes", "")
        anio_num = grupo[0].get("anio", "")
        mes_nombre = _MESES_ES.get(int(mes_num), "") if mes_num else ""
        titulo_periodo = f"{mes_nombre} {anio_num}".strip() if mes_nombre else periodo

        if campo_tipo:
            ingresos_p = round(
                sum(f.get(campo_total, 0) for f in grupo if f.get(campo_tipo) == "Ingreso"), 2
            )
            egresos_p = round(
                sum(f.get(campo_total, 0) for f in grupo if f.get(campo_tipo) == "Egreso"), 2
            )
            writer.writerow([
                f"--- Período: {periodo} ({titulo_periodo}) | "
                f"{len(grupo)} registros | "
                f"Ingresos: ${ingresos_p:,.2f} | "
                f"Egresos: ${egresos_p:,.2f} ---"
            ])
        else:
            writer.writerow([
                f"--- Período: {periodo} ({titulo_periodo}) | "
                f"{len(grupo)} registros | "
                f"Total: ${total_p:,.2f} ---"
            ])

        writer.writerow(headers)
        for fila in grupo:
            writer.writerow([fila.get(h, "") for h in headers])
        writer.writerow([])


def generar_csv_consolidado_exportacion(
    db: Session,
    empresa: Empresa,
    tipo: str | None = None,
    mes: int | None = None,
    anio: int | None = None,
) -> tuple[bytes, str]:
    """
    Genera un CSV con la información seleccionada.
    - Con mes+anio: CSV plano del período exacto, sin agrupaciones.
    - Sin filtro: CSV agrupado por mes con subtotales.
    """
    datos = _recolectar_datos_exportacion(db, empresa, mes=mes, anio=anio)
    empresa_obj = datos["empresa"]
    secciones = obtener_secciones_exportacion(tipo)
    filtro_mes = bool(mes and anio)

    buf = io.StringIO()
    writer = csv.writer(buf)

    # ── Resumen ───────────────────────────────────────────────────────────────
    if "resumen" in secciones:
        writer.writerow(["=== RESUMEN DE EMPRESA ==="])
        writer.writerow(["Campo", "Valor"])
        for fila in datos["filas_resumen"]:
            writer.writerow([fila["concepto"], fila["valor"]])
        writer.writerow([])

        # Solo mostrar tabla de resumen por mes cuando NO hay filtro de período
        if not filtro_mes:
            resumen_mes = datos["resumen_por_mes"]
            if resumen_mes:
                writer.writerow(["=== RESUMEN POR MES ==="])
                writer.writerow(["Período", "Mes", "Facturas", "Ingresos MXN", "Egresos MXN", "Resultado Neto MXN"])
                for periodo in sorted(resumen_mes.keys()):
                    r = resumen_mes[periodo]
                    writer.writerow([
                        periodo, r["mes_nombre"], r["facturas"],
                        r["ingresos"], r["egresos"], r["resultado_neto"],
                    ])
                writer.writerow([])

    # ── Empresa ───────────────────────────────────────────────────────────────
    if "empresa" in secciones:
        writer.writerow(["=== DATOS DE EMPRESA ==="])
        _escribir_filas_planas(writer, datos["filas_empresa"])
        writer.writerow([])

    # ── Facturas ─────────────────────────────────────────────────────────────
    if "facturas" in secciones:
        filas_f = datos["filas_facturas"]
        if filtro_mes:
            # CSV plano: solo los datos del mes, sin decoración
            writer.writerow([f"=== FACTURAS (CFDI) — {_MESES_ES.get(mes, '')} {anio} ==="])
            _escribir_filas_planas(writer, filas_f)
        else:
            writer.writerow(["=== FACTURAS (CFDI) — ORGANIZADAS POR MES ==="])
            if filas_f:
                _escribir_seccion_por_mes(writer, filas_f, campo_total="total", campo_tipo="tipo_movimiento")
                total_ing = round(sum(f["total"] for f in filas_f if f["tipo_movimiento"] == "Ingreso"), 2)
                total_egr = round(sum(f["total"] for f in filas_f if f["tipo_movimiento"] == "Egreso"), 2)
                writer.writerow([
                    "TOTALES GLOBALES", "", "",
                    f"Ingresos: ${total_ing:,.2f}",
                    f"Egresos: ${total_egr:,.2f}",
                    f"Neto: ${round(total_ing - total_egr, 2):,.2f}",
                ])
            else:
                writer.writerow(["Sin facturas registradas"])
        writer.writerow([])

    # ── Pólizas ───────────────────────────────────────────────────────────────
    if "polizas" in secciones:
        filas_p = datos["filas_polizas"]
        if filtro_mes:
            writer.writerow([f"=== PÓLIZAS CONTABLES — {_MESES_ES.get(mes, '')} {anio} ==="])
            _escribir_filas_planas(writer, filas_p)
        else:
            writer.writerow(["=== PÓLIZAS CONTABLES — ORGANIZADAS POR MES ==="])
            if filas_p:
                _escribir_seccion_por_mes(writer, filas_p, campo_total="total", campo_tipo=None)
            else:
                writer.writerow(["Sin pólizas registradas"])
        writer.writerow([])

    # ── Movimientos ───────────────────────────────────────────────────────────
    if "movimientos" in secciones:
        filas_m = datos["filas_movimientos"]
        if filtro_mes:
            writer.writerow([f"=== MOVIMIENTOS DE PÓLIZAS — {_MESES_ES.get(mes, '')} {anio} ==="])
            _escribir_filas_planas(writer, filas_m)
        else:
            writer.writerow(["=== MOVIMIENTOS DE PÓLIZAS — ORGANIZADAS POR MES ==="])
            if filas_m:
                _escribir_seccion_por_mes(writer, filas_m, campo_total="debe", campo_tipo=None)
            else:
                writer.writerow(["Sin movimientos registrados"])
        writer.writerow([])

    # ── Mapeos (sin período, son configuración global) ────────────────────────
    if "mapeos" in secciones:
        writer.writerow(["=== CLASIFICACIÓN DE PROVEEDORES (MAPEO CUENTA) ==="])
        _escribir_filas_planas(writer, datos["filas_mapeos"])
        writer.writerow([])

    # ── Comisiones (sin período, son configuración global) ────────────────────
    if "comisiones" in secciones:
        writer.writerow(["=== COMISIONES BANCARIAS ==="])
        _escribir_filas_planas(writer, datos["filas_comisiones"])

    csv_bytes = f"\ufeff{buf.getvalue()}".encode("utf-8")

    fecha_archivo = datetime.now().strftime("%Y%m%d")
    sufijo = f"{anio}-{mes:02d}" if filtro_mes else (tipo or "todo")
    nombre = f"SmartContable_{empresa_obj.rfc}_{fecha_archivo}_{sufijo}.csv"
    return csv_bytes, nombre


def generar_zip_exportacion_empresa(
    db: Session,
    empresa: Empresa,
    mes: int | None = None,
    anio: int | None = None,
) -> tuple[bytes, str]:
    datos = _recolectar_datos_exportacion(db, empresa, mes=mes, anio=anio)
    empresa_obj = datos["empresa"]
    generado = datos["generado"]
    resumen_filas = datos["filas_resumen"]
    resumen_por_mes = datos["resumen_por_mes"]

    resumen = {
        "empresa": empresa_obj.razon_social,
        "rfc": empresa_obj.rfc,
        "exportado_en": generado,
        "filtro_periodo": f"{anio}-{mes:02d}" if mes and anio else "todo",
        "totales": {
            "facturas": resumen_filas[3]["valor"],
            "ingresos_mxn": resumen_filas[4]["valor"],
            "egresos_mxn": resumen_filas[5]["valor"],
            "resultado_neto_mxn": resumen_filas[6]["valor"],
            "polizas": resumen_filas[7]["valor"],
            "movimientos_poliza": resumen_filas[8]["valor"],
            "clasificaciones_proveedor": resumen_filas[9]["valor"],
            "comisiones_banco": resumen_filas[10]["valor"],
        },
        "por_mes": {
            p: {
                "periodo": p,
                "mes_nombre": v["mes_nombre"],
                "facturas": v["facturas"],
                "ingresos_mxn": v["ingresos"],
                "egresos_mxn": v["egresos"],
                "resultado_neto_mxn": v["resultado_neto"],
            }
            for p, v in sorted(resumen_por_mes.items())
        },
    }

    # ── Agrupar filas por período ─────────────────────────────────────────────
    facturas_por_mes: dict[str, list[dict]] = defaultdict(list)
    for f in datos["filas_facturas"]:
        facturas_por_mes[f.get("periodo") or "sin-periodo"].append(f)

    polizas_por_mes: dict[str, list[dict]] = defaultdict(list)
    for p in datos["filas_polizas"]:
        polizas_por_mes[p.get("periodo") or "sin-periodo"].append(p)

    movs_por_mes: dict[str, list[dict]] = defaultdict(list)
    for m in datos["filas_movimientos"]:
        movs_por_mes[m.get("periodo") or "sin-periodo"].append(m)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:

        # ── Archivos globales ─────────────────────────────────────────────────
        zf.writestr("empresa.csv", _csv_bytes(datos["filas_empresa"]))
        zf.writestr("global/facturas.csv", _csv_bytes(datos["filas_facturas"]))
        zf.writestr("global/polizas.csv", _csv_bytes(datos["filas_polizas"]))
        zf.writestr("global/movimientos_poliza.csv", _csv_bytes(datos["filas_movimientos"]))
        zf.writestr("clasificaciones_proveedor.csv", _csv_bytes(datos["filas_mapeos"]))
        zf.writestr("comisiones_banco.csv", _csv_bytes(datos["filas_comisiones"]))

        # ── Archivos por mes ──────────────────────────────────────────────────
        todos_periodos = sorted(
            set(facturas_por_mes.keys()) | set(polizas_por_mes.keys())
        )
        for periodo in todos_periodos:
            zf.writestr(
                f"por_mes/{periodo}/facturas_{periodo}.csv",
                _csv_bytes(facturas_por_mes.get(periodo, [])),
            )
            zf.writestr(
                f"por_mes/{periodo}/polizas_{periodo}.csv",
                _csv_bytes(polizas_por_mes.get(periodo, [])),
            )
            if movs_por_mes.get(periodo):
                zf.writestr(
                    f"por_mes/{periodo}/movimientos_{periodo}.csv",
                    _csv_bytes(movs_por_mes[periodo]),
                )

        # ── Metadatos ─────────────────────────────────────────────────────────
        zf.writestr(
            "resumen.json",
            json.dumps(resumen, ensure_ascii=False, indent=2).encode("utf-8"),
        )

        periodos_txt = "\n".join(
            f"  por_mes/{p}/  →  facturas_{p}.csv | polizas_{p}.csv | movimientos_{p}.csv"
            for p in todos_periodos
        ) or "  (sin datos)"

        zf.writestr(
            "LEEME.txt",
            (
                f"Exportación SmartContable — {empresa_obj.razon_social}\n"
                f"RFC: {empresa_obj.rfc}\n"
                f"Generado: {generado}\n"
                + (f"Período filtrado: {anio}-{mes:02d}\n" if mes and anio else "")
                + "\n"
                "Estructura del ZIP:\n"
                "  empresa.csv                      — datos fiscales de la empresa\n"
                "  clasificaciones_proveedor.csv    — mapeo RFC → cuenta\n"
                "  comisiones_banco.csv             — configuración de comisiones\n"
                "  global/facturas.csv              — todos los CFDI (vista completa)\n"
                "  global/polizas.csv               — todas las pólizas (vista completa)\n"
                "  global/movimientos_poliza.csv    — todos los movimientos\n"
                "  resumen.json                     — totales y desglose por mes\n"
                "\nArchivos por mes:\n"
                + periodos_txt + "\n"
            ).encode("utf-8"),
        )

    fecha_archivo = datetime.now().strftime("%Y%m%d")
    sufijo = f"_{anio}-{mes:02d}" if mes and anio else ""
    nombre = f"SmartContable_{empresa_obj.rfc}_{fecha_archivo}{sufijo}.zip"
    return buf.getvalue(), nombre
