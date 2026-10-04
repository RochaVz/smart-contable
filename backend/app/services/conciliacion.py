from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import csv
import hashlib
import io
import re
import xml.etree.ElementTree as ET

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.models.conciliacion import MovimientoBanco
from app.models.poliza import MovimientoPoliza, Poliza, TipoPoliza
from app.core.logging_config import get_logger
from app.services.bank_parser.factory import BankParserFactory

logger = get_logger(__name__)


@dataclass
class MovimientoEstadoCuenta:
    fecha: datetime
    tipo: str
    descripcion: str
    referencia: str | None
    monto: Decimal
    saldo: Decimal | None = None


FECHA_KEYS = {"fecha", "fechaoperacion", "fechaoperación", "date", "fechamovimiento"}
DESC_KEYS = {"descripcion", "descripción", "concepto", "detalle", "description", "memo"}
REF_KEYS = {"referencia", "ref", "folio", "autorizacion", "autorización", "id"}
ABONO_KEYS = {"abono", "deposito", "depósito", "credito", "crédito", "credit", "ingreso"}
CARGO_KEYS = {"cargo", "retiro", "debito", "débito", "debit", "egreso"}
MONTO_KEYS = {"monto", "importe", "amount", "valor"}
SALDO_KEYS = {"saldo", "balance"}


def _clean_key(key: str) -> str:
    return key.split("}")[-1].strip().lower().replace("_", "").replace("-", "")


def _to_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None
    cleaned = re.sub(r"[^0-9.\-]", "", str(value).replace(",", ""))
    if cleaned in {"", "-", "."}:
        return None
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except Exception:
        return None


def _to_date(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    match = re.search(r"(\d{4})[-/](\d{2})[-/](\d{2})", text)
    if match:
        return datetime(int(match.group(1)), int(match.group(2)), int(match.group(3)))
    match = re.search(r"(\d{2})[-/](\d{2})[-/](\d{4})", text)
    if match:
        return datetime(int(match.group(3)), int(match.group(2)), int(match.group(1)))
    return None


def _node_data(node: ET.Element) -> dict[str, str]:
    data = {}
    for key, value in node.attrib.items():
        if value:
            data[_clean_key(key)] = value.strip()
    for child in list(node):
        text = (child.text or "").strip()
        if text:
            data[_clean_key(child.tag)] = text
        for key, value in child.attrib.items():
            if value:
                data[_clean_key(key)] = value.strip()
    return data


def _pick(data: dict[str, str], keys: set[str]) -> str | None:
    normalized = {_clean_key(k) for k in keys}
    for key, value in data.items():
        if key in normalized:
            return value
    return None


def _movimiento_desde_data(data: dict[str, str]) -> MovimientoEstadoCuenta | None:
    fecha = _to_date(_pick(data, FECHA_KEYS))
    if not fecha:
        return None

    abono = _to_decimal(_pick(data, ABONO_KEYS))
    cargo = _to_decimal(_pick(data, CARGO_KEYS))
    monto = _to_decimal(_pick(data, MONTO_KEYS))
    descripcion = _pick(data, DESC_KEYS) or "Movimiento bancario"
    referencia = _pick(data, REF_KEYS)
    saldo = _to_decimal(_pick(data, SALDO_KEYS))

    if abono and abono > 0:
        tipo, importe = "abono", abono
    elif cargo and cargo > 0:
        tipo, importe = "cargo", cargo
    elif monto is not None and monto != 0:
        tipo, importe = ("cargo", abs(monto)) if monto < 0 else ("abono", monto)
    else:
        return None

    return MovimientoEstadoCuenta(
        fecha=fecha,
        tipo=tipo,
        descripcion=descripcion,
        referencia=referencia,
        monto=importe,
        saldo=saldo,
    )


def parsear_estado_cuenta_xml(xml_bytes: bytes) -> list[MovimientoEstadoCuenta]:
    root = ET.fromstring(xml_bytes)
    movimientos: list[MovimientoEstadoCuenta] = []
    vistos = set()

    for node in root.iter():
        atributos_nodo = {_clean_key(key) for key in node.attrib}
        campos_hijos_directos = {_clean_key(child.tag) for child in node}
        es_nodo_movimiento = (
            _clean_key(node.tag) in {"movimiento", "transaction", "operacion", "registro"}
            or bool(atributos_nodo & FECHA_KEYS)
            or bool(campos_hijos_directos & FECHA_KEYS)
        )
        if not es_nodo_movimiento:
            continue

        data = _node_data(node)
        movimiento = _movimiento_desde_data(data)
        if not movimiento:
            continue

        key = (
            movimiento.fecha.date().isoformat(),
            movimiento.tipo,
            str(movimiento.monto),
            movimiento.referencia or "",
            movimiento.descripcion,
        )
        if key in vistos:
            continue
        vistos.add(key)
        movimientos.append(movimiento)

    return sorted(movimientos, key=lambda m: (m.fecha, m.tipo, m.monto))


def parsear_estado_cuenta_pdf(pdf_bytes: bytes) -> list[MovimientoEstadoCuenta]:
    """
    Extrae y analiza un estado de cuenta PDF con parsers locales.

    La IA no es obligatoria para procesar el documento: el parser local evita
    que una clave de pago ausente convierta una carga válida en un fallo total.
    """
    texto_completo = _extraer_texto_pdf(pdf_bytes)

    if not texto_completo.strip():
        raise ValueError("El archivo PDF no contiene texto legible (puede estar escaneado o protegido).")

    parser = BankParserFactory().get_parser(texto_completo)
    extraido = parser.parse(texto_completo)
    if not extraido.movimientos:
        raise ValueError("No se encontraron movimientos bancarios en el PDF")

    movimientos: list[MovimientoEstadoCuenta] = []
    vistos = set()

    for movimiento in extraido.movimientos:
        if movimiento.confianza < 0.80:
            logger.warning(
                "Movimiento PDF con confianza baja: fecha=%s descripcion=%s confianza=%.2f",
                movimiento.fecha,
                movimiento.descripcion,
                movimiento.confianza,
            )

        fecha_obj = _to_date(movimiento.fecha)
        if not fecha_obj:
            continue

        tipo_norm = "abono" if movimiento.abono > 0 else "cargo"
        monto = movimiento.abono if movimiento.abono > 0 else movimiento.cargo
        if monto <= 0:
            continue

        saldo_dec = Decimal(str(movimiento.saldo)).quantize(Decimal("0.01")) if movimiento.saldo is not None else None
        mov = MovimientoEstadoCuenta(
            fecha=fecha_obj,
            tipo=tipo_norm,
            descripcion=movimiento.descripcion,
            referencia=movimiento.referencia or "",
            monto=Decimal(str(monto)).quantize(Decimal("0.01")),
            saldo=saldo_dec,
        )

        key = (
            mov.fecha.date().isoformat(),
            mov.tipo,
            str(mov.monto),
            mov.referencia or "",
            mov.descripcion,
        )
        if key in vistos:
            continue
        vistos.add(key)
        movimientos.append(mov)

    return movimientos


def _extraer_texto_pdf(pdf_bytes: bytes) -> str:
    """Extrae texto con fallbacks locales para no depender de un proveedor IA."""
    try:
        import pdfplumber

        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            return "\n".join(
                extracted
                for page in pdf.pages
                if (extracted := page.extract_text())
            )
    except ImportError:
        logger.info("pdfplumber no está disponible; intentando PyPDF2")
    except Exception as exc:
        logger.warning("pdfplumber no pudo extraer el PDF: %s", exc)

    try:
        from PyPDF2 import PdfReader

        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except ImportError:
        logger.info("PyPDF2 no está disponible; intentando pdfminer")
    except Exception as exc:
        logger.warning("PyPDF2 no pudo extraer el PDF: %s", exc)

    try:
        from pdfminer.high_level import extract_text

        return extract_text(io.BytesIO(pdf_bytes))
    except ImportError as exc:
        raise RuntimeError(
            "No hay un extractor PDF instalado. Instala pdfplumber, PyPDF2 o pdfminer.six."
        ) from exc
    except Exception as exc:
        raise ValueError(f"Error al abrir o leer las páginas del PDF: {exc}") from exc

    return sorted(movimientos, key=lambda m: (m.fecha, m.tipo, m.monto))


def parsear_estado_cuenta_csv(csv_bytes: bytes) -> list[MovimientoEstadoCuenta]:
    """Parsea un CSV de estado de cuenta. Se espera que el CSV tenga una fila de cabecera
    con nombres como fecha, descripcion, monto, abono, cargo, referencia, saldo, etc.
    El parser intentará mapear columnas usando las mismas claves que el parser XML.
    """
    text = csv_bytes.decode("utf-8", errors="replace")
    first_line = text.splitlines()[0] if text.splitlines() else ""
    delimiter = '\t' if '\t' in first_line else ','
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    movimientos: list[MovimientoEstadoCuenta] = []
    vistos = set()

    for row in reader:
        data = {}
        for k, v in row.items():
            if k is None:
                continue
            key = k.strip().lower()
            data[key] = (v.strip() if v is not None else "")

        movimiento = _movimiento_desde_data(data)
        if not movimiento:
            continue

        key = (
            movimiento.fecha.date().isoformat(),
            movimiento.tipo,
            str(movimiento.monto),
            movimiento.referencia or "",
            movimiento.descripcion,
        )
        if key in vistos:
            continue
        vistos.add(key)
        movimientos.append(movimiento)

    return sorted(movimientos, key=lambda m: (m.fecha, m.tipo, m.monto))


def hash_archivo(xml_bytes: bytes) -> str:
    return hashlib.sha256(xml_bytes).hexdigest()


def hash_movimiento(empresa_id: int, mov) -> str:
    fecha = mov.fecha
    fecha_str = fecha.date().isoformat() if hasattr(fecha, "date") else fecha.isoformat()
    raw = "|".join([
        str(empresa_id),
        fecha_str,
        mov.tipo,
        str(mov.monto),
        mov.referencia or "",
        mov.descripcion or "",
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _fecha_date(fecha) -> "date":
    from datetime import date
    return fecha.date() if hasattr(fecha, "date") else fecha


# Prefijos de cuentas bancarias y de pago reconocidas
_CUENTAS_BANCO = ("102", "105")
_CUENTAS_PAGO = ("201",)

# Patrones de descripción que identifican comisiones/IVA bancarios
# ya contabilizados dentro de la póliza de ingreso correspondiente
_PATRONES_COMISION = (
    "APLI TASA DE DES",
    "IVA TASA DE DESC",
    "COM. VTA. NAL.",
    "IVA COM. VTA.",
    "COM VTA",
    "IVA COM VTA",
    "COMISION BANCARIA",
    "IVA COMISION",
)

TOLERANCIA_CONCILIACION_CENTAVOS = 0.05


def _es_comision_bancaria(descripcion: str) -> bool:
    """True si el movimiento es una comisión/IVA bancario ya incluido en póliza de ingreso."""
    desc = (descripcion or "").upper()
    return any(patron in desc for patron in _PATRONES_COMISION)


def _montos_coinciden(monto_poliza: float, monto_banco: float, tolerancia: float) -> bool:
    diferencia = round(abs(monto_poliza - monto_banco), 2)
    return diferencia <= round(tolerancia, 2)


def _monto_banco_poliza(poliza: Poliza) -> float:
    """Extrae el monto bancario de la póliza.
    - Ingreso: usa el depósito neto registrado en Bancos; la comisión se separa.
    - Egreso: suma haber de cuentas 102/105; si no hay, suma haber de cuentas 201.
    - Diario: toma el mayor movimiento neto en cuentas bancarias.
    """
    if poliza.tipo == TipoPoliza.ingreso:
        movs_banco = [
            m for m in poliza.movimientos
            if (m.cuenta or "").startswith(_CUENTAS_BANCO) and float(m.debe or 0) > 0
        ]
        if movs_banco:
            return round(sum(float(m.debe or 0) for m in movs_banco), 2)
        return round(float(poliza.total or 0), 2)

    movs_banco = [m for m in poliza.movimientos if (m.cuenta or "").startswith(_CUENTAS_BANCO)]
    if movs_banco:
        if poliza.tipo == TipoPoliza.diario:
            debe = sum(float(m.debe or 0) for m in movs_banco)
            haber = sum(float(m.haber or 0) for m in movs_banco)
            return round(max(debe, haber), 2)
        return round(sum(float(m.haber or 0) for m in movs_banco), 2)

    # fallback: cuenta de proveedores/pago
    movs_pago = [m for m in poliza.movimientos if (m.cuenta or "").startswith(_CUENTAS_PAGO)]
    if movs_pago:
        return round(sum(float(m.haber or 0) for m in movs_pago), 2)
    return round(float(poliza.total or 0), 2)


def _montos_conciliables_poliza(poliza: Poliza) -> list[float]:
    monto = _monto_banco_poliza(poliza)
    montos = [monto]
    if poliza.tipo == TipoPoliza.ingreso:
        total_bruto = round(float(poliza.total or 0), 2)
        if total_bruto > 0 and total_bruto != monto:
            montos.append(total_bruto)
    return montos


def _tipo_banco_de_poliza(poliza: Poliza) -> str:
    """Infiere si la póliza mueve banco como abono o cargo."""
    if poliza.tipo == TipoPoliza.ingreso:
        return "abono"
    if poliza.tipo == TipoPoliza.egreso:
        return "cargo"
    # diario: mira el asiento en cuentas bancarias
    debe_banco = sum(
        float(m.debe or 0)
        for m in poliza.movimientos
        if (m.cuenta or "").startswith(_CUENTAS_BANCO)
    )
    haber_banco = sum(
        float(m.haber or 0)
        for m in poliza.movimientos
        if (m.cuenta or "").startswith(_CUENTAS_BANCO)
    )
    if debe_banco > haber_banco:
        return "abono"
    return "cargo"


def _polizas_conciliables(db: Session, empresa_id: int, mes: int, anio: int) -> list[dict]:
    polizas = (
        db.query(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            Poliza.tipo.in_([TipoPoliza.ingreso, TipoPoliza.egreso, TipoPoliza.diario]),
        )
        .order_by(Poliza.fecha.asc(), Poliza.numero.asc())
        .all()
    )
    resultado = []
    for p in polizas:
        tipo_banco = _tipo_banco_de_poliza(p)
        monto = _monto_banco_poliza(p)
        montos_conciliables = _montos_conciliables_poliza(p)
        logger.debug("Poliza %s tipo=%s monto=%s", p.id, p.tipo.value, monto)
        if monto <= 0:
            continue
        resultado.append({
            "poliza_id": p.id,
            "tipo": p.tipo.value,
            "tipo_banco": tipo_banco,
            "numero": p.numero,
            "fecha": str(_fecha_date(p.fecha)),
            "concepto": p.concepto or "",
            "canal_cobro": _canal_cobro_poliza(p.concepto or ""),
            "monto": monto,
            "montos_conciliables": montos_conciliables,
        })
    return resultado


def _concepto_similar(concepto_banco: str, concepto_poliza: str) -> bool:
    """Verifica si dos conceptos comparten al menos una palabra significativa (>=4 chars)."""
    if not concepto_banco or not concepto_poliza:
        return True
    palabras_banco = {w.upper() for w in re.split(r"\W+", concepto_banco) if len(w) >= 4}
    palabras_poliza = {w.upper() for w in re.split(r"\W+", concepto_poliza) if len(w) >= 4}
    return bool(palabras_banco & palabras_poliza)


def _canal_cobro_poliza(concepto: str) -> str | None:
    texto = (concepto or "").upper()
    if any(etiqueta in texto for etiqueta in ("TARJETA DE CRÉDITO", "TARJETA DE DEBITO", "TARJETA DE DÉBITO", "TARJETA DE SERVICIOS")):
        return "tarjeta"
    if "TRANSFERENCIA" in texto:
        return "transferencia"
    return None


def _canal_movimiento_banco(descripcion: str) -> str | None:
    texto = (descripcion or "").upper()
    if any(etiqueta in texto for etiqueta in ("VENTAS DEBITO", "VENTAS CREDITO", "TERMINALES PUNTO DE VENTA", "TPV", "TARJETA")):
        return "tarjeta"
    if any(etiqueta in texto for etiqueta in ("SPEI", "CUENTA DE TERCEROS", "TRANSFERENCIA")):
        return "transferencia"
    return None


def _canal_cobro_compatible(movimiento_banco: MovimientoBanco, poliza: dict) -> bool:
    canal_banco = _canal_movimiento_banco(movimiento_banco.descripcion or "")
    canal_poliza = poliza.get("canal_cobro")
    return not canal_banco or not canal_poliza or canal_banco == canal_poliza


_PATRONES_AJUSTE_DIARIO = (
    "AJUSTE",
    "RECLASIFIC",
    "CORRECCION",
    "CORRECCIÓN",
    "TRASPASO",
    "TRASFERENCIA ENTRE CUENTAS",
    "TRANSFERENCIA ENTRE CUENTAS",
    "COMPENSACION",
    "COMPENSACIÓN",
    "CANCELACION CONTABLE",
    "CANCELACIÓN CONTABLE",
    "ASIENTO",
    "DIARIO",
)

_CUENTAS_DEFAULT = {
    "ingreso": ("401.01.01", "Ingresos por ventas"),
    "egreso": ("601.01.01", "Gastos generales"),
    "diario": ("601.84.01", "Ajustes contables"),
}


def clasificar_tipo_poliza_movimiento(movimiento: MovimientoBanco) -> str:
    """Reglas de asignación automática: depósitos→ingreso, pagos→egreso, ajustes→diario."""
    descripcion = (movimiento.descripcion or "").upper()
    if any(patron in descripcion for patron in _PATRONES_AJUSTE_DIARIO):
        return TipoPoliza.diario.value
    if movimiento.tipo == "abono":
        return TipoPoliza.ingreso.value
    return TipoPoliza.egreso.value


def _ahora_utc():
    from datetime import timezone
    return datetime.now(timezone.utc)


def vincular_movimiento_poliza(
    movimiento: MovimientoBanco,
    poliza: Poliza | dict,
    modo: str,
    tipo_asignacion: str | None = None,
) -> None:
    """Persiste el vínculo de conciliación en el movimiento bancario."""
    poliza_id = poliza["poliza_id"] if isinstance(poliza, dict) else poliza.id
    tipo = tipo_asignacion
    if tipo is None:
        if isinstance(poliza, dict):
            tipo = poliza.get("tipo")
        else:
            tipo = poliza.tipo.value if hasattr(poliza.tipo, "value") else str(poliza.tipo)

    movimiento.poliza_id = poliza_id
    movimiento.modo_conciliacion = modo
    movimiento.tipo_asignacion = tipo
    movimiento.conciliado_en = _ahora_utc()


def _serializar_poliza_obj(poliza: Poliza) -> dict:
    tipo_banco = _tipo_banco_de_poliza(poliza)
    monto = _monto_banco_poliza(poliza)
    return {
        "poliza_id": poliza.id,
        "tipo": poliza.tipo.value if hasattr(poliza.tipo, "value") else str(poliza.tipo),
        "tipo_banco": tipo_banco,
        "numero": poliza.numero,
        "fecha": str(_fecha_date(poliza.fecha)),
        "concepto": poliza.concepto or "",
        "canal_cobro": _canal_cobro_poliza(poliza.concepto or ""),
        "monto": monto,
        "montos_conciliables": [monto],
    }


def conciliar_periodo(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
    tolerancia: float = TOLERANCIA_CONCILIACION_CENTAVOS,
    banco_id: int | None = None,
    persistir_matches: bool = True,
) -> dict:
    query = db.query(MovimientoBanco).filter(
        MovimientoBanco.empresa_id == empresa_id,
        extract("month", MovimientoBanco.fecha) == mes,
        extract("year", MovimientoBanco.fecha) == anio,
    )
    if banco_id:
        query = query.filter(MovimientoBanco.banco_id == banco_id)
    movimientos_banco = query.order_by(MovimientoBanco.fecha.asc()).all()

    polizas = _polizas_conciliables(db, empresa_id, mes, anio)
    polizas_disponibles = polizas.copy()
    polizas_por_id = {p["poliza_id"]: p for p in polizas}

    conciliados = []
    banco_sin_poliza = []
    comisiones_en_poliza = []
    matches_nuevos = 0

    for mov in movimientos_banco:
        if mov.tipo == "cargo" and _es_comision_bancaria(mov.descripcion or ""):
            comisiones_en_poliza.append(_serializar_movimiento(mov))
            continue

        if mov.poliza_id:
            poliza_info = polizas_por_id.get(mov.poliza_id)
            if poliza_info is None:
                poliza_obj = db.query(Poliza).filter(Poliza.id == mov.poliza_id).first()
                if poliza_obj:
                    poliza_info = _serializar_poliza_obj(poliza_obj)
            if poliza_info:
                polizas_disponibles = [
                    p for p in polizas_disponibles if p["poliza_id"] != poliza_info["poliza_id"]
                ]
                try:
                    diff = abs(
                        (_fecha_date(mov.fecha) - datetime.fromisoformat(poliza_info["fecha"]).date()).days
                    )
                except Exception:
                    diff = 0
                conciliados.append({
                    "movimiento_banco": _serializar_movimiento(mov),
                    "poliza": poliza_info,
                    "diferencia_dias": diff,
                    "modo_conciliacion": mov.modo_conciliacion or "manual",
                })
                continue

        monto_mov = round(float(mov.monto or 0), 2)

        candidatas = [
            p for p in polizas_disponibles
            if p["tipo_banco"] == mov.tipo
            and _canal_cobro_compatible(mov, p)
            and any(
                _montos_coinciden(monto_poliza, monto_mov, tolerancia)
                for monto_poliza in p["montos_conciliables"]
            )
            and _concepto_similar(mov.descripcion or "", p["concepto"])
        ]

        if not candidatas:
            candidatas = [
                p for p in polizas_disponibles
                if p["tipo_banco"] == mov.tipo
                and _canal_cobro_compatible(mov, p)
                and any(
                    _montos_coinciden(monto_poliza, monto_mov, tolerancia)
                    for monto_poliza in p["montos_conciliables"]
                )
            ]

        def _diff_dias(p: dict) -> int:
            try:
                return abs((_fecha_date(mov.fecha) - datetime.fromisoformat(p["fecha"]).date()).days)
            except Exception:
                return 9999

        candidatas.sort(key=_diff_dias)

        if candidatas:
            poliza = candidatas[0]
            polizas_disponibles = [
                p for p in polizas_disponibles if p["poliza_id"] != poliza["poliza_id"]
            ]
            if persistir_matches and not mov.poliza_id:
                vincular_movimiento_poliza(mov, poliza, modo="automatico")
                matches_nuevos += 1
            conciliados.append({
                "movimiento_banco": _serializar_movimiento(mov),
                "poliza": poliza,
                "diferencia_dias": _diff_dias(poliza),
                "modo_conciliacion": mov.modo_conciliacion or "automatico",
            })
        else:
            banco_sin_poliza.append(_serializar_movimiento(mov))

    if persistir_matches and matches_nuevos:
        db.commit()

    total_cargos_banco = round(sum(float(m.monto or 0) for m in movimientos_banco if m.tipo == "cargo"), 2)
    total_abonos_banco = round(sum(float(m.monto or 0) for m in movimientos_banco if m.tipo == "abono"), 2)
    total_cargos_polizas = round(sum(p["monto"] for p in polizas if p["tipo_banco"] == "cargo"), 2)
    total_abonos_polizas = round(sum(p["monto"] for p in polizas if p["tipo_banco"] == "abono"), 2)

    total_banco = round(total_cargos_banco + total_abonos_banco, 2)
    total_polizas = round(total_cargos_polizas + total_abonos_polizas, 2)
    total_conciliado = round(sum(float(c["movimiento_banco"]["monto"]) for c in conciliados), 2)
    total_comisiones = round(sum(float(m["monto"]) for m in comisiones_en_poliza), 2)
    auto_count = sum(1 for c in conciliados if c.get("modo_conciliacion") == "automatico")
    manual_count = sum(1 for c in conciliados if c.get("modo_conciliacion") == "manual")

    return {
        "resumen": {
            "movimientos_banco": len(movimientos_banco),
            "polizas": len(polizas),
            "conciliados": len(conciliados),
            "conciliados_automatico": auto_count,
            "conciliados_manual": manual_count,
            "banco_sin_poliza": len(banco_sin_poliza),
            "polizas_sin_banco": len(polizas_disponibles),
            "comisiones_en_poliza": len(comisiones_en_poliza),
            "total_banco": total_banco,
            "total_polizas": total_polizas,
            "total_conciliado": total_conciliado,
            "total_comisiones": total_comisiones,
            "total_cargos_banco": total_cargos_banco,
            "total_abonos_banco": total_abonos_banco,
            "total_cargos_polizas": total_cargos_polizas,
            "total_abonos_polizas": total_abonos_polizas,
            "diferencia_cargos": round(total_cargos_banco - total_cargos_polizas, 2),
            "diferencia_abonos": round(total_abonos_banco - total_abonos_polizas, 2),
            "cuadre_cargos": total_cargos_banco == total_cargos_polizas,
            "cuadre_abonos": total_abonos_banco == total_abonos_polizas,
        },
        "conciliados": conciliados,
        "banco_sin_poliza": banco_sin_poliza,
        "polizas_sin_banco": polizas_disponibles,
        "comisiones_en_poliza": comisiones_en_poliza,
    }


def auto_conciliar_sin_poliza(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
    tolerancia: float = TOLERANCIA_CONCILIACION_CENTAVOS,
    banco_id: int | None = None,
) -> dict:
    """Empareja pólizas existentes y crea pólizas para movimientos aún sin vínculo."""
    from app.services.polizas import generar_poliza_movimiento_banco

    base = conciliar_periodo(
        db, empresa_id, mes, anio, tolerancia, banco_id, persistir_matches=True
    )

    creadas = 0
    errores: list[dict] = []

    query = db.query(MovimientoBanco).filter(
        MovimientoBanco.empresa_id == empresa_id,
        extract("month", MovimientoBanco.fecha) == mes,
        extract("year", MovimientoBanco.fecha) == anio,
        MovimientoBanco.poliza_id.is_(None),
    )
    if banco_id:
        query = query.filter(MovimientoBanco.banco_id == banco_id)

    pendientes = query.order_by(MovimientoBanco.fecha.asc()).all()
    for mov in pendientes:
        if mov.tipo == "cargo" and _es_comision_bancaria(mov.descripcion or ""):
            continue
        tipo_str = clasificar_tipo_poliza_movimiento(mov)
        cuenta, nombre = _CUENTAS_DEFAULT[tipo_str]
        try:
            poliza = generar_poliza_movimiento_banco(
                movimiento=mov,
                cuenta_contrapartida=cuenta,
                nombre_contrapartida=nombre,
                concepto=mov.descripcion or f"Conciliación automática ({tipo_str})",
                db=db,
                tipo=TipoPoliza(tipo_str),
            )
            vincular_movimiento_poliza(mov, poliza, modo="automatico", tipo_asignacion=tipo_str)
            creadas += 1
        except Exception as exc:  # noqa: BLE001
            logger.warning("No se pudo auto-conciliar movimiento %s: %s", mov.id, exc)
            errores.append({"movimiento_id": mov.id, "error": str(exc)})

    if creadas:
        db.commit()

    resultado = conciliar_periodo(
        db, empresa_id, mes, anio, tolerancia, banco_id, persistir_matches=False
    )
    resultado["auto_conciliacion"] = {
        "polizas_creadas": creadas,
        "errores": errores,
        "previo_sin_poliza": base["resumen"]["banco_sin_poliza"],
    }
    return resultado


def asignar_conciliacion_manual(
    db: Session,
    empresa_id: int,
    movimiento_id: int,
    tipo_poliza: str,
    poliza_id: int | None = None,
    cuenta_contrapartida: str | None = None,
    nombre_contrapartida: str | None = None,
    concepto: str | None = None,
) -> dict:
    """Permite al usuario reasignar manualmente un movimiento a ingreso/egreso/diario."""
    from app.services.polizas import generar_poliza_movimiento_banco

    tipo_norm = str(tipo_poliza or "").strip().lower()
    if tipo_norm not in {t.value for t in TipoPoliza}:
        raise ValueError("tipo_poliza debe ser ingreso, egreso o diario")

    movimiento = (
        db.query(MovimientoBanco)
        .filter(
            MovimientoBanco.id == movimiento_id,
            MovimientoBanco.empresa_id == empresa_id,
        )
        .first()
    )
    if not movimiento:
        raise ValueError("Movimiento bancario no encontrado")

    if poliza_id is not None:
        poliza = (
            db.query(Poliza)
            .filter(Poliza.id == poliza_id, Poliza.empresa_id == empresa_id)
            .first()
        )
        if not poliza:
            raise ValueError("Póliza no encontrada")
        if poliza.tipo.value != tipo_norm:
            raise ValueError("El tipo de la póliza no coincide con tipo_poliza")
    else:
        cuenta, nombre = _CUENTAS_DEFAULT[tipo_norm]
        if cuenta_contrapartida:
            cuenta = cuenta_contrapartida
        if nombre_contrapartida:
            nombre = nombre_contrapartida
        poliza = generar_poliza_movimiento_banco(
            movimiento=movimiento,
            cuenta_contrapartida=cuenta,
            nombre_contrapartida=nombre,
            concepto=concepto or movimiento.descripcion or f"Conciliación manual ({tipo_norm})",
            db=db,
            tipo=TipoPoliza(tipo_norm),
        )

    vincular_movimiento_poliza(
        movimiento, poliza, modo="manual", tipo_asignacion=tipo_norm
    )
    db.commit()
    db.refresh(movimiento)

    return {
        "movimiento": _serializar_movimiento(movimiento),
        "poliza": _serializar_poliza_obj(poliza),
        "modo_conciliacion": "manual",
    }


def _serializar_movimiento(mov: MovimientoBanco) -> dict:
    return {
        "id": mov.id,
        "fecha": str(mov.fecha.date() if hasattr(mov.fecha, "date") else mov.fecha),
        "tipo": mov.tipo,
        "descripcion": mov.descripcion,
        "referencia": mov.referencia,
        "monto": float(mov.monto or 0),
        "saldo": float(mov.saldo) if mov.saldo is not None else None,
        "poliza_id": getattr(mov, "poliza_id", None),
        "modo_conciliacion": getattr(mov, "modo_conciliacion", None),
        "tipo_asignacion": getattr(mov, "tipo_asignacion", None),
        "conciliado_en": mov.conciliado_en.isoformat() if getattr(mov, "conciliado_en", None) else None,
    }
