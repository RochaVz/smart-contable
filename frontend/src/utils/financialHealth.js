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
    const [topNombre, topMonto] = [...porContraparte.entries()]
      .sort((a, b) => b[1] - a[1])[0] || [null, 0];
    return {
      total,
      cantidad: lista.length,
      contrapartes: porContraparte.size,
      topNombre,
      topPct: total > 0 ? round((topMonto / total) * 100, 1) : 0,
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

  return {
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
  };
};

const scoreFromMargen = (s) => (s.ingresos > 0 ? clamp(50 + s.margen * 2.5) : null);

const scoreFromFlujo = (s) => {
  if (s.gastos > 0) return clamp((s.ingresos / s.gastos / 1.2) * 100);
  return s.ingresos > 0 ? 100 : null;
};

const obligacionesDelPeriodo = (s) => Math.max(s.gastos, 0) + Math.max(s.impuestosPendientes || 0, 0);

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
    return { id, label, score: value == null ? null : round(value) };
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

const money = (value) => Number(value || 0).toLocaleString('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

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
      `Los ingresos bajaron ${Math.abs(s.variacionIngresos)}% contra el mes anterior.`,
      'ingresos',
    );
  }
  if (s.variacionGastos != null && s.variacionGastos >= 25) {
    add(
      s.variacionGastos >= 50 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      'incremento-gastos',
      'Incremento de gastos',
      `Los gastos subieron ${s.variacionGastos}% contra el mes anterior.`,
      'egresos',
    );
  }
  if (s.gastos > 0 && s.ingresos < s.gastos) {
    add(
      SEVERITY.CRITICAL,
      'flujo-insuficiente',
      'Flujo insuficiente',
      `Los gastos (${money(s.gastos)}) superan a los ingresos (${money(s.ingresos)}) del periodo.`,
      'utilidades',
    );
  }
  const obligaciones = obligacionesDelPeriodo(s);
  if (s.saldoBancario != null && obligaciones > 0 && s.saldoBancario < obligaciones) {
    add(
      s.saldoBancario <= 0 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
      'saldo-bajo',
      'Saldo bancario bajo',
      `El saldo (${money(s.saldoBancario)}) no cubre gastos e impuestos del periodo (${money(obligaciones)}).`,
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
        `${grupo.topNombre} concentra ${grupo.topPct}% del periodo.`,
        destino,
      );
    }
  });

  s.sugerenciasPago
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

  s.declaraciones.forEach((d, index) => {
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

  if (s.alertasSat.length > 0) {
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

/** Recomendaciones accionables derivadas del score y las alertas. */
export const generarRecomendaciones = (scoreInfo, alertas) => {
  const recomendaciones = [];
  const ids = new Set(alertas.map((a) => a.id));

  if (ids.has('flujo-insuficiente')) {
    recomendaciones.push('Revisa los gastos del periodo y prioriza cobranza para recuperar flujo.');
  }
  if (ids.has('caida-ingresos')) {
    recomendaciones.push('Analiza qué clientes dejaron de comprar y reactiva las cuentas principales.');
  }
  if (ids.has('incremento-gastos')) {
    recomendaciones.push('Identifica las categorías de gasto que crecieron y valida si son recurrentes.');
  }
  if (ids.has('concentracion-clientes')) {
    recomendaciones.push('Diversifica tu cartera: depender de un solo cliente aumenta el riesgo.');
  }
  if (ids.has('dependencia-proveedores')) {
    recomendaciones.push('Cotiza proveedores alternos para reducir dependencia.');
  }
  if ([...ids].some((id) => id.startsWith('pago-') || id.startsWith('declaracion-'))) {
    recomendaciones.push('Programa el pago de impuestos y presenta tus declaraciones antes del vencimiento.');
  }
  if (ids.has('alertas-sat')) {
    recomendaciones.push('Concilia CFDI contra pólizas en el módulo SAT para eliminar diferencias.');
  }
  if (ids.has('saldo-bajo')) {
    recomendaciones.push('Cuida tu liquidez: acelera cobros o difiere pagos no urgentes.');
  }
  if (recomendaciones.length === 0 && scoreInfo.score != null) {
    recomendaciones.push('Mantén el ritmo: tus indicadores no muestran riesgos relevantes este periodo.');
  }
  return recomendaciones;
};
