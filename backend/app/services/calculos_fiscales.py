from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy import extract
from sqlalchemy.orm import Session

from app.core.sat_fiscal import SAT_REGIMEN_RULES, CalculoIsrTipo, SatRegimenEnum
from app.core.tarifas_isr_oficiales import aplicar_tarifa_progresiva, obtener_tramos
from app.models.ajustes_fiscales import (
    PagoProvisionalAnterior,
    PerdidaFiscal,
    TipoImpuestoProvisional,
)
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.fiscal import OperacionFiscal, PeriodoFiscal
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


def _facturas_ejercicio(db: Session, empresa_id: int, anio: int) -> list[Factura]:
    return (
        db.query(Factura)
        .filter(
            Factura.empresa_id == empresa_id,
            extract("year", Factura.fecha_emision) == anio,
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


def _pagos_provisionales_isr(
    db: Session, empresa_id: int, ejercicio: int, mes_hasta: int | None = None
) -> Decimal:
    q = db.query(PagoProvisionalAnterior).filter(
        PagoProvisionalAnterior.empresa_id == empresa_id,
        PagoProvisionalAnterior.tipo_impuesto == TipoImpuestoProvisional.isr,
        PagoProvisionalAnterior.ejercicio == ejercicio,
    )
    if mes_hasta is not None:
        q = q.filter(PagoProvisionalAnterior.mes <= mes_hasta)
    return sum((_moneda(p.monto) for p in q.all()), Decimal("0")).quantize(CENTAVOS)


def _perdidas_aplicables(
    db: Session, empresa_id: int, ejercicio: int, base_utilidad: Decimal
) -> dict:
    filas = (
        db.query(PerdidaFiscal)
        .filter(
            PerdidaFiscal.empresa_id == empresa_id,
            PerdidaFiscal.activa.is_(True),
            PerdidaFiscal.monto_pendiente > 0,
            PerdidaFiscal.ejercicio_origen < ejercicio,
        )
        .order_by(PerdidaFiscal.ejercicio_origen.asc())
        .all()
    )
    restante = base_utilidad
    aplicadas = []
    total = Decimal("0")
    for fila in filas:
        if fila.ejercicio_limite is not None and ejercicio > int(fila.ejercicio_limite):
            continue
        if restante <= 0:
            break
        disponible = _moneda(fila.monto_pendiente)
        aplica = min(disponible, restante)
        if aplica <= 0:
            continue
        aplicadas.append(
            {
                "id": fila.id,
                "ejercicio_origen": fila.ejercicio_origen,
                "monto_aplicado": float(aplica),
                "monto_pendiente_antes": float(disponible),
            }
        )
        total += aplica
        restante -= aplica
    return {
        "perdidas_aplicadas": aplicadas,
        "total_perdidas_aplicadas": total.quantize(CENTAVOS),
        "base_despues_perdidas": max(restante, Decimal("0")).quantize(CENTAVOS),
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
    calculo_tipo = None
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

    usa_tarifa = calculo_tipo == CalculoIsrTipo.tarifa_progresiva.value
    tarifa_info = None
    isr_causado = None
    isr_estimado = None
    pagos_previos = _pagos_provisionales_isr(db, empresa_id, anio, mes_hasta=mes - 1 if mes > 1 else 0)
    if mes <= 1:
        pagos_previos = Decimal("0")

    if usa_tarifa and tasa_isr is None:
        tarifa_info = aplicar_tarifa_progresiva(base_gravable, anio, "mensual")
        if tarifa_info["disponible"] and tarifa_info["isr_causado"] is not None:
            isr_causado = _moneda(tarifa_info["isr_causado"])
            isr_estimado = max(isr_causado - resumen["retenciones_isr"] - pagos_previos, Decimal("0")).quantize(CENTAVOS)
        else:
            parametros_faltantes.append("tarifa_progresiva_ejercicio")
    elif tasa_isr is None and not usa_tarifa:
        parametros_faltantes.append("tasa_isr")
    elif tasa_isr is not None:
        isr_causado = (base_gravable * tasa_isr / Decimal("100")).quantize(CENTAVOS)
        isr_estimado = max(isr_causado - resumen["retenciones_isr"] - pagos_previos, Decimal("0")).quantize(CENTAVOS)

    saldo = None
    if isr_causado is not None:
        neto = isr_causado - resumen["retenciones_isr"] - pagos_previos
        saldo = {
            "isr_causado": float(isr_causado),
            "pagos_provisionales_anteriores": float(pagos_previos),
            "retenciones_isr": float(resumen["retenciones_isr"]),
            "isr_a_cargo": float(max(neto, Decimal("0")).quantize(CENTAVOS)),
            "saldo_a_favor": float(max(-neto, Decimal("0")).quantize(CENTAVOS)),
        }

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
        "tarifa_progresiva": tarifa_info,
        "pagos_provisionales_anteriores": float(pagos_previos),
        "isr_estimado": float(isr_estimado) if isr_estimado is not None else None,
        "saldo": saldo,
        "parametros_faltantes": parametros_faltantes,
        "estatus": "estimado" if not parametros_faltantes else "requiere_parametros_del_regimen",
        "criterio": "Cálculo guiado por régimen; requiere revisión contable antes de declarar.",
    }


def calcular_ieps_provisional(
    db: Session, empresa_id: int, mes: int, anio: int
) -> dict:
    """IEPS del periodo a partir de operaciones fiscales registradas."""
    periodos = (
        db.query(PeriodoFiscal)
        .filter(
            PeriodoFiscal.empresa_id == empresa_id,
            PeriodoFiscal.anio == anio,
        )
        .all()
    )
    periodo_ids = [p.id for p in periodos]
    ops = []
    if periodo_ids:
        ops = (
            db.query(OperacionFiscal)
            .filter(
                OperacionFiscal.empresa_id == empresa_id,
                OperacionFiscal.periodo_id.in_(periodo_ids),
            )
            .all()
        )

    ieps_periodo = Decimal("0")
    ieps_acumulado = Decimal("0")
    detalle = []
    for op in ops:
        periodo = next((p for p in periodos if p.id == op.periodo_id), None)
        monto = _moneda(getattr(op, "ieps", 0))
        if monto == 0:
            continue
        mes_op = periodo.mes if periodo and periodo.mes else None
        if mes_op is not None and mes_op <= mes:
            ieps_acumulado += monto
        if mes_op == mes:
            ieps_periodo += monto
            detalle.append(
                {
                    "operacion_id": op.id,
                    "periodo_id": op.periodo_id,
                    "mes": mes_op,
                    "ieps": float(monto),
                    "descripcion": getattr(op, "descripcion", None),
                }
            )

    return {
        "empresa_id": empresa_id,
        "periodo": {"mes": mes, "anio": anio},
        "ieps_periodo": float(ieps_periodo.quantize(CENTAVOS)),
        "ieps_acumulado": float(ieps_acumulado.quantize(CENTAVOS)),
        "operaciones": detalle,
        "aplica": ieps_periodo > 0 or ieps_acumulado > 0,
        "criterio": (
            "IEPS tomado de operaciones fiscales registradas (campo ieps). "
            "Si no hay operaciones con IEPS, el impuesto no aplica en el periodo."
        ),
    }


def calcular_isr_anual(
    db: Session,
    empresa_id: int,
    anio: int,
    tasa_isr: Decimal | None = None,
    coeficiente_utilidad: Decimal | None = None,
    deduccion_ciega_pct: Decimal | None = None,
) -> dict:
    """Declaración anual estimada: ingresos, deducciones, retenciones, pérdidas y saldo."""
    if tasa_isr is not None:
        tasa_isr = Decimal(str(tasa_isr))
    if coeficiente_utilidad is not None:
        coeficiente_utilidad = Decimal(str(coeficiente_utilidad))
    if deduccion_ciega_pct is not None:
        deduccion_ciega_pct = Decimal(str(deduccion_ciega_pct))

    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    rfc_empresa = (empresa.rfc or "").strip().upper() if empresa else ""
    facturas = _facturas_ejercicio(db, empresa_id, anio)
    resumen = _resumen_isr(facturas, rfc_empresa)

    regimen_valor = getattr(getattr(empresa, "regimen_fiscal", ""), "value", getattr(empresa, "regimen_fiscal", ""))
    regimen = None
    calculo_tipo = None
    try:
        regimen = SatRegimenEnum(regimen_valor)
        calculo_tipo = SAT_REGIMEN_RULES[regimen]["calculo_isr_tipo"].value
    except (ValueError, KeyError):
        pass

    deducciones_aplicadas = resumen["deducciones_acumuladas"]
    utilidad = resumen["base_gravable"]
    parametros_faltantes = []

    if regimen in {SatRegimenEnum.resico_pf, SatRegimenEnum.resico_pm}:
        deducciones_aplicadas = Decimal("0")
        utilidad = resumen["ingresos_acumulados"]
    elif regimen == SatRegimenEnum.arrendamiento and deduccion_ciega_pct is not None:
        deducciones_aplicadas = (
            resumen["ingresos_acumulados"] * deduccion_ciega_pct / Decimal("100")
        ).quantize(CENTAVOS)
        utilidad = max(resumen["ingresos_acumulados"] - deducciones_aplicadas, Decimal("0"))
    elif regimen in {SatRegimenEnum.general_de_ley, SatRegimenEnum.personas_morales_no_lucrativas}:
        if coeficiente_utilidad is None:
            parametros_faltantes.append("coeficiente_utilidad")
        else:
            utilidad = (resumen["ingresos_acumulados"] * coeficiente_utilidad).quantize(CENTAVOS)
            deducciones_aplicadas = max(resumen["ingresos_acumulados"] - utilidad, Decimal("0"))

    perdidas = _perdidas_aplicables(db, empresa_id, anio, utilidad)
    base_final = perdidas["base_despues_perdidas"]

    usa_tarifa = calculo_tipo == CalculoIsrTipo.tarifa_progresiva.value
    tarifa_info = None
    isr_causado = None

    if usa_tarifa and tasa_isr is None:
        tarifa_info = aplicar_tarifa_progresiva(base_final, anio, "anual")
        if tarifa_info["disponible"] and tarifa_info["isr_causado"] is not None:
            isr_causado = _moneda(tarifa_info["isr_causado"])
        else:
            parametros_faltantes.append("tarifa_progresiva_ejercicio")
    elif tasa_isr is not None:
        isr_causado = (base_final * tasa_isr / Decimal("100")).quantize(CENTAVOS)
    elif calculo_tipo == CalculoIsrTipo.coeficiente_utilidad.value:
        # PM: tasa corporativa estandar 30% si no se pasa tasa
        isr_causado = (base_final * Decimal("30") / Decimal("100")).quantize(CENTAVOS)
        tasa_isr = Decimal("30")
    else:
        parametros_faltantes.append("tasa_isr")

    pagos_previos = _pagos_provisionales_isr(db, empresa_id, anio, mes_hasta=12)
    retenciones = resumen["retenciones_isr"]
    iva_anual = _resumen_iva(facturas, rfc_empresa)
    ieps = calcular_ieps_provisional(db, empresa_id, 12, anio)

    saldo = None
    if isr_causado is not None:
        neto = isr_causado - retenciones - pagos_previos
        saldo = {
            "isr_causado": float(isr_causado),
            "pagos_provisionales_anteriores": float(pagos_previos),
            "retenciones_isr": float(retenciones),
            "isr_a_cargo": float(max(neto, Decimal("0")).quantize(CENTAVOS)),
            "saldo_a_favor": float(max(-neto, Decimal("0")).quantize(CENTAVOS)),
        }

    return {
        "empresa_id": empresa_id,
        "ejercicio": anio,
        "regimen_fiscal": regimen_valor,
        "calculo_isr_tipo": calculo_tipo,
        "ingresos_acumulados": float(resumen["ingresos_acumulados"]),
        "deducciones_acumuladas": float(resumen["deducciones_acumuladas"]),
        "deducciones_aplicadas": float(deducciones_aplicadas),
        "retenciones_isr": float(retenciones),
        "utilidad_antes_perdidas": float(utilidad),
        "perdidas_fiscales": {
            "detalle": perdidas["perdidas_aplicadas"],
            "total_aplicado": float(perdidas["total_perdidas_aplicadas"]),
        },
        "base_gravable": float(base_final),
        "tasa_isr_aplicada": float(tasa_isr) if tasa_isr is not None else None,
        "tarifa_progresiva": tarifa_info,
        "pagos_provisionales_anteriores": float(pagos_previos),
        "iva_anual": {k: float(v) for k, v in iva_anual.items()},
        "ieps_anual": {
            "ieps_acumulado": ieps["ieps_acumulado"],
            "aplica": ieps["aplica"],
        },
        "saldo": saldo,
        "parametros_faltantes": parametros_faltantes,
        "estatus": "estimado" if not parametros_faltantes else "requiere_parametros_del_regimen",
        "criterio": (
            "Estimación anual informativa con ingresos/deducciones de CFDI, "
            "pérdidas fiscales registradas y pagos provisionales enterados. "
            "Requiere revisión de contador antes de presentar."
        ),
    }


def listar_tarifas_ejercicio(ejercicio: int) -> dict:
    mensual = obtener_tramos(ejercicio, "mensual")
    anual = obtener_tramos(ejercicio, "anual")
    return {
        "ejercicio": ejercicio,
        "disponible": mensual is not None and anual is not None,
        "mensual": mensual or [],
        "anual": anual or [],
        "fuente": "Tarifas ISR personas físicas versionadas en app (referencia SAT).",
    }
