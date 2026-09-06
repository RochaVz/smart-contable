"""
Pruebas unitarias para BBVAParser con el formato real de BBVA Bancomer.
Ejecutar: python -m pytest tests/test_bank_parser_bbva.py -v
"""
import pytest
from app.services.bank_parser.bbva import (
    BBVAParser,
    _detectar_anio,
    _detectar_posicion_columnas,
    _fecha_a_iso,
    _parse_montos_por_posicion,
)
from app.services.bank_parser.generic import GenericBankParser
from app.services.bank_parser.factory import BankParserFactory

# Texto simulado con el formato real de BBVA Bancomer
BBVA_SAMPLE_TEXT = """
BBVA MEXICO Estado de Cuenta
DEL 01/06/2026 AL 30/06/2026

Detalle de Movimientos Realizados
   FECHA                                                               SALDO
 OPER LIQ  COD. DESCRIPCIÓN    REFERENCIA          CARGOS  ABONOS OPERACIÓN LIQUIDACIÓN
 01/JUN 01/JUN V42 VENTAS DEBITO                            3,500.00
            TERMINALES PUNTO DE VENTA Ref. 147462997
 01/JUN 01/JUN V43 APLI TASA DE DES DEBITO           54.24
            TERMINALES PUNTO DE VENTA Ref. 177462997
 02/JUN 02/JUN T01 SPEI RECIBIDO CLIENTE ABC               12,000.00
            PAGO FACTURA Ref. 998877
 03/JUN 03/JUN C01 COMISION MANEJO CTA              120.00
 05/JUN 05/JUN V42 VENTAS DEBITO                            8,750.50
            TERMINALES PUNTO DE VENTA Ref. 223344556
"""


class TestFechaConversion:
    def test_fecha_junio(self):
        assert _fecha_a_iso("01/JUN", 2026) == "01/06/2026"

    def test_fecha_diciembre(self):
        assert _fecha_a_iso("31/DIC", 2025) == "31/12/2025"

    def test_fecha_enero(self):
        assert _fecha_a_iso("15/ENE", 2026) == "15/01/2026"

    def test_fecha_invalida_retorna_original(self):
        assert _fecha_a_iso("INVALIDO", 2026) == "INVALIDO"


class TestDetectarAnio:
    def test_detecta_anio_del_texto(self):
        assert _detectar_anio("Estado de Cuenta 2026") == 2026

    def test_fallback_anio_default(self):
        assert _detectar_anio("sin año aquí") == 2026


class TestDetectarColumnas:
    def test_detecta_posicion_cargos_abonos(self):
        result = _detectar_posicion_columnas(BBVA_SAMPLE_TEXT)
        assert result is not None
        cargo_pos, abono_pos = result
        assert cargo_pos < abono_pos

    def test_no_confunde_el_saldo_con_cargos_o_abonos(self):
        cargo_pos = 20
        abono_pos = 35
        line = f"{' ' * cargo_pos}125.50{' ' * (abono_pos - cargo_pos - 6)}2,000.00{' ' * 12}15,874.20"

        cargo, abono, saldo = _parse_montos_por_posicion(line, cargo_pos, abono_pos)

        assert cargo == 125.50
        assert abono == 2000.00
        assert saldo == 15874.20


class TestBBVAParser:
    def setup_method(self):
        self.parser = BBVAParser()

    def test_can_parse_bbva(self):
        assert self.parser.can_parse("BBVA Estado de Cuenta") is True

    def test_no_parsea_otro_banco(self):
        assert self.parser.can_parse("Santander Estado de Cuenta") is False

    def test_parse_detecta_movimientos(self):
        result = self.parser.parse(BBVA_SAMPLE_TEXT)
        assert len(result.movimientos) >= 4

    def test_parse_banco_correcto(self):
        result = self.parser.parse(BBVA_SAMPLE_TEXT)
        assert result.banco == "BBVA México"

    def test_parse_abono_detectado(self):
        result = self.parser.parse(BBVA_SAMPLE_TEXT)
        abonos = [m for m in result.movimientos if m.abono > 0]
        assert len(abonos) >= 2
        assert abonos[0].descripcion.startswith("VENTAS DEBITO")
        assert abonos[0].abono == 3500.00
        assert abonos[0].cargo == 0

    def test_parse_cargo_detectado(self):
        result = self.parser.parse(BBVA_SAMPLE_TEXT)
        cargos = [m for m in result.movimientos if m.cargo > 0]
        assert len(cargos) >= 2
        assert cargos[0].descripcion.startswith("APLI TASA DE DES DEBITO")
        assert cargos[0].cargo == 54.24
        assert cargos[0].abono == 0

    def test_parse_fechas_formato_iso(self):
        import re
        result = self.parser.parse(BBVA_SAMPLE_TEXT)
        fecha_re = re.compile(r"\d{2}/\d{2}/\d{4}")
        for mov in result.movimientos:
            assert fecha_re.match(mov.fecha), f"Fecha inválida: {mov.fecha}"

    def test_parse_referencia_extraida(self):
        result = self.parser.parse(BBVA_SAMPLE_TEXT)
        refs = [m.referencia for m in result.movimientos if m.referencia]
        assert len(refs) >= 1

    def test_parse_confianza_alta(self):
        result = self.parser.parse(BBVA_SAMPLE_TEXT)
        for mov in result.movimientos:
            assert mov.confianza >= 0.90

    def test_parse_texto_vacio_retorna_lista_vacia(self):
        result = self.parser.parse("")
        assert result.movimientos == []

    def test_parse_sin_movimientos_validos(self):
        result = self.parser.parse("BBVA sin movimientos aquí")
        assert result.movimientos == []


class TestGenericBankParser:
    def setup_method(self):
        self.parser = GenericBankParser()

    def test_can_parse_siempre_true(self):
        assert self.parser.can_parse("cualquier texto") is True

    def test_parse_extrae_movimientos(self):
        text = (
            "01/06/2026 PAGO PROVEEDOR 5,000.00 95,000.00\n"
            "03/06/2026 DEPOSITO CLIENTE 12,000.00 107,000.00\n"
        )
        result = self.parser.parse(text)
        assert len(result.movimientos) == 2

    def test_parse_sin_fechas_retorna_vacio(self):
        result = self.parser.parse("texto sin fechas ni montos")
        assert result.movimientos == []

    def test_parse_fecha_iso_y_referencia_en_fila(self):
        text = (
            "Fecha Descripcion Referencia Monto\n"
            "2026-07-01 Pago cliente X FOLIO1 1000.00\n"
            "2026-07-02 Retiro proveedor Y REF999 -250.50\n"
        )

        result = self.parser.parse(text)

        assert len(result.movimientos) == 2
        assert result.movimientos[0].referencia == "FOLIO1"
        assert result.movimientos[0].abono == 1000.00
        assert result.movimientos[1].referencia == "REF999"
        assert result.movimientos[1].cargo == 250.50

    def test_parse_recompone_fila_pdf_partida(self):
        text = (
            "Fecha Descripcion Referencia Monto\n"
            "2026-07-01 Pago cliente X FOLIO1\n"
            "1000.00\n"
        )

        result = self.parser.parse(text)

        assert len(result.movimientos) == 1
        assert result.movimientos[0].descripcion == "Pago cliente X"
        assert result.movimientos[0].referencia == "FOLIO1"


class TestBankParserFactory:
    def setup_method(self):
        self.factory = BankParserFactory()

    def test_selecciona_bbva(self):
        assert isinstance(self.factory.get_parser("BBVA Estado de Cuenta"), BBVAParser)

    def test_selecciona_generic_para_desconocido(self):
        assert isinstance(self.factory.get_parser("Banco Desconocido XYZ"), GenericBankParser)
