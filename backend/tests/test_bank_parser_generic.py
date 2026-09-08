from app.services.bank_parser.generic import GenericBankParser


GENERIC_BANK_SAMPLE = """
Estado de cuenta Santander
FECHA DESCRIPCION CARGOS ABONOS SALDO
01/09/2026 Pago proveedor                  1,250.00             8,750.00
02/09/2026 Deposito cliente                             3,000.00 11,750.00
"""


def test_parser_generico_separa_cargos_abonos_y_saldo():
    result = GenericBankParser().parse(GENERIC_BANK_SAMPLE)

    assert len(result.movimientos) == 2
    assert sum(m.cargo for m in result.movimientos) == 1250.00
    assert sum(m.abono for m in result.movimientos) == 3000.00
    assert result.movimientos[0].saldo == 8750.00
    assert result.movimientos[1].saldo == 11750.00


def test_parser_generico_conserva_fallback_por_signo():
    result = GenericBankParser().parse(
        "01/09/2026 Pago proveedor -1,250.00 8,750.00\n"
        "02/09/2026 Deposito cliente 3,000.00 11,750.00\n"
    )

    assert result.movimientos[0].cargo == 1250.00
    assert result.movimientos[1].abono == 3000.00