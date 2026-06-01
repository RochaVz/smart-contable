"""Generación de informes contables y fiscales por empresa y periodo."""

from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from app.models.factura import Factura
from app.models.poliza import Poliza, MovimientoPoliza
from app.models.mapeo_cuenta import MapeoCuenta
from app.models.empresa import Empresa
from app.services.cfdi_helpers import es_venta, extraer_datos_xml


def _facturas_periodo(db: Session, empresa_id: int, mes: int, anio: int) -> list[Factura]:
    return (
        db.query(Factura)
        .filter(
            Factura.empresa_id == empresa_id,
            extract("month", Factura.fecha_emision) == mes,
            extract("year", Factura.fecha_emision) == anio,
        )
        .all()
    )


def _rfc_empresa(db: Session, empresa_id: int) -> str:
    emp = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return (emp.rfc or "").strip().upper() if emp else ""


def generar_resumen_ingresos_egresos(
    db: Session, empresa_id: int, mes: int, anio: int
) -> dict:
    rfc = _rfc_empresa(db, empresa_id)
    facturas = _facturas_periodo(db, empresa_id, mes, anio)

    ingresos = {"cantidad": 0, "subtotal": 0.0, "iva": 0.0, "total": 0.0}
    egresos = {"cantidad": 0, "subtotal": 0.0, "iva": 0.0, "total": 0.0}

    for f in facturas:
        bucket = ingresos if es_venta(f, rfc) else egresos
        bucket["cantidad"] += 1
        bucket["subtotal"] += float(f.subtotal or 0)
        bucket["iva"] += float(f.iva_trasladado or 0)
        bucket["total"] += float(f.total or 0)

    for b in (ingresos, egresos):
        for k in ("subtotal", "iva", "total"):
            b[k] = round(b[k], 2)

    utilidad = round(ingresos["total"] - egresos["total"], 2)
    return {
        "ingresos": ingresos,
        "egresos": egresos,
        "utilidad_neta": utilidad,
        "margen_pct": round((utilidad / ingresos["total"]) * 100, 2) if ingresos["total"] else 0,
    }


def _cuenta_ingreso_de_factura(db: Session, factura_id: int) -> tuple[str, str]:
    poliza = (
        db.query(Poliza)
        .filter(Poliza.factura_id == factura_id)
        .first()
    )
    if not poliza:
        return "", "VENTAS GENERALES"
    mov = (
        db.query(MovimientoPoliza)
        .filter(
            MovimientoPoliza.poliza_id == poliza.id,
            MovimientoPoliza.cuenta.like("4%"),
            MovimientoPoliza.haber > 0,
            MovimientoPoliza.nombre_cuenta.notin_(
                ["IVA Trasladado", "IVA Pendiente de Trasladar"]
            ),
        )
        .first()
    )
    if mov:
        return mov.cuenta or "", mov.nombre_cuenta or "VENTAS GENERALES"
    return "", "VENTAS GENERALES"


def _ingresos_por_concepto_venta(
    db: Session, empresa_id: int, mes: int, anio: int
) -> list[dict]:
    """Ingresos del periodo agrupados por concepto vendido (descripción del CFDI)."""
    rfc = _rfc_empresa(db, empresa_id)
    ventas = [f for f in _facturas_periodo(db, empresa_id, mes, anio) if es_venta(f, rfc)]

    lineas_crudas: list[dict] = []
    for f in ventas:
        cuenta, nombre_cuenta = _cuenta_ingreso_de_factura(db, f.id)
        datos = extraer_datos_xml(f.xml_contenido)
        conceptos = datos.get("conceptos") or []
        cliente = f.nombre_receptor or "Cliente"

        if not conceptos:
            desc = (datos.get("concepto_principal") or "Venta de bienes/servicios").strip()
            lineas_crudas.append({
                "concepto": desc,
                "cliente": cliente,
                "cuenta": cuenta,
                "nombre_cuenta": nombre_cuenta,
                "monto": float(f.subtotal or f.total or 0),
            })
            continue

        for c in conceptos:
            desc = (c.get("descripcion") or "").strip() or "Sin descripción"
            monto = float(c.get("importe") or 0)
            if monto <= 0:
                continue
            lineas_crudas.append({
                "concepto": desc,
                "cliente": cliente,
                "cuenta": cuenta,
                "nombre_cuenta": nombre_cuenta,
                "monto": monto,
            })

    agrupado: dict[tuple, dict] = {}
    for lin in lineas_crudas:
        key = (lin["concepto"], lin["cuenta"], lin["nombre_cuenta"])
        if key not in agrupado:
            agrupado[key] = {
                "concepto": lin["concepto"],
                "cliente": lin["cliente"],
                "cuenta": lin["cuenta"],
                "nombre_cuenta": lin["nombre_cuenta"],
                "monto": 0.0,
                "num_facturas": 0,
            }
        bucket = agrupado[key]
        bucket["monto"] += lin["monto"]
        bucket["num_facturas"] += 1
        if bucket["cliente"] != lin["cliente"] and bucket["num_facturas"] > 1:
            bucket["cliente"] = "Varios clientes"

    ingresos = sorted(agrupado.values(), key=lambda x: x["monto"], reverse=True)
    for item in ingresos:
        item["monto"] = round(item["monto"], 2)
        item.pop("num_facturas", None)

    return ingresos


def generar_estado_resultados(db: Session, empresa_id: int, mes: int, anio: int) -> dict:
    """Estado de resultados: ingresos por concepto de venta (CFDI), gastos desde pólizas."""
    ingresos = _ingresos_por_concepto_venta(db, empresa_id, mes, anio)

    lineas_gasto = (
        db.query(
            MovimientoPoliza.nombre_cuenta,
            MovimientoPoliza.cuenta,
            func.sum(MovimientoPoliza.debe).label("monto"),
        )
        .join(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            (MovimientoPoliza.cuenta.like("6%") | MovimientoPoliza.cuenta.like("7%")),
            MovimientoPoliza.debe > 0,
        )
        .group_by(MovimientoPoliza.nombre_cuenta, MovimientoPoliza.cuenta)
        .order_by(func.sum(MovimientoPoliza.debe).desc())
        .all()
    )

    gastos = [
        {
            "concepto": r.nombre_cuenta or "Gastos",
            "cuenta": r.cuenta,
            "monto": round(float(r.monto or 0), 2),
        }
        for r in lineas_gasto
    ]

    rfc = _rfc_empresa(db, empresa_id)
    ventas = [
        f for f in _facturas_periodo(db, empresa_id, mes, anio) if es_venta(f, rfc)
    ]
    total_ingresos = round(
        sum(float(f.subtotal or 0) for f in ventas) or sum(i["monto"] for i in ingresos),
        2,
    )
    total_gastos = round(sum(g["monto"] for g in gastos), 2)
    utilidad = round(total_ingresos - total_gastos, 2)

    return {
        "ingresos": ingresos,
        "gastos": gastos,
        "total_ingresos": total_ingresos,
        "total_gastos": total_gastos,
        "utilidad_operativa": utilidad,
        "utilidad_neta": utilidad,
        "margen_pct": round((utilidad / total_ingresos) * 100, 2) if total_ingresos else 0,
        "fuente_ingresos": "cfdi_conceptos",
        "fuente_gastos": "polizas",
    }


def generar_padron_proveedores(db: Session, empresa_id: int, mes: int, anio: int) -> dict:
    rfc = _rfc_empresa(db, empresa_id)
    facturas = _facturas_periodo(db, empresa_id, mes, anio)
    gastos = [f for f in facturas if not es_venta(f, rfc)]

    mapeos = {
        m.rfc_emisor: m
        for m in db.query(MapeoCuenta).filter(MapeoCuenta.empresa_id == empresa_id).all()
    }

    padron: dict[str, dict] = {}
    for f in gastos:
        rfc_p = (f.rfc_emisor or "").strip().upper()
        if rfc_p not in padron:
            m = mapeos.get(rfc_p)
            padron[rfc_p] = {
                "rfc": rfc_p,
                "nombre": f.nombre_emisor or "Sin nombre",
                "clasificacion": m.nombre_cuenta if m else "Por clasificar",
                "codigo_cuenta": m.codigo_cuenta if m else None,
                "num_facturas": 0,
                "subtotal": 0.0,
                "iva": 0.0,
                "total": 0.0,
                "iva_retenido": 0.0,
                "isr_retenido": 0.0,
                "deducible": bool(f.es_deducible),
            }
        p = padron[rfc_p]
        p["num_facturas"] += 1
        p["subtotal"] += float(f.subtotal or 0)
        p["iva"] += float(f.iva_trasladado or 0)
        p["total"] += float(f.total or 0)
        p["iva_retenido"] += float(f.iva_retenido or 0)
        p["isr_retenido"] += float(f.isr_retenido or 0)

    proveedores = sorted(padron.values(), key=lambda x: x["total"], reverse=True)
    for p in proveedores:
        for k in ("subtotal", "iva", "total", "iva_retenido", "isr_retenido"):
            p[k] = round(p[k], 2)

    return {
        "total_proveedores": len(proveedores),
        "total_gastado": round(sum(p["total"] for p in proveedores), 2),
        "proveedores": proveedores,
    }


def generar_impuestos_trasladados(db: Session, empresa_id: int, mes: int, anio: int) -> dict:
    rfc = _rfc_empresa(db, empresa_id)
    facturas = _facturas_periodo(db, empresa_id, mes, anio)
    ventas = [f for f in facturas if es_venta(f, rfc)]

    detalle = []
    total_iva = 0.0
    total_ish = 0.0
    total_subtotal = 0.0

    for f in ventas:
        iva = float(f.iva_trasladado or 0)
        ish = float(f.impuestos_locales or 0)
        total_iva += iva
        total_ish += ish
        total_subtotal += float(f.subtotal or 0)
        detalle.append({
            "uuid": f.uuid,
            "fecha": str(f.fecha_emision),
            "receptor": f.nombre_receptor,
            "subtotal": round(float(f.subtotal or 0), 2),
            "iva_trasladado": round(iva, 2),
            "impuestos_locales": round(ish, 2),
            "total": round(float(f.total or 0), 2),
        })

    # Complemento desde pólizas (cuentas 216)
    iva_polizas = (
        db.query(func.sum(MovimientoPoliza.haber))
        .join(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            MovimientoPoliza.cuenta.like("216.01%"),
        )
        .scalar()
        or 0
    )

    return {
        "total_iva_trasladado": round(total_iva, 2),
        "total_impuestos_locales": round(total_ish, 2),
        "total_subtotal_ventas": round(total_subtotal, 2),
        "iva_desde_polizas": round(float(iva_polizas), 2),
        "num_cfdi_venta": len(ventas),
        "detalle": detalle,
    }


def generar_impuestos_acreditables(db: Session, empresa_id: int, mes: int, anio: int) -> dict:
    rfc = _rfc_empresa(db, empresa_id)
    facturas = _facturas_periodo(db, empresa_id, mes, anio)
    compras = [f for f in facturas if not es_venta(f, rfc)]

    detalle = []
    total_iva = 0.0
    total_subtotal = 0.0

    for f in compras:
        iva = float(f.iva_trasladado or 0)
        total_iva += iva
        total_subtotal += float(f.subtotal or 0)
        detalle.append({
            "uuid": f.uuid,
            "fecha": str(f.fecha_emision),
            "proveedor": f.nombre_emisor,
            "rfc": f.rfc_emisor,
            "subtotal": round(float(f.subtotal or 0), 2),
            "iva_acreditable": round(iva, 2),
            "total": round(float(f.total or 0), 2),
            "deducible": bool(f.es_deducible),
        })

    iva_polizas = (
        db.query(func.sum(MovimientoPoliza.debe))
        .join(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            MovimientoPoliza.cuenta.like("118.01%"),
        )
        .scalar()
        or 0
    )

    return {
        "total_iva_acreditable": round(total_iva, 2),
        "total_subtotal_compras": round(total_subtotal, 2),
        "iva_desde_polizas": round(float(iva_polizas), 2),
        "num_cfdi_compra": len(compras),
        "detalle": detalle,
    }


def generar_impuestos_retenidos(db: Session, empresa_id: int, mes: int, anio: int) -> dict:
    facturas = _facturas_periodo(db, empresa_id, mes, anio)
    rfc = _rfc_empresa(db, empresa_id)

    detalle = []
    total_iva_ret = 0.0
    total_isr_ret = 0.0

    for f in facturas:
        iva_ret = float(f.iva_retenido or 0)
        isr_ret = float(f.isr_retenido or 0)
        if iva_ret <= 0 and isr_ret <= 0:
            continue
        total_iva_ret += iva_ret
        total_isr_ret += isr_ret
        venta = es_venta(f, rfc)
        detalle.append({
            "uuid": f.uuid,
            "fecha": str(f.fecha_emision),
            "tipo": "VENTA" if venta else "COMPRA",
            "contraparte": f.nombre_receptor if venta else f.nombre_emisor,
            "rfc": f.rfc_receptor if venta else f.rfc_emisor,
            "iva_retenido": round(iva_ret, 2),
            "isr_retenido": round(isr_ret, 2),
        })

    return {
        "total_iva_retenido": round(total_iva_ret, 2),
        "total_isr_retenido": round(total_isr_ret, 2),
        "total_retenciones": round(total_iva_ret + total_isr_ret, 2),
        "detalle": detalle,
    }


def generar_sugerencias(
    db: Session, empresa_id: int, mes: int, anio: int, paquete: dict
) -> dict:
    rfc = _rfc_empresa(db, empresa_id)
    facturas = _facturas_periodo(db, empresa_id, mes, anio)

    sin_poliza = sum(1 for f in facturas if not f.polizas)
    sin_clasificar = sum(
        1 for f in facturas
        if not es_venta(f, rfc)
        and not db.query(MapeoCuenta)
        .filter(MapeoCuenta.empresa_id == empresa_id, MapeoCuenta.rfc_emisor == f.rfc_emisor)
        .first()
    )

    iva_tras = paquete["impuestos_trasladados"]["total_iva_trasladado"]
    iva_acred = paquete["impuestos_acreditables"]["total_iva_acreditable"]
    iva_neto = round(iva_tras - iva_acred, 2)

    top_clientes: dict[str, dict] = {}
    for f in facturas:
        if not es_venta(f, rfc):
            continue
        key = f.rfc_receptor or "?"
        if key not in top_clientes:
            top_clientes[key] = {"nombre": f.nombre_receptor, "total": 0.0}
        top_clientes[key]["total"] += float(f.total or 0)

    clientes = sorted(top_clientes.values(), key=lambda x: x["total"], reverse=True)[:5]

    comisiones = (
        db.query(func.sum(MovimientoPoliza.debe))
        .join(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            MovimientoPoliza.cuenta.like("701%"),
        )
        .scalar()
        or 0
    )

    alertas = []
    if sin_poliza:
        alertas.append({
            "nivel": "warning",
            "mensaje": f"{sin_poliza} CFDI del periodo sin póliza contable generada.",
        })
    if sin_clasificar:
        alertas.append({
            "nivel": "warning",
            "mensaje": f"{sin_clasificar} gasto(s) con proveedor sin clasificar en el padrón.",
        })
    if iva_neto > 0:
        alertas.append({
            "nivel": "info",
            "mensaje": f"IVA a cargo estimado del periodo: ${iva_neto:,.2f} (trasladado − acreditable).",
        })
    elif iva_neto < 0:
        alertas.append({
            "nivel": "info",
            "mensaje": f"Saldo a favor de IVA estimado: ${abs(iva_neto):,.2f}.",
        })

    return {
        "iva_neto_periodo": iva_neto,
        "facturas_sin_poliza": sin_poliza,
        "gastos_sin_clasificar": sin_clasificar,
        "comisiones_bancarias": round(float(comisiones), 2),
        "top_clientes": [
            {**c, "total": round(c["total"], 2)} for c in clientes
        ],
        "alertas": alertas,
        "recomendaciones": [
            "Balanza de comprobación por cuenta (activo, pasivo, capital).",
            "Flujo de efectivo mensual (cobros vs pagos).",
            "CFDI cancelados vs vigentes del periodo.",
            "Conciliación bancaria vs pólizas de ingreso.",
            "Proyección de ISR anual con base en utilidad acumulada.",
        ],
    }


def generar_paquete_informes(
    db: Session, empresa_id: int, mes: int, anio: int
) -> dict:
    resumen = generar_resumen_ingresos_egresos(db, empresa_id, mes, anio)
    estado = generar_estado_resultados(db, empresa_id, mes, anio)
    padron = generar_padron_proveedores(db, empresa_id, mes, anio)
    trasladados = generar_impuestos_trasladados(db, empresa_id, mes, anio)
    acreditables = generar_impuestos_acreditables(db, empresa_id, mes, anio)
    retenidos = generar_impuestos_retenidos(db, empresa_id, mes, anio)

    paquete = {
        "periodo": {"mes": mes, "anio": anio},
        "resumen_ingresos_egresos": resumen,
        "estado_resultados": estado,
        "padron_proveedores": padron,
        "impuestos_trasladados": trasladados,
        "impuestos_acreditables": acreditables,
        "impuestos_retenidos": retenidos,
    }
    paquete["sugerencias"] = generar_sugerencias(db, empresa_id, mes, anio, paquete)
    return paquete
