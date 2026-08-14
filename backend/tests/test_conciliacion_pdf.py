import os
import tempfile

import pytest
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle

import builtins
from types import SimpleNamespace

from app.services.conciliacion import parsear_estado_cuenta_pdf
from app.services.conciliacion import (
    _monto_banco_poliza,
    _montos_coinciden,
    _montos_conciliables_poliza,
)
from app.models.poliza import TipoPoliza


def test_monto_conciliable_ingreso_usa_deposito_neto():
    poliza = SimpleNamespace(
        tipo=TipoPoliza.ingreso,
        total=1160,
        movimientos=[
            SimpleNamespace(cuenta="102.01.01", debe=1131, haber=0),
            SimpleNamespace(cuenta="701.02.01", debe=29, haber=0),
        ],
    )

    assert _monto_banco_poliza(poliza) == 1131
    assert _montos_conciliables_poliza(poliza) == [1131, 1160]


def test_conciliacion_acepta_diferencias_de_centavos_y_rechaza_diferencias_reales():
    assert _montos_coinciden(1000.00, 1000.01, 0.05) is True
    assert _montos_coinciden(1000.00, 1000.05, 0.05) is True
    assert _montos_coinciden(1000.00, 1000.06, 0.05) is False


def test_parsear_estado_cuenta_pdf():
    data = [
        ["Fecha", "Descripcion", "Referencia", "Monto"],
        ["2026-07-01", "Pago cliente X", "FOLIO1", "1000.00"],
        ["2026-07-02", "Retiro proveedor Y", "REF999", "-250.50"],
    ]

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tf:
        path = tf.name

    try:
        doc = SimpleDocTemplate(path, pagesize=letter)
        table = Table(data)
        table.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 1, colors.black)]))
        doc.build([table])

        with open(path, "rb") as fh:
            pdf_bytes = fh.read()

        movimientos = parsear_estado_cuenta_pdf(pdf_bytes)

        assert len(movimientos) == 2

        primera = movimientos[0]
        assert primera.fecha.date().isoformat() == "2026-07-01"
        assert primera.tipo == "abono"
        assert float(primera.monto) == 1000.00
        assert primera.referencia == "FOLIO1"

        segunda = movimientos[1]
        assert segunda.tipo == "cargo"
        assert float(segunda.monto) == 250.50
        assert segunda.referencia == "REF999"
    finally:
        os.unlink(path)


def test_parsear_estado_cuenta_pdf_fallback_to_pypdf(monkeypatch):
    original_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "pdfplumber":
            raise ModuleNotFoundError("No module named 'pdfplumber'")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    data = [
        ["Fecha", "Descripcion", "Referencia", "Monto"],
        ["2026-07-01", "Pago cliente X", "FOLIO1", "1000.00"],
        ["2026-07-02", "Retiro proveedor Y", "REF999", "-250.50"],
    ]
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tf:
        path = tf.name

    try:
        doc = SimpleDocTemplate(path, pagesize=letter)
        table = Table(data)
        table.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 1, colors.black)]))
        doc.build([table])

        with open(path, "rb") as fh:
            pdf_bytes = fh.read()

        movimientos = parsear_estado_cuenta_pdf(pdf_bytes)

        assert len(movimientos) == 2

        primera = movimientos[0]
        assert primera.fecha.date().isoformat() == "2026-07-01"
        assert primera.tipo == "abono"
        assert float(primera.monto) == 1000.00
        assert primera.referencia == "FOLIO1"

        segunda = movimientos[1]
        assert segunda.tipo == "cargo"
        assert float(segunda.monto) == 250.50
        assert segunda.referencia == "REF999"
    finally:
        os.unlink(path)


def test_parsear_estado_cuenta_pdf_fallback_to_pdfminer(monkeypatch):
    pytest.importorskip("pdfminer.high_level")
    original_import = builtins.__import__

    def fake_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name in {"pdfplumber", "PyPDF2"}:
            raise ModuleNotFoundError(f"No module named '{name}'")
        return original_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", fake_import)

    data = [
        ["Fecha", "Descripcion", "Referencia", "Monto"],
        ["2026-07-01", "Pago cliente X", "FOLIO1", "1000.00"],
        ["2026-07-02", "Retiro proveedor Y", "REF999", "-250.50"],
    ]
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tf:
        path = tf.name

    try:
        doc = SimpleDocTemplate(path, pagesize=letter)
        table = Table(data)
        table.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 1, colors.black)]))
        doc.build([table])

        with open(path, "rb") as fh:
            pdf_bytes = fh.read()

        movimientos = parsear_estado_cuenta_pdf(pdf_bytes)

        assert len(movimientos) == 2

        primera = movimientos[0]
        assert primera.fecha.date().isoformat() == "2026-07-01"
        assert primera.tipo == "abono"
        assert float(primera.monto) == 1000.00
        assert primera.referencia == "FOLIO1"

        segunda = movimientos[1]
        assert segunda.tipo == "cargo"
        assert float(segunda.monto) == 250.50
        assert segunda.referencia == "REF999"
    finally:
        os.unlink(path)
