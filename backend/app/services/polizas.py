from sqlalchemy.orm import Session
from app.models.factura import Factura
from app.models.poliza import Poliza, MovimientoPoliza, TipoPoliza
from app.models.mapeo_cuenta import MapeoCuenta
from app.models.empresa import Empresa
from datetime import date
from app.services.clasificador import obtener_cuenta_por_clave_sat
from app.services.cfdi_helpers import (
    es_venta,
    extraer_datos_xml,
    etiqueta_forma_pago,
    desglose_impuestos,
    FORMAS_PAGO_TARJETA,
)
from app.services.comisiones import calcular_comision_bancaria
from app.core.logging_config import get_logger
from app.core.exceptions import UnbalancedVoucherException
from decimal import Decimal

logger = get_logger(__name__)

# ─────────────────────────────────────────
# VALIDACIONES CONTABLES
# ─────────────────────────────────────────

def validar_partida_doble(movimientos):
    """
    Validate that voucher (póliza) balances (Debe = Haber)
    
    Args:
        movimientos: List of MovimientoPoliza objects
    
    Raises:
        UnbalancedVoucherException: If Debe != Haber
    """
    try:
        total_debe = sum(Decimal(str(m.debe or 0)) for m in movimientos)
        total_haber = sum(Decimal(str(m.haber or 0)) for m in movimientos)
        
        # Round to 2 decimal places for currency comparison
        if round(total_debe, 2) != round(total_haber, 2):
            logger.error(
                "Unbalanced voucher",
                extra={
                    "debe": float(total_debe),
                    "haber": float(total_haber)
                }
            )
            raise UnbalancedVoucherException(
                f"Debe: {total_debe}, Haber: {total_haber}"
            )
    except UnbalancedVoucherException:
        raise
    except Exception as e:
        logger.error("Error validating double-entry", exc_info=True)
        raise UnbalancedVoucherException(
            "Error al validar partida doble"
        ) from e


def obtener_cuenta_inteligente(
    db: Session,
    rfc: str,
    empresa_id: int,
    clave_sat: str
) -> dict:
    """
    Prioridad de clasificación:
    1. Mapeo manual RFC → cuenta definido por el usuario para esta empresa
    2. Clasificación automática por clave SAT del catálogo del SAT
    3. Fallback a Gastos Generales
    
    Args:
        db: Database session
        rfc: RFC of the issuer
        empresa_id: ID of the empresa
        clave_sat: SAT product/service code
    
    Returns:
        Dictionary with "cuenta" and "nombre" keys
    """
    try:
        # 1. Mapeo manual por RFC del proveedor
        mapeo = db.query(MapeoCuenta).filter(
            MapeoCuenta.rfc_emisor == rfc,
            MapeoCuenta.empresa_id == empresa_id,
        ).first()
        
        if mapeo and mapeo.codigo_cuenta:
            logger.debug(
                "Account mapped by RFC",
                extra={"rfc": rfc, "cuenta": mapeo.codigo_cuenta}
            )
            return {
                "cuenta": mapeo.codigo_cuenta,
                "nombre": mapeo.nombre_cuenta or "Gasto clasificado",
            }

        # 2. Clasificación por clave SAT
        return obtener_cuenta_por_clave_sat(db, clave_sat)
        
    except Exception as e:
        logger.error("Error obtaining intelligent account", exc_info=True)
        # Return fallback account
        return {
            "cuenta": "601.01.01",
            "nombre": "Gastos Generales"
        }


CUENTAS = {
    "caja": "101.01.01",
    "bancos": "102.01.01",
    "cxc": "105.01.01",
    "iva_acreditable": "118.01.01",
    "iva_pendiente_acreditar": "118.02.01",
    "isr_retenido_cxc": "118.03.01",
    "cxp": "201.01.01",
    "iva_trasladado": "216.01.01",
    "iva_pendiente_trasladar": "216.02.01",
    "iva_retenido": "216.03.01",
    "impuestos_locales": "216.04.01",
    "isr_retenido_cxp": "216.05.01",
    "ingresos": "401.01.01",
    "gastos": "601.01.01",
    "gastos_no_ded": "602.01.01",
    "comisiones_bancarias": "701.02.01",
}

FORMA_PAGO_CUENTA = {
    "01": ("101.01.01", "Caja"),
    "02": ("101.01.01", "Caja"),
    "03": ("102.01.01", "Bancos"),
    "04": ("102.01.01", "Bancos"),
    "28": ("102.01.01", "Bancos"),
    "29": ("102.01.01", "Bancos"),
}


def _ultimo_numero_poliza(db: Session, empresa_id: int, tipo: TipoPoliza, mes: int, anio: int) -> int:
    ultima = db.query(Poliza).filter(
        Poliza.empresa_id == empresa_id,
        Poliza.tipo == tipo,
        Poliza.mes == mes,
        Poliza.anio == anio,
    ).order_by(Poliza.numero.desc()).first()
    return (ultima.numero + 1) if ultima else 1


def _cuenta_cobro(factura: Factura) -> tuple[str, str]:
    if factura.metodo_pago == "PPD":
        return CUENTAS["cxc"], "Clientes (por cobrar)"
    forma = factura.forma_pago or ""
    # Tarjeta: el cobro y la comisión van en póliza de ingresos
    if forma in FORMAS_PAGO_TARJETA:
        return CUENTAS["cxc"], "Clientes"
    if forma in FORMA_PAGO_CUENTA:
        return FORMA_PAGO_CUENTA[forma]
    return CUENTAS["cxc"], "Clientes"


def _clave_sat_desde_factura(factura: Factura) -> str:
    datos = extraer_datos_xml(factura.xml_contenido)
    conceptos = datos.get("conceptos") or []
    if conceptos:
        return conceptos[0].get("clave_prod_serv") or "00000000"
    return "00000000"


def _conceptos_vendidos(factura: Factura) -> list[dict]:
    datos = extraer_datos_xml(factura.xml_contenido)
    return [
        {
            "descripcion": c.get("descripcion", ""),
            "cantidad": c.get("cantidad", 1),
            "unidad": c.get("unidad", ""),
            "importe": c.get("importe", 0),
        }
        for c in (datos.get("conceptos") or [])
    ]


# ─────────────────────────────────────────
# PÓLIZA DE DIARIO (ventas / registro del CFDI emitido)
# ─────────────────────────────────────────

def generar_poliza_diario_venta(factura: Factura, db: Session) -> Poliza:
    fecha = factura.fecha_emision.date() if factura.fecha_emision else date.today()
    mes, anio = fecha.month, fecha.year
    subtotal = float(factura.subtotal or 0)
    iva = float(factura.iva_trasladado or 0)
    total = float(factura.total or 0)
    ish = float(factura.impuestos_locales or 0)
    datos_xml = extraer_datos_xml(factura.xml_contenido)
    vendido = datos_xml.get("concepto_principal") or "Venta de bienes/servicios"
    nombre = factura.nombre_receptor or "Cliente"
    forma = etiqueta_forma_pago(factura.forma_pago)

    numero = _ultimo_numero_poliza(db, factura.empresa_id, TipoPoliza.diario, mes, anio)
    poliza = Poliza(
        empresa_id=factura.empresa_id,
        factura_id=factura.id,
        tipo=TipoPoliza.diario,
        numero=numero,
        fecha=fecha,
        mes=mes,
        anio=anio,
        concepto=f"Diario venta | {nombre} | {forma} | {vendido[:80]}",
        total=total,
    )
    db.add(poliza)
    db.flush()

    cuenta_debe, nombre_debe = _cuenta_cobro(factura)
    movimientos = [
        MovimientoPoliza(
            poliza_id=poliza.id,
            cuenta=cuenta_debe,
            nombre_cuenta=nombre_debe,
            debe=total,
            haber=0,
            concepto=f"Cobro/venta a {nombre} — {forma}",
        ),
        MovimientoPoliza(
            poliza_id=poliza.id,
            cuenta=CUENTAS["ingresos"],
            nombre_cuenta="Ingresos por ventas",
            debe=0,
            haber=subtotal,
            concepto=vendido,
        ),
    ]

    if iva > 0:
        es_ppd = factura.metodo_pago == "PPD"
        cuenta_iva = (
            CUENTAS["iva_pendiente_trasladar"] if es_ppd else CUENTAS["iva_trasladado"]
        )
        nombre_iva = "IVA pendiente de trasladar" if es_ppd else "IVA trasladado"
        movimientos.append(
            MovimientoPoliza(
                poliza_id=poliza.id,
                cuenta=cuenta_iva,
                nombre_cuenta=nombre_iva,
                debe=0,
                haber=iva,
                concepto="IVA trasladado 16%",
            )
        )

    if ish > 0:
        movimientos.append(
            MovimientoPoliza(
                poliza_id=poliza.id,
                cuenta=CUENTAS["impuestos_locales"],
                nombre_cuenta="ISH / impuestos locales",
                debe=0,
                haber=ish,
                concepto="Impuestos locales",
            )
        )

    validar_partida_doble(movimientos)
    for mov in movimientos:
        db.add(mov)
    return poliza


# ─────────────────────────────────────────
# PÓLIZA DE INGRESOS (cobro + comisión bancaria si tarjeta)
# ─────────────────────────────────────────

def generar_poliza_ingreso_cobro(
    factura: Factura, db: Session, banco_id: int | None = None
) -> Poliza | None:
    forma = factura.forma_pago or ""
    if forma not in FORMAS_PAGO_TARJETA or factura.metodo_pago == "PPD":
        return None

    fecha = factura.fecha_emision.date() if factura.fecha_emision else date.today()
    mes, anio = fecha.month, fecha.year
    total = float(factura.total or 0)
    info_com = calcular_comision_bancaria(
        db, factura.empresa_id, forma, total, banco_id
    )
    comision = info_com["comision"]
    deposito = info_com["deposito_neto"]
    forma_label = etiqueta_forma_pago(forma)
    banco_nombre = info_com["nombre_banco"] or "Banco"
    pct = info_com["porcentaje"]

    numero = _ultimo_numero_poliza(db, factura.empresa_id, TipoPoliza.ingreso, mes, anio)
    poliza = Poliza(
        empresa_id=factura.empresa_id,
        factura_id=factura.id,
        tipo=TipoPoliza.ingreso,
        numero=numero,
        fecha=fecha,
        mes=mes,
        anio=anio,
        concepto=(
            f"Ingreso cobro | {forma_label} | {banco_nombre} | "
            f"Comisión {pct}% ${comision:,.2f}"
        ),
        total=total,
    )
    db.add(poliza)
    db.flush()

    movimientos = [
        MovimientoPoliza(
            poliza_id=poliza.id,
            cuenta=CUENTAS["bancos"],
            nombre_cuenta="Bancos (depósito neto)",
            debe=deposito,
            haber=0,
            concepto=f"Depósito por {forma_label}",
        ),
        MovimientoPoliza(
            poliza_id=poliza.id,
            cuenta=CUENTAS["comisiones_bancarias"],
            nombre_cuenta="Comisiones bancarias",
            debe=comision,
            haber=0,
            concepto=f"Comisión {banco_nombre} {pct}% + fija ${info_com['comision_fija']:,.2f}",
        ),
        MovimientoPoliza(
            poliza_id=poliza.id,
            cuenta=CUENTAS["cxc"],
            nombre_cuenta="Clientes",
            debe=0,
            haber=total,
            concepto="Cancelación de CxC por cobro con tarjeta",
        ),
    ]

    validar_partida_doble(movimientos)
    for mov in movimientos:
        db.add(mov)
    return poliza


# ─────────────────────────────────────────
# PÓLIZA DE EGRESOS (gastos + clasificación + impuestos)
# ─────────────────────────────────────────

def generar_poliza_egreso(factura: Factura, db: Session) -> Poliza:
    fecha = factura.fecha_emision.date() if factura.fecha_emision else date.today()
    mes, anio = fecha.month, fecha.year
    subtotal = Decimal(str(factura.subtotal or 0))
    iva = Decimal(str(factura.iva_trasladado or 0))
    total = Decimal(str(factura.total or 0))
    iva_ret = Decimal(str(factura.iva_retenido or 0))
    isr_ret = Decimal(str(factura.isr_retenido or 0))
    datos_xml = extraer_datos_xml(factura.xml_contenido)
    descripcion_gasto = datos_xml.get("concepto_principal") or factura.nombre_emisor

    if not factura.es_deducible:
        info_cuenta = {"cuenta": CUENTAS["gastos_no_ded"], "nombre": "Gastos no deducibles"}
    else:
        clave_sat = _clave_sat_desde_factura(factura)
        info_cuenta = obtener_cuenta_inteligente(
            db, factura.rfc_emisor, factura.empresa_id, clave_sat
        )

    numero = _ultimo_numero_poliza(db, factura.empresa_id, TipoPoliza.egreso, mes, anio)
    poliza = Poliza(
        empresa_id=factura.empresa_id,
        factura_id=factura.id,
        tipo=TipoPoliza.egreso,
        numero=numero,
        fecha=fecha,
        mes=mes,
        anio=anio,
        concepto=f"Egreso | {factura.nombre_emisor} | {info_cuenta['nombre']}",
        total=float(total),
    )
    db.add(poliza)
    db.flush()

    abono_proveedor = total - isr_ret - iva_ret
    movimientos = [
        MovimientoPoliza(
            poliza_id=poliza.id,
            cuenta=info_cuenta["cuenta"],
            nombre_cuenta=info_cuenta["nombre"],
            debe=subtotal,
            haber=0,
            concepto=descripcion_gasto,
        ),
        MovimientoPoliza(
            poliza_id=poliza.id,
            cuenta=CUENTAS["cxp"],
            nombre_cuenta="Proveedores",
            debe=0,
            haber=abono_proveedor,
            concepto=f"Pago a {factura.nombre_emisor}",
        ),
    ]

    if iva > 0:
        es_ppd = factura.metodo_pago == "PPD"
        cuenta_iva = (
            CUENTAS["iva_pendiente_acreditar"] if es_ppd else CUENTAS["iva_acreditable"]
        )
        nombre_iva = "IVA pendiente de acreditar" if es_ppd else "IVA acreditable"
        movimientos.append(
            MovimientoPoliza(
                poliza_id=poliza.id,
                cuenta=cuenta_iva,
                nombre_cuenta=nombre_iva,
                debe=iva,
                haber=0,
                concepto="IVA acreditable 16%",
            )
        )

    if isr_ret > 0:
        movimientos.append(
            MovimientoPoliza(
                poliza_id=poliza.id,
                cuenta=CUENTAS["isr_retenido_cxp"],
                nombre_cuenta="ISR retenido por pagar",
                debe=0,
                haber=isr_ret,
                concepto="Retención ISR",
            )
        )

    if iva_ret > 0:
        movimientos.append(
            MovimientoPoliza(
                poliza_id=poliza.id,
                cuenta=CUENTAS["iva_retenido"],
                nombre_cuenta="IVA retenido",
                debe=0,
                haber=iva_ret,
                concepto="Retención IVA",
            )
        )

    validar_partida_doble(movimientos)
    for mov in movimientos:
        db.add(mov)
    return poliza


def generar_poliza_diario(
    empresa_id: int, fecha: date, concepto: str, movimientos: list[dict], db: Session
) -> Poliza:
    obj_movs = [
        MovimientoPoliza(debe=m.get("debe", 0), haber=m.get("haber", 0))
        for m in movimientos
    ]
    validar_partida_doble(obj_movs)

    mes, anio = fecha.month, fecha.year
    numero = _ultimo_numero_poliza(db, empresa_id, TipoPoliza.diario, mes, anio)

    poliza = Poliza(
        empresa_id=empresa_id,
        factura_id=None,
        tipo=TipoPoliza.diario,
        numero=numero,
        fecha=fecha,
        concepto=concepto,
        total=sum(float(m.get("debe", 0)) for m in movimientos),
        mes=mes,
        anio=anio,
    )
    db.add(poliza)
    db.flush()

    for m in movimientos:
        db.add(
            MovimientoPoliza(
                poliza_id=poliza.id,
                cuenta=m.get("cuenta"),
                nombre_cuenta=m.get("nombre_cuenta", ""),
                debe=float(m.get("debe", 0)),
                haber=float(m.get("haber", 0)),
                concepto=m.get("concepto", concepto),
            )
        )
    return poliza


def generar_poliza_desde_factura(
    factura: Factura, db: Session, banco_id: int | None = None
) -> list[Poliza]:
    empresa = db.query(Empresa).filter(Empresa.id == factura.empresa_id).first()
    rfc_empresa = empresa.rfc if empresa else ""
    creadas: list[Poliza] = []

    if es_venta(factura, rfc_empresa):
        if not _tiene_poliza_tipo(db, factura.id, TipoPoliza.diario):
            creadas.append(generar_poliza_diario_venta(factura, db))
        # Verificar ANTES de crear: generar_poliza_ingreso_cobro hace db.flush()
        # internamente, por lo que llamarla cuando ya existe produce una póliza
        # duplicada silenciosa en la sesión que sería persistida en el commit.
        if not _tiene_poliza_tipo(db, factura.id, TipoPoliza.ingreso):
            ingreso = generar_poliza_ingreso_cobro(factura, db, banco_id)
            if ingreso:
                creadas.append(ingreso)
        return creadas

    if not _tiene_poliza_tipo(db, factura.id, TipoPoliza.egreso):
        creadas.append(generar_poliza_egreso(factura, db))
    return creadas


def _tiene_poliza_tipo(db: Session, factura_id: int, tipo: TipoPoliza) -> bool:
    return (
        db.query(Poliza)
        .filter(Poliza.factura_id == factura_id, Poliza.tipo == tipo)
        .first()
        is not None
    )


def factura_requiere_polizas(factura: Factura, db: Session, empresa_rfc: str) -> bool:
    """True si faltan pólizas por generar para esta factura."""
    if es_venta(factura, empresa_rfc):
        if not _tiene_poliza_tipo(db, factura.id, TipoPoliza.diario):
            return True
        forma = factura.forma_pago or ""
        if forma in FORMAS_PAGO_TARJETA and factura.metodo_pago != "PPD":
            if not _tiene_poliza_tipo(db, factura.id, TipoPoliza.ingreso):
                return True
        return False
    return not _tiene_poliza_tipo(db, factura.id, TipoPoliza.egreso)


def obtener_facturas_pendientes_poliza(
    db: Session,
    empresa_id: int,
    empresa_rfc: str,
    mes: int | None = None,
    anio: int | None = None,
) -> list[Factura]:
    from sqlalchemy import extract

    q = db.query(Factura).filter(Factura.empresa_id == empresa_id)
    if mes is not None and anio is not None:
        q = q.filter(
            extract("month", Factura.fecha_emision) == mes,
            extract("year", Factura.fecha_emision) == anio,
        )
    facturas = q.order_by(Factura.fecha_emision.asc()).all()
    return [f for f in facturas if factura_requiere_polizas(f, db, empresa_rfc)]


def generar_polizas_automaticas(
    db: Session,
    empresa_id: int,
    banco_id: int | None = None,
    mes: int | None = None,
    anio: int | None = None,
) -> dict:
    """
    Genera pólizas para todas las facturas pendientes.
    Ordena por fecha de emisión y numera por mes/año del CFDI.
    """
    from collections import defaultdict

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise ValueError("Empresa no encontrada")

    rfc = empresa.rfc or ""
    pendientes = obtener_facturas_pendientes_poliza(db, empresa_id, rfc, mes, anio)

    por_periodo: dict[tuple[int, int], list[Factura]] = defaultdict(list)
    for factura in pendientes:
        fecha = factura.fecha_emision.date() if factura.fecha_emision else date.today()
        por_periodo[(fecha.year, fecha.month)].append(factura)

    creadas_total: list[Poliza] = []
    errores: list[dict] = []
    resumen_por_mes: list[dict] = []

    for anio_p, mes_p in sorted(por_periodo.keys()):
        facturas_mes = sorted(
            por_periodo[(anio_p, mes_p)],
            key=lambda f: f.fecha_emision or date.min,
        )
        count_mes = 0
        for factura in facturas_mes:
            try:
                nuevas = generar_poliza_desde_factura(factura, db, banco_id)
                creadas_total.extend(nuevas)
                count_mes += len(nuevas)
            except (ValueError, UnbalancedVoucherException) as exc:
                errores.append({
                    "factura_id": factura.id,
                    "uuid": factura.uuid,
                    "mes": mes_p,
                    "anio": anio_p,
                    "error": str(exc),
                })
        resumen_por_mes.append({
            "mes": mes_p,
            "anio": anio_p,
            "facturas": len(facturas_mes),
            "polizas_generadas": count_mes,
        })

    return {
        "total_polizas": len(creadas_total),
        "facturas_procesadas": len(pendientes),
        "por_mes": resumen_por_mes,
        "errores": errores,
    }


def auto_generar_poliza_factura(
    factura: Factura, db: Session, banco_id: int | None = None
) -> list[Poliza]:
    """Genera pólizas al registrar un CFDI (no lanza si ya están completas)."""
    try:
        return generar_poliza_desde_factura(factura, db, banco_id)
    except (ValueError, UnbalancedVoucherException):
        return []


# ─────────────────────────────────────────
# VISTA ESTRUCTURADA PARA API / FRONTEND
# ─────────────────────────────────────────

def _info_comision_factura(db: Session | None, factura: Factura) -> dict:
    if not db or not factura:
        return {"comision": 0, "deposito_neto": 0, "nombre_banco": None, "porcentaje": 0}
    return calcular_comision_bancaria(
        db,
        factura.empresa_id,
        factura.forma_pago,
        float(factura.total or 0),
    )


def serializar_poliza(
    poliza: Poliza,
    factura: Factura | None,
    empresa_rfc: str,
    db: Session | None = None,
) -> dict:
    base = {
        "poliza_id": poliza.id,
        "tipo": poliza.tipo.value,
        "numero": poliza.numero,
        "fecha": str(poliza.fecha),
        "mes": poliza.mes,
        "anio": poliza.anio,
        "periodo": f"{poliza.anio}-{poliza.mes:02d}" if poliza.mes and poliza.anio else None,
        "concepto": poliza.concepto,
        "total": float(poliza.total),
        "factura_id": poliza.factura_id,
        "movimientos": [
            {
                "cuenta": m.cuenta,
                "nombre_cuenta": m.nombre_cuenta,
                "debe": float(m.debe),
                "haber": float(m.haber),
                "concepto": m.concepto,
            }
            for m in poliza.movimientos
        ],
    }

    if not factura:
        return base

    venta = es_venta(factura, empresa_rfc)
    info_com = _info_comision_factura(db, factura)
    comision = info_com["comision"] if (factura.forma_pago or "") in FORMAS_PAGO_TARJETA else 0

    base["cfdi"] = {
        "uuid": factura.uuid,
        "tipo_operacion": "VENTA" if venta else "GASTO",
    }
    base["forma_pago"] = {
        "codigo": factura.forma_pago,
        "etiqueta": etiqueta_forma_pago(factura.forma_pago),
        "metodo_pago": factura.metodo_pago,
    }
    base["desglose_impuestos"] = desglose_impuestos(factura)
    base["conceptos_vendidos"] = _conceptos_vendidos(factura)

    if poliza.tipo == TipoPoliza.diario or (venta and poliza.tipo == TipoPoliza.diario):
        base["diario"] = {
            "nombre": factura.nombre_receptor if venta else factura.nombre_emisor,
            "forma_pago": etiqueta_forma_pago(factura.forma_pago),
            "que_se_vendio": _conceptos_vendidos(factura),
            "desglose_impuestos": desglose_impuestos(factura),
        }

    if poliza.tipo == TipoPoliza.ingreso:
        base["ingreso"] = {
            "forma_pago": etiqueta_forma_pago(factura.forma_pago),
            "comision_bancaria": comision,
            "deposito_neto": info_com.get("deposito_neto", round(float(factura.total or 0) - comision, 2)),
            "porcentaje_comision": info_com.get("porcentaje", 0),
            "nombre_banco": info_com.get("nombre_banco"),
            "comision_fija": info_com.get("comision_fija", 0),
        }

    if poliza.tipo == TipoPoliza.egreso:
        cuenta_gasto = next(
            (m for m in poliza.movimientos if float(m.debe or 0) > 0 and "IVA" not in (m.nombre_cuenta or "")),
            None,
        )
        base["egreso"] = {
            "proveedor": factura.nombre_emisor,
            "rfc_proveedor": factura.rfc_emisor,
            "clasificacion_gasto": cuenta_gasto.nombre_cuenta if cuenta_gasto else "Sin clasificar",
            "cuenta_gasto": cuenta_gasto.cuenta if cuenta_gasto else None,
            "desglose_impuestos": desglose_impuestos(factura),
            "deducible": bool(factura.es_deducible),
        }

    return base


def preview_poliza_desde_factura(
    factura: Factura, empresa_rfc: str, db: Session | None = None
) -> dict:
    """Vista previa sin generar póliza en BD."""
    venta = es_venta(factura, empresa_rfc)
    info_com = _info_comision_factura(db, factura)
    comision = info_com["comision"] if (factura.forma_pago or "") in FORMAS_PAGO_TARJETA else 0
    fecha = factura.fecha_emision.date() if factura.fecha_emision else date.today()
    item = {
        "factura_id": factura.id,
        "uuid": factura.uuid,
        "fecha": str(factura.fecha_emision),
        "mes": fecha.month,
        "anio": fecha.year,
        "periodo": f"{fecha.year}-{fecha.month:02d}",
        "total": float(factura.total or 0),
        "tiene_poliza": bool(factura.polizas),
        "forma_pago": {
            "codigo": factura.forma_pago,
            "etiqueta": etiqueta_forma_pago(factura.forma_pago),
            "metodo_pago": factura.metodo_pago,
        },
        "desglose_impuestos": desglose_impuestos(factura),
        "conceptos_vendidos": _conceptos_vendidos(factura),
    }

    if venta:
        item["categoria"] = "diario"
        item["diario"] = {
            "nombre": factura.nombre_receptor,
            "forma_pago": etiqueta_forma_pago(factura.forma_pago),
            "que_se_vendio": _conceptos_vendidos(factura),
            "desglose_impuestos": desglose_impuestos(factura),
        }
        if (factura.forma_pago or "") in FORMAS_PAGO_TARJETA and factura.metodo_pago != "PPD":
            item["ingreso"] = {
                "forma_pago": etiqueta_forma_pago(factura.forma_pago),
                "comision_bancaria": comision,
                "deposito_neto": info_com.get("deposito_neto", round(float(factura.total or 0) - comision, 2)),
                "porcentaje_comision": info_com.get("porcentaje", 0),
                "nombre_banco": info_com.get("nombre_banco"),
            }
    else:
        item["categoria"] = "egreso"
        clave_sat = _clave_sat_desde_factura(factura)
        if db is not None:
            info_cuenta = obtener_cuenta_inteligente(
                db, factura.rfc_emisor or "", factura.empresa_id, clave_sat
            )
        else:
            from app.services.clasificador import obtener_cuenta_por_clave_sat  # noqa: PLC0415
            info_cuenta = obtener_cuenta_por_clave_sat(None, clave_sat)
        item["egreso"] = {
            "proveedor": factura.nombre_emisor,
            "rfc_proveedor": factura.rfc_emisor,
            "clasificacion_gasto": info_cuenta["nombre"],
            "cuenta_gasto": info_cuenta["cuenta"],
            "desglose_impuestos": desglose_impuestos(factura),
            "deducible": bool(factura.es_deducible),
        }

    return item
