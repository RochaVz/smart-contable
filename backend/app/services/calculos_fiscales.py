from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.models.empresa import Empresa
from app.models.factura import Factura
from app.core.sat_fiscal import SAT_REGIMEN_RULES, SatRegimenEnum
from app.services.cfdi_helpers import es_venta


CENTAVOS = Decimal("0.01")


def _moneda(valor) -> Decimal:
    return Decimal(str(valor or 0)).quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def _rfc_empresa(db: Session, empresa_id: int) -> str:
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    return (empresa.rfc or "").strip().upper() if empresa else ""


def _facturas_hasta_periodo(
    db: Session, empresa_id: int, mes: int, anio: int
) -> list[Factura]:
    return (
        db.query(Factura)
        .filter(
            Factura.empresa_id == empresa_id,
            extract("year", Factura.fecha_emision) == anio,
            extract("month", Factura.fecha_emision) <= mes,
        )
        .all()
    )


def _facturas_del_periodo(
    db: Session, empresa_id: int, mes: int, anio: int
) -> list[Factura]:
    return (
        db.query(Factura)
        .filter(
            Factura.empresa_id == empresa_id,
            extract("year", Factura.fecha_emision) == anio,
            extract("month", Factura.fecha_emision) == mes,
        )
        .all()
    )


def _resumen_iva(facturas: list[Factura], rfc_empresa: str) -> dict[str, Decimal]:
    trasladado = Decimal("0")
    acreditable = Decimal("0")
    retenido = Decimal("0")

    for factura in facturas:
        tipo = getattr(getattr(factura, "tipo_comprobante", ""), "value", factura.tipo_comprobante)
        tipo = str(tipo or "").upper()
        if tipo == "I" and es_venta(factura, rfc_empresa):
            trasladado += _moneda(factura.iva_trasladado)
            retenido += _moneda(factura.iva_retenido)
        elif tipo == "E" and not es_venta(factura, rfc_empresa):
            acreditable += _moneda(factura.iva_trasladado)

    iva_a_cargo = trasladado - acreditable - retenido
    return {
        "iva_trasladado": trasladado.quantize(CENTAVOS),
        "iva_acreditable": acreditable.quantize(CENTAVOS),
        "iva_retenido": retenido.quantize(CENTAVOS),
        "iva_a_cargo": iva_a_cargo.quantize(CENTAVOS),
        "saldo_a_favor": max(-iva_a_cargo, Decimal("0")).quantize(CENTAVOS),
    }


def calcular_iva_provisional(
    db: Session, empresa_id: int, mes: int, anio: int
) -> dict:
    rfc_empresa = _rfc_empresa(db, empresa_id)
    facturas_periodo = _facturas_del_periodo(db, empresa_id, mes, anio)
    facturas_acumuladas = _facturas_hasta_periodo(db, empresa_id, mes, anio)
    periodo = _resumen_iva(facturas_periodo, rfc_empresa)
    acumulado = _resumen_iva(facturas_acumuladas, rfc_empresa)

    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "periodo_actual": {key: float(value) for key, value in periodo.items()},
        "acumulado_anual": {key: float(value) for key, value in acumulado.items()},
        "criterio": {
            "trasladado": "CFDI tipo I emitidos por la empresa",
            "acreditable": "CFDI tipo E recibidos de proveedores",
            "retenido": "IVA retenido en CFDI tipo I",
            "alcance": "Estimación informativa; requiere revisión contable antes de declarar",
        },
    }


def _resumen_isr(facturas: list[Factura], rfc_empresa: str) -> dict[str, Decimal]:
    ingresos = Decimal("0")
    deducciones = Decimal("0")
    retenciones = Decimal("0")

    for factura in facturas:
        tipo = getattr(getattr(factura, "tipo_comprobante", ""), "value", factura.tipo_comprobante)
        tipo = str(tipo or "").upper()
        if tipo == "I" and es_venta(factura, rfc_empresa):
            ingresos += _moneda(factura.subtotal)
            retenciones += _moneda(getattr(factura, "isr_retenido", 0))
        elif tipo == "E" and not es_venta(factura, rfc_empresa) and getattr(factura, "es_deducible", True):
            deducciones += _moneda(factura.subtotal)

    base = max(ingresos - deducciones, Decimal("0"))
    return {
        "ingresos_acumulados": ingresos.quantize(CENTAVOS),
        "deducciones_acumuladas": deducciones.quantize(CENTAVOS),
        "retenciones_isr": retenciones.quantize(CENTAVOS),
        "base_gravable": base.quantize(CENTAVOS),
    }


def calcular_isr_provisional(
    db: Session,
    empresa_id: int,
    mes: int,
    anio: int,
    tasa_isr: Decimal | None = None,
    coeficiente_utilidad: Decimal | None = None,
    deduccion_ciega_pct: Decimal | None = None,
) -> dict:
    if tasa_isr is not None:
        tasa_isr = Decimal(str(tasa_isr))
    if coeficiente_utilidad is not None:
        coeficiente_utilidad = Decimal(str(coeficiente_utilidad))
    if deduccion_ciega_pct is not None:
        deduccion_ciega_pct = Decimal(str(deduccion_ciega_pct))

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    rfc_empresa = (empresa.rfc or "").strip().upper() if empresa else ""
    facturas = _facturas_hasta_periodo(db, empresa_id, mes, anio)
    resumen = _resumen_isr(facturas, rfc_empresa)

    regimen_valor = getattr(getattr(empresa, "regimen_fiscal", ""), "value", getattr(empresa, "regimen_fiscal", ""))
    regimen = None
    try:
        regimen = SatRegimenEnum(regimen_valor)
        calculo_tipo = SAT_REGIMEN_RULES[regimen]["calculo_isr_tipo"].value
    except (ValueError, KeyError):
        calculo_tipo = None

    parametros_faltantes = []
    deducciones_aplicadas = resumen["deducciones_acumuladas"]
    base_gravable = resumen["base_gravable"]

    if regimen in {SatRegimenEnum.resico_pf, SatRegimenEnum.resico_pm}:
        deducciones_aplicadas = Decimal("0")
        base_gravable = resumen["ingresos_acumulados"]
    elif regimen == SatRegimenEnum.arrendamiento and deduccion_ciega_pct is not None:
        deducciones_aplicadas = (
            resumen["ingresos_acumulados"] * deduccion_ciega_pct / Decimal("100")
        ).quantize(CENTAVOS)
        base_gravable = max(resumen["ingresos_acumulados"] - deducciones_aplicadas, Decimal("0"))
    elif regimen == SatRegimenEnum.arrendamiento and getattr(getattr(empresa, "opcion_deduccion", None), "value", getattr(empresa, "opcion_deduccion", None)) == "CIEGA":
        parametros_faltantes.append("deduccion_ciega_pct")

    if regimen in {SatRegimenEnum.general_de_ley, SatRegimenEnum.personas_morales_no_lucrativas} and coeficiente_utilidad is None:
        parametros_faltantes.append("coeficiente_utilidad")
    elif regimen in {SatRegimenEnum.general_de_ley, SatRegimenEnum.personas_morales_no_lucrativas}:
        base_gravable = (
            resumen["ingresos_acumulados"] * coeficiente_utilidad
        ).quantize(CENTAVOS)
        deducciones_aplicadas = max(resumen["ingresos_acumulados"] - base_gravable, Decimal("0"))

    if tasa_isr is None:
        parametros_faltantes.append("tasa_isr")

    isr_estimado = None
    if tasa_isr is not None:
        isr_estimado = max(
            base_gravable * tasa_isr / Decimal("100") - resumen["retenciones_isr"],
            Decimal("0"),
        ).quantize(CENTAVOS)

    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "regimen_fiscal": regimen_valor,
        "calculo_isr_tipo": calculo_tipo,
        **{key: float(value) for key, value in resumen.items()},
        "deducciones_aplicadas": float(deducciones_aplicadas),
        "base_gravable": float(base_gravable),
        "tasa_isr_aplicada": float(tasa_isr) if tasa_isr is not None else None,
        "coeficiente_utilidad_aplicado": float(coeficiente_utilidad) if coeficiente_utilidad is not None else None,
        "deduccion_ciega_pct_aplicada": float(deduccion_ciega_pct) if deduccion_ciega_pct is not None else None,
        "isr_estimado": float(isr_estimado) if isr_estimado is not None else None,
        "parametros_faltantes": parametros_faltantes,
        "estatus": "estimado" if not parametros_faltantes else "requiere_parametros_del_regimen",
        "criterio": "Cálculo guiado por régimen; requiere revisión contable antes de declarar.",
    }