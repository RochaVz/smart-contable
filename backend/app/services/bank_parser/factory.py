from typing import List
from app.services.bank_parser.base import BaseBankParser
from app.services.bank_parser.bbva import BBVAParser
from app.services.bank_parser.generic import GenericBankParser

class BankParserFactory:  # pylint: disable=too-few-public-methods
    """Factory that returns the appropriate bank statement parser based on content."""
    def __init__(self):
        self._parsers: List[BaseBankParser] = [
            BBVAParser(),
            GenericBankParser()
        ]

    def get_parser(self, text: str) -> BaseBankParser:
        for parser in self._parsers:
            if parser.can_parse(text):
                return parser
        return GenericBankParser()