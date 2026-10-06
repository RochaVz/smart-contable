from types import SimpleNamespace

from app.services.cfdi_helpers import (
    obtener_xml_factura,
    resumen_concepto_desde_datos,
    serializar_conceptos,
)


def test_resumen_concepto_usa_completo_y_fallback():
    datos = {
        "concepto_completo": "A | B",
        "conceptos": [{"descripcion": "A"}, {"descripcion": "B"}],
    }
    assert resumen_concepto_desde_datos(datos) == "A | B"
    assert resumen_concepto_desde_datos({}, fallback="Guardado") == "Guardado"
    assert resumen_concepto_desde_datos(
        {"conceptos": [{"descripcion": "Uno"}, {"descripcion": "Dos"}]}
    ) == "Uno (+1 más)"


def test_serializar_conceptos_normaliza_campos():
    datos = {
        "conceptos": [
            {
                "descripcion": "Servicio",
                "importe": "150.5",
                "cantidad": "2",
                "clave_prod_serv": "80101500",
                "unidad": "E48",
            }
        ]
    }
    assert serializar_conceptos(datos) == [
        {
            "descripcion": "Servicio",
            "importe": 150.5,
            "cantidad": 2.0,
            "clave_prod_serv": "80101500",
            "unidad": "E48",
        }
    ]


def test_obtener_xml_factura_prioriza_contenido_local():
    factura = SimpleNamespace(
        xml_contenido="<cfdi>local</cfdi>",
        archivo_s3_key="empresas/1/cfdi/x.xml",
    )
    assert obtener_xml_factura(factura, permitir_s3=False) == "<cfdi>local</cfdi>"
    assert obtener_xml_factura(factura, permitir_s3=True) == "<cfdi>local</cfdi>"


def test_obtener_xml_factura_sin_local_ni_s3_devuelve_none():
    factura = SimpleNamespace(xml_contenido=None, archivo_s3_key=None)
    assert obtener_xml_factura(factura, permitir_s3=True) is None
