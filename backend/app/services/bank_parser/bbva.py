import re
from typing import List, Optional, Tuple
from app.services.bank_parser.models import BankStatementModel, FinancialMovement
from app.services.bank_parser.base import BaseBankParser
from app.services.bank_parser.analyzer import PDFExtractor

# Formato real BBVA Bancomer:
# 01/JUN 01/JUN V42 VENTAS DEBITO                            3,500.00
#             TERMINALES PUNTO DE VENTA Ref. 147462997
_MESES = {"ENE": "01", "FEB": "02", "MAR": "03", "ABR": "04", "MAY": "05",
          "JUN": "06", "JUL": "07", "AGO": "08", "SEP": "09", "OCT": "10",
          "NOV": "11", "DIC": "12"}

# Línea principal: DD/MMM DD/MMM COD DESCRIPCION   [CARGO]  [ABONO]  [SALDO]
_LINEA_MOV_RE = re.compile(
    r"^\s*(\d{2}/[A-Z]{3})\s+\d{2}/[A-Z]{3}\s+\w+\s+(.+?)\s{2,}([\d,]+\.\d{2})(?:\s+([\d,]+\.\d{2}))?(?:\s+([\d,]+\.\d{2}))?\s*$"
)

# Encabezado de columnas para detectar posición de CARGOS y ABONOS
_HEADER_RE = re.compile(r"CARGOS\s+ABONOS", re.IGNORECASE)

_MONTO_RE = re.compile(r"(?<!\d)(?:[$]\s*)?(?:\(?-?[\d,]+\.\d{2}\)?)(?!\d)")


def _monto_a_float(valor: str) -> float:
    limpio = valor.replace("$", "").replace(",", "").replace(" ", "")
    negativo = limpio.startswith("-") or (limpio.startswith("(") and limpio.endswith(")"))
    limpio = limpio.strip("()")
    monto = float(limpio)
    return -monto if negativo else monto


def _fecha_a_iso(fecha_str: str, anio: int) -> str:
    """Convierte '01/JUN' a '01/06/2026'."""
    partes = fecha_str.split("/")
    if len(partes) != 2:
        return fecha_str
    dia, mes_abr = partes
    mes = _MESES.get(mes_abr.upper(), "01")
    return f"{dia}/{mes}/{anio}"


def _detectar_anio(text: str) -> int:
    m = re.search(r"(\d{4})", text[:500])
    return int(m.group(1)) if m else 2026


def _detectar_posicion_columnas(text: str) -> Optional[Tuple[int, int]]:
    """Detecta la posición x (char index) de las columnas CARGOS y ABONOS."""
    posiciones = _detectar_posiciones_columnas(text)
    return posiciones[:2] if posiciones else None


def _detectar_posiciones_columnas(text: str) -> Optional[Tuple[int, int, Optional[int]]]:
    """Detecta las posiciones de CARGOS, ABONOS y SALDO en el texto extraído."""
    cargo_pos = abono_pos = saldo_pos = None
    for line in text.splitlines():
        upper_line = line.upper()
        if cargo_pos is None and _HEADER_RE.search(line):
            cargo_pos = upper_line.find("CARGOS")
            abono_pos = upper_line.find("ABONOS")
        if "SALDO" in upper_line:
            posicion_saldo = upper_line.find("SALDO")
            if saldo_pos is None or posicion_saldo > saldo_pos:
                saldo_pos = posicion_saldo
    if cargo_pos is None or abono_pos is None:
        return None
    return cargo_pos, abono_pos, saldo_pos


def _parse_montos_por_posicion(
    line: str,
    cargo_pos: int,
    abono_pos: int,
    saldo_pos: Optional[int] = None,
) -> Tuple[float, float, float]:
    """Extrae cargo, abono y saldo según posición de columnas."""
    montos = [(m.start(), _monto_a_float(m.group())) for m in _MONTO_RE.finditer(line)]
    if not montos:
        return 0.0, 0.0, 0.0

    cargo = abono = saldo = 0.0
    # El saldo es la columna más a la derecha. En PDFs BBVA puede perderse
    # el encabezado, pero el orden visual de las columnas se conserva.
    candidatos = montos
    if len(montos) >= 2 and saldo_pos is None:
        saldo_pos, saldo = montos[-1]
        candidatos = montos[:-1]

    limite_cargo_abono = (cargo_pos + abono_pos) / 2
    limite_abono_saldo = (
        (abono_pos + saldo_pos) / 2
        if saldo_pos is not None
        else None
    )
    for pos, val in candidatos:
        if limite_abono_saldo is not None and pos >= limite_abono_saldo:
            saldo = val
            continue
        if pos < limite_cargo_abono:
            cargo = val
        else:
            abono = val

    # Si el saldo fue identificado por encabezado, aún puede haber quedado
    # mezclado entre candidatos por el orden del texto extraído.
    if saldo_pos is not None:
        for pos, val in montos:
            if pos >= (abono_pos + saldo_pos) / 2:
                saldo = val
                if (pos, val) in candidatos:
                    candidatos.remove((pos, val))
                break

    for pos, val in candidatos:
        if limite_abono_saldo is not None and pos >= limite_abono_saldo:
            continue
        distancia_cargo = abs(pos - cargo_pos)
        distancia_abono = abs(pos - abono_pos)
        if distancia_cargo < distancia_abono:
            cargo = val
        elif distancia_abono <= distancia_cargo:
            abono = val

    return cargo, abono, saldo


class BBVAParser(BaseBankParser):
    def can_parse(self, text: str) -> bool:
        return "BBVA" in text.upper()

    def parse(self, text: str, pdf_bytes: Optional[bytes] = None) -> BankStatementModel:
        if pdf_bytes:
            full_text = PDFExtractor.extract_text(pdf_bytes)
        else:
            full_text = text

        anio = _detectar_anio(full_text)
        col_positions = _detectar_posiciones_columnas(full_text)
        movimientos = self._parse_movimientos(full_text, anio, col_positions)

        return BankStatementModel(banco="BBVA México", movimientos=movimientos)

    def _parse_movimientos(
        self,
        text: str,
        anio: int,
        col_positions: Optional[Tuple[int, int]],
    ) -> List[FinancialMovement]:
        movimientos = []
        lines = text.splitlines()
        i = 0

        # Buscar inicio de sección de movimientos
        inicio = 0
        for idx, line in enumerate(lines):
            if "DETALLE DE MOVIMIENTOS" in line.upper() or (
                "CARGOS" in line.upper() and "ABONOS" in line.upper()
            ):
                inicio = idx
                break

        while i < len(lines):
            line = lines[i]

            # Detectar línea de movimiento: empieza con DD/MMM
            fecha_m = re.match(r"^\s*(\d{2}/[A-Z]{3})\s+\d{2}/[A-Z]{3}\s+(\w+)\s+(.*)", line)
            if fecha_m and i >= inicio:
                fecha_raw = fecha_m.group(1)
                codigo = fecha_m.group(2)
                resto = fecha_m.group(3).strip()

                # Siguiente línea puede ser continuación de descripción con referencia
                desc_extra = ""
                if i + 1 < len(lines):
                    next_line = lines[i + 1].strip()
                    if next_line and not re.match(r"^\d{2}/[A-Z]{3}", next_line):
                        desc_extra = next_line
                        i += 1

                # Extraer montos de la línea principal
                montos = _MONTO_RE.findall(resto)
                desc_sin_montos = _MONTO_RE.sub("", resto).strip()

                # Descripción completa
                descripcion = desc_sin_montos
                referencia = ""
                ref_m = re.search(r"[Rr]ef\.?\s*(\w+)", desc_extra)
                if ref_m:
                    referencia = ref_m.group(1)
                    desc_extra_limpia = desc_extra[:ref_m.start()].strip()
                    if desc_extra_limpia:
                        descripcion = f"{desc_sin_montos} {desc_extra_limpia}".strip()
                elif desc_extra:
                    descripcion = f"{desc_sin_montos} {desc_extra}".strip()

                # Determinar cargo/abono por posición de columna
                if col_positions and montos:
                    cargo_pos, abono_pos, saldo_pos = col_positions
                    cargo, abono, saldo = _parse_montos_por_posicion(
                        line, cargo_pos, abono_pos, saldo_pos
                    )
                elif len(montos) == 1:
                    # Un solo monto: determinar por posición en la línea
                    monto_val = _monto_a_float(montos[0])
                    monto_match = _MONTO_RE.search(line)
                    pos = monto_match.start() if monto_match else 0
                    # Si está en la mitad izquierda de la línea es cargo, derecha es abono
                    mitad = len(line) // 2
                    if pos < mitad:
                        cargo, abono, saldo = monto_val, 0.0, 0.0
                    else:
                        cargo, abono, saldo = 0.0, monto_val, 0.0
                elif len(montos) >= 2:
                    cargo = _monto_a_float(montos[0])
                    abono = _monto_a_float(montos[1])
                    saldo = _monto_a_float(montos[2]) if len(montos) > 2 else 0.0
                else:
                    i += 1
                    continue

                if cargo == 0.0 and abono == 0.0:
                    i += 1
                    continue

                movimientos.append(FinancialMovement(
                    fecha=_fecha_a_iso(fecha_raw, anio),
                    descripcion=descripcion or codigo,
                    referencia=referencia,
                    cargo=cargo,
                    abono=abono,
                    saldo=saldo,
                    confianza=0.93,
                ))

            i += 1

        return movimientos
