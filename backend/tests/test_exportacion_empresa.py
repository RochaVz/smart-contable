from app.services.exportacion_empresa import obtener_secciones_exportacion


def test_obtener_secciones_exportacion_todo():
    assert obtener_secciones_exportacion("todo") == [
        "resumen",
        "empresa",
        "facturas",
        "polizas",
        "movimientos",
        "mapeos",
        "comisiones",
    ]


def test_obtener_secciones_exportacion_facturas():
    assert obtener_secciones_exportacion("facturas") == ["facturas"]


def test_obtener_secciones_exportacion_ingresos():
    assert obtener_secciones_exportacion("ingresos") == ["resumen", "empresa", "facturas"]


def test_obtener_secciones_exportacion_egresos():
    assert obtener_secciones_exportacion("egresos") == ["resumen", "empresa", "facturas"]
