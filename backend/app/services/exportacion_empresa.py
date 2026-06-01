"""Exportación ZIP con varios archivos CSV por empresa."""

import csv
import io
import json
import zipfile
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.comision_banco import ComisionBanco
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.mapeo_cuenta import MapeoCuenta
from app.models.poliza import MovimientoPoliza, Poliza
from app.services.cfdi_helpers import es_venta, etiqueta_forma_pago


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


def _recolectar_datos_exportacion(db: Session, empresa: Empresa) -> dict:
    empresa_id = empresa.id
    rfc_empresa = (empresa.rfc or "").strip().upper()
    generado = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    facturas = (
        db.query(Factura)
        .filter(Factura.empresa_id == empresa_id)
        .order_by(Factura.fecha_emision.desc())
        .all()
    )
    polizas = (
        db.query(Poliza)
        .filter(Poliza.empresa_id == empresa_id)
        .order_by(Poliza.fecha.desc(), Poliza.numero.desc())
        .all()
    )
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

    filas_facturas = []
    total_ingresos = 0.0
    total_egresos = 0.0
    for f in facturas:
        venta = es_venta(f, rfc_empresa)
        total = _float_val(f.total)
        if venta:
            total_ingresos += total
        else:
            total_egresos += total
        filas_facturas.append({
            "id": f.id,
            "uuid": f.uuid,
            "tipo_movimiento": "Ingreso" if venta else "Egreso",
            "tipo_comprobante": _enum_val(f.tipo_comprobante),
            "fecha_emision": str(f.fecha_emision or ""),
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

    filas_polizas = [{
        "id": p.id,
        "factura_id": p.factura_id or "",
        "tipo": _enum_val(p.tipo),
        "numero": p.numero,
        "fecha": str(p.fecha or ""),
        "mes": p.mes or "",
        "anio": p.anio or "",
        "concepto": p.concepto or "",
        "total": _float_val(p.total),
    } for p in polizas]

    filas_movimientos = [{
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
    }


def generar_zip_exportacion_empresa(db: Session, empresa: Empresa) -> tuple[bytes, str]:
    datos = _recolectar_datos_exportacion(db, empresa)
    empresa_obj = datos["empresa"]
    generado = datos["generado"]
    resumen_filas = datos["filas_resumen"]

    resumen = {
        "empresa": empresa_obj.razon_social,
        "rfc": empresa_obj.rfc,
        "exportado_en": generado,
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
        "archivos": [
            "empresa.csv",
            "facturas.csv",
            "polizas.csv",
            "movimientos_poliza.csv",
            "clasificaciones_proveedor.csv",
            "comisiones_banco.csv",
        ],
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("empresa.csv", _csv_bytes(datos["filas_empresa"]))
        zf.writestr("facturas.csv", _csv_bytes(datos["filas_facturas"]))
        zf.writestr("polizas.csv", _csv_bytes(datos["filas_polizas"]))
        zf.writestr("movimientos_poliza.csv", _csv_bytes(datos["filas_movimientos"]))
        zf.writestr("clasificaciones_proveedor.csv", _csv_bytes(datos["filas_mapeos"]))
        zf.writestr("comisiones_banco.csv", _csv_bytes(datos["filas_comisiones"]))
        zf.writestr(
            "resumen.json",
            json.dumps(resumen, ensure_ascii=False, indent=2).encode("utf-8"),
        )
        zf.writestr(
            "LEEME.txt",
            (
                f"Exportación SmartContable — {empresa_obj.razon_social}\n"
                f"RFC: {empresa_obj.rfc}\n"
                f"Generado: {generado}\n\n"
                "Contenido del ZIP:\n"
                "- empresa.csv: datos fiscales de la empresa\n"
                "- facturas.csv: todos los CFDI registrados\n"
                "- polizas.csv: pólizas contables\n"
                "- movimientos_poliza.csv: partidas de cada póliza\n"
                "- clasificaciones_proveedor.csv: mapeo RFC → cuenta\n"
                "- comisiones_banco.csv: configuración de comisiones\n"
                "- resumen.json: totales y conteos\n"
            ).encode("utf-8"),
        )

    fecha_archivo = datetime.now().strftime("%Y%m%d")
    nombre = f"SmartContable_{empresa_obj.rfc}_{fecha_archivo}.zip"
    return buf.getvalue(), nombre
