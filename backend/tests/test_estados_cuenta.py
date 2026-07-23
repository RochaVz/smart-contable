import os
import tempfile
from app.services.estados_cuenta import (
    cargar_estados_cuenta,
    conciliar_movimientos,
    validar_polizas,
    validador_datos_contables,
    cargar_constancia_fiscal,
)


def test_cargar_estados_cuenta_csv():
    csv_content = "Fecha,Concepto,Referencia,Importe\n2026-07-01,Venta cliente X,REF123,1000.00\n2026-07-02,Compra proveedor Y,REF999,-250.50\n"
    with tempfile.NamedTemporaryFile(delete=False, suffix='.csv', mode='w', encoding='utf-8') as tf:
        tf.write(csv_content)
        path = tf.name
    try:
        rows = cargar_estados_cuenta(path)
        assert isinstance(rows, list)
        # two rows
        assert len(rows) == 2
        # first is abono 1000
        first = rows[0]
        assert first['Fecha'] == '2026-07-01'
        assert first['Monto'] == 1000.00
        assert first['Tipo'] == 'abono'
        # second is cargo 250.50
        second = rows[1]
        assert second['Tipo'] == 'cargo'
        assert second['Monto'] == 250.50
    finally:
        os.unlink(path)


def test_conciliar_movimientos_and_validators():
    # create bank records
    estados = [
        {'Fecha': '2026-07-01', 'Concepto': 'Pago', 'Referencia': 'FOLIO1', 'Monto': 500.00, 'Tipo': 'abono'},
        {'Fecha': '2026-07-03', 'Concepto': 'Retiro', 'Referencia': 'FOLIO2', 'Monto': 200.00, 'Tipo': 'cargo'},
    ]
    # create xml poliza bytes (simple)
    xml1 = b"""<?xml version='1.0'?><Poliza><Fecha>2026-07-01</Fecha><Total>500.00</Total><Folio>FOLIO1</Folio></Poliza>"""
    xml2 = b"""<?xml version='1.0'?><Poliza><Fecha>2026-07-10</Fecha><Total>999.00</Total><Folio>FOLIOX</Folio></Poliza>"""
    result = conciliar_movimientos(estados, [xml1, xml2])
    assert 'conciliados' in result
    assert len(result['conciliados']) == 1
    assert len(result['pendientes_banco']) == 1
    assert len(result['pendientes_polizas']) == 1

    # validate polizas (use polizas from pendiente_polizas)
    polizas = [p for p in result['pendientes_polizas']]
    v = validar_polizas(polizas)
    # poliza with monto 999 should be ok
    assert isinstance(v, dict)
    # if there are no errors in the sample, ok list should contain at least one
    assert 'ok' in v

    # validador datos contables
    warnings = validador_datos_contables(estados)
    assert isinstance(warnings, list)


def test_cargar_constancia_fiscal_xml():
    xml = """<?xml version='1.0'?><Constancia RFC="ABC123" RegimenFiscal="601"><Nombre>Empresa SA</Nombre></Constancia>"""
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xml', mode='w', encoding='utf-8') as tf:
        tf.write(xml)
        path = tf.name
    try:
        data = cargar_constancia_fiscal(path)
        assert isinstance(data, dict)
        assert 'raw' in data
        raw = data['raw']
        # expect RFC or regimen keys
        assert any(k in raw for k in ['rfc', 'regimen', 'regimenfiscal', 'rfcactivo'])
    finally:
        os.unlink(path)
