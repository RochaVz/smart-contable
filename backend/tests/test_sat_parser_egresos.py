from app.services.sat_parser import parsear_xml_sat


CFDI_EGRESO = """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"
    Fecha="2026-09-07T12:00:00" TipoDeComprobante="I" SubTotal="1500" Total="1740">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Proveedor de servicios" RegimenFiscal="601" />
  <cfdi:Receptor Rfc="BBB010101BBB" Nombre="Empresa receptora" UsoCFDI="G03"
      RegimenFiscalReceptor="601" DomicilioFiscalReceptor="01000" />
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="80101500" Cantidad="1" ClaveUnidad="E48"
        Descripcion="Consultoria contable" ValorUnitario="1000" Importe="1000" ObjetoImp="02" />
    <cfdi:Concepto ClaveProdServ="81112100" Cantidad="1" ClaveUnidad="E48"
        Descripcion="Servicio de hosting" ValorUnitario="500" Importe="500" ObjetoImp="02" />
  </cfdi:Conceptos>
</cfdi:Comprobante>"""


def test_parsea_receptor_y_todos_los_datos_de_conceptos():
    datos = parsear_xml_sat(CFDI_EGRESO)

    assert datos["receptor"] == {
        "rfc": "BBB010101BBB",
        "nombre": "Empresa receptora",
        "uso_cfdi": "G03",
        "regimen_fiscal": "601",
        "domicilio_fiscal": "01000",
    }
    assert datos["claves_prod_serv"] == ["80101500", "81112100"]
    assert datos["descripciones_conceptos"] == ["Consultoria contable", "Servicio de hosting"]
    assert datos["concepto_completo"] == "Consultoria contable | Servicio de hosting"
    assert datos["conceptos"][0]["clave_unidad"] == "E48"
    assert datos["conceptos"][1]["descripcion"] == "Servicio de hosting"