from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
import hashlib
import re
import xml.etree.ElementTree as ET

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.models.conciliacion import MovimientoBanco
from app.models.poliza import MovimientoPoliza, Poliza, TipoPoliza


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


def hash_archivo(xml_bytes: bytes) -> str:
    return hashlib.sha256(xml_bytes).hexdigest()


def hash_movimiento(empresa_id: int, mov: MovimientoEstadoCuenta) -> str:
    raw = "|".join([
        str(empresa_id),
        mov.fecha.date().isoformat(),
        mov.tipo,
        str(mov.monto),
        mov.referencia or "",
        mov.descripcion or "",
    ])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _monto_bancos(poliza: Poliza, tipo: str) -> float:
    movimientos_banco = [
        m for m in poliza.movimientos
        if (m.cuenta or "").startswith("102")
    ]
    if tipo == "abono":
        total = sum(float(m.debe or 0) for m in movimientos_banco)
    else:
        total = sum(float(m.haber or 0) for m in movimientos_banco)
    return round(total, 2)


def _polizas_conciliables(db: Session, empresa_id: int, mes: int, anio: int) -> list[dict]:
    polizas = (
        db.query(Poliza)
        .filter(
            Poliza.empresa_id == empresa_id,
            Poliza.mes == mes,
            Poliza.anio == anio,
            Poliza.tipo.in_([TipoPoliza.ingreso, TipoPoliza.egreso]),
        )
        .order_by(Poliza.fecha.asc(), Poliza.numero.asc())
        .all()
    )

    resultado = []
    for p in polizas:
        tipo_banco = "abono" if p.tipo == TipoPoliza.ingreso else "cargo"
        monto_banco = _monto_bancos(p, tipo_banco)
        monto = monto_banco if monto_banco > 0 else float(p.total or 0)
        resultado.append({
            "poliza_id": p.id,
            "tipo": p.tipo.value,
            "tipo_banco": tipo_banco,
            "numero": p.numero,
            "fecha": str(p.fecha.date() if hasattr(p.fecha, "date") else p.fecha),
            "concepto": p.concepto,
            "monto": round(monto, 2),
            "usa_cuenta_bancos": monto_banco > 0,
        })
    return resultado


def conciliar_periodo(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
    tolerancia: float = 1.0,
) -> dict:
    movimientos = (
        db.query(MovimientoBanco)
        .filter(
            MovimientoBanco.empresa_id == empresa_id,
            extract("month", MovimientoBanco.fecha) == mes,
            extract("year", MovimientoBanco.fecha) == anio,
        )
        .order_by(MovimientoBanco.fecha.asc())
        .all()
    )
    polizas = _polizas_conciliables(db, empresa_id, mes, anio)

    polizas_disponibles = polizas.copy()
    conciliados = []
    banco_sin_poliza = []

    for mov in movimientos:
        monto = float(mov.monto or 0)
        candidatas = [
            p for p in polizas_disponibles
            if p["tipo_banco"] == mov.tipo and abs(p["monto"] - monto) <= tolerancia
        ]
        def _diff_dias(poliza: dict) -> int:
            try:
                pf = datetime.fromisoformat(str(poliza["fecha"])[:10]).date()
                mf = mov.fecha.date() if hasattr(mov.fecha, "date") else mov.fecha
                return abs((mf - pf).days)
            except (ValueError, TypeError, AttributeError):
                return 9999

        candidatas.sort(key=_diff_dias)

        if candidatas:
            poliza = candidatas[0]
            polizas_disponibles.remove(poliza)
            conciliados.append({
                "movimiento_banco": _serializar_movimiento(mov),
                "poliza": poliza,
                "diferencia": round(monto - poliza["monto"], 2),
            })
        else:
            banco_sin_poliza.append(_serializar_movimiento(mov))

    total_banco = round(sum(float(m.monto or 0) for m in movimientos), 2)
    total_polizas = round(sum(p["monto"] for p in polizas), 2)
    total_conciliado = round(sum(c["poliza"]["monto"] for c in conciliados), 2)

    return {
        "resumen": {
            "movimientos_banco": len(movimientos),
            "polizas": len(polizas),
            "conciliados": len(conciliados),
            "banco_sin_poliza": len(banco_sin_poliza),
            "polizas_sin_banco": len(polizas_disponibles),
            "total_banco": total_banco,
            "total_polizas": total_polizas,
            "total_conciliado": total_conciliado,
        },
        "conciliados": conciliados,
        "banco_sin_poliza": banco_sin_poliza,
        "polizas_sin_banco": polizas_disponibles,
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
    }
