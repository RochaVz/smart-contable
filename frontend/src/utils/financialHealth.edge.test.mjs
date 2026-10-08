import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutiveSnapshot,
  calcularScoreFinanciero,
  detectarAlertas,
  generarRecomendaciones,
  nivelDeScore,
  resumirBancoPeriodo,
  resumirFacturasPeriodo,
  variacionPct,
} from './financialHealth.js';

const HOY = new Date(2026, 9, 7);
const sinConcentracion = { cantidad: 0, contrapartes: 0, topNombre: null, topPct: 0, total: 0 };

/** Snapshot neutro: sin riesgos ni datos opcionales. */
const snapshot = (parcial = {}) => ({
  ingresos: 100000,
  gastos: 50000,
  utilidad: 50000,
  margen: 50,
  variacionIngresos: null,
  variacionGastos: null,
  flujoBancario: null,
  saldoBancario: null,
  impuestosPendientes: null,
  scoreFiscal: null,
  sugerenciasPago: [],
  declaraciones: [],
  alertasSat: [],
  concentracionClientes: sinConcentracion,
  concentracionProveedores: sinConcentracion,
  ...parcial,
});

const componente = (info, id) => info.componentes.find((c) => c.id === id).score;

test('variacionPct redondea a 1 decimal y usa valor absoluto en la base', () => {
  assert.equal(variacionPct(110, 100), 10);
  assert.equal(variacionPct(-50, -100), 50);
  assert.equal(variacionPct(1, 3), -66.7);
  assert.equal(variacionPct(5, NaN), null);
});

test('nivelDeScore respeta los cortes 80 / 65 / 40', () => {
  assert.equal(nivelDeScore(80).id, 'excelente');
  assert.equal(nivelDeScore(79).id, 'buena');
  assert.equal(nivelDeScore(65).id, 'buena');
  assert.equal(nivelDeScore(64).id, 'atencion');
  assert.equal(nivelDeScore(40).id, 'atencion');
  assert.equal(nivelDeScore(39).id, 'critica');
});

test('resumirBancoPeriodo devuelve null si no hay lista', () => {
  assert.equal(resumirBancoPeriodo(null, 9, 2026), null);
  assert.equal(resumirBancoPeriodo(undefined, 9, 2026), null);
});

test('resumirBancoPeriodo calcula flujo y toma el último saldo sin importar el orden', () => {
  const r = resumirBancoPeriodo([
    { id: 3, fecha: '2026-09-20', tipo: 'cargo', monto: 400, saldo: 800 },
    { id: 1, fecha: '2026-08-30', tipo: 'abono', monto: 50, saldo: 300 },
    { id: 2, fecha: '2026-09-02', tipo: 'abono', monto: 900, saldo: 1200 },
    { id: 4, fecha: '2026-10-01', tipo: 'cargo', monto: 100, saldo: 700 },
  ], 9, 2026);
  assert.deepEqual(r, { cantidad: 2, flujo: 500, saldo: 800 });
});

test('resumirBancoPeriodo sin movimientos con saldo deja saldo en null', () => {
  const r = resumirBancoPeriodo([{ id: 1, fecha: '2026-09-02', tipo: 'abono', monto: 10 }], 9, 2026);
  assert.equal(r.saldo, null);
  assert.equal(r.flujo, 10);
});

test('resumirBancoPeriodo usa el saldo de meses anteriores si el periodo no tiene movimientos', () => {
  const r = resumirBancoPeriodo([{ id: 1, fecha: '2026-07-10', tipo: 'abono', monto: 10, saldo: 250 }], 9, 2026);
  assert.deepEqual(r, { cantidad: 0, flujo: 0, saldo: 250 });
});

test('resumirFacturasPeriodo suma subtotal en ventas y total en compras', () => {
  const r = resumirFacturasPeriodo([
    { tipo_operacion: 'VENTA', fecha: '2026-09-01', subtotal: 100, total: 116, nombre_cliente: 'A' },
    { tipo_operacion: 'COMPRA', fecha: '2026-09-02', subtotal: 50, total: 58, nombre_proveedor: 'P' },
    { tipo_operacion: 'VENTA', fecha: '2026-08-01', subtotal: 999, total: 999, nombre_cliente: 'A' },
  ], 9, 2026);
  assert.equal(r.ingresos.total, 100);
  assert.equal(r.egresos.total, 58);
  assert.equal(r.ingresos.cantidad, 1);
});

test('resumirFacturasPeriodo agrupa por contraparte y calcula el mayor', () => {
  const r = resumirFacturasPeriodo([
    { tipo_operacion: 'VENTA', fecha: '2026-09-01', subtotal: 30, nombre_cliente: 'A' },
    { tipo_operacion: 'VENTA', fecha: '2026-09-02', subtotal: 70, nombre_cliente: 'B' },
    { tipo_operacion: 'VENTA', fecha: '2026-09-03', subtotal: 100, nombre_cliente: 'B' },
  ], 9, 2026);
  assert.equal(r.ingresos.contrapartes, 2);
  assert.equal(r.ingresos.topNombre, 'B');
  assert.equal(r.ingresos.topPct, 85);
});

test('resumirFacturasPeriodo con lista vacía no divide entre cero', () => {
  const r = resumirFacturasPeriodo([], 9, 2026);
  assert.equal(r.ingresos.topPct, 0);
  assert.equal(r.ingresos.topNombre, null);
});

test('snapshot sin mes anterior deja variaciones en null', () => {
  const s = buildExecutiveSnapshot({
    facturas: [{ tipo_operacion: 'VENTA', fecha: '2026-09-01', subtotal: 100, nombre_cliente: 'A' }],
    mes: 9,
    anio: 2026,
  });
  assert.equal(s.ingresosPrev, null);
  assert.equal(s.variacionIngresos, null);
});

test('snapshot calcula cumplimiento como promedio de las tres métricas fiscales', () => {
  const s = buildExecutiveSnapshot({
    facturas: [],
    mes: 9,
    anio: 2026,
    indicadores: {
      salud: { score: 90, nivel: 'saludable' },
      diferencias: { porcentaje_coinciden: 60 },
      diot: { porcentaje_completos: 90 },
      revision_contable: { porcentaje: 30 },
    },
  });
  assert.equal(s.cumplimientoFiscal, 60);
  assert.equal(s.scoreFiscal, 90);
  assert.equal(s.riesgoFiscal, 'Bajo');
});

test('snapshot mapea el nivel fiscal a riesgo', () => {
  const nivel = (n) => buildExecutiveSnapshot({ facturas: [], mes: 9, anio: 2026, indicadores: { salud: { score: 10, nivel: n } } }).riesgoFiscal;
  assert.equal(nivel('aceptable'), 'Moderado');
  assert.equal(nivel('en_riesgo'), 'Alto');
  assert.equal(nivel('critico'), 'Crítico');
});

test('score: rentabilidad en los extremos del margen', () => {
  assert.equal(componente(calcularScoreFinanciero(snapshot({ margen: 20 })), 'rentabilidad'), 100);
  assert.equal(componente(calcularScoreFinanciero(snapshot({ margen: 0 })), 'rentabilidad'), 50);
  assert.equal(componente(calcularScoreFinanciero(snapshot({ margen: -20 })), 'rentabilidad'), 0);
  assert.equal(componente(calcularScoreFinanciero(snapshot({ margen: 90 })), 'rentabilidad'), 100);
});

test('score: sin ingresos no hay rentabilidad ni endeudamiento', () => {
  const info = calcularScoreFinanciero(snapshot({ ingresos: 0, gastos: 0, impuestosPendientes: 500 }));
  assert.equal(componente(info, 'rentabilidad'), null);
  assert.equal(componente(info, 'endeudamiento'), null);
  assert.equal(componente(info, 'flujo'), null);
});

test('score: flujo con gastos cero e ingresos positivos es 100', () => {
  assert.equal(componente(calcularScoreFinanciero(snapshot({ gastos: 0 })), 'flujo'), 100);
});

test('score: endeudamiento baja conforme crecen los impuestos pendientes', () => {
  assert.equal(componente(calcularScoreFinanciero(snapshot({ impuestosPendientes: 0 })), 'endeudamiento'), 100);
  assert.equal(componente(calcularScoreFinanciero(snapshot({ impuestosPendientes: 10000 })), 'endeudamiento'), 70);
  assert.equal(componente(calcularScoreFinanciero(snapshot({ impuestosPendientes: 50000 })), 'endeudamiento'), 0);
});

test('score: liquidez usa saldo, cae a flujo y se acota a 100', () => {
  assert.equal(componente(calcularScoreFinanciero(snapshot({ saldoBancario: 25000 })), 'liquidez'), 50);
  assert.equal(componente(calcularScoreFinanciero(snapshot({ saldoBancario: 900000 })), 'liquidez'), 100);
  assert.equal(componente(calcularScoreFinanciero(snapshot({ saldoBancario: -5 })), 'liquidez'), 0);
  assert.equal(componente(calcularScoreFinanciero(snapshot({ flujoBancario: 25000 })), 'liquidez'), 50);
});

test('score: concentración de contrapartes penaliza a partir del 30%', () => {
  const grupo = (topPct) => ({ cantidad: 3, contrapartes: 3, topNombre: 'X', topPct, total: 1 });
  const s = (pct) => componente(calcularScoreFinanciero(snapshot({ concentracionClientes: grupo(pct) })), 'clientes');
  assert.equal(s(30), 100);
  assert.equal(s(50), 70);
  assert.equal(s(100), 0);
});

test('score: crecimiento se acota entre 0 y 100', () => {
  const c = (v) => componente(calcularScoreFinanciero(snapshot({ variacionIngresos: v })), 'crecimiento');
  assert.equal(c(0), 60);
  assert.equal(c(50), 100);
  assert.equal(c(-50), 0);
});

test('score: promedia únicamente los componentes disponibles y reporta cobertura', () => {
  const info = calcularScoreFinanciero(snapshot({ margen: 20, gastos: 0, scoreFiscal: 70 }));
  assert.equal(info.cobertura, 3);
  assert.equal(info.score, Math.round((100 + 100 + 70) / 3));
});

test('score: fortalezas (>=75) y oportunidades (<60) se separan', () => {
  const info = calcularScoreFinanciero(snapshot({ margen: 20, scoreFiscal: 30 }));
  assert.ok(info.fortalezas.some((f) => f.id === 'rentabilidad'));
  assert.ok(info.oportunidades.some((o) => o.id === 'riesgoFiscal'));
  assert.ok(info.fortalezas.length <= 3 && info.oportunidades.length <= 3);
});

test('alertas: un snapshot sano no genera alertas', () => {
  assert.deepEqual(detectarAlertas(snapshot(), HOY), []);
});

test('alertas: umbrales de caída de ingresos', () => {
  const sev = (v) => detectarAlertas(snapshot({ variacionIngresos: v }), HOY).find((a) => a.id === 'caida-ingresos')?.severity;
  assert.equal(sev(-9.9), undefined);
  assert.equal(sev(-10), 'warning');
  assert.equal(sev(-29.9), 'warning');
  assert.equal(sev(-30), 'critical');
});

test('alertas: umbrales de incremento de gastos', () => {
  const sev = (v) => detectarAlertas(snapshot({ variacionGastos: v }), HOY).find((a) => a.id === 'incremento-gastos')?.severity;
  assert.equal(sev(24), undefined);
  assert.equal(sev(25), 'warning');
  assert.equal(sev(50), 'critical');
});

test('alertas: gastos mayores a ingresos es flujo insuficiente crítico', () => {
  const a = detectarAlertas(snapshot({ ingresos: 10, gastos: 20 }), HOY).find((x) => x.id === 'flujo-insuficiente');
  assert.equal(a.severity, 'critical');
});

test('alertas: saldo bajo distingue saldo no positivo (crítico) de insuficiente (warning)', () => {
  const sev = (saldo) => detectarAlertas(snapshot({ saldoBancario: saldo }), HOY).find((a) => a.id === 'saldo-bajo')?.severity;
  assert.equal(sev(10000), 'warning');
  assert.equal(sev(0), 'critical');
  assert.equal(sev(50000), undefined);
});

test('alertas: sin saldo, un flujo bancario negativo avisa; uno positivo no', () => {
  const ids = (flujo) => detectarAlertas(snapshot({ flujoBancario: flujo }), HOY).map((a) => a.id);
  assert.ok(ids(-1).includes('saldo-bajo'));
  assert.ok(!ids(1).includes('saldo-bajo'));
});

test('alertas: la concentración requiere más de una contraparte', () => {
  const unica = { cantidad: 1, contrapartes: 1, topNombre: 'A', topPct: 100, total: 1 };
  const varias = { cantidad: 3, contrapartes: 2, topNombre: 'A', topPct: 70, total: 1 };
  assert.equal(detectarAlertas(snapshot({ concentracionClientes: unica }), HOY).length, 0);
  const a = detectarAlertas(snapshot({ concentracionClientes: varias }), HOY).find((x) => x.id === 'concentracion-clientes');
  assert.equal(a.severity, 'critical');
  const w = detectarAlertas(snapshot({ concentracionProveedores: { ...varias, topPct: 55 } }), HOY).find((x) => x.id === 'dependencia-proveedores');
  assert.equal(w.severity, 'warning');
});

test('alertas: pagos próximos, vencidos y lejanos', () => {
  const pago = (vencimiento, extra = {}) => snapshot({
    sugerenciasPago: [{ clave: 'iva', concepto: 'IVA', monto: 100, accion: 'pagar', vencimiento, ...extra }],
  });
  const sev = (s) => detectarAlertas(s, HOY).find((a) => a.id === 'pago-iva');
  assert.equal(sev(pago('2026-10-20')).severity, 'info');
  assert.equal(sev(pago('2026-10-17')).severity, 'warning');
  assert.equal(sev(pago('2026-10-10')).severity, 'critical');
  assert.match(sev(pago('2026-10-01')).detalle, /venció hace 6/);
  assert.equal(sev(pago('2026-10-10', { accion: 'acreditar' })), undefined);
  assert.equal(sev(pago('2026-10-10', { monto: 0 })), undefined);
});

test('alertas: declaraciones solo dentro de 10 días y sin fecha se ignoran', () => {
  const decl = (fecha) => snapshot({ declaraciones: [{ tipo: 'DIOT', proximo_vencimiento: fecha }] });
  assert.equal(detectarAlertas(decl('2026-10-30'), HOY).length, 0);
  assert.equal(detectarAlertas(decl(null), HOY).length, 0);
  assert.equal(detectarAlertas(decl('2026-10-12'), HOY)[0].severity, 'warning');
  assert.equal(detectarAlertas(decl('2026-10-08'), HOY)[0].severity, 'critical');
});

test('alertas: desvíos SAT generan warning', () => {
  const a = detectarAlertas(snapshot({ alertasSat: [{}, {}] }), HOY).find((x) => x.id === 'alertas-sat');
  assert.equal(a.severity, 'warning');
  assert.match(a.detalle, /2 desvío/);
});

test('alertas: se ordenan de más a menos grave', () => {
  const alertas = detectarAlertas(snapshot({
    ingresos: 10,
    gastos: 20,
    variacionIngresos: -15,
    alertasSat: [{}],
    sugerenciasPago: [{ clave: 'isr', concepto: 'ISR', monto: 5, accion: 'pagar', vencimiento: '2026-10-30' }],
  }), HOY);
  const orden = alertas.map((a) => a.severity);
  assert.deepEqual(orden, [...orden].sort((a, b) => ({ critical: 0, warning: 1, info: 2 }[a] - { critical: 0, warning: 1, info: 2 }[b])));
  assert.equal(orden[0], 'critical');
  assert.equal(orden.at(-1), 'info');
});

test('recomendaciones: mensaje por defecto con score y vacío sin datos', () => {
  const conScore = generarRecomendaciones({ score: 80 }, []);
  assert.equal(conScore.length, 1);
  assert.match(conScore[0], /Mantén el ritmo/);
  assert.deepEqual(generarRecomendaciones({ score: null }, []), []);
});

test('recomendaciones: una por cada tipo de alerta relevante, sin duplicar pagos', () => {
  const alertas = [
    { id: 'pago-iva' },
    { id: 'pago-isr' },
    { id: 'declaracion-0' },
    { id: 'saldo-bajo' },
    { id: 'alertas-sat' },
  ];
  const recs = generarRecomendaciones({ score: 50 }, alertas);
  assert.equal(recs.filter((r) => /impuestos/.test(r)).length, 1);
  assert.equal(recs.length, 3);
});
