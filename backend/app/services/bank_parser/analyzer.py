import io
from typing import Dict, Any, List

import fitz
import pdfplumber


class DocumentAnalyzer:
    @staticmethod
    def detect_pdf_type(pdf_bytes: bytes) -> Dict[str, Any]:
        with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
            total_text_length = sum(len(page.get_text()) for page in doc)
        if total_text_length < 100:
            return {"type": "scanned", "confidence": 0.95}
        return {"type": "digital", "confidence": 0.98}


class PDFExtractor:
    @staticmethod
    def extract_text(pdf_bytes: bytes) -> str:
        text = ""
        with io.BytesIO(pdf_bytes) as buffer, pdfplumber.open(buffer) as pdf:
            for page in pdf.pages:
                extracted = page.extract_text(layout=True)
                if extracted:
                    text += extracted + "\n"
        return text

    @staticmethod
    def extract_tables(pdf_bytes: bytes) -> List[List[List[str]]]:
        """Returns list of tables per page. Each table is a list of rows."""
        all_tables = []
        with io.BytesIO(pdf_bytes) as buffer, pdfplumber.open(buffer) as pdf:
            for page in pdf.pages:
                tables = page.extract_tables()
                if tables:
                    all_tables.extend(tables)
        return all_tables
