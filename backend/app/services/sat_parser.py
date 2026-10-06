from defusedxml.ElementTree import fromstring, ParseError
from datetime import datetime
from typing import Optional, Any
from decimal import Decimal

# Namespaces del SAT para CFDI 3.3 y 4.0 y complementos
NAMESPACES = {
    "cfdi": "http://www.sat.gob.mx/cfd/4",
    "cfdi33": "http://www.sat.gob.mx/cfd/3",
    "tfd": "http://www.sat.gob.mx/TimbreFiscalDigital",
    "implocal": "http://www.sat.gob.mx/implocal",
    "nomina12": "http://www.sat.gob.mx/nomina12",
    "pago20": "http://www.sat.gob.mx/Pagos20",
    "pago10": "http://www.sat.gob.mx/Pagos",
}

# Claves ProdServ frecuentes para clasificacion especial (SAT)
CLAVES_ARRENDAMIENTO = {"80131500", "80131501", "80131502"}
CLAVES_INTERESES = {"84101700", "84101701", "84101702", "84101703"}
CLAVES_DIVIDENDOS = {"84101704", "84101600", "84121500"}


def detectar_version(root) -> tuple[str, str]:
    """Detecta la version del CFDI y retorna (version, namespace)."""
    version = root.get("Version") or root.get("version", "3.3")
    if version.startswith("4"):
        return version, "cfdi"
    return version, "cfdi33"


def _to_decimal(value: Any, default: str = "0") -> Decimal:
    if value is None or value == "":
        return Decimal(default)
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal(default)


def _local(tag: str | None) -> str:
    if not tag:
        return ""
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _attr(node, name: str) -> str | None:
    """Lee atributo CFDI con fallback case-insensitive."""
    if node is None:
        return None
    value = node.get(name)
    if value is not None:
        return value
    target = name.lower()
    for key, val in node.attrib.items():
        local = key.rsplit("}", 1)[-1] if "}" in key else key
        if local.lower() == target:
            return val
    return None


def _find_by_local(parent, local_name: str):
    if parent is None:
        return None
    for child in parent.iter():
        if _local(child.tag) == local_name:
            return child
    return None


def _findall_by_local(parent, local_name: str) -> list:
    if parent is None:
        return []
    return [child for child in list(parent) if _local(child.tag) == local_name]


def parsear_xml_sat(contenido_xml: str) -> dict:
    xml_limpio = contenido_xml.strip()
    try:
        root = fromstring(xml_limpio)
    except ParseError as e:
        raise ValueError(f"XML invalido: {e}") from e

    version, ns_key = detectar_version(root)
    ns = NAMESPACES[ns_key]

    datos = {
        "version_cfdi": version,
        "uuid": None,
        "serie": root.get("Serie", ""),
        "folio": root.get("Folio", ""),
        "fecha_emision": _parsear_fecha(root.get("Fecha")),
        "fecha_timbrado": None,
        "tipo_comprobante": root.get("TipoDeComprobante", ""),
        "forma_pago": root.get("FormaPago", ""),
        "metodo_pago": root.get("MetodoPago", ""),
        "moneda": root.get("Moneda", "MXN"),
        "tipo_cambio": _to_decimal(root.get("TipoCambio", 1.0), "1"),
        "subtotal": _to_decimal(root.get("SubTotal", 0)),
        "descuento": _to_decimal(root.get("Descuento", 0)),
        "total": _to_decimal(root.get("Total", 0)),
        "lugar_expedicion": root.get("LugarExpedicion", ""),
        "rfc_emisor": None,
        "nombre_emisor": None,
        "regimen_emisor": None,
        "rfc_receptor": None,
        "nombre_receptor": None,
        "uso_cfdi": None,
        "regimen_receptor": None,
        "domicilio_fiscal": None,
        "receptor": {},
        "iva_trasladado": Decimal("0.0"),
        "iva_retenido": Decimal("0.0"),
        "isr_retenido": Decimal("0.0"),
        "impuestos_locales": Decimal("0.0"),
        "conceptos": [],
        "nomina": None,
        "pagos": None,
        "retenciones_detalle": [],
        "clasificaciones_especiales": [],
    }

    emisor = root.find(f"{{{ns}}}Emisor")
    if emisor is None:
        emisor = _find_by_local(root, "Emisor")
    if emisor is not None:
        datos["rfc_emisor"] = _attr(emisor, "Rfc")
        datos["nombre_emisor"] = _attr(emisor, "Nombre")
        datos["regimen_emisor"] = _attr(emisor, "RegimenFiscal")

    receptor = root.find(f"{{{ns}}}Receptor")
    if receptor is None:
        receptor = _find_by_local(root, "Receptor")
    if receptor is not None:
        datos["rfc_receptor"] = _attr(receptor, "Rfc")
        datos["nombre_receptor"] = _attr(receptor, "Nombre")
        datos["uso_cfdi"] = _attr(receptor, "UsoCFDI")
        datos["regimen_receptor"] = _attr(receptor, "RegimenFiscalReceptor")
        datos["domicilio_fiscal"] = _attr(receptor, "DomicilioFiscalReceptor")
        datos["receptor"] = {
            "rfc": datos["rfc_receptor"],
            "nombre": datos["nombre_receptor"],
            "uso_cfdi": datos["uso_cfdi"],
            "regimen_fiscal": datos["regimen_receptor"],
            "domicilio_fiscal": datos["domicilio_fiscal"],
        }

    conceptos_node = root.find(f"{{{ns}}}Conceptos")
    if conceptos_node is None:
        conceptos_node = _find_by_local(root, "Conceptos")
    if conceptos_node is not None:
        conceptos = conceptos_node.findall(f"{{{ns}}}Concepto")
        if not conceptos:
            conceptos = _findall_by_local(conceptos_node, "Concepto")
        for concepto in conceptos:
            datos["conceptos"].append(
                {
                    "clave_prod_serv": _attr(concepto, "ClaveProdServ"),
                    "descripcion": _attr(concepto, "Descripcion"),
                    "clave_unidad": _attr(concepto, "ClaveUnidad"),
                    "no_identificacion": _attr(concepto, "NoIdentificacion"),
                    "objeto_imp": _attr(concepto, "ObjetoImp"),
                    "cantidad": float(_attr(concepto, "Cantidad") or 1),
                    "unidad": _attr(concepto, "Unidad") or "",
                    "valor_unitario": float(_attr(concepto, "ValorUnitario") or 0),
                    "importe": float(_attr(concepto, "Importe") or 0),
                    "descuento": float(_attr(concepto, "Descuento") or 0),
                }
            )

    impuestos = root.find(f"{{{ns}}}Impuestos")
    if impuestos is not None:
        traslados = impuestos.find(f"{{{ns}}}Traslados")
        if traslados is not None:
            for traslado in traslados.findall(f"{{{ns}}}Traslado"):
                impuesto = traslado.get("Impuesto")
                importe = _to_decimal(traslado.get("Importe", 0))
                if impuesto == "002":
                    datos["iva_trasladado"] += importe

        retenciones = impuestos.find(f"{{{ns}}}Retenciones")
        if retenciones is not None:
            for retencion in retenciones.findall(f"{{{ns}}}Retencion"):
                impuesto = retencion.get("Impuesto")
                importe = _to_decimal(retencion.get("Importe", 0))
                if impuesto == "001":
                    datos["isr_retenido"] += importe
                    datos["retenciones_detalle"].append(
                        {
                            "impuesto": "ISR",
                            "codigo": "001",
                            "importe": float(importe),
                            "origen": "cfdi_retenciones",
                        }
                    )
                elif impuesto == "002":
                    datos["iva_retenido"] += importe
                    datos["retenciones_detalle"].append(
                        {
                            "impuesto": "IVA",
                            "codigo": "002",
                            "importe": float(importe),
                            "origen": "cfdi_retenciones",
                        }
                    )

        implocal_ns = NAMESPACES.get("implocal")
        complemento_local = root.find(f"{{{ns}}}Complemento")
        if complemento_local is not None:
            implocal = complemento_local.find(f"{{{implocal_ns}}}ImpuestosLocales")
            if implocal is not None:
                total_locales = Decimal("0.0")
                for traslado in implocal.findall(f"{{{implocal_ns}}}TrasladosLocales"):
                    total_locales += _to_decimal(traslado.get("Importe", 0))
                datos["impuestos_locales"] = total_locales

    tfd_ns = NAMESPACES["tfd"]
    complemento = root.find(f"{{{ns}}}Complemento")
    if complemento is not None:
        tfd = complemento.find(f"{{{tfd_ns}}}TimbreFiscalDigital")
        if tfd is not None:
            datos["uuid"] = tfd.get("UUID")
            datos["fecha_timbrado"] = _parsear_fecha(tfd.get("FechaTimbrado"))

        datos["nomina"] = _parsear_complemento_nomina(complemento)
        datos["pagos"] = _parsear_complemento_pagos(complemento)

        if datos["nomina"]:
            isr_nom = _to_decimal(datos["nomina"].get("isr_retenido", 0))
            if isr_nom > 0:
                datos["isr_retenido"] = max(datos["isr_retenido"], isr_nom)
                datos["retenciones_detalle"].append(
                    {
                        "impuesto": "ISR",
                        "codigo": "001",
                        "importe": float(isr_nom),
                        "origen": "nomina_deduccion",
                    }
                )

    datos["tipo_factura"] = _determinar_tipo(datos["tipo_comprobante"])

    if datos["conceptos"]:
        datos["concepto_principal"] = datos["conceptos"][0]["descripcion"]
        datos["clave_prod_serv_principal"] = datos["conceptos"][0]["clave_prod_serv"]
    else:
        datos["concepto_principal"] = ""
        datos["clave_prod_serv_principal"] = None

    datos["descripciones_conceptos"] = [
        c.get("descripcion") or "" for c in datos["conceptos"] if c.get("descripcion")
    ]
    datos["claves_prod_serv"] = [
        c.get("clave_prod_serv") or "" for c in datos["conceptos"] if c.get("clave_prod_serv")
    ]
    datos["concepto_completo"] = " | ".join(datos["descripciones_conceptos"])
    datos["clasificaciones_especiales"] = _clasificar_conceptos_especiales(datos)

    return datos


def _parsear_complemento_nomina(complemento) -> dict | None:
    nomina_node = None
    for child in complemento:
        if _local(child.tag) == "Nomina":
            nomina_node = child
            break
    if nomina_node is None:
        return None

    percepciones = []
    deducciones = []
    otros_pagos = []
    total_percepciones = _to_decimal(nomina_node.get("TotalPercepciones", 0))
    total_deducciones = _to_decimal(nomina_node.get("TotalDeducciones", 0))
    total_otros_pagos = _to_decimal(nomina_node.get("TotalOtrosPagos", 0))
    total_sueldos = Decimal("0")
    total_gravado = Decimal("0")
    total_exento = Decimal("0")
    isr_retenido = Decimal("0")
    subsidio_causado = Decimal("0")
    subsidio_entregado = Decimal("0")

    for perc_wrap in _findall_by_local(nomina_node, "Percepciones") or []:
        total_sueldos = _to_decimal(perc_wrap.get("TotalSueldos", total_sueldos))
        total_gravado = _to_decimal(perc_wrap.get("TotalGravado", total_gravado))
        total_exento = _to_decimal(perc_wrap.get("TotalExento", total_exento))
        for perc in list(perc_wrap):
            if _local(perc.tag) != "Percepcion":
                continue
            gravado = _to_decimal(perc.get("ImporteGravado", 0))
            exento = _to_decimal(perc.get("ImporteExento", 0))
            percepciones.append(
                {
                    "tipo_percepcion": perc.get("TipoPercepcion"),
                    "clave": perc.get("Clave"),
                    "concepto": perc.get("Concepto"),
                    "importe_gravado": float(gravado),
                    "importe_exento": float(exento),
                    "importe": float(gravado + exento),
                }
            )

    for ded_wrap in _findall_by_local(nomina_node, "Deducciones") or []:
        for ded in list(ded_wrap):
            if _local(ded.tag) != "Deduccion":
                continue
            importe = _to_decimal(ded.get("Importe", 0))
            tipo = (ded.get("TipoDeduccion") or "").strip()
            item = {
                "tipo_deduccion": tipo,
                "clave": ded.get("Clave"),
                "concepto": ded.get("Concepto"),
                "importe": float(importe),
            }
            deducciones.append(item)
            # 002 = ISR en catalogo nomina12
            if tipo == "002" or "ISR" in (ded.get("Concepto") or "").upper():
                isr_retenido += importe

    for otros_wrap in _findall_by_local(nomina_node, "OtrosPagos") or []:
        for otro in list(otros_wrap):
            if _local(otro.tag) != "OtroPago":
                continue
            importe = _to_decimal(otro.get("Importe", 0))
            tipo_otro = (otro.get("TipoOtroPago") or "").strip()
            concepto = otro.get("Concepto") or ""
            item = {
                "tipo_otro_pago": tipo_otro,
                "clave": otro.get("Clave"),
                "concepto": concepto,
                "importe": float(importe),
                "subsidio_causado": None,
            }
            sub = None
            for child in list(otro):
                if _local(child.tag) == "SubsidioAlEmpleo":
                    sub = child
                    break
            if sub is not None:
                causado = _to_decimal(sub.get("SubsidioCausado", 0))
                item["subsidio_causado"] = float(causado)
                subsidio_causado += causado
                subsidio_entregado += importe
            elif tipo_otro == "002" or "SUBSIDIO" in concepto.upper():
                subsidio_entregado += importe
            otros_pagos.append(item)

    return {
        "version": nomina_node.get("Version"),
        "tipo_nomina": nomina_node.get("TipoNomina"),
        "fecha_pago": nomina_node.get("FechaPago"),
        "fecha_inicial_pago": nomina_node.get("FechaInicialPago"),
        "fecha_final_pago": nomina_node.get("FechaFinalPago"),
        "num_dias_pagados": float(nomina_node.get("NumDiasPagados") or 0),
        "total_percepciones": float(total_percepciones),
        "total_deducciones": float(total_deducciones),
        "total_otros_pagos": float(total_otros_pagos),
        "total_sueldos": float(total_sueldos),
        "total_gravado": float(total_gravado),
        "total_exento": float(total_exento),
        "isr_retenido": float(isr_retenido),
        "subsidio_causado": float(subsidio_causado),
        "subsidio_entregado": float(subsidio_entregado),
        "percepciones": percepciones,
        "deducciones": deducciones,
        "otros_pagos": otros_pagos,
    }


def _parsear_complemento_pagos(complemento) -> dict | None:
    pagos_node = None
    for child in complemento:
        if _local(child.tag) == "Pagos":
            pagos_node = child
            break
    if pagos_node is None:
        return None

    version = pagos_node.get("Version") or "2.0"
    pagos = []
    documentos = []

    for pago in list(pagos_node):
        if _local(pago.tag) != "Pago":
            continue
        pago_item = {
            "fecha_pago": pago.get("FechaPago"),
            "forma_pago_p": pago.get("FormaDePagoP") or pago.get("FormaDePago"),
            "moneda_p": pago.get("MonedaP") or pago.get("Moneda") or "MXN",
            "tipo_cambio_p": float(_to_decimal(pago.get("TipoCambioP") or pago.get("TipoCambio") or 1, "1")),
            "monto": float(_to_decimal(pago.get("Monto", 0))),
            "num_operacion": pago.get("NumOperacion"),
            "documentos": [],
        }
        for doc in list(pago):
            if _local(doc.tag) != "DoctoRelacionado":
                continue
            uuid_rel = (doc.get("IdDocumento") or "").strip().upper()
            doc_item = {
                "uuid_cfdi_relacionado": uuid_rel or None,
                "serie": doc.get("Serie"),
                "folio": doc.get("Folio"),
                "moneda_dr": doc.get("MonedaDR") or doc.get("Moneda") or "MXN",
                "num_parcialidad": int(float(doc.get("NumParcialidad") or 0) or 0) or None,
                "importe_saldo_anterior": float(
                    _to_decimal(doc.get("ImpSaldoAnt") or doc.get("ImportSaldoAnt") or 0)
                ),
                "importe_pagado": float(_to_decimal(doc.get("ImpPagado") or doc.get("ImportPagado") or 0)),
                "importe_saldo_insoluto": float(
                    _to_decimal(doc.get("ImpSaldoInsoluto") or doc.get("ImportSaldoInsoluto") or 0)
                ),
                "metodo_pago_dr": doc.get("MetodoDePagoDR") or doc.get("MetodoDePago"),
                "objeto_imp_dr": doc.get("ObjetoImpDR"),
                "equivalencia_dr": float(_to_decimal(doc.get("EquivalenciaDR") or 1, "1")),
            }
            pago_item["documentos"].append(doc_item)
            documentos.append(doc_item)
        pagos.append(pago_item)

    if not pagos and not documentos:
        return None

    return {
        "version": version,
        "pagos": pagos,
        "documentos": documentos,
        "total_pagos": float(sum(_to_decimal(p.get("monto", 0)) for p in pagos)),
        "num_documentos": len(documentos),
    }


def _clasificar_conceptos_especiales(datos: dict) -> list[dict]:
    hallazgos = []
    for concepto in datos.get("conceptos") or []:
        clave = (concepto.get("clave_prod_serv") or "").strip()
        desc = (concepto.get("descripcion") or "").lower()
        tipo = None
        if clave in CLAVES_ARRENDAMIENTO or "arrend" in desc or "renta" in desc:
            tipo = "arrendamiento"
        elif clave in CLAVES_INTERESES or "interes" in desc or "interés" in desc:
            tipo = "intereses"
        elif clave in CLAVES_DIVIDENDOS or "dividendo" in desc:
            tipo = "dividendos"
        if tipo:
            hallazgos.append(
                {
                    "tipo": tipo,
                    "clave_prod_serv": clave or None,
                    "descripcion": concepto.get("descripcion"),
                    "importe": float(concepto.get("importe") or 0),
                }
            )
    # Uso CFDI tipicos
    uso = (datos.get("uso_cfdi") or "").upper()
    if uso == "D10" and not any(h["tipo"] == "arrendamiento" for h in hallazgos):
        hallazgos.append(
            {
                "tipo": "arrendamiento",
                "clave_prod_serv": datos.get("clave_prod_serv_principal"),
                "descripcion": datos.get("concepto_principal"),
                "importe": float(datos.get("subtotal") or 0),
            }
        )
    return hallazgos


def _parsear_fecha(fecha_str: Optional[str]) -> Optional[datetime]:
    """Convierte string de fecha SAT a datetime."""
    if not fecha_str:
        return None
    formatos = [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in formatos:
        try:
            return datetime.strptime(fecha_str[:19] if "T" in fecha_str and len(fecha_str) > 19 else fecha_str, fmt)
        except ValueError:
            continue
    # Timestamps con zona: 2026-01-01T12:00:00-06:00
    try:
        clean = fecha_str.replace("Z", "+00:00")
        if len(clean) >= 19:
            return datetime.strptime(clean[:19], "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        pass
    return None


def _determinar_tipo(tipo_comprobante: str) -> str:
    """
    Determina el tipo de factura para el sistema contable.
    I=Ingreso, E=Egreso, T=Traslado, N=Nomina, P=Complemento de Pago.
    """
    mapa = {
        "I": "ingreso",
        "E": "egreso",
        "T": "traslado",
        "N": "egreso",
        "P": "pago",
    }
    return mapa.get(tipo_comprobante, "ingreso")
