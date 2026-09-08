import re
from typing import List, Optional
from app.services.bank_parser.models import BankStatementModel, FinancialMovement
from app.services.bank_parser.base import BaseBankParser

_FECHA_RE = re.compile(
    r"\b(\d{2}[/\-]\d{2}[/\-]\d{4}|\d{4}[/\-]\d{2}[/\-]\d{2})\b"
)
_MONTO_RE = re.compile(r"(?<!\d)(?:[$]\s*)?(?:\(?-?[\d,]+\.\d{2}\)?)(?!\d)")


def _monto_a_float(valor: str) -> float:
    limpio = valor.replace("$", "").replace(",", "").replace(" ", "")
    negativo = limpio.startswith("-") or (limpio.startswith("(") and limpio.endswith(")"))
    monto = abs(float(limpio.strip("()-")))
    return -monto if negativo else monto


def _detectar_columnas(text: str) -> Optional[tuple[int, int, Optional[int]]]:
    cargo_pos = abono_pos = saldo_pos = None
    for line in text.splitlines():
        upper_line = line.upper()
        if cargo_pos is None and "CARGOS" in upper_line and "ABONOS" in upper_line:
            cargo_pos = upper_line.find("CARGOS")
            abono_pos = upper_line.find("ABONOS")
        if "SALDO" in upper_line:
            saldo_pos = upper_line.find("SALDO")
    if cargo_pos is None or abono_pos is None:
        return None
    return cargo_pos, abono_pos, saldo_pos


def _parsear_montos_por_columnas(
    line: str,
    cargo_pos: int,
    abono_pos: int,
    saldo_pos: Optional[int],
) -> tuple[float, float, float]:
    montos = [(match.start(), _monto_a_float(match.group())) for match in _MONTO_RE.finditer(line)]
    if not montos:
        return 0.0, 0.0, 0.0

    saldo = 0.0
    candidatos = montos
    if len(montos) >= 2 and saldo_pos is None:
        saldo = montos[-1][1]
        candidatos = montos[:-1]

    limite_cargo_abono = (cargo_pos + abono_pos) / 2
    limite_abono_saldo = (abono_pos + saldo_pos) / 2 if saldo_pos is not None else None
    cargo = abono = 0.0
    for pos, valor in candidatos:
        if limite_abono_saldo is not None and pos >= limite_abono_saldo:
            saldo = valor
        elif pos < limite_cargo_abono:
            cargo = valor
        else:
            abono = valor
    return cargo, abono, saldo


def _inferir_columnas_movimientos(registros: List[str]) -> Optional[tuple[int, int, None]]:
    """Infiere cargos y abonos cuando el PDF desalineó los encabezados."""
    posiciones = []
    for registro in registros:
        montos = list(_MONTO_RE.finditer(registro))
        if montos:
            posiciones.append(montos[0].start())
    posiciones = sorted(set(posiciones))
    if len(posiciones) < 2 or posiciones[-1] - posiciones[0] < 3:
        return None
    return posiciones[0], posiciones[-1], None


class GenericBankParser(BaseBankParser):
    def can_parse(self, text: str) -> bool:
        return True

    def parse(self, text: str, pdf_bytes: Optional[bytes] = None) -> BankStatementModel:
        movimientos: List[FinancialMovement] = []
        columnas = _detectar_columnas(text)
        registros: List[str] = []
        lineas_movimiento: List[str] = []
        for raw_line in text.splitlines():
            line = raw_line.strip()
            if _FECHA_RE.search(line):
                if lineas_movimiento:
                    registros.append(" ".join(lineas_movimiento))
                lineas_movimiento = [line]
            elif lineas_movimiento and line:
                lineas_movimiento.append(line)

        if lineas_movimiento:
            registros.append(" ".join(lineas_movimiento))

        columnas_movimientos = _inferir_columnas_movimientos(registros) if columnas else None

        for line in registros:
            fecha_m = _FECHA_RE.search(line)
            if not fecha_m:
                continue
            montos = _MONTO_RE.findall(line)
            if not montos:
                continue
            if columnas_movimientos:
                cargo, abono, saldo = _parsear_montos_por_columnas(line, *columnas_movimientos)
            elif columnas:
                cargo, abono, saldo = _parsear_montos_por_columnas(line, *columnas)
                monto = 0.0
            else:
                monto = _monto_a_float(montos[0])
                saldo = _monto_a_float(montos[-1]) if len(montos) > 1 else 0.0
                cargo = abs(monto) if monto < 0 else 0.0
                abono = monto if monto > 0 else 0.0
            desc = re.sub(r"-?[\d,]+\.\d{2}", "", line[fecha_m.end():]).strip(" -")
            referencia = ""
            referencia_m = re.search(r"\b(?:ref(?:erencia)?[.:]?\s*)?([A-Z0-9][A-Z0-9_-]{3,})$", desc, re.IGNORECASE)
            if referencia_m:
                referencia = referencia_m.group(1)
                desc = desc[:referencia_m.start()].strip(" -")
            movimientos.append(FinancialMovement(
                fecha=fecha_m.group(1),
                descripcion=desc or "SIN DESCRIPCIÓN",
                referencia=referencia,
                cargo=cargo,
                abono=abono,
                saldo=saldo,
                confianza=0.50,
            ))
        return BankStatementModel(banco="GENÉRICO", movimientos=movimientos)
