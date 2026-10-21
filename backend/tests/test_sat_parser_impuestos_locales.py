from decimal import Decimal

from app.services.sat_parser import parsear_xml_sat

CFDI_ISH_SIN_IMPUESTOS = """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:implocal="http://www.sat.gob.mx/implocal"
  xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
  Version="4.0" TipoDeComprobante="I" SubTotal="1000.00" Total="1030.00" Moneda="MXN"
  Fecha="2026-02-10T10:00:00">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="Hotel" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="BBB010101BBB" Nombre="Cliente" UsoCFDI="G03"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="90111500" Cantidad="1" ClaveUnidad="E48"
      Descripcion="Hospedaje" ValorUnitario="1000.00" Importe="1000.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <implocal:ImpuestosLocales version="1.0" TotaldeRetenciones="0.00" TotaldeTraslados="30.00">
      <implocal:TrasladosLocales ImpLocTrasladado="ISH" TasadeTraslado="3.00" Importe="30.00"/>
    </implocal:ImpuestosLocales>
    <tfd:TimbreFiscalDigital UUID="11111111-1111-1111-1111-111111111111"
      FechaTimbrado="2026-02-10T10:00:05"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
"""


def test_impuestos_locales_se_leen_sin_nodo_impuestos():
    datos = parsear_xml_sat(CFDI_ISH_SIN_IMPUESTOS)
    assert datos["impuestos_locales"] == Decimal("30.00")
