from defusedxml.ElementTree import fromstring, ParseError
from datetime import datetime
from typing import Optional
from decimal import Decimal

# Namespaces del SAT para CFDI 3.3 y 4.0
NAMESPACES = {
    'cfdi': 'http://www.sat.gob.mx/cfd/4',
    'cfdi33': 'http://www.sat.gob.mx/cfd/3',
    'tfd': 'http://www.sat.gob.mx/TimbreFiscalDigital',
    'implocal': 'http://www.sat.gob.mx/implocal',
}

def detectar_version(root) -> tuple[str, str]:
    """Detecta la versión del CFDI y retorna (version, namespace)."""
    version = root.get('Version') or root.get('version', '3.3')
    if version.startswith('4'):
        return version, 'cfdi'
    return version, 'cfdi33'

def parsear_xml_sat(contenido_xml: str) -> dict:
    xml_limpio = contenido_xml.strip()
    try:
        root = fromstring(xml_limpio)
    except ParseError as e:
        raise ValueError(f"XML inválido: {e}") from e

    version, ns_key = detectar_version(root)
    ns = NAMESPACES[ns_key]

    # Datos principales del comprobante
    datos = {
        'version_cfdi':     version,
        'uuid':             None,
        'serie':            root.get('Serie', ''),
        'folio':            root.get('Folio', ''),
        'fecha_emision':    _parsear_fecha(root.get('Fecha')),
        'fecha_timbrado':   None,
        'tipo_comprobante': root.get('TipoDeComprobante', ''),
        'forma_pago':       root.get('FormaPago', ''),
        'metodo_pago':      root.get('MetodoPago', ''),
        'moneda':           root.get('Moneda', 'MXN'),
        'tipo_cambio':      Decimal(str(root.get('TipoCambio', 1.0))),
        'subtotal':         Decimal(str(root.get('SubTotal', 0))),
        'descuento':        Decimal(str(root.get('Descuento', 0))),
        'total':            Decimal(str(root.get('Total', 0))),
        'lugar_expedicion': root.get('LugarExpedicion', ''),

        # Emisor
        'rfc_emisor':       None,
        'nombre_emisor':    None,
        'regimen_emisor':   None,

        # Receptor
        'rfc_receptor':     None,
        'nombre_receptor':  None,
        'uso_cfdi':         None,
        'regimen_receptor': None,
        'domicilio_fiscal': None,

        # Impuestos
        'iva_trasladado':   Decimal('0.0'),
        'iva_retenido':     Decimal('0.0'),
        'isr_retenido':     Decimal('0.0'),
        'impuestos_locales': Decimal('0.0'),
        # Conceptos
        'conceptos':        [],
    }

    # Emisor
    emisor = root.find(f'{{{ns}}}Emisor')
    if emisor is not None:
        datos['rfc_emisor']     = emisor.get('Rfc')
        datos['nombre_emisor']  = emisor.get('Nombre')
        datos['regimen_emisor'] = emisor.get('RegimenFiscal')

    # Receptor
    receptor = root.find(f'{{{ns}}}Receptor')
    if receptor is not None:
        datos['rfc_receptor']     = receptor.get('Rfc')
        datos['nombre_receptor']  = receptor.get('Nombre')
        datos['uso_cfdi']         = receptor.get('UsoCFDI')
        datos['regimen_receptor'] = receptor.get('RegimenFiscalReceptor')
        datos['domicilio_fiscal'] = receptor.get('DomicilioFiscalReceptor')

    # Conceptos
    conceptos_node = root.find(f'{{{ns}}}Conceptos')
    if conceptos_node is not None:
        for concepto in conceptos_node.findall(f'{{{ns}}}Concepto'):
            datos['conceptos'].append({
                'clave_prod_serv': concepto.get('ClaveProdServ'),
                'descripcion':     concepto.get('Descripcion'),
                'cantidad':        float(concepto.get('Cantidad', 1)),
                'unidad':          concepto.get('Unidad', ''),
                'valor_unitario':  float(concepto.get('ValorUnitario', 0)),
                'importe':         float(concepto.get('Importe', 0)),
                'descuento':       float(concepto.get('Descuento', 0)),
            })

    # Impuestos
    impuestos = root.find(f'{{{ns}}}Impuestos')
    if impuestos is not None:
        # Traslados (IVA cobrado/pagado)
        traslados = impuestos.find(f'{{{ns}}}Traslados')
        if traslados is not None:
            for traslado in traslados.findall(f'{{{ns}}}Traslado'):
                impuesto = traslado.get('Impuesto')
                importe = Decimal(str(traslado.get('Importe', 0)))
                if impuesto == '002':  # IVA
                    datos['iva_trasladado'] += importe

        # Retenciones (ISR e IVA retenido)
        retenciones = impuestos.find(f'{{{ns}}}Retenciones')
        if retenciones is not None:
            for retencion in retenciones.findall(f'{{{ns}}}Retencion'):
                impuesto = retencion.get('Impuesto')
                importe = Decimal(str(retencion.get('Importe', 0)))
                if impuesto == '001':  # ISR
                    datos['isr_retenido'] += importe
                elif impuesto == '002':  # IVA
                    datos['iva_retenido'] += importe
        
        implocal_ns = NAMESPACES.get('implocal')
        complemento = root.find(f'{{{ns}}}Complemento')
        if complemento is not None:
            implocal = complemento.find(f'{{{implocal_ns}}}ImpuestosLocales')
            if implocal is not None:
                # Sumamos el Impuesto Local
                total_locales = Decimal('0.0')
                for traslado in implocal.findall(f'{{{implocal_ns}}}TrasladosLocales'):
                    total_locales += Decimal(str(traslado.get('Importe', 0)))
                datos['impuestos_locales'] = total_locales

    # Timbre Fiscal Digital (UUID y fecha timbrado)
    tfd_ns = NAMESPACES['tfd']
    complemento = root.find(f'{{{ns}}}Complemento')
    if complemento is not None:
        tfd = complemento.find(f'{{{tfd_ns}}}TimbreFiscalDigital')
        if tfd is not None:
            datos['uuid']           = tfd.get('UUID')
            datos['fecha_timbrado'] = _parsear_fecha(tfd.get('FechaTimbrado'))

    # Determinar tipo de factura para el sistema
    datos['tipo_factura'] = _determinar_tipo(datos['tipo_comprobante'])

    # Concepto principal (primer concepto)
    if datos['conceptos']:
        datos['concepto_principal'] = datos['conceptos'][0]['descripcion']
    else:
        datos['concepto_principal'] = ''

    return datos


def _parsear_fecha(fecha_str: Optional[str]) -> Optional[datetime]:
    """Convierte string de fecha SAT a datetime."""
    if not fecha_str:
        return None
    formatos = [
        '%Y-%m-%dT%H:%M:%S',
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d',
    ]
    for fmt in formatos:
        try:
            return datetime.strptime(fecha_str, fmt)
        except ValueError:
            continue
    return None


def _determinar_tipo(tipo_comprobante: str) -> str:
    """
    Determina el tipo de factura para el sistema contable.
    I=Ingreso, E=Egreso, T=Traslado, N=Nómina, P=Pago
    """
    mapa = {
        'I': 'ingreso',
        'E': 'egreso',
        'T': 'ingreso',
        'N': 'egreso',
        'P': 'ingreso',
    }
    return mapa.get(tipo_comprobante, 'ingreso')