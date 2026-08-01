import re
from typing import List, Optional
from app.services.bank_parser.models import BankStatementModel, FinancialMovement
from app.services.bank_parser.base import BaseBankParser

_FECHA_RE = re.compile(r"\b(\d{2}[/\-]\d{2}[/\-]\d{4})\b")


class GenericBankParser(BaseBankParser):
    def can_parse(self, text: str) -> bool:
        return True

    def parse(self, text: str, pdf_bytes: Optional[bytes] = None) -> BankStatementModel:
        movimientos: List[FinancialMovement] = []
        for line in text.splitlines():
            line = line.strip()
            fecha_m = _FECHA_RE.search(line)
            if not fecha_m:
                continue
            montos = re.findall(r"-?[\d,]+\.\d{2}", line)
            if not montos:
                continue
            monto = float(montos[0].replace(",", ""))
            saldo = float(montos[-1].replace(",", "")) if len(montos) > 1 else 0.0
            desc = re.sub(r"-?[\d,]+\.\d{2}", "", line[fecha_m.end():]).strip(" -")
            movimientos.append(FinancialMovement(
                fecha=fecha_m.group(1),
                descripcion=desc or "SIN DESCRIPCIÓN",
                cargo=abs(monto) if monto < 0 else 0.0,
                abono=monto if monto > 0 else 0.0,
                saldo=saldo,
                confianza=0.50,
            ))
        return BankStatementModel(banco="GENÉRICO", movimientos=movimientos)
