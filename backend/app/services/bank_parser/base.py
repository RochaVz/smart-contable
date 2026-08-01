from abc import ABC, abstractmethod
from typing import Optional
from app.services.bank_parser.models import BankStatementModel


class BaseBankParser(ABC):
    @abstractmethod
    def can_parse(self, text: str) -> bool:
        pass

    @abstractmethod
    def parse(self, text: str, pdf_bytes: Optional[bytes] = None) -> BankStatementModel:
        pass
