"""Utilidades para leer CFDI y etiquetar campos de pólizas."""

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.factura import Factura
from app.services.sat_parser import parsear_xml_sat

FORMA_PAGO_LABELS = {
    "01": "Efectivo",
    "02": "Cheque nominativo",
    "03": "Transferencia electrónica",
    "04": "Tarjeta de crédito",
    "05": "Monedero electrónico",
    "06": "Dinero electrónico",
    "08": "Vales de despensa",
    "12": "Dación en pago",
    "13": "Pago en especie",
    "14": "Condonación",
    "15": "Compensación",
    "17": "Novación",
    "23": "Novación",
    "24": "Confusión",
    "25": "Remisión de deuda",
    "26": "Prescripción / caducidad",
    "27": "A satisfacción del acreedor",
    "28": "Tarjeta de débito",
    "29": "Tarjeta de servicios",
    "30": "Aplicación de anticipos",
    "31": "Intermediario pagos",
    "99": "Por definir",
}

FORMAS_PAGO_TARJETA = {"04", "28", "29"}
COMISION_TARJETA_PCT = 0.025


def etiqueta_forma_pago(codigo: str | None) -> str:
    if not codigo:
        return "No especificada"
    return FORMA_PAGO_LABELS.get(codigo, f"Código {codigo}")


def extraer_datos_xml(xml_contenido: str | None) -> dict:
    if not xml_contenido:
        return {"conceptos": [], "concepto_principal": ""}
    try:
        return parsear_xml_sat(xml_contenido)
    except (ValueError, TypeError):
        return {"conceptos": [], "concepto_principal": ""}


def normalizar_rfc(rfc: str | None) -> str:
    return (rfc or "").strip().upper()


def normalizar_uuid(uuid: str | None) -> str:
    return (uuid or "").strip().upper()


def es_venta(factura, empresa_rfc: str) -> bool:
    return normalizar_rfc(factura.rfc_emisor) == normalizar_rfc(empresa_rfc)


def cfdi_pertenece_a_empresa(datos: dict, empresa_rfc: str) -> bool:
    """True si la empresa es emisor (venta) o receptor (compra) del CFDI."""
    rfc_empresa = normalizar_rfc(empresa_rfc)
    if not rfc_empresa:
        return False
    rfc_emisor = normalizar_rfc(datos.get("rfc_emisor"))
    rfc_receptor = normalizar_rfc(datos.get("rfc_receptor"))
    return rfc_emisor == rfc_empresa or rfc_receptor == rfc_empresa


def validar_cfdi_empresa(datos: dict, empresa_rfc: str, razon_social: str | None = None) -> None:
    """
    Rechaza CFDI que no correspondan a la empresa activa.
    Ventas: RFC empresa = emisor. Compras: RFC empresa = receptor.
    """
    rfc_empresa = normalizar_rfc(empresa_rfc)
    if not rfc_empresa or len(rfc_empresa) < 12:
        raise ValueError("La empresa no tiene un RFC válido registrado.")

    if cfdi_pertenece_a_empresa(datos, rfc_empresa):
        return

    rfc_emisor = normalizar_rfc(datos.get("rfc_emisor")) or "—"
    rfc_receptor = normalizar_rfc(datos.get("rfc_receptor")) or "—"
    nombre = (razon_social or "esta empresa").strip()
    raise ValueError(
        f"El CFDI no pertenece a {nombre}. "
        f"RFC de la empresa: {rfc_empresa}. "
        f"En el XML — Emisor: {rfc_emisor}, Receptor: {rfc_receptor}. "
        f"Debe coincidir el RFC de la empresa como emisor en ventas o como receptor en gastos."
    )


def factura_uuid_registrada(
    db: Session,
    empresa_id: int,
    uuid_norm: str,
) -> bool:
    """True si el UUID ya existe en BD o en facturas pendientes de la misma sesión."""
    if db.query(Factura.id).filter(
        Factura.empresa_id == empresa_id,
        or_(Factura.uuid == uuid_norm, func.upper(Factura.uuid) == uuid_norm),
    ).first():
        return True

    for obj in db.new:
        if (
            isinstance(obj, Factura)
            and obj.empresa_id == empresa_id
            and normalizar_uuid(obj.uuid) == uuid_norm
        ):
            return True

    return False


def validar_factura_no_duplicada(
    db: Session,
    empresa_id: int,
    uuid: str | None,
    *,
    uuids_en_lote: set[str] | None = None,
) -> str:
    """
    Valida UUID y que la factura no esté duplicada en la empresa ni en el mismo ZIP.
    Devuelve el UUID normalizado para guardar.
    """
    uuid_norm = normalizar_uuid(uuid)
    if not uuid_norm:
        raise ValueError("El XML no contiene UUID del timbre fiscal (TimbreFiscalDigital).")

    if uuids_en_lote is not None and uuid_norm in uuids_en_lote:
        raise ValueError(
            f"Factura repetida en este archivo: el UUID {uuid_norm} ya se procesó en el ZIP."
        )

    if factura_uuid_registrada(db, empresa_id, uuid_norm):
        raise ValueError(
            f"Esta factura ya está registrada en la empresa (UUID: {uuid_norm})."
        )

    return uuid_norm


def marcar_uuid_en_lote(uuids_en_lote: set[str] | None, uuid_norm: str) -> None:
    if uuids_en_lote is not None:
        uuids_en_lote.add(uuid_norm)


def calcular_comision_tarjeta(total: float) -> float:
    return round(total * COMISION_TARJETA_PCT, 2)


def desglose_impuestos(factura) -> list[dict]:
    items = []
    subtotal = float(factura.subtotal or 0)
    if subtotal:
        items.append({"concepto": "Subtotal", "importe": subtotal})
    iva = float(factura.iva_trasladado or 0)
    if iva:
        items.append({"concepto": "IVA trasladado (16%)", "importe": iva})
    iva_ret = float(factura.iva_retenido or 0)
    if iva_ret:
        items.append({"concepto": "IVA retenido", "importe": -iva_ret})
    isr_ret = float(factura.isr_retenido or 0)
    if isr_ret:
        items.append({"concepto": "ISR retenido", "importe": -isr_ret})
    ish = float(factura.impuestos_locales or 0)
    if ish:
        items.append({"concepto": "Impuestos locales (ISH)", "importe": ish})
    desc = float(factura.descuento or 0)
    if desc:
        items.append({"concepto": "Descuento", "importe": -desc})
    items.append({"concepto": "Total", "importe": float(factura.total or 0)})
    return items
