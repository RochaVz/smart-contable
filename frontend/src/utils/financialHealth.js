import {
  esIngreso,
  getContraparteFactura,
  getPeriodoFactura,
  toNumber,
} from './facturas.js';

/**
 * Capa de presentación ejecutiva. Solo transforma datos que ya entregan los
 * servicios existentes (paquete fiscal, resumen SAT, indicadores, conciliación
 * y CFDI cargados); no recalcula reglas fiscales ni contables.
 */

export const SEVERITY = { INFO: 'info', WARNING: 'warning', CRITICAL: 'critical' };

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const round = (value, digits = 0) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const average = (values) => {
  const valid = values.filter((v) => Number.isFinite(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
};

export const periodoAnterior = (mes, anio) => (
  mes === 1 ? { mes: 12, anio: anio - 1 } : { mes: mes - 1, anio }
);

export const variacionPct = (actual, previo) => {
  if (!Number.isFinite(previo) || previo === 0) return null;
  return round(((actual - previo) / Math.abs(previo)) * 100, 1);
};

export const diasHasta = (isoDate, hoy = new Date()) => {
  if (!isoDate) return null;
  const match = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((target - base) / 86400000);
};

const moneyPlain = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

/** Normaliza la descripción de un concepto CFDI para agrupar. */
export const normalizarConcepto = (raw) => {
  const texto = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!texto) return 'Sin concepto';
  return texto.replace(/\b\d+\b/g, '#').replace(/\s+/g, ' ').trim() || 'Sin concepto';
};

/** Extrae descripciones de conceptos de un CFDI (API o local). */
export const extraerConceptosFactura = (factura) => {
  if (factura?.concepto) {
    return [{ descripcion: String(factura.concepto).trim(), importe: toNumber(factura.subtotal || factura.total) }];
  }
  const lista = factura?.conceptos || factura?.conceptos_vendidos || [];
  if (!Array.isArray(lista) || lista.length === 0) {
    return [{
      descripcion: 'Sin concepto',
      importe: toNumber(esIngreso(factura) ? factura.subtotal : factura.total),
    }];
  }
  return lista.map((item) => ({
    descripcion: String(item?.descripcion || item?.Descripcion || 'Sin concepto').trim(),
    importe: toNumber(item?.importe ?? item?.Importe ?? item?.valor_unitario ?? item?.monto ?? 0),
  }));
};

/**
 * Agrupa conceptos del periodo por descripción normalizada.
 * Devuelve rankings con monto, % y cantidad de CFDI.
 */
export const agruparConceptosPeriodo = (facturas = [], mes, anio, { top = 8 } = {}) => {
  const delPeriodo = facturas.filter((f) => {
    const p = getPeriodoFactura(f);
    return p?.mes === mes && p?.anio === anio;
  });

  const agrupar = (lista, campoFallback) => {
    const map = new Map();
    let total = 0;
    lista.forEach((f) => {
      const conceptos = extraerConceptosFactura(f);
      const sumaConceptos = conceptos.reduce((acc, c) => acc + c.importe, 0);
      const montoFactura = toNumber(f[campoFallback]);
      const base = sumaConceptos > 0 ? conceptos : [{
        descripcion: conceptos[0]?.descripcion || 'Sin concepto',
        importe: montoFactura,
      }];
      const factor = sumaConceptos > 0 && montoFactura > 0 && Math.abs(sumaConceptos - montoFactura) > 0.01
        ? montoFactura / sumaConceptos
        : 1;

      base.forEach((c) => {
        const clave = normalizarConcepto(c.descripcion);
        const etiqueta = (c.descripcion || 'Sin concepto').trim() || 'Sin concepto';
        const monto = round((c.importe || 0) * factor, 2);
        total += monto;
        const prev = map.get(clave) || { id: clave, label: etiqueta, monto: 0, cantidad: 0 };
        prev.monto += monto;
        prev.cantidad += 1;
        if (etiqueta.length < prev.label.length) prev.label = etiqueta;
        map.set(clave, prev);
      });
    });

    const items = [...map.values()]
      .map((item) => ({
        ...item,
        monto: round(item.monto, 2),
        pct: total > 0 ? round((item.monto / total) * 100, 1) : 0,
      }))
      .sort((a, b) => b.monto - a.monto);

    const topItems = items.slice(0, top);
    const resto = items.slice(top);
    if (resto.length > 0) {
      const montoResto = round(resto.reduce((a, i) => a + i.monto, 0), 2);
      topItems.push({
        id: '__otros__',
        label: 'Otros',
        monto: montoResto,
        cantidad: resto.reduce((a, i) => a + i.cantidad, 0),
        pct: total > 0 ? round((montoResto / total) * 100, 1) : 0,
      });
    }

    return {
      total: round(total, 2),
      cantidad: lista.length,
      items: topItems,
      categorias: items.length,
    };
  };

  return {
    ingresos: agrupar(delPeriodo.filter(esIngreso), 'subtotal'),
    egresos: agrupar(delPeriodo.filter((f) => !esIngreso(f)), 'total'),
  };
};

/** Totales y concentración de contrapartes a partir de los CFDI del periodo. */
export const resumirFacturasPeriodo = (facturas = [], mes, anio) => {
  const delPeriodo = facturas.filter((f) => {
    const p = getPeriodoFactura(f);
    return p?.mes === mes && p?.anio === anio;
  });

  const acumular = (lista, campoMonto) => {
    const porContraparte = new Map();
    let total = 0;
    lista.forEach((f) => {
      const monto = toNumber(f[campoMonto]);
      total += monto;
      const nombre = String(getContraparteFactura(f) || '—');
      porContraparte.set(nombre, (porContraparte.get(nombre) || 0) + monto);
    });
    const ranking = [...porContraparte.entries()]
      .map(([nombre, monto]) => ({
        nombre,
        monto: round(monto, 2),
        pct: total > 0 ? round((monto / total) * 100, 1) : 0,
      }))
      .sort((a, b) => b.monto - a.monto);
    const top = ranking[0] || null;
    return {
      total,
      cantidad: lista.length,
      contrapartes: porContraparte.size,
      topNombre: top?.nombre || null,
      topPct: top?.pct || 0,
      ranking: ranking.slice(0, 5),
      ticketPromedio: lista.length ? round(total / lista.length, 2) : 0,
    };
  };

  const ingresos = acumular(delPeriodo.filter(esIngreso), 'subtotal');
  const egresos = acumular(delPeriodo.filter((f) => !esIngreso(f)), 'total');
  return { ingresos, egresos };
};

/** Flujo y saldo bancario del periodo a partir de los movimientos ya importados. */
export const resumirBancoPeriodo = (movimientos, mes, anio) => {
  if (!Array.isArray(movimientos)) return null;
  const clave = (m) => String(m.fecha || '').slice(0, 7);
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const hastaPeriodo = movimientos
    .filter((m) => clave(m) && clave(m) <= periodo)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || (a.id || 0) - (b.id || 0));
  const delPeriodo = hastaPeriodo.filter((m) => clave(m) === periodo);
  const flujo = delPeriodo.reduce(
    (acc, m) => acc + (m.tipo === 'abono' ? toNumber(m.monto) : -toNumber(m.monto)),
    0,
  );
  const conSaldo = hastaPeriodo.filter((m) => m.saldo != null);
  return {
    cantidad: delPeriodo.length,
    flujo: round(flujo, 2),
    saldo: conSaldo.length ? toNumber(conSaldo[conSaldo.length - 1].saldo) : null,
  };
};

const ratioLabel = (nivel) => ({
  saludable: 'Bajo',
  aceptable: 'Moderado',
  en_riesgo: 'Alto',
  critico: 'Crítico',
}[nivel] || '—');

/** Desglose de impuestos por pagar a partir del resumen SAT. */
export const construirImpuestosDetalle = (resumenSat = null) => {
  if (!resumenSat) {
    return {
      items: [],
      totalPagar: null,
      ivaTrasladado: null,
      ivaAcreditable: null,
      ivaACargo: null,
      ivaAFavor: null,
      isrProvisional: null,
      isrAnualEstimado: null,
      retenciones: null,
      ish: null,
      vencimientoPrincipal: null,
    };
  }

  const totales = resumenSat.totales || {};
  const impuestos = resumenSat.impuestos || {};
  const ivaDetalle = impuestos.iva?.detalle || {};
  const isrDetalle = impuestos.isr?.detalle || {};

  const ivaTrasladado = toNumber(
    ivaDetalle.iva_trasladado ?? ivaDetalle.trasladado ?? ivaDetalle.iva_cobrado,
  );
  const ivaAcreditable = toNumber(
    ivaDetalle.iva_acreditable ?? ivaDetalle.acreditable ?? ivaDetalle.iva_pagado,
  );
  const ivaACargo = toNumber(totales.iva_a_cargo ?? impuestos.iva?.a_cargo);
  const ivaAFavor = toNumber(totales.iva_a_favor ?? impuestos.iva?.a_favor);
  const isrProvisional = toNumber(totales.isr_a_cargo ?? impuestos.isr?.a_cargo);
  const retenciones = toNumber(totales.retenciones ?? impuestos.retenciones?.total);
  const mesPeriodo = resumenSat.periodo?.mes || 1;
  const isrAnualEstimado = toNumber(
    isrDetalle.isr_anual_estimado
    ?? isrDetalle.estimado_anual
    ?? (isrProvisional > 0 ? isrProvisional * (13 - mesPeriodo + 1) : 0),
  );
  const ish = toNumber(
    ivaDetalle.ish
    ?? ivaDetalle.impuesto_hospedaje
    ?? totales.ish
    ?? impuestos.ish?.a_cargo,
  );

  const porClave = new Map(
    (resumenSat.sugerencias_pago || []).map((s) => [s.clave, s]),
  );

  const items = [];
  const pushItem = ({ id, label, monto, vencimiento, accion = 'pagar', nota = null, prioridad = 2 }) => {
    if (!Number.isFinite(monto) || monto <= 0) return;
    items.push({
      id,
      label,
      monto: round(monto, 2),
      vencimiento: vencimiento || null,
      accion,
      nota,
      prioridad,
      dias: diasHasta(vencimiento),
    });
  };

  const ivaSug = porClave.get('iva');
  const isrSug = porClave.get('isr');
  const retSug = porClave.get('retenciones');
  const favorSug = porClave.get('iva_favor');

  const ivaMonto = ivaSug
      ? toNumber(ivaSug.monto)
      : (ivaACargo || toNumber(impuestos.iva_por_pagar));
    const isrMonto = isrSug
      ? toNumber(isrSug.monto)
      : (isrProvisional || toNumber(impuestos.isr_provisional));
    const ivaAcreditableMonto = ivaAcreditable
      || toNumber(impuestos.iva_acreditable)
      || toNumber(
        (resumenSat.sugerencias_pago || []).find((s) => s.clave === 'iva_acreditable' || s.accion === 'acreditar')?.monto,
      );

    pushItem({
      id: 'iva',
      label: 'IVA por pagar',
      monto: ivaMonto,
      vencimiento: ivaSug?.vencimiento,
      prioridad: 1,
      nota: ivaTrasladado || ivaAcreditableMonto
        ? `Trasladado ${moneyPlain(ivaTrasladado)} − Acreditable ${moneyPlain(ivaAcreditableMonto)}`
        : null,
    });

    if (ivaAcreditableMonto > 0) {
      pushItem({
        id: 'iva-acreditable',
        label: 'IVA acreditable',
        monto: ivaAcreditableMonto,
        vencimiento: null,
        accion: 'informativo',
        prioridad: 4,
        nota: 'Crédito fiscal del periodo',
      });
    }

    pushItem({
      id: 'isr',
      label: 'ISR provisional',
      monto: isrMonto,
      vencimiento: isrSug?.vencimiento,
      prioridad: 1,
    });

  if (isrAnualEstimado > isrProvisional) {
    pushItem({
      id: 'isr-anual',
      label: 'ISR anual estimado',
      monto: isrAnualEstimado,
      vencimiento: null,
      accion: 'informativo',
      prioridad: 5,
      nota: 'Proyección del ejercicio con base en provisionales',
    });
  }

  const retencionesMonto = retSug
      ? toNumber(retSug.monto)
      : (retenciones || (typeof impuestos.retenciones === 'number' ? impuestos.retenciones : 0));
    pushItem({
      id: 'retenciones',
      label: 'Retenciones',
      monto: retencionesMonto,
      vencimiento: retSug?.vencimiento,
      prioridad: 1,
      nota: impuestos.retenciones && typeof impuestos.retenciones === 'object'
        ? `ISR ${moneyPlain(impuestos.retenciones.isr)} + IVA ${moneyPlain(impuestos.retenciones.iva)}`
        : null,
    });

  pushItem({
    id: 'ish',
    label: 'Impuesto sobre hospedaje',
    monto: ish,
    vencimiento: ivaSug?.vencimiento || isrSug?.vencimiento,
    prioridad: 2,
  });

  (resumenSat.sugerencias_pago || []).forEach((s) => {
    if (['iva', 'isr', 'retenciones', 'iva_favor'].includes(s.clave)) return;
    if (s.accion !== 'pagar') return;
    pushItem({
      id: s.clave || s.concepto,
      label: s.concepto || s.clave,
      monto: toNumber(s.monto),
      vencimiento: s.vencimiento,
      nota: s.nota || null,
      prioridad: 3,
    });
  });

  if (favorSug || ivaAFavor > 0) {
    items.push({
      id: 'iva_favor',
      label: 'IVA a favor',
      monto: round(favorSug ? toNumber(favorSug.monto) : ivaAFavor, 2),
      vencimiento: null,
      accion: 'acreditar',
      nota: 'Saldo a favor estimable; acreditable en periodos siguientes',
      prioridad: 4,
      dias: null,
    });
  }

  items.sort((a, b) => a.prioridad - b.prioridad || (a.dias ?? 999) - (b.dias ?? 999));

  const totalPagar = round(
    items.filter((i) => i.accion === 'pagar').reduce((acc, i) => acc + i.monto, 0),
    2,
  );

  return {
    items,
    totalPagar: totales.total_a_pagar != null
      ? toNumber(totales.total_a_pagar)
      : (items.some((i) => i.accion === 'pagar') ? totalPagar : null),
    ivaTrasladado: ivaTrasladado || null,
    ivaAcreditable: ivaAcreditable || null,
    ivaACargo: ivaACargo || null,
    ivaAFavor: ivaAFavor || null,
    isrProvisional: isrProvisional || null,
    isrAnualEstimado: isrAnualEstimado || null,
    retenciones: retenciones || null,
    ish: ish || null,
    vencimientoPrincipal: items.find((i) => i.accion === 'pagar' && i.vencimiento)?.vencimiento || null,
  };
};

/**
 * Acciones prioritarias del motor fiscal (solo lo accionable).
 */
export const construirAccionesFiscales = (snapshot, hoy = new Date()) => {
  const acciones = [];
  const add = (id, titulo, detalle, estado = 'pendiente', destino = 'sat') => {
    acciones.push({ id, titulo, detalle, estado, destino });
  };

  const impuestos = snapshot.impuestosDetalle || { items: [] };
  const hayIva = impuestos.items.some((i) => i.id === 'iva' && i.accion === 'pagar');
  const hayIsr = impuestos.items.some((i) => i.id === 'isr' && i.accion === 'pagar');
  const hayRet = impuestos.items.some((i) => i.id === 'retenciones' && i.accion === 'pagar');

  if (hayIva) {
    const iva = impuestos.items.find((i) => i.id === 'iva');
    add('declarar-iva', 'Declarar / pagar IVA', `${moneyPlain(iva.monto)}${iva.vencimiento ? ` · vence ${iva.vencimiento}` : ''}`, 'urgente');
  } else if (impuestos.ivaAFavor > 0) {
    add('revisar-iva-favor', 'Revisar IVA a favor', `${moneyPlain(impuestos.ivaAFavor)} acreditable`, 'info');
  } else if (snapshot.impuestosPendientes != null || snapshot.scoreFiscal != null) {
    add('declarar-iva', 'Declarar IVA', 'Sin saldo a cargo en el periodo', 'hecho');
  }

  if (hayIsr) {
    const isr = impuestos.items.find((i) => i.id === 'isr');
    add('declarar-isr', 'Declarar / pagar ISR provisional', `${moneyPlain(isr.monto)}${isr.vencimiento ? ` · vence ${isr.vencimiento}` : ''}`, 'urgente');
  } else if (snapshot.impuestosPendientes != null || snapshot.scoreFiscal != null) {
    add('declarar-isr', 'Declarar ISR provisional', 'Sin ISR a cargo estimado', 'hecho');
  }

  if (hayRet) {
    const ret = impuestos.items.find((i) => i.id === 'retenciones');
    add('enterar-retenciones', 'Enterar retenciones', moneyPlain(ret.monto), 'urgente');
  }

  const totalCfdi = (snapshot.cfdiIngresos || 0) + (snapshot.cfdiEgresos || 0);
  const clasificados = snapshot.kpiAhorro?.cfdiClasificados || 0;
  const cfdiSinClasificar = Math.max(0, totalCfdi - clasificados);
  if (cfdiSinClasificar > 0) {
    add('clasificar-cfdi', 'Clasificar CFDI', `${cfdiSinClasificar} comprobante(s) sin clasificar`, 'pendiente', 'ingresos');
  } else if (totalCfdi > 0) {
    add('clasificar-cfdi', 'Clasificar CFDI', 'Todos los CFDI del periodo tienen clasificación', 'hecho', 'ingresos');
  }

  if ((snapshot.diferenciasPendientes?.length || 0) > 0 || (snapshot.alertasSat?.length || 0) > 0) {
    const n = (snapshot.diferenciasPendientes?.length || 0) + (snapshot.alertasSat?.length || 0);
    add('corregir-inconsistencias', 'Corregir inconsistencias', `${n} diferencia(s) CFDI / pólizas / SAT`, 'urgente', 'sat');
  } else if (snapshot.cumplimientoFiscal != null) {
    add('corregir-inconsistencias', 'Corregir inconsistencias', 'Sin diferencias detectadas', 'hecho', 'sat');
  }

  const diot = (snapshot.declaraciones || []).find((d) => String(d.tipo || '').toUpperCase() === 'DIOT');
  if (diot) {
    const dias = diasHasta(diot.proximo_vencimiento, hoy);
    add(
      'presentar-diot',
      'Presentar DIOT',
      dias == null ? (diot.periodo_corresponde || 'Periodo actual') : `Vence en ${dias} día(s)`,
      dias != null && dias <= 10 ? 'urgente' : 'pendiente',
    );
  }

  const vencimientos = [
    ...impuestos.items
      .filter((i) => i.accion === 'pagar' && i.vencimiento)
      .map((i) => ({ id: i.id, titulo: i.label, fecha: i.vencimiento, monto: i.monto })),
    ...(snapshot.declaraciones || [])
      .filter((d) => d.proximo_vencimiento && /^\d{4}-\d{2}-\d{2}/.test(String(d.proximo_vencimiento)))
      .map((d, i) => ({
        id: `decl-${i}`,
        titulo: d.tipo,
        fecha: d.proximo_vencimiento,
        monto: null,
      })),
  ]
    .filter((v) => diasHasta(v.fecha, hoy) != null)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .slice(0, 4);

  return { acciones, vencimientos };
};

/**
 * KPI de ahorro operativo de SmartContable.
 * Benchmark despacho contable MX: min/tarea manual.
 */
export const construirKpiAhorro = (facturas = [], mes, anio, indicadores = null) => {
  const delPeriodo = facturas.filter((f) => {
    const p = getPeriodoFactura(f);
    return p?.mes === mes && p?.anio === anio;
  });

  const cfdiAnalizados = delPeriodo.length;
  const cfdiClasificados = delPeriodo.filter((f) => (
    f.clasificacion
    || f.cuenta_contable
    || f.categoria
    || f.clasificado
    || (Array.isArray(f.clasificaciones_especiales) && f.clasificaciones_especiales.length > 0)
  )).length;

  const conciliacionPct = toNumber(indicadores?.diferencias?.porcentaje_coinciden);
  const cfdiConciliados = conciliacionPct > 0
      ? Math.round(cfdiAnalizados * (conciliacionPct / 100))
    : delPeriodo.filter((f) => f.conciliado || f.tiene_poliza || f.poliza_id).length;

  const diferenciasDetectadas = (
    (indicadores?.diferencias?.pendientes?.length || 0)
    + (indicadores?.diferencias?.alertas?.length || 0)
  );

  const declaracionesPreparadas = indicadores?.declaraciones_preparadas
    ?? (indicadores?.salud ? 1 : 0);

  const minutos = (
    cfdiAnalizados * 4
    + cfdiClasificados * 3
    + cfdiConciliados * 5
    + declaracionesPreparadas * 45
    + diferenciasDetectadas * 8
  );

  return {
    cfdiAnalizados,
    cfdiConciliados,
    cfdiClasificados,
    diferenciasDetectadas,
    declaracionesPreparadas,
    horasAhorradas: round(minutos / 60, 1),
    minutosAhorrados: minutos,
  };
};

/**
 * Unifica los datos de los servicios existentes en un único snapshot.
 * Si el paquete fiscal no está disponible (p. ej. negocio local) se usan los CFDI.
 */
export const buildExecutiveSnapshot = ({
  paquete = null,
  paqueteAnterior = null,
  resumenSat = null,
  indicadores = null,
  movimientosBanco = null,
  facturas = [],
  mes,
  anio,
}) => {
  const actualCfdi = resumirFacturasPeriodo(facturas, mes, anio);
  const prev = periodoAnterior(mes, anio);
  const previoCfdi = resumirFacturasPeriodo(facturas, prev.mes, prev.anio);
  const conceptos = agruparConceptosPeriodo(facturas, mes, anio);

  const resumen = paquete?.resumen_ingresos_egresos;
  const resumenPrev = paqueteAnterior?.resumen_ingresos_egresos;

  const ingresos = resumen ? toNumber(resumen.ingresos?.total) : actualCfdi.ingresos.total;
  const gastos = resumen ? toNumber(resumen.egresos?.total) : actualCfdi.egresos.total;
  const utilidad = resumen ? toNumber(resumen.utilidad_neta) : ingresos - gastos;
  const margen = resumen
    ? toNumber(resumen.margen_pct)
    : (ingresos > 0 ? round((utilidad / ingresos) * 100, 2) : 0);

  const hayPrevio = resumenPrev
    ? true
    : (previoCfdi.ingresos.cantidad + previoCfdi.egresos.cantidad) > 0;
  const ingresosPrev = hayPrevio
    ? (resumenPrev ? toNumber(resumenPrev.ingresos?.total) : previoCfdi.ingresos.total)
    : null;
  const gastosPrev = hayPrevio
    ? (resumenPrev ? toNumber(resumenPrev.egresos?.total) : previoCfdi.egresos.total)
    : null;

  const bancoPeriodo = resumirBancoPeriodo(movimientosBanco, mes, anio);

  const totalesSat = resumenSat?.totales;
  const impuestosPendientes = totalesSat ? toNumber(totalesSat.total_a_pagar) : null;
  const ivaNeto = paquete?.sugerencias?.iva_neto_periodo ?? null;

  const salud = indicadores?.salud || null;
  const cumplimiento = indicadores
    ? round(average([
      toNumber(indicadores.diferencias?.porcentaje_coinciden),
      toNumber(indicadores.diot?.porcentaje_completos),
      toNumber(indicadores.revision_contable?.porcentaje),
    ]) ?? 0)
    : null;

  const impuestosDetalle = construirImpuestosDetalle(resumenSat);
  const kpiAhorro = construirKpiAhorro(facturas, mes, anio, indicadores);

  const snapshot = {
    mes,
    anio,
    origen: resumen ? 'servicios' : 'cfdi',
    ingresos,
    gastos,
    utilidad,
    margen,
    ingresosPrev,
    gastosPrev,
    variacionIngresos: ingresosPrev != null ? variacionPct(ingresos, ingresosPrev) : null,
    variacionGastos: gastosPrev != null ? variacionPct(gastos, gastosPrev) : null,
    cfdiIngresos: resumen?.ingresos?.cantidad ?? actualCfdi.ingresos.cantidad,
    cfdiEgresos: resumen?.egresos?.cantidad ?? actualCfdi.egresos.cantidad,
    flujoBancario: bancoPeriodo?.flujo ?? null,
    saldoBancario: bancoPeriodo?.saldo ?? null,
    movimientosBanco: bancoPeriodo?.cantidad ?? null,
    impuestosPendientes,
    ivaNeto,
    scoreFiscal: salud?.score != null ? round(toNumber(salud.score)) : null,
    nivelFiscal: salud?.nivel || null,
    riesgoFiscal: salud?.nivel ? ratioLabel(salud.nivel) : null,
    cumplimientoFiscal: cumplimiento,
    sugerenciasPago: resumenSat?.sugerencias_pago || [],
    declaraciones: resumenSat?.declaraciones || [],
    alertasSat: indicadores?.diferencias?.alertas || [],
    diferenciasPendientes: indicadores?.diferencias?.pendientes || [],
    concentracionClientes: actualCfdi.ingresos,
    concentracionProveedores: actualCfdi.egresos,
    conceptosIngresos: conceptos.ingresos,
    conceptosEgresos: conceptos.egresos,
    impuestosDetalle,
    kpiAhorro,
    obligacionesRegimen: resumenSat?.obligaciones_regimen || null,
  };

  const fiscal = construirAccionesFiscales(snapshot);
  snapshot.accionesFiscales = fiscal.acciones;
  snapshot.vencimientosFiscales = fiscal.vencimientos;
  return snapshot;
};

const obligacionesDelPeriodo = (s) => Math.max(s.gastos, 0) + Math.max(s.impuestosPendientes || 0, 0);

const interpretacionScore = (score) => {
  if (score == null) return 'Sin datos suficientes';
  if (score >= 80) return 'Excelente';
  if (score >= 65) return 'Aceptable';
  if (score >= 40) return 'Requiere atención';
  return 'Crítico';
};

/** Calcula cada componente con fórmula, variables y resultado transparentes. */
export const explicarComponente = (id, s) => {
  switch (id) {
    case 'liquidez': {
      const activo = s.saldoBancario ?? s.flujoBancario;
      if (activo == null) return null;
      const pasivo = obligacionesDelPeriodo(s);
      const ratio = pasivo > 0 ? round(Math.max(activo, 0) / pasivo, 2) : (activo >= 0 ? null : 0);
      const score = pasivo <= 0
        ? (activo >= 0 ? 100 : 40)
        : clamp((Math.max(activo, 0) / pasivo) * 100);
      return {
        formula: 'Liquidez = Activo disponible ÷ (Gastos del periodo + Impuestos por pagar)',
        variables: [
          { label: 'Activo disponible (saldo o flujo bancario)', value: moneyPlain(activo) },
          { label: 'Gastos del periodo', value: moneyPlain(s.gastos) },
          { label: 'Impuestos por pagar', value: s.impuestosPendientes == null ? '—' : moneyPlain(s.impuestosPendientes) },
          { label: 'Pasivo operativo del periodo', value: moneyPlain(pasivo) },
        ],
        ratio: ratio == null ? (activo >= 0 ? 'N/A (sin pasivo)' : '0') : String(ratio),
        score: round(score),
        interpretacion: interpretacionScore(score),
      };
    }
    case 'rentabilidad': {
      if (s.ingresos <= 0) return null;
      const score = clamp(50 + s.margen * 2.5);
      return {
        formula: 'Score = clamp(50 + Margen% × 2.5, 0, 100) · Margen% = Utilidad ÷ Ingresos × 100',
        variables: [
          { label: 'Ingresos', value: moneyPlain(s.ingresos) },
          { label: 'Gastos', value: moneyPlain(s.gastos) },
          { label: 'Utilidad neta', value: moneyPlain(s.utilidad) },
          { label: 'Margen %', value: `${round(s.margen, 2)}%` },
        ],
        ratio: `${round(s.margen, 2)}%`,
        score: round(score),
        interpretacion: interpretacionScore(score),
      };
    }
    case 'flujo': {
      if (s.gastos <= 0) {
        const score = s.ingresos > 0 ? 100 : null;
        if (score == null) return null;
        return {
          formula: 'Sin gastos: score = 100 si hay ingresos',
          variables: [
            { label: 'Ingresos', value: moneyPlain(s.ingresos) },
            { label: 'Gastos', value: moneyPlain(s.gastos) },
          ],
          ratio: '∞',
          score,
          interpretacion: interpretacionScore(score),
        };
      }
      const cobertura = round(s.ingresos / s.gastos, 2);
      const score = clamp((cobertura / 1.2) * 100);
      return {
        formula: 'Score = clamp((Ingresos ÷ Gastos) ÷ 1.2 × 100, 0, 100)',
        variables: [
          { label: 'Ingresos', value: moneyPlain(s.ingresos) },
          { label: 'Gastos', value: moneyPlain(s.gastos) },
          { label: 'Cobertura (Ingresos/Gastos)', value: String(cobertura) },
        ],
        ratio: String(cobertura),
        score: round(score),
        interpretacion: interpretacionScore(score),
      };
    }
    case 'crecimiento': {
      if (s.variacionIngresos == null) return null;
      const score = clamp(60 + s.variacionIngresos * 2);
      return {
        formula: 'Score = clamp(60 + ΔIngresos% × 2, 0, 100)',
        variables: [
          { label: 'Ingresos periodo actual', value: moneyPlain(s.ingresos) },
          { label: 'Ingresos periodo anterior', value: s.ingresosPrev == null ? '—' : moneyPlain(s.ingresosPrev) },
          { label: 'Variación %', value: `${s.variacionIngresos}%` },
        ],
        ratio: `${s.variacionIngresos}%`,
        score: round(score),
        interpretacion: interpretacionScore(score),
      };
    }
    case 'endeudamiento': {
      if (s.impuestosPendientes == null || s.ingresos <= 0) return null;
      const carga = round((s.impuestosPendientes / s.ingresos) * 100, 2);
      const score = clamp(100 - (s.impuestosPendientes / s.ingresos) * 300);
      return {
        formula: 'Score = clamp(100 − (Impuestos ÷ Ingresos) × 300, 0, 100)',
        variables: [
          { label: 'Impuestos pendientes', value: moneyPlain(s.impuestosPendientes) },
          { label: 'Ingresos', value: moneyPlain(s.ingresos) },
          { label: 'Carga fiscal del periodo', value: `${carga}%` },
        ],
        ratio: `${carga}%`,
        score: round(score),
        interpretacion: interpretacionScore(score),
      };
    }
    case 'clientes': {
      const g = s.concentracionClientes;
      if (!g?.cantidad) return null;
      const score = clamp(100 - Math.max(0, g.topPct - 30) * 1.5);
      return {
        formula: 'Score = clamp(100 − max(0, TopCliente% − 30) × 1.5, 0, 100)',
        variables: [
          { label: 'Clientes del periodo', value: String(g.contrapartes) },
          { label: 'Cliente principal', value: g.topNombre || '—' },
          { label: 'Concentración top', value: `${g.topPct}%` },
          { label: 'Ticket promedio', value: moneyPlain(g.ticketPromedio || 0) },
        ],
        ratio: `${g.topPct}%`,
        score: round(score),
        interpretacion: interpretacionScore(score),
      };
    }
    case 'proveedores': {
      const g = s.concentracionProveedores;
      if (!g?.cantidad) return null;
      const score = clamp(100 - Math.max(0, g.topPct - 30) * 1.5);
      return {
        formula: 'Score = clamp(100 − max(0, TopProveedor% − 30) × 1.5, 0, 100)',
        variables: [
          { label: 'Proveedores del periodo', value: String(g.contrapartes) },
          { label: 'Proveedor principal', value: g.topNombre || '—' },
          { label: 'Concentración top', value: `${g.topPct}%` },
        ],
        ratio: `${g.topPct}%`,
        score: round(score),
        interpretacion: interpretacionScore(score),
      };
    }
    case 'riesgoFiscal': {
      if (s.scoreFiscal == null) return null;
      return {
        formula: 'Score fiscal del motor SAT (cumplimiento, DIOT, diferencias)',
        variables: [
          { label: 'Score fiscal', value: `${s.scoreFiscal}/100` },
          { label: 'Nivel de riesgo', value: s.riesgoFiscal || '—' },
          { label: 'Cumplimiento', value: s.cumplimientoFiscal == null ? '—' : `${s.cumplimientoFiscal}%` },
        ],
        ratio: String(s.scoreFiscal),
        score: round(s.scoreFiscal),
        interpretacion: interpretacionScore(s.scoreFiscal),
      };
    }
    default:
      return null;
  }
};

const scoreFromMargen = (s) => (s.ingresos > 0 ? clamp(50 + s.margen * 2.5) : null);

const scoreFromFlujo = (s) => {
  if (s.gastos > 0) return clamp((s.ingresos / s.gastos / 1.2) * 100);
  return s.ingresos > 0 ? 100 : null;
};

const scoreFromLiquidez = (s) => {
  const base = s.saldoBancario ?? s.flujoBancario;
  if (base == null) return null;
  const obligaciones = obligacionesDelPeriodo(s);
  if (obligaciones <= 0) return base >= 0 ? 100 : 40;
  return clamp((Math.max(base, 0) / obligaciones) * 100);
};

const scoreFromCrecimiento = (s) => (
  s.variacionIngresos == null ? null : clamp(60 + s.variacionIngresos * 2)
);

const scoreFromEndeudamiento = (s) => {
  if (s.impuestosPendientes == null || s.ingresos <= 0) return null;
  return clamp(100 - (s.impuestosPendientes / s.ingresos) * 300);
};

const scoreFromConcentracion = (grupo) => (
  grupo.cantidad > 0 ? clamp(100 - Math.max(0, grupo.topPct - 30) * 1.5) : null
);

export const COMPONENTES_SCORE = [
  { id: 'liquidez', label: 'Liquidez', calc: scoreFromLiquidez },
  { id: 'rentabilidad', label: 'Rentabilidad', calc: scoreFromMargen },
  { id: 'flujo', label: 'Flujo', calc: scoreFromFlujo },
  { id: 'crecimiento', label: 'Crecimiento', calc: scoreFromCrecimiento },
  { id: 'endeudamiento', label: 'Endeudamiento', calc: scoreFromEndeudamiento },
  { id: 'clientes', label: 'Clientes', calc: (s) => scoreFromConcentracion(s.concentracionClientes) },
  { id: 'proveedores', label: 'Proveedores', calc: (s) => scoreFromConcentracion(s.concentracionProveedores) },
  { id: 'riesgoFiscal', label: 'Riesgo fiscal', calc: (s) => s.scoreFiscal },
];

export const nivelDeScore = (score) => {
  if (score == null) return { id: 'sin-datos', label: 'Sin datos', tone: 'neutral' };
  if (score >= 80) return { id: 'excelente', label: 'Excelente', tone: 'success' };
  if (score >= 65) return { id: 'buena', label: 'Buena', tone: 'primary' };
  if (score >= 40) return { id: 'atencion', label: 'Requiere atención', tone: 'warning' };
  return { id: 'critica', label: 'Crítica', tone: 'danger' };
};

/** Score financiero 0-100: promedio de los componentes con datos disponibles. */
export const calcularScoreFinanciero = (snapshot) => {
  const componentes = COMPONENTES_SCORE.map(({ id, label, calc }) => {
    const value = calc(snapshot);
    const detail = explicarComponente(id, snapshot);
    return {
      id,
      label,
      score: value == null ? null : round(value),
      detail: detail || null,
    };
  });
  const score = average(componentes.map((c) => c.score));
  const total = score == null ? null : round(score);
  const sorted = componentes.filter((c) => c.score != null).sort((a, b) => b.score - a.score);
  return {
    score: total,
    nivel: nivelDeScore(total),
    componentes,
    fortalezas: sorted.filter((c) => c.score >= 75).slice(0, 3),
    oportunidades: [...sorted].reverse().filter((c) => c.score < 60).slice(0, 3),
    cobertura: componentes.filter((c) => c.score != null).length,
  };
};

const money = moneyPlain;

/** Alertas Info / Warning / Critical ordenadas por gravedad. */
export const detectarAlertas = (s, hoy = new Date()) => {
  const alertas = [];
  const add = (severity, id, titulo, detalle, destino = null) => (
    alertas.push({ severity, id, titulo, detalle, destino })
  );

  if (s.variacionIngresos != null && s.variacionIngresos <= -10) {
    add(
      s.variacionIngresos <= -30 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      'caida-ingresos',
      'Caída de ingresos',
      `Los ingresos bajaron ${Math.abs(s.variacionIngresos)}% contra el mes anterior (${money(s.ingresosPrev)} → ${money(s.ingresos)}).`,
      'ingresos',
    );
  }
  if (s.variacionGastos != null && s.variacionGastos >= 25) {
    add(
      s.variacionGastos >= 50 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      'incremento-gastos',
      'Incremento de gastos',
      `Los gastos subieron ${s.variacionGastos}% contra el mes anterior (${money(s.gastosPrev)} → ${money(s.gastos)}).`,
      'egresos',
    );
  }
  if (s.gastos > 0 && s.ingresos < s.gastos) {
    add(
      SEVERITY.CRITICAL,
      'flujo-insuficiente',
      'Flujo insuficiente',
      `Los gastos (${money(s.gastos)}) superan a los ingresos (${money(s.ingresos)}) del periodo por ${money(s.gastos - s.ingresos)}.`,
      'utilidades',
    );
  }
  const obligaciones = obligacionesDelPeriodo(s);
  if (s.saldoBancario != null && obligaciones > 0 && s.saldoBancario < obligaciones) {
    add(
      s.saldoBancario <= 0 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      'saldo-bajo',
      'Saldo bancario bajo',
      `El saldo (${money(s.saldoBancario)}) no cubre gastos e impuestos del periodo (${money(obligaciones)}). Faltan ${money(obligaciones - Math.max(s.saldoBancario, 0))}.`,
      'bancos',
    );
  } else if (s.saldoBancario == null && s.flujoBancario != null && s.flujoBancario < 0) {
    add(
      SEVERITY.WARNING,
      'saldo-bajo',
      'Flujo bancario negativo',
      `Los cargos del banco superan a los abonos por ${money(Math.abs(s.flujoBancario))}.`,
      'bancos',
    );
  }
  [
    ['concentracion-clientes', 'Concentración de clientes', s.concentracionClientes, 'ingresos'],
    ['dependencia-proveedores', 'Dependencia de proveedores', s.concentracionProveedores, 'proveedores'],
  ].forEach(([id, titulo, grupo, destino]) => {
    if (grupo.cantidad > 0 && grupo.contrapartes > 1 && grupo.topPct >= 50) {
      add(
        grupo.topPct >= 70 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        id,
        titulo,
        `${grupo.topNombre} concentra ${grupo.topPct}% del periodo (${money((grupo.total || 0) * grupo.topPct / 100)}).`,
        destino,
      );
    }
  });

  (s.sugerenciasPago || [])
    .filter((p) => p.accion === 'pagar' && toNumber(p.monto) > 0)
    .forEach((p) => {
      const dias = diasHasta(p.vencimiento, hoy);
      const severity = dias != null && dias <= 3
        ? SEVERITY.CRITICAL
        : dias != null && dias <= 10 ? SEVERITY.WARNING : SEVERITY.INFO;
      const cuando = dias == null
        ? ''
        : dias < 0 ? ` (venció hace ${Math.abs(dias)} día(s))` : ` (vence en ${dias} día(s))`;
      add(severity, `pago-${p.clave}`, `${p.concepto} próximo`, `${money(p.monto)}${cuando}.`, 'sat');
    });

  (s.declaraciones || []).forEach((d, index) => {
    const dias = diasHasta(d.proximo_vencimiento, hoy);
    if (dias == null || dias > 10) return;
    add(
      dias <= 3 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      `declaracion-${index}`,
      `Declaración pendiente: ${d.tipo}`,
      `${d.periodo_corresponde || 'Periodo actual'} · ${dias < 0 ? 'vencida' : `vence en ${dias} día(s)`}.`,
      'sat',
    );
  });

  if ((s.alertasSat || []).length > 0) {
    add(
      SEVERITY.WARNING,
      'alertas-sat',
      'Diferencias detectadas con el SAT',
      `${s.alertasSat.length} desvío(s) entre CFDI, pólizas y cálculo fiscal.`,
      'sat',
    );
  }

  return alertas.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
};

/**
 * Recomendaciones cuantificables derivadas del snapshot real.
 * Cada ítem incluye texto accionable + impacto estimado en MXN cuando aplica.
 */
export const generarRecomendaciones = (scoreInfo, alertas, snapshot = null) => {
  const recomendaciones = [];
  const ids = new Set(alertas.map((a) => a.id));
  const s = snapshot || {};

  const push = (id, texto, impacto = null, destino = null) => {
    if (recomendaciones.some((r) => r.id === id)) return;
    recomendaciones.push({ id, texto, impacto, destino });
  };

  if (ids.has('flujo-insuficiente')) {
    const hueco = Math.max((s.gastos || 0) - (s.ingresos || 0), 0);
    push(
      'flujo-insuficiente',
      `El periodo cierra con hueco de ${money(hueco)}. Reducir gastos 10% liberaría ${money((s.gastos || 0) * 0.1)}; acelerar cobranza del ticket promedio de la cartera top sumaría ~${money((s.concentracionClientes?.ticketPromedio || 0) * Math.max(s.concentracionClientes?.contrapartes || 1, 1) * 0.25)}.`,
      money(hueco),
      'utilidades',
    );
  }

  if (ids.has('caida-ingresos') && s.ingresosPrev != null) {
    const perdida = Math.max((s.ingresosPrev || 0) - (s.ingresos || 0), 0);
    const topNombres = (s.concentracionClientes?.ranking || []).slice(0, 3).map((c) => c.nombre).filter(Boolean);
    push(
      'caida-ingresos',
      `Ingresos cayeron ${Math.abs(s.variacionIngresos)}% (−${money(perdida)}). Recuperar el nivel del mes anterior en ${topNombres.length ? topNombres.join(', ') : 'la cartera principal'} cerraría esa brecha.`,
      money(perdida),
      'ingresos',
    );
  }

  if (ids.has('incremento-gastos') && s.gastosPrev != null) {
    const extra = Math.max((s.gastos || 0) - (s.gastosPrev || 0), 0);
    const topGasto = s.conceptosEgresos?.items?.[0];
    push(
      'incremento-gastos',
      `Gastos subieron ${s.variacionGastos}% (+${money(extra)}).${topGasto ? ` «${topGasto.label}» concentra ${topGasto.pct}% (${money(topGasto.monto)}).` : ''} Reducir 12% los gastos operativos incrementaría la utilidad del periodo en ${money((s.gastos || 0) * 0.12)}.`,
      money((s.gastos || 0) * 0.12),
      'egresos',
    );
  }

  if (ids.has('concentracion-clientes') && s.concentracionClientes?.topPct >= 50) {
    const expuesto = (s.ingresos || 0) * (s.concentracionClientes.topPct / 100);
    push(
      'concentracion-clientes',
      `${s.concentracionClientes.topNombre} concentra ${s.concentracionClientes.topPct}% de ingresos (${money(expuesto)}). Diversificar 20% de esa cartera reduce la exposición en ${money(expuesto * 0.2)}.`,
      money(expuesto * 0.2),
      'ingresos',
    );
  }

  if (ids.has('dependencia-proveedores') && s.concentracionProveedores?.topPct >= 50) {
    const expuesto = (s.gastos || 0) * (s.concentracionProveedores.topPct / 100);
    push(
      'dependencia-proveedores',
      `${s.concentracionProveedores.topNombre} concentra ${s.concentracionProveedores.topPct}% de egresos (${money(expuesto)}). Cotizar 2 proveedores alternos sobre el 30% de ese gasto podría bajar ~5% = ${money(expuesto * 0.3 * 0.05)} mensuales.`,
      money(expuesto * 0.3 * 0.05),
      'proveedores',
    );
  }

  if ([...ids].some((id) => id.startsWith('pago-') || id.startsWith('declaracion-'))) {
    const total = s.impuestosDetalle?.totalPagar ?? s.impuestosPendientes ?? 0;
    const venc = s.impuestosDetalle?.vencimientoPrincipal;
    push(
      'pagar-impuestos',
      `Tienes ${money(total)} de impuestos por pagar${venc ? ` con vencimiento ${venc}` : ''}. Prioriza IVA e ISR antes de la fecha límite; el recargo estimado es ~1.47%/mes (${money(total * 0.0147)}).`,
      money(total * 0.0147),
      'sat',
    );
  }

  if (ids.has('alertas-sat')) {
    const n = s.alertasSat?.length || 0;
    push(
      'alertas-sat',
      `Hay ${n} diferencia(s) entre CFDI, pólizas y cálculo fiscal. Conciliarlas antes de declarar evita rechazos; cada diferencia suele costar 15–30 min de corrección manual.`,
      null,
      'sat',
    );
  }

  if (ids.has('saldo-bajo')) {
    const obligaciones = obligacionesDelPeriodo(s);
    const disponible = s.saldoBancario ?? s.flujoBancario ?? 0;
    const faltante = Math.max(obligaciones - Math.max(disponible, 0), 0);
    const porCobrar = Math.max((s.ingresos || 0) * 0.35, faltante);
    push(
      'saldo-bajo',
      `Faltan ${money(faltante)} para cubrir gastos e impuestos. Estimamos ~${money(porCobrar)} potencialmente por cobrar (35% de ingresos del periodo). Recuperar 50% liberaría ${money(porCobrar * 0.5)} de flujo.`,
      money(porCobrar * 0.5),
      'bancos',
    );
  }

  if (
    !ids.has('incremento-gastos')
    && s.gastos > 0
    && s.utilidad != null
    && s.margen != null
    && s.margen < 25
    && s.margen >= 0
  ) {
    push(
      'mejorar-margen',
      `Tu margen es ${round(s.margen, 1)}%. Reducir gastos operativos 12% (${money(s.gastos * 0.12)}) elevaría la utilidad a ${money((s.utilidad || 0) + s.gastos * 0.12)} (margen ~${round(((s.utilidad || 0) + s.gastos * 0.12) / Math.max(s.ingresos, 1) * 100, 1)}%).`,
      money(s.gastos * 0.12),
      'utilidades',
    );
  }

  if (recomendaciones.length === 0 && scoreInfo.score != null) {
    push(
      'mantener',
      `Indicadores estables (score ${scoreInfo.score}/100). Mantén conciliación y declara en tiempo; ahorro estimado del periodo: ${s.kpiAhorro?.horasAhorradas ?? 0} h de trabajo manual.`,
      null,
      null,
    );
  }

  return recomendaciones;
};
