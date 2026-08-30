from io import BytesIO

import pytest
from fastapi import UploadFile

from app.api.v1.endpoints import conciliacion, facturas


def _upload_file(size: int) -> UploadFile:
    return UploadFile(
        file=BytesIO(b"x" * size),
        filename="archivo.xml",
        size=size,
    )


@pytest.mark.parametrize(
    ("limite", "tipo"),
    [(5, "XML"), (5, "ZIP")],
)
def test_validar_tamano_upload_rechaza_antes_de_leer(limite, tipo):
    archivo = _upload_file(limite + 1)

    with pytest.raises(facturas.HTTPException) as exc_info:
        facturas._validar_tamano_upload(archivo, limite, tipo)

    assert exc_info.value.status_code == 413
    assert f"archivo {tipo}" in exc_info.value.detail


def test_validar_tamano_pdf_rechaza_archivo_sobre_limite(monkeypatch):
    monkeypatch.setattr(conciliacion.settings, "MAX_PDF_UPLOAD_BYTES", 5)

    with pytest.raises(conciliacion.HTTPException) as exc_info:
        conciliacion._validar_tamano_pdf(b"123456")

    assert exc_info.value.status_code == 413
    assert "excede el limite" in exc_info.value.detail


def test_validar_tamano_pdf_upload_rechaza_antes_de_leer(monkeypatch):
    monkeypatch.setattr(conciliacion.settings, "MAX_PDF_UPLOAD_BYTES", 5)
    archivo = _upload_file(6)

    with pytest.raises(conciliacion.HTTPException) as exc_info:
        conciliacion._validar_tamano_pdf_upload(archivo)

    assert exc_info.value.status_code == 413
    assert "PDF excede el limite" in exc_info.value.detail