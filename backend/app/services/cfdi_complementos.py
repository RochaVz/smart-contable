"""Persistencia y consulta de complementos CFDI (nomina, pagos, especiales, retenciones)."""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import extract, func, or_
from sqlalchemy.orm import Session

from app.models.cfdi_complementos import (
    CfdiClasificacionEspecial,
    CfdiComplementoPago,
    CfdiNomina,
    CfdiNominaLinea,
    CfdiPagoDocumento,
    TipoClasificacionEspecial,
    TipoLineaNomina,
)
from app.models.factura import Factura
from app.services.sat_parser import _parsear_fecha, _to_decimal


def _dec(value: Any, default: str = "0") -> Decimal:
    return _to_decimal(value, default)


def _json_dump(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def guardar_complemento_pago(
    db: Session,
    *,
    empresa_id: int,
    datos: dict,
    xml_str: str | None = None,
    archivo_s3_key: str | None = None,
    commit: bool = False,
) -> CfdiComplementoPago:
    uuid_norm = (datos.get("uuid") or "").strip().upper()
    if not uuid_norm:
        raise HTTPException(status_code=400, detail="El complemento de pago no tiene UUID")

    existente = (
        db.query(CfdiComplementoPago)
        .filter(
            CfdiComplementoPago.empresa_id == empresa_id,
            CfdiComplementoPago.uuid == uuid_norm,
        )
        .first()
    )
    if existente:
        raise HTTPException(
            status_code=409,
            detail=f"El complemento de pago ya esta registrado (UUID: {uuid_norm}).",
        )

    pagos_info = datos.get("pagos") or {}
    complemento = CfdiComplementoPago(
        empresa_id=empresa_id,
        uuid=uuid_norm,
        serie=datos.get("serie") or None,
        folio=str(datos.get("folio") or "")[:40] or None,
        version_cfdi=datos.get("version_cfdi"),
        version_pagos=pagos_info.get("version"),
        fecha_emision=datos.get("fecha_emision"),
        fecha_timbrado=datos.get("fecha_timbrado"),
        rfc_emisor=(datos.get("rfc_emisor") or "").upper(),
        nombre_emisor=datos.get("nombre_emisor"),
        rfc_receptor=(datos.get("rfc_receptor") or "").upper(),
        nombre_receptor=datos.get("nombre_receptor"),
        moneda=datos.get("moneda") or "MXN",
        total=_dec(datos.get("total")),
        total_pagos=_dec(pagos_info.get("total_pagos") or datos.get("total")),
        num_documentos=int(pagos_info.get("num_documentos") or 0),
        xml_contenido=xml_str,
        archivo_s3_key=archivo_s3_key,
    )
    db.add(complemento)
    db.flush()

    for pago in pagos_info.get("pagos") or []:
        fecha_pago = _parsear_fecha(pago.get("fecha_pago")) if isinstance(pago.get("fecha_pago"), str) else pago.get("fecha_pago")
        for doc in pago.get("documentos") or []:
            uuid_rel = (doc.get("uuid_cfdi_relacionado") or "").strip().upper() or None
            factura_rel = None
            if uuid_rel:
                factura_rel = (
                    db.query(Factura)
                    .filter(Factura.empresa_id == empresa_id, Factura.uuid == uuid_rel)
                    .first()
                )
            db.add(
                CfdiPagoDocumento(
                    empresa_id=empresa_id,
                    complemento_pago_id=complemento.id,
                    factura_id=factura_rel.id if factura_rel else None,
                    uuid_cfdi_relacionado=uuid_rel,
                    serie=doc.get("serie"),
                    folio=str(doc.get("folio") or "")[:40] or None,
                    moneda_dr=doc.get("moneda_dr"),
                    num_parcialidad=doc.get("num_parcialidad"),
                    importe_saldo_anterior=_dec(doc.get("importe_saldo_anterior")),
                    importe_pagado=_dec(doc.get("importe_pagado")),
                    importe_saldo_insoluto=_dec(doc.get("importe_saldo_insoluto")),
                    metodo_pago_dr=doc.get("metodo_pago_dr"),
                    objeto_imp_dr=doc.get("objeto_imp_dr"),
                    fecha_pago=fecha_pago,
                    forma_pago_p=pago.get("forma_pago_p"),
                )
            )

    db.flush()
    if commit:
        db.commit()
        db.refresh(complemento)
    return complemento


def guardar_nomina_desde_factura(
    db: Session,
    *,
    empresa_id: int,
    factura: Factura,
    datos: dict,
    commit: bool = False,
) -> CfdiNomina | None:
    nomina_data = datos.get("nomina")
    if not nomina_data:
        return None

    existente = db.query(CfdiNomina).filter(CfdiNomina.factura_id == factura.id).first()
    if existente:
        return existente

    nomina = CfdiNomina(
        empresa_id=empresa_id,
        factura_id=factura.id,
        version=nomina_data.get("version"),
        tipo_nomina=nomina_data.get("tipo_nomina"),
        fecha_pago=_parsear_fecha(nomina_data.get("fecha_pago")),
        fecha_inicial_pago=_parsear_fecha(nomina_data.get("fecha_inicial_pago")),
        fecha_final_pago=_parsear_fecha(nomina_data.get("fecha_final_pago")),
        num_dias_pagados=_dec(nomina_data.get("num_dias_pagados")),
        total_percepciones=_dec(nomina_data.get("total_percepciones")),
        total_deducciones=_dec(nomina_data.get("total_deducciones")),
        total_otros_pagos=_dec(nomina_data.get("total_otros_pagos")),
        total_sueldos=_dec(nomina_data.get("total_sueldos")),
        total_gravado=_dec(nomina_data.get("total_gravado")),
        total_exento=_dec(nomina_data.get("total_exento")),
        isr_retenido=_dec(nomina_data.get("isr_retenido")),
        subsidio_causado=_dec(nomina_data.get("subsidio_causado")),
        subsidio_entregado=_dec(nomina_data.get("subsidio_entregado")),
        snapshot_json=_json_dump(nomina_data),
    )
    db.add(nomina)
    db.flush()

    for perc in nomina_data.get("percepciones") or []:
        db.add(
            CfdiNominaLinea(
                nomina_id=nomina.id,
                empresa_id=empresa_id,
                tipo_linea=TipoLineaNomina.percepcion,
                tipo_clave=perc.get("tipo_percepcion"),
                clave=perc.get("clave"),
                concepto=perc.get("concepto"),
                importe_gravado=_dec(perc.get("importe_gravado")),
                importe_exento=_dec(perc.get("importe_exento")),
                importe=_dec(perc.get("importe")),
            )
        )
    for ded in nomina_data.get("deducciones") or []:
        db.add(
            CfdiNominaLinea(
                nomina_id=nomina.id,
                empresa_id=empresa_id,
                tipo_linea=TipoLineaNomina.deduccion,
                tipo_clave=ded.get("tipo_deduccion"),
                clave=ded.get("clave"),
                concepto=ded.get("concepto"),
                importe=_dec(ded.get("importe")),
            )
        )
    for otro in nomina_data.get("otros_pagos") or []:
        es_sub = bool(
            otro.get("subsidio_causado") is not None
            or (otro.get("tipo_otro_pago") or "") == "002"
            or "SUBSIDIO" in (otro.get("concepto") or "").upper()
        )
        db.add(
            CfdiNominaLinea(
                nomina_id=nomina.id,
                empresa_id=empresa_id,
                tipo_linea=TipoLineaNomina.otro_pago,
                tipo_clave=otro.get("tipo_otro_pago"),
                clave=otro.get("clave"),
                concepto=otro.get("concepto"),
                importe=_dec(otro.get("importe")),
                es_subsidio=es_sub,
                subsidio_causado=_dec(otro.get("subsidio_causado")) if otro.get("subsidio_causado") is not None else None,
            )
        )

    db.flush()
    if commit:
        db.commit()
        db.refresh(nomina)
    return nomina


def guardar_clasificaciones_especiales(
    db: Session,
    *,
    empresa_id: int,
    factura: Factura,
    datos: dict,
    commit: bool = False,
) -> list[CfdiClasificacionEspecial]:
    hallazgos = datos.get("clasificaciones_especiales") or []
    creados: list[CfdiClasificacionEspecial] = []
    for item in hallazgos:
        tipo_raw = item.get("tipo")
        try:
            tipo = TipoClasificacionEspecial(tipo_raw)
        except Exception:
            continue
        row = CfdiClasificacionEspecial(
            empresa_id=empresa_id,
            factura_id=factura.id,
            tipo=tipo,
            clave_prod_serv=item.get("clave_prod_serv"),
            descripcion=(item.get("descripcion") or "")[:500] or None,
            importe=_dec(item.get("importe")),
        )
        db.add(row)
        creados.append(row)
    if creados:
        db.flush()
    if commit:
        db.commit()
    return creados


def listar_complementos_pago(
    db: Session,
    empresa_id: int,
    *,
    anio: int | None = None,
    mes: int | None = None,
) -> list[CfdiComplementoPago]:
    query = db.query(CfdiComplementoPago).filter(CfdiComplementoPago.empresa_id == empresa_id)
    if anio is not None:
        query = query.filter(extract("year", CfdiComplementoPago.fecha_emision) == anio)
    if mes is not None:
        query = query.filter(extract("month", CfdiComplementoPago.fecha_emision) == mes)
    return query.order_by(CfdiComplementoPago.fecha_emision.desc(), CfdiComplementoPago.id.desc()).all()


def listar_nominas(
    db: Session,
    empresa_id: int,
    *,
    anio: int | None = None,
    mes: int | None = None,
) -> list[CfdiNomina]:
    query = db.query(CfdiNomina).filter(CfdiNomina.empresa_id == empresa_id)
    if anio is not None:
        query = query.filter(extract("year", CfdiNomina.fecha_pago) == anio)
    if mes is not None:
        query = query.filter(extract("month", CfdiNomina.fecha_pago) == mes)
    return query.order_by(CfdiNomina.fecha_pago.desc(), CfdiNomina.id.desc()).all()


def consolidar_retenciones_terceros(
    db: Session,
    empresa_id: int,
    *,
    mes: int | None = None,
    anio: int | None = None,
) -> dict:
    """Consolida ISR/IVA retenidos en CFDI y nominas para el periodo."""
    facturas_q = db.query(Factura).filter(Factura.empresa_id == empresa_id)
    if anio is not None:
        facturas_q = facturas_q.filter(extract("year", Factura.fecha_emision) == anio)
    if mes is not None:
        facturas_q = facturas_q.filter(extract("month", Factura.fecha_emision) == mes)
    facturas = facturas_q.all()

    detalle = []
    total_isr = Decimal("0")
    total_iva = Decimal("0")

    for f in facturas:
        isr = _dec(f.isr_retenido)
        iva = _dec(f.iva_retenido)
        if isr <= 0 and iva <= 0:
            continue
        total_isr += isr
        total_iva += iva
        detalle.append(
            {
                "origen": "factura",
                "factura_id": f.id,
                "uuid": f.uuid,
                "tipo_comprobante": f.tipo_comprobante.value if hasattr(f.tipo_comprobante, "value") else str(f.tipo_comprobante),
                "rfc_contraparte": f.rfc_receptor if isr or iva else None,
                "nombre_contraparte": f.nombre_receptor,
                "isr_retenido": float(isr),
                "iva_retenido": float(iva),
                "fecha": f.fecha_emision.isoformat() if f.fecha_emision else None,
            }
        )

    nominas_q = db.query(CfdiNomina).filter(CfdiNomina.empresa_id == empresa_id)
    if anio is not None:
        nominas_q = nominas_q.filter(extract("year", CfdiNomina.fecha_pago) == anio)
    if mes is not None:
        nominas_q = nominas_q.filter(extract("month", CfdiNomina.fecha_pago) == mes)
    for n in nominas_q.all():
        isr = _dec(n.isr_retenido)
        if isr <= 0:
            continue
        # Evitar doble conteo si la factura ya trae el mismo ISR
        factura = n.factura
        if factura and _dec(factura.isr_retenido) >= isr:
            continue
        total_isr += isr
        detalle.append(
            {
                "origen": "nomina",
                "factura_id": n.factura_id,
                "nomina_id": n.id,
                "uuid": factura.uuid if factura else None,
                "tipo_comprobante": "N",
                "isr_retenido": float(isr),
                "iva_retenido": 0.0,
                "subsidio_entregado": float(_dec(n.subsidio_entregado)),
                "fecha": n.fecha_pago.isoformat() if n.fecha_pago else None,
            }
        )

    return {
        "empresa_id": empresa_id,
        "mes": mes,
        "anio": anio,
        "total_isr_retenido": float(total_isr),
        "total_iva_retenido": float(total_iva),
        "total_retenciones": float(total_isr + total_iva),
        "num_documentos": len(detalle),
        "detalle": detalle,
    }


def serializar_complemento_pago(item: CfdiComplementoPago) -> dict:
    return {
        "id": item.id,
        "empresa_id": item.empresa_id,
        "uuid": item.uuid,
        "serie": item.serie,
        "folio": item.folio,
        "version_cfdi": item.version_cfdi,
        "version_pagos": item.version_pagos,
        "fecha_emision": item.fecha_emision.isoformat() if item.fecha_emision else None,
        "fecha_timbrado": item.fecha_timbrado.isoformat() if item.fecha_timbrado else None,
        "rfc_emisor": item.rfc_emisor,
        "nombre_emisor": item.nombre_emisor,
        "rfc_receptor": item.rfc_receptor,
        "nombre_receptor": item.nombre_receptor,
        "moneda": item.moneda,
        "total": float(item.total or 0),
        "total_pagos": float(item.total_pagos or 0),
        "num_documentos": item.num_documentos,
        "documentos": [
            {
                "id": d.id,
                "uuid_cfdi_relacionado": d.uuid_cfdi_relacionado,
                "factura_id": d.factura_id,
                "serie": d.serie,
                "folio": d.folio,
                "num_parcialidad": d.num_parcialidad,
                "importe_saldo_anterior": float(d.importe_saldo_anterior or 0),
                "importe_pagado": float(d.importe_pagado or 0),
                "importe_saldo_insoluto": float(d.importe_saldo_insoluto or 0),
                "metodo_pago_dr": d.metodo_pago_dr,
                "fecha_pago": d.fecha_pago.isoformat() if d.fecha_pago else None,
                "forma_pago_p": d.forma_pago_p,
            }
            for d in (item.documentos or [])
        ],
        "creado_en": item.creado_en.isoformat() if item.creado_en else None,
    }


def serializar_nomina(item: CfdiNomina) -> dict:
    return {
        "id": item.id,
        "empresa_id": item.empresa_id,
        "factura_id": item.factura_id,
        "version": item.version,
        "tipo_nomina": item.tipo_nomina,
        "fecha_pago": item.fecha_pago.isoformat() if item.fecha_pago else None,
        "fecha_inicial_pago": item.fecha_inicial_pago.isoformat() if item.fecha_inicial_pago else None,
        "fecha_final_pago": item.fecha_final_pago.isoformat() if item.fecha_final_pago else None,
        "num_dias_pagados": float(item.num_dias_pagados or 0),
        "total_percepciones": float(item.total_percepciones or 0),
        "total_deducciones": float(item.total_deducciones or 0),
        "total_otros_pagos": float(item.total_otros_pagos or 0),
        "total_sueldos": float(item.total_sueldos or 0),
        "total_gravado": float(item.total_gravado or 0),
        "total_exento": float(item.total_exento or 0),
        "isr_retenido": float(item.isr_retenido or 0),
        "subsidio_causado": float(item.subsidio_causado or 0),
        "subsidio_entregado": float(item.subsidio_entregado or 0),
        "lineas": [
            {
                "id": ln.id,
                "tipo_linea": ln.tipo_linea.value if hasattr(ln.tipo_linea, "value") else ln.tipo_linea,
                "tipo_clave": ln.tipo_clave,
                "clave": ln.clave,
                "concepto": ln.concepto,
                "importe_gravado": float(ln.importe_gravado or 0),
                "importe_exento": float(ln.importe_exento or 0),
                "importe": float(ln.importe or 0),
                "es_subsidio": bool(ln.es_subsidio),
                "subsidio_causado": float(ln.subsidio_causado) if ln.subsidio_causado is not None else None,
            }
            for ln in (item.lineas or [])
        ],
        "creado_en": item.creado_en.isoformat() if item.creado_en else None,
    }
