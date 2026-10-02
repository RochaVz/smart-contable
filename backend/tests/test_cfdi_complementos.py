import pytest
from decimal import Decimal
from types import SimpleNamespace

from app.services.sat_parser import parsear_xml_sat
from app.services import cfdi_complementos as svc
from app.models.cfdi_complementos import (
    CfdiComplementoPago,
    CfdiNomina,
    CfdiNominaLinea,
    CfdiPagoDocumento,
    CfdiClasificacionEspecial,
    TipoLineaNomina,
    TipoClasificacionEspecial,
)
from app.api.v1.endpoints import facturas


XML_NOMINA = """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
 xmlns:nomina12="http://www.sat.gob.mx/nomina12"
 xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
 Version="4.0" Serie="N" Folio="1" Fecha="2026-03-15T12:00:00"
 SubTotal="10000.00" Total="8500.00" Moneda="MXN" TipoDeComprobante="N"
 LugarExpedicion="01000" MetodoPago="PUE" FormaPago="99">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMPRESA DEMO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="TRABAJADOR" UsoCFDI="CN01" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="605"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111505" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago de nomina" ValorUnitario="10000.00" Importe="10000.00"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" FechaTimbrado="2026-03-15T12:05:00"/>
    <nomina12:Nomina Version="1.2" TipoNomina="O" FechaPago="2026-03-15" FechaInicialPago="2026-03-01" FechaFinalPago="2026-03-15" NumDiasPagados="15" TotalPercepciones="10000.00" TotalDeducciones="1800.00" TotalOtrosPagos="300.00">
      <nomina12:Percepciones TotalSueldos="10000.00" TotalGravado="9000.00" TotalExento="1000.00">
        <nomina12:Percepcion TipoPercepcion="001" Clave="P001" Concepto="Sueldo" ImporteGravado="9000.00" ImporteExento="1000.00"/>
      </nomina12:Percepciones>
      <nomina12:Deducciones TotalOtrasDeducciones="300.00" TotalImpuestosRetenidos="1500.00">
        <nomina12:Deduccion TipoDeduccion="002" Clave="D002" Concepto="ISR" Importe="1500.00"/>
        <nomina12:Deduccion TipoDeduccion="001" Clave="D001" Concepto="IMSS" Importe="300.00"/>
      </nomina12:Deducciones>
      <nomina12:OtrosPagos>
        <nomina12:OtroPago TipoOtroPago="002" Clave="OP02" Concepto="Subsidio para el empleo" Importe="300.00">
          <nomina12:SubsidioAlEmpleo SubsidioCausado="350.00"/>
        </nomina12:OtroPago>
      </nomina12:OtrosPagos>
    </nomina12:Nomina>
  </cfdi:Complemento>
</cfdi:Comprobante>
"""

XML_PAGO = """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
 xmlns:pago20="http://www.sat.gob.mx/Pagos20"
 xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
 Version="4.0" Serie="P" Folio="9" Fecha="2026-04-10T10:00:00"
 SubTotal="0" Total="0" Moneda="XXX" TipoDeComprobante="P" LugarExpedicion="01000">
  <cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMPRESA DEMO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="BBB010101BBB" Nombre="CLIENTE" UsoCFDI="CP01" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="601"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/>
  </cfdi:Conceptos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="11111111-2222-3333-4444-555555555555" FechaTimbrado="2026-04-10T10:01:00"/>
    <pago20:Pagos Version="2.0">
      <pago20:Pago FechaPago="2026-04-09T12:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="1160.00">
        <pago20:DoctoRelacionado IdDocumento="99999999-8888-7777-6666-555555555555" MonedaDR="MXN" NumParcialidad="1" ImpSaldoAnt="1160.00" ImpPagado="1160.00" ImpSaldoInsoluto="0.00" ObjetoImpDR="02"/>
      </pago20:Pago>
    </pago20:Pagos>
  </cfdi:Complemento>
</cfdi:Comprobante>
"""

XML_ARRENDAMIENTO = """<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
 xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital"
 Version="4.0" Serie="A" Folio="2" Fecha="2026-05-01T09:00:00"
 SubTotal="5000.00" Total="5800.00" Moneda="MXN" TipoDeComprobante="I" LugarExpedicion="01000">
  <cfdi:Emisor Rfc="CCC010101CCC" Nombre="ARRENDADOR" RegimenFiscal="612"/>
  <cfdi:Receptor Rfc="AAA010101AAA" Nombre="EMPRESA DEMO" UsoCFDI="D10" DomicilioFiscalReceptor="01000" RegimenFiscalReceptor="601"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="80131500" Cantidad="1" ClaveUnidad="E48" Descripcion="Renta de oficina" ValorUnitario="5000.00" Importe="5000.00"/>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="800.00" TotalImpuestosRetenidos="850.00">
    <cfdi:Retenciones>
      <cfdi:Retencion Impuesto="001" Importe="500.00"/>
      <cfdi:Retencion Impuesto="002" Importe="350.00"/>
    </cfdi:Retenciones>
    <cfdi:Traslados>
      <cfdi:Traslado Base="5000.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="800.00"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital UUID="ABCDEF01-2345-6789-ABCD-EF0123456789" FechaTimbrado="2026-05-01T09:05:00"/>
  </cfdi:Complemento>
</cfdi:Comprobante>
"""


class FakeQuery:
    def __init__(self, db, model):
        self.db = db
        self.model = model
        self._filters = []

    def filter(self, *args):
        self._filters.extend(args)
        return self

    def options(self, *args):
        return self

    def order_by(self, *args):
        return self

    def first(self):
        name = getattr(self.model, "__name__", str(self.model))
        rows = [o for o in self.db.objects if o.__class__.__name__ == name or name in o.__class__.__name__]
        # naive: return first matching empresa/uuid if present in objects attrs
        for row in rows:
            return row
        return None

    def all(self):
        name = getattr(self.model, "__name__", str(self.model))
        return [o for o in self.db.objects if o.__class__.__name__ == name or name in o.__class__.__name__]


class FakeDB:
    def __init__(self):
        self.objects = []
        self.added = []
        self.committed = False
        self.new = set()
        self._id = 1

    def query(self, model):
        return FakeQuery(self, model)

    def add(self, obj):
        if getattr(obj, "id", None) is None:
            obj.id = self._id
            self._id += 1
        self.objects.append(obj)
        self.added.append(obj)
        self.new.add(obj)

    def flush(self):
        for obj in self.objects:
            if getattr(obj, "id", None) is None:
                obj.id = self._id
                self._id += 1

    def commit(self):
        self.committed = True

    def refresh(self, obj):
        return obj


def test_parsear_complemento_nomina_percepciones_deducciones_subsidio():
    datos = parsear_xml_sat(XML_NOMINA)
    assert datos["tipo_comprobante"] == "N"
    assert datos["uuid"] == "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE"
    nom = datos["nomina"]
    assert nom is not None
    assert nom["total_percepciones"] == 10000.0
    assert len(nom["percepciones"]) == 1
    assert nom["percepciones"][0]["tipo_percepcion"] == "001"
    assert len(nom["deducciones"]) == 2
    assert nom["isr_retenido"] == 1500.0
    assert nom["subsidio_causado"] == 350.0
    assert nom["subsidio_entregado"] == 300.0
    assert any(r["origen"] == "nomina_deduccion" for r in datos["retenciones_detalle"])


def test_parsear_complemento_pagos_docto_relacionado():
    datos = parsear_xml_sat(XML_PAGO)
    assert datos["tipo_comprobante"] == "P"
    pagos = datos["pagos"]
    assert pagos is not None
    assert pagos["num_documentos"] == 1
    assert pagos["total_pagos"] == 1160.0
    doc = pagos["documentos"][0]
    assert doc["uuid_cfdi_relacionado"] == "99999999-8888-7777-6666-555555555555"
    assert doc["importe_pagado"] == 1160.0


def test_clasificar_arrendamiento_e_intereses():
    datos = parsear_xml_sat(XML_ARRENDAMIENTO)
    assert datos["iva_retenido"] == Decimal("350.0") or float(datos["iva_retenido"]) == 350.0
    assert datos["isr_retenido"] == Decimal("500.0") or float(datos["isr_retenido"]) == 500.0
    tipos = [c["tipo"] for c in datos["clasificaciones_especiales"]]
    assert "arrendamiento" in tipos


def test_guardar_complemento_pago_relaciona_factura():
    db = FakeDB()
    factura = SimpleNamespace(
        id=77,
        empresa_id=1,
        uuid="99999999-8888-7777-6666-555555555555",
    )
    # Fake query needs to return factura for CfdiComplementoPago first() None then Factura
    class SmartDB(FakeDB):
        def query(self, model):
            q = FakeQuery(self, model)
            name = getattr(model, "__name__", "")
            if name == "CfdiComplementoPago":
                q.first = lambda: None
            elif name == "Factura":
                q.first = lambda: factura
            return q

    sdb = SmartDB()
    datos = parsear_xml_sat(XML_PAGO)
    complemento = svc.guardar_complemento_pago(sdb, empresa_id=1, datos=datos, xml_str=XML_PAGO)
    assert isinstance(complemento, CfdiComplementoPago)
    docs = [o for o in sdb.objects if isinstance(o, CfdiPagoDocumento)]
    assert len(docs) == 1
    assert docs[0].factura_id == 77
    assert docs[0].uuid_cfdi_relacionado == "99999999-8888-7777-6666-555555555555"


def test_guardar_nomina_lineas_y_subsidio():
    db = FakeDB()

    class SmartDB(FakeDB):
        def query(self, model):
            q = FakeQuery(self, model)
            name = getattr(model, "__name__", "")
            if name == "CfdiNomina":
                q.first = lambda: None
            return q

    sdb = SmartDB()
    factura = SimpleNamespace(id=10, empresa_id=1, uuid="AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")
    datos = parsear_xml_sat(XML_NOMINA)
    nomina = svc.guardar_nomina_desde_factura(sdb, empresa_id=1, factura=factura, datos=datos)
    assert isinstance(nomina, CfdiNomina)
    assert float(nomina.isr_retenido) == 1500.0
    assert float(nomina.subsidio_causado) == 350.0
    lineas = [o for o in sdb.objects if isinstance(o, CfdiNominaLinea)]
    assert any(l.tipo_linea == TipoLineaNomina.percepcion for l in lineas)
    assert any(l.tipo_linea == TipoLineaNomina.deduccion for l in lineas)
    assert any(l.es_subsidio for l in lineas)


def test_consolidar_retenciones_terceros():
    class Q:
        def __init__(self, rows):
            self.rows = rows
        def filter(self, *a, **k):
            return self
        def all(self):
            return self.rows

    class DB:
        def query(self, model):
            name = getattr(model, "__name__", "")
            if name == "Factura":
                return Q([
                    SimpleNamespace(
                        id=1,
                        uuid="U1",
                        tipo_comprobante="I",
                        isr_retenido=100,
                        iva_retenido=50,
                        rfc_receptor="X",
                        nombre_receptor="Y",
                        fecha_emision=None,
                    )
                ])
            if name == "CfdiNomina":
                return Q([])
            return Q([])

    result = svc.consolidar_retenciones_terceros(DB(), empresa_id=1, mes=3, anio=2026)
    assert result["total_isr_retenido"] == 100.0
    assert result["total_iva_retenido"] == 50.0
    assert result["num_documentos"] == 1


def test_procesar_xml_interno_registra_complemento_pago(monkeypatch):
    datos = parsear_xml_sat(XML_PAGO)
    monkeypatch.setattr(facturas, "parsear_xml_sat", lambda _xml: datos)
    monkeypatch.setattr(facturas, "validar_cfdi_empresa", lambda *_a, **_k: None)

    class SmartDB(FakeDB):
        def query(self, model):
            q = FakeQuery(self, model)
            name = getattr(model, "__name__", "")
            if name in ("CfdiComplementoPago", "Factura"):
                q.first = lambda: None
            return q

    sdb = SmartDB()
    resultado = facturas.procesar_xml_interno(
        empresa_id=1,
        xml_str=XML_PAGO,
        db=sdb,
        empresa_rfc="AAA010101AAA",
    )
    assert isinstance(resultado, facturas.ComplementoPagoRegistrado)
    assert resultado.uuid == "11111111-2222-3333-4444-555555555555"
