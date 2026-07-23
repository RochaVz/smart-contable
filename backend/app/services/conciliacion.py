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


def _read_pdf_rows(pdf_bytes: bytes) -> list[dict[str, str]]:
    def _parse_text_pages(text_pages: list[str | None]) -> list[dict[str, str]]:
        def _parse_unstructured_rows(lines: list[str]) -> list[dict[str, str]]:
            def _looks_like_amount(line: str) -> bool:
                cleaned = line.strip()
                if not cleaned:
                    return False
                if re.fullmatch(r"[-+]?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d+)?", cleaned):
                    return True
                if re.fullmatch(r"[-+]?(?:\d+)(?:\.\d+)?", cleaned):
                    return True
                return False

            rows: list[dict[str, str]] = []
            date_pattern = re.compile(r"\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4}")
            current_block: list[str] = []

            for line in lines:
                if date_pattern.search(line):
                    if current_block:
                        rows.append(current_block)
                    current_block = [line]
                elif current_block and line.strip():
                    current_block.append(line)
            if current_block:
                rows.append(current_block)

            parsed: list[dict[str, str]] = []
            for block in rows:
                if not block:
                    continue
                first = block[0]
                match = date_pattern.search(first)
                if not match:
                    continue
                fecha = match.group(0)
                remainder = first[match.end():].strip()
                referencia = None
                if remainder:
                    possible_ref = remainder.rsplit(" ", 1)
                    if len(possible_ref) == 2 and re.fullmatch(r"[A-Za-z0-9]{3,}", possible_ref[1]) and not _looks_like_amount(possible_ref[1]):
                        referencia = possible_ref[1]
                        remainder = possible_ref[0]
                monto = None
                descripcion_parts = [remainder] if remainder else []

                for line in block[1:]:
                    if monto is None and _looks_like_amount(line):
                        posible_monto = _to_decimal(line)
                        if posible_monto is not None:
                            monto = line.strip()
                            continue
                    if referencia is None and len(line.split()) == 1 and re.search(r"[A-Za-z0-9]{3,}", line):
                        referencia = line.strip()
                        continue
                    descripcion_parts.append(line.strip())

                if monto is None and descripcion_parts:
                    last_line = descripcion_parts[-1]
                    if _looks_like_amount(last_line):
                        posible_monto = _to_decimal(last_line)
                        if posible_monto is not None:
                            monto = last_line.strip()
                            descripcion_parts = descripcion_parts[:-1]

                descripcion = " ".join(part for part in descripcion_parts if part).strip()
                if not descripcion:
                    descripcion = "Movimiento bancario"

                parsed.append({
                    "fecha": fecha,
                    "descripcion": descripcion,
                    "referencia": referencia or "",
                    "monto": monto or "",
                })
            return parsed

        rows: list[dict[str, str]] = []
        for text in text_pages:
            if not text:
                continue
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            if not lines:
                continue
            header_start = None
            for i, line in enumerate(lines):
                if any(word in line.lower() for word in ("fecha", "date")):
                    header_start = i
                    break
            if header_start is None:
                continue
            headers = [lines[header_start].strip().lower()]
            data_start = header_start + 1
            while data_start < len(lines):
                candidate = lines[data_start]
                if re.search(r"\d{4}[-/]\d{2}[-/]\d{2}", candidate) or re.search(r"\d{2}[-/]\d{2}[-/]\d{4}", candidate):
                    break
                headers.append(candidate.strip().lower())
                data_start += 1

            rest_lines = lines[data_start:]
            if not headers or not rest_lines:
                continue

            for line in rest_lines:
                parts = re.split(r"\s{2,}", line)
                if len(parts) >= 2:
                    data = {
                        headers[j]: parts[j].strip() if j < len(parts) else ""
                        for j in range(len(headers))
                    }
                    if any(value for value in data.values()):
                        rows.append(data)

            if len(rest_lines) >= len(headers):
                for idx in range(0, len(rest_lines), len(headers)):
                    row_lines = rest_lines[idx : idx + len(headers)]
                    if len(row_lines) < len(headers):
                        break
                    data = {headers[j]: row_lines[j].strip() for j in range(len(headers))}
                    if any(value for value in data.values()):
                        rows.append(data)

            if rest_lines:
                rows.extend(_parse_unstructured_rows(rest_lines))
        return rows

    def _extract_text_pages_from_pdf_bytes(pdf_bytes: bytes) -> list[str | None]:
        try:
            from PyPDF2 import PdfReader
            reader = PdfReader(io.BytesIO(pdf_bytes))
            return [page.extract_text() for page in reader.pages]
        except Exception:
            pass

        try:
            from pdfminer.high_level import extract_text
            text = extract_text(io.BytesIO(pdf_bytes))
            return [text] if text is not None else []
        except Exception as exc:
            raise RuntimeError(
                "La lectura de PDF requiere pdfplumber, PyPDF2 o pdfminer.six. Instala una de estas dependencias."
            ) from exc

    try:
        import pdfplumber  # type: ignore
    except Exception:
        text_pages = _extract_text_pages_from_pdf_bytes(pdf_bytes)
        return _parse_text_pages(text_pages)

    rows: list[dict[str, str]] = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            pages = list(pdf.pages)
            for page in pages:
                try:
                    tables = page.extract_tables()
                except Exception:
                    tables = None
                if tables:
                    for table in tables:
                        if not table or len(table) < 2:
                            continue
                        headers = [str(h).strip().lower() if h is not None else "" for h in table[0]]
                        for row in table[1:]:
                            if not any(cell for cell in row if cell):
                                continue
                            data = {
                                headers[i]: str(row[i]).strip() if i < len(row) and row[i] is not None else ""
                                for i in range(len(headers))
                            }
                            rows.append(data)
            if rows:
                return rows

            text_pages = [page.extract_text() for page in pages]
        return _parse_text_pages(text_pages)
    except Exception:
        text_pages = _extract_text_pages_from_pdf_bytes(pdf_bytes)
        return _parse_text_pages(text_pages)


def convertir_estado_cuenta_pdf_a_xml(pdf_bytes: bytes) -> bytes:
    rows = _read_pdf_rows(pdf_bytes)
    root = ET.Element("EstadoCuenta")
    for row in rows:
        movimiento_el = ET.SubElement(root, "Movimiento")
        for key, value in row.items():
            if value is None or str(value).strip() == "":
                continue
            tag = re.sub(r"[^0-9a-zA-Z_-]", "_", str(key).strip().lower())
            if not tag:
                continue
            child = ET.SubElement(movimiento_el, tag)
            child.text = str(value)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def parsear_estado_cuenta_pdf(pdf_bytes: bytes) -> list[MovimientoEstadoCuenta]:
    xml_bytes = convertir_estado_cuenta_pdf_a_xml(pdf_bytes)
    return parsear_estado_cuenta_xml(xml_bytes)


def parsear_estado_cuenta_csv(csv_bytes: bytes) -> list[MovimientoEstadoCuenta]:
    """Parsea un CSV de estado de cuenta. Se espera que el CSV tenga una fila de cabecera
    con nombres como fecha, descripcion, monto, abono, cargo, referencia, saldo, etc.
    El parser intentará mapear columnas usando las mismas claves que el parser XML.
    """
    text = csv_bytes.decode("utf-8", errors="replace")
    # Detect delimiter: accept tab-separated exports (TSV) as well as comma-separated CSV
    first_line = text.splitlines()[0] if text.splitlines() else ""
    delimiter = '\t' if '\t' in first_line else ','
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    movimientos: list[MovimientoEstadoCuenta] = []
    vistos = set()

    for row in reader:
        # Normalize keys and values: keep as simple mapping for _movimiento_desde_data
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
    banco_id: int | None = None,
) -> dict:
    query = db.query(MovimientoBanco).filter(
        MovimientoBanco.empresa_id == empresa_id,
        extract("month", MovimientoBanco.fecha) == mes,
        extract("year", MovimientoBanco.fecha) == anio,
    )
    
    if banco_id:
        query = query.filter(MovimientoBanco.banco_id == banco_id)
    
    movimientos = query.order_by(MovimientoBanco.fecha.asc()).all()
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
