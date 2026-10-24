"""Generación de informes contables y fiscales por empresa y periodo."""

from sqlalchemy.orm import Session
from sqlalchemy import extract, func
from sqlalchemy.exc import SQLAlchemyError
from app.models.factura import Factura
from app.models.poliza import Poliza, MovimientoPoliza
from app.models.mapeo_cuenta import MapeoCuenta
from app.models.empresa import Empresa
from app.core.sat_fiscal import SAT_REGIMEN_RULES, SatRegimenEnum
from app.services.cfdi_helpers import (
    es_emitido_por_empresa,
    es_nota_credito,
    es_venta,
    extraer_datos_xml,
    filtro_sin_canceladas,
)


def _facturas_periodo(db: Session, empresa_id: int, mes: int, anio: int) -> list[Factura]:
    return (
        db.query(Factura)
        .filter(
            Factura.empresa_id == empresa_id,
            extract("month", Factura.fecha_emision) == mes,
            extract("year", Factura.fecha_emision) == anio,
            filtro_sin_canceladas(),
        )
        .all()
    )


def _rfc_empresa(db: Session, empresa_id: int) -> str:
    emp = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return (emp.rfc or "").strip().upper() if emp else ""


def _regimen_info(db: Session, empresa_id: int) -> tuple[str, bool]:
    """Devuelve (clave de régimen, aplica IVA) según el régimen registrado."""
    emp = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    raw = getattr(emp, "regimen_fiscal", "")
    clave = str(getattr(raw, "value", raw) or "")
    try:
        return clave, bool(SAT_REGIMEN_RULES[SatRegimenEnum(clave)]["aplica_iva"])
    except (ValueError, KeyError):
        return clave, True


def generar_resumen_ingresos_egresos(
    db: Session, empresa_id: int, mes: int, anio: int
) -> dict:
    """
    Resumen de ingresos y egresos del periodo.

    Reglas contables aplicadas:
    - Las notas de crédito (tipo E) se registran con signo negativo: las
      emitidas por la empresa reducen los ingresos y las recibidas reducen los
      egresos. Antes se acumulaban en positivo, inflando los egresos y
      sobrestimando los ingresos.
    - Los CFDI cancelados quedan excluidos (ver `filtro_sin_canceladas`).
    - `total` es siempre el importe neto sin IVA; `total_con_iva` conserva el
      importe con IVA trasladado.
    """
    rfc = _rfc_empresa(db, empresa_id)
    facturas = _facturas_periodo(db, empresa_id, mes, anio)

    ingresos = {"cantidad": 0, "subtotal": 0.0, "iva": 0.0, "total": 0.0, "total_con_iva": 0.0}
    egresos = {"cantidad": 0, "subtotal": 0.0, "iva": 0.0, "total": 0.0, "total_con_iva": 0.0}
    notas_credito = {"cantidad": 0, "subtotal": 0.0, "iva": 0.0, "total": 0.0, "total_con_iva": 0.0}

    for f in facturas:
        subtotal = float(f.subtotal or 0)  # type: ignore
        iva = float(f.iva_trasladado or 0)  # type: ignore
        total = float(f.total or 0)  # type: ignore

        if es_nota_credito(f):
            # La nota de crédito reduce el bucket donde impacta:
            # emitida por la empresa -> ingresos; recibida del proveedor -> egresos.
            emitida = es_emitido_por_empresa(f, rfc)
            bucket = ingresos if emitida else egresos
            signo = -1
            notas_credito["cantidad"] += 1
            notas_credito["subtotal"] += subtotal
            notas_credito["iva"] += iva
            notas_credito["total"] += subtotal
            notas_credito["total_con_iva"] += total
        else:
            bucket = ingresos if es_venta(f, rfc) else egresos
            signo = 1
            bucket["cantidad"] += 1

        bucket["subtotal"] += signo * subtotal
        bucket["iva"] += signo * iva
        bucket["total"] += signo * subtotal
        bucket["total_con_iva"] += signo * total

    for b in (ingresos, egresos, notas_credito):
        for k in ("subtotal", "iva", "total", "total_con_iva"):
            b[k] = round(b[k], 2)

    utilidad = round(ingresos["total"] - egresos["total"], 2)
    return {
        "ingresos": ingresos,
        "egresos": egresos,
        "notas_credito": notas_credito,
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
                "monto": float(f.subtotal or f.total or 0),  # type: ignore
            })
            continue

        for c in conceptos:
            desc = (c.get("descripcion") or "").strip() or "Sin descripción"
            monto = float(c.get("importe") or 0)  # type: ignore
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
        # El cliente forma parte de la clave para que el estado de resultados
        # conserve el desglose comercial y no mezcle ventas de clientes distintos.
        key = (lin["concepto"], lin["cliente"], lin["cuenta"], lin["nombre_cuenta"])
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

    ingresos = sorted(agrupado.values(), key=lambda x: x["monto"], reverse=True)
    for item in ingresos:
        item["monto"] = round(item["monto"], 2)

    return ingresos


def _cuentas_t_estado_resultados(
    db: Session, empresa_id: int, mes: int, anio: int
) -> list[dict]:
    """Agrupa las cuentas de resultados conservando los lados Debe y Haber."""
    movimientos = (
        db.query(
            MovimientoPoliza.cuenta,
            MovimientoPoliza.nombre_cuenta,
            func.sum(MovimientoPoliza.debe).label("debe"),
            func.sum(MovimientoPoliza.haber).label("haber"),
        )
        .join(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            (
                MovimientoPoliza.cuenta.like("4%")
                | MovimientoPoliza.cuenta.like("5%")
                | MovimientoPoliza.cuenta.like("6%")
                | MovimientoPoliza.cuenta.like("7%")
            ),
        )
        .group_by(MovimientoPoliza.cuenta, MovimientoPoliza.nombre_cuenta)
        .order_by(MovimientoPoliza.cuenta)
        .all()
    )

    cuentas = []
    for movimiento in movimientos:
        cuenta = movimiento.cuenta or ""
        debe = round(float(movimiento.debe or 0), 2)  # type: ignore
        haber = round(float(movimiento.haber or 0), 2)  # type: ignore
        acreedora = cuenta.startswith("4")
        cuentas.append({
            "cuenta": cuenta,
            "nombre": movimiento.nombre_cuenta or "Sin nombre",
            "debe": debe,
            "haber": haber,
            "naturaleza": "Acreedora" if acreedora else "Deudora",
            "saldo": round((haber - debe) if acreedora else (debe - haber), 2),
        })
    return cuentas


def _tipo_comprobante(factura: Factura) -> str:
    tipo = getattr(factura.tipo_comprobante, "value", factura.tipo_comprobante)
    return str(tipo or "").upper()


def _detalle_facturas_por_tipo(
    facturas: list[Factura], tipo: str, rfc_empresa: str
) -> list[dict]:
    detalle = []
    for factura in facturas:
        if _tipo_comprobante(factura) != tipo:
            continue

        es_ingreso = tipo == "I" and es_venta(factura, rfc_empresa)
        contraparte = getattr(factura, "nombre_receptor", None) if es_ingreso else getattr(factura, "nombre_emisor", None)
        rfc_contraparte = getattr(factura, "rfc_receptor", None) if es_ingreso else getattr(factura, "rfc_emisor", None)
        detalle.append({
            "id": getattr(factura, "id", None),
            "uuid": getattr(factura, "uuid", ""),
            "fecha": str(getattr(factura, "fecha_emision", "")),
            "contraparte": contraparte or "Sin nombre",
            "rfc": rfc_contraparte or "",
            "subtotal": round(float(factura.subtotal or 0), 2),  # type: ignore
            "iva": round(float(factura.iva_trasladado or 0), 2),  # type: ignore
            "iva_retenido": round(float(getattr(factura, "iva_retenido", 0) or 0), 2),  # type: ignore
            "isr_retenido": round(float(getattr(factura, "isr_retenido", 0) or 0), 2),  # type: ignore
            "total": round(float(factura.total or 0), 2),  # type: ignore
            "estatus": getattr(getattr(factura, "estatus", ""), "value", getattr(factura, "estatus", "")),
        })
    return detalle


def generar_estado_resultados(db: Session, empresa_id: int, mes: int, anio: int) -> dict:
    """Estado de resultados: ingresos por concepto de venta (CFDI), gastos desde pólizas."""
    ingresos = _ingresos_por_concepto_venta(db, empresa_id, mes, anio)
    rfc = _rfc_empresa(db, empresa_id)
    facturas_periodo = _facturas_periodo(db, empresa_id, mes, anio)
    facturas_ingreso = _detalle_facturas_por_tipo(facturas_periodo, "I", rfc)
    facturas_egreso = _detalle_facturas_por_tipo(facturas_periodo, "E", rfc)
    cuentas_t = _cuentas_t_estado_resultados(db, empresa_id, mes, anio)

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
            "monto": round(float(r.monto or 0), 2),  # type: ignore
        }
        for r in lineas_gasto
    ]

    movimientos_gasto = (
        db.query(
            MovimientoPoliza.cuenta,
            MovimientoPoliza.nombre_cuenta,
            MovimientoPoliza.concepto,
            MovimientoPoliza.debe,
            MovimientoPoliza.haber,
            Poliza.fecha,
        )
        .join(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            (
                MovimientoPoliza.cuenta.like("5%")
                | MovimientoPoliza.cuenta.like("6%")
                | MovimientoPoliza.cuenta.like("7%")
            ),
            MovimientoPoliza.debe > 0,
        )
        .order_by(Poliza.fecha, MovimientoPoliza.cuenta)
        .all()
    )

    gastos_detalle = [
        {
            "fecha": str(movimiento.fecha or ""),
            "cuenta": movimiento.cuenta or "",
            "nombre_cuenta": movimiento.nombre_cuenta or "Gastos",
            "concepto": movimiento.concepto or movimiento.nombre_cuenta or "Gastos",
            "debe": round(float(movimiento.debe or 0), 2),  # type: ignore
            "haber": round(float(movimiento.haber or 0), 2),  # type: ignore
            "monto": round(float(movimiento.debe or 0), 2),  # type: ignore
        }
        for movimiento in movimientos_gasto
    ]

    ventas = [
        f for f in facturas_periodo if es_venta(f, rfc)
    ]
    total_ingresos = round(
        sum(float(f.subtotal or 0) for f in ventas) or sum(i["monto"] for i in ingresos),  # type: ignore
        2,
    )
    total_gastos = round(sum(g["monto"] for g in gastos), 2)
    utilidad = round(total_ingresos - total_gastos, 2)

    return {
        "ingresos": ingresos,
        "facturas_ingreso": facturas_ingreso,
        "facturas_egreso": facturas_egreso,
        "gastos": gastos,
        "gastos_detalle": gastos_detalle,
        "cuentas_t": cuentas_t,
        "total_facturas_ingreso": round(sum(f["total"] for f in facturas_ingreso), 2),
        "total_facturas_egreso": round(sum(f["total"] for f in facturas_egreso), 2),
        "total_ingresos": total_ingresos,
        "total_gastos": total_gastos,
        "utilidad_operativa": utilidad,
        "utilidad_neta": utilidad,
        "margen_pct": round((utilidad / total_ingresos) * 100, 2) if total_ingresos else 0,
        "fuente_ingresos": "cfdi_conceptos",
        "fuente_gastos": "polizas",
    }


def _es_factura_recibida_de_proveedor(factura: Factura, rfc_empresa: str) -> bool:
    """Identifica CFDI recibidos de terceros que deben aparecer en el padrón."""
    tipo = _tipo_comprobante(factura)
    rfc_emisor = (getattr(factura, "rfc_emisor", None) or "").strip().upper()
    if tipo not in {"I", "E", "P"} or not rfc_emisor:
        return False
    return rfc_emisor != rfc_empresa


def generar_padron_proveedores(db: Session, empresa_id: int, mes: int, anio: int) -> dict:
    rfc = _rfc_empresa(db, empresa_id)
    facturas = _facturas_periodo(db, empresa_id, mes, anio)
    gastos = [
        f for f in facturas
        if _es_factura_recibida_de_proveedor(f, rfc)
    ]

    mapeos = {
        m.rfc_emisor: m
        for m in db.query(MapeoCuenta).filter(MapeoCuenta.empresa_id == empresa_id).all()
    }

    padron: dict[str, dict] = {}
    for f in gastos:
        rfc_p = (f.rfc_emisor or "").strip().upper()
        nombre_p = (f.nombre_emisor or "Proveedor sin nombre").strip()
        clave = rfc_p or f"NOMBRE:{nombre_p.upper()}"
        if clave not in padron:
            m = mapeos.get(rfc_p)
            padron[clave] = {
                "rfc": rfc_p,
                "nombre": nombre_p,
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
        p = padron[clave]
        p["num_facturas"] += 1
        p["subtotal"] += float(f.subtotal or 0)  # type: ignore
        p["iva"] += float(f.iva_trasladado or 0)  # type: ignore
        p["total"] += float(f.total or 0)  # type: ignore
        p["iva_retenido"] += float(f.iva_retenido or 0)  # type: ignore
        p["isr_retenido"] += float(f.isr_retenido or 0)  # type: ignore

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
        iva = float(f.iva_trasladado or 0)  # type: ignore
        ish = float(f.impuestos_locales or 0)  # type: ignore
        total_iva += iva
        total_ish += ish
        total_subtotal += float(f.subtotal or 0)  # type: ignore
        detalle.append({
            "uuid": f.uuid,
            "fecha": str(f.fecha_emision),
            "receptor": f.nombre_receptor,
            "subtotal": round(float(f.subtotal or 0), 2),  # type: ignore
            "iva_trasladado": round(iva, 2),
            "impuestos_locales": round(ish, 2),
            "total": round(float(f.total or 0), 2),  # type: ignore
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

    # ISH desde polizas (cuentas 216.04) en lugar de CFDI.
    ish_polizas = None
    try:
        ish_polizas = (
            db.query(func.sum(MovimientoPoliza.haber))
            .join(Poliza)
            .filter(
                Poliza.empresa_id == empresa_id,
                Poliza.mes == mes,
                Poliza.anio == anio,
                MovimientoPoliza.cuenta.like("216.04%"),
            )
            .scalar()
        )
    except SQLAlchemyError:  # noqa: BLE001
        ish_polizas = None

    regimen, aplica_iva = _regimen_info(db, empresa_id)
    if not aplica_iva:
        total_iva = 0.0
        for d in detalle:
            d["iva_trasladado"] = 0.0
    if ish_polizas is not None:
        total_ish = float(ish_polizas or 0)  # type: ignore
    return {
        "regimen_fiscal": regimen,
        "aplica_iva": aplica_iva,
        "total_iva_trasladado": round(total_iva, 2),
        "total_impuestos_locales": round(total_ish, 2),
        "total_subtotal_ventas": round(total_subtotal, 2),
        "iva_desde_polizas": round(float(iva_polizas), 2),  # type: ignore
        "num_cfdi_venta": len(ventas),
        "detalle": detalle,
    }


def generar_impuestos_acreditables(db: Session, empresa_id: int, mes: int, anio: int) -> dict:
    rfc = _rfc_empresa(db, empresa_id)
    facturas = _facturas_periodo(db, empresa_id, mes, anio)
    def _tipo(f) -> str:
        return str(getattr(f.tipo_comprobante, "value", f.tipo_comprobante) or "").upper()

    compras = [
        f for f in facturas
        if (f.rfc_emisor or "").strip().upper() != rfc
        and _tipo(f) in ("I", "E")
    ]

    detalle = []
    total_iva = 0.0
    total_subtotal = 0.0

    for f in compras:
        signo = -1 if _tipo(f) == "E" else 1
        iva = signo * float(f.iva_trasladado or 0)  # type: ignore
        total_iva += iva
        total_subtotal += signo * float(f.subtotal or 0)  # type: ignore
        detalle.append({
            "uuid": f.uuid,
            "fecha": str(f.fecha_emision),
            "proveedor": f.nombre_emisor,
            "rfc": f.rfc_emisor,
            "subtotal": round(float(f.subtotal or 0), 2),  # type: ignore
            "iva_acreditable": round(iva, 2),
            "total": round(float(f.total or 0), 2),  # type: ignore
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

    regimen, aplica_iva = _regimen_info(db, empresa_id)
    if not aplica_iva:
        total_iva = 0.0
        for d in detalle:
            d["iva_acreditable"] = 0.0
    return {
        "regimen_fiscal": regimen,
        "aplica_iva": aplica_iva,
        "total_iva_acreditable": round(total_iva, 2),
        "total_subtotal_compras": round(total_subtotal, 2),
        "iva_desde_polizas": round(float(iva_polizas), 2),  # type: ignore
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
        iva_ret = float(f.iva_retenido or 0)  # type: ignore
        isr_ret = float(f.isr_retenido or 0)  # type: ignore
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

    # Retenciones desde polizas de gasto (cuentas 216.03 y 216.05).
    iva_ret_polizas = None
    isr_ret_polizas = None
    query_ok = False
    try:
        iva_ret_polizas = (
            db.query(func.sum(MovimientoPoliza.haber))
            .join(Poliza)
            .filter(
                Poliza.empresa_id == empresa_id,
                Poliza.mes == mes,
                Poliza.anio == anio,
                MovimientoPoliza.cuenta.like("216.03%"),
            )
            .scalar()
        )
        isr_ret_polizas = (
            db.query(func.sum(MovimientoPoliza.haber))
            .join(Poliza)
            .filter(
                Poliza.empresa_id == empresa_id,
                Poliza.mes == mes,
                Poliza.anio == anio,
                MovimientoPoliza.cuenta.like("216.05%"),
            )
            .scalar()
        )
        query_ok = True
    except SQLAlchemyError:  # noqa: BLE001
        query_ok = False
    if query_ok:
        total_iva_ret = float(iva_ret_polizas or 0)  # type: ignore
        total_isr_ret = float(isr_ret_polizas or 0)  # type: ignore

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
            top_clientes[key] = {"nombre": f.nombre_receptor, "total": 0.0, "cfdi": 0}
        top_clientes[key]["total"] += float(f.total or 0)  # type: ignore
        top_clientes[key]["cfdi"] += 1

    clientes = sorted(top_clientes.values(), key=lambda x: x["total"], reverse=True)[:10]

    top_gastos: dict[str, dict] = {}
    for f in facturas:
        if es_venta(f, rfc):
            continue
        key = f.rfc_emisor or "?"
        if key not in top_gastos:
            top_gastos[key] = {
                "nombre": f.nombre_emisor or "Proveedor sin nombre",
                "rfc": key,
                "total": 0.0,
                "cfdi": 0,
            }
        top_gastos[key]["total"] += float(f.total or 0)  # type: ignore
        top_gastos[key]["cfdi"] += 1

    gastos = sorted(top_gastos.values(), key=lambda x: x["total"], reverse=True)[:10]

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
    regimen, aplica_iva = _regimen_info(db, empresa_id)
    if not aplica_iva:
        iva_neto = 0.0
        alertas.append({
            "nivel": "info",
            "mensaje": f"El régimen registrado ({regimen}) no causa IVA; no se calcula IVA a cargo ni a favor.",
        })
    elif iva_neto > 0:
        alertas.append({
            "nivel": "info",
            "mensaje": f"IVA a cargo estimado del periodo: ${iva_neto:,.2f} (trasladado − acreditable).",
        })
    elif iva_neto < 0:
        alertas.append({
            "nivel": "info",
            "mensaje": f"Saldo a favor de IVA estimado: ${abs(iva_neto):,.2f}.",
        })

    recomendaciones = [
        "Balanza de comprobación por cuenta (activo, pasivo, capital).",
        "Flujo de efectivo mensual (cobros vs pagos).",
        "CFDI cancelados vs vigentes del periodo.",
        "Conciliación bancaria vs pólizas de ingreso.",
    ]
    if regimen == "605":
        recomendaciones.append("Sueldos y salarios: no hay pagos provisionales; revisa deducciones personales para la anual.")
    elif regimen in ("626_PF", "626_PM"):
        recomendaciones.append("RESICO: el ISR se paga mensual sobre ingresos cobrados; vigila el límite anual de ingresos.")
    else:
        recomendaciones.append("Proyección de ISR anual con base en utilidad acumulada.")

    return {
        "facturas_sin_poliza": sin_poliza,
        "gastos_sin_clasificar": sin_clasificar,
        "comisiones_bancarias": round(float(comisiones), 2),  # type: ignore
        "top_clientes": [
            {**c, "total": round(c["total"], 2)} for c in clientes
        ],
        "top_gastos": [
            {**g, "total": round(g["total"], 2)} for g in gastos
        ],
        "alertas": alertas,
        "recomendaciones": recomendaciones,
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
