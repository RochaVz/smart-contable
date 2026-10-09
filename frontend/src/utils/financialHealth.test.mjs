import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutiveSnapshot,
  calcularScoreFinanciero,
  detectarAlertas,
  diasHasta,
  generarRecomendaciones,
  nivelDeScore,
  periodoAnterior,
  variacionPct,
} from './financialHealth.js';

const facturas = [
  { tipo_operacion: 'VENTA', fecha: '2026-09-10', subtotal: 8000, total: 9280, nombre_cliente: 'Cliente A' },
  { tipo_operacion: 'VENTA', fecha: '2026-09-12', subtotal: 2000, total: 2320, nombre_cliente: 'Cliente B' },
  { tipo_operacion: 'COMPRA', fecha: '2026-09-15', subtotal: 3000, total: 3480, nombre_proveedor: 'Prov 1' },
  { tipo_operacion: 'VENTA', fecha: '2026-08-10', subtotal: 20000, total: 23200, nombre_cliente: 'Cliente A' },
  { tipo_operacion: 'COMPRA', fecha: '2026-08-11', subtotal: 1000, total: 1000, nombre_proveedor: 'Prov 1' },
];

test('periodoAnterior cruza de año', () => {
  assert.deepEqual(periodoAnterior(1, 2026), { mes: 12, anio: 2025 });
  assert.deepEqual(periodoAnterior(5, 2026), { mes: 4, anio: 2026 });
});

test('variacionPct evita división entre cero', () => {
  assert.equal(variacionPct(10, 0), null);
  assert.equal(variacionPct(50, 100), -50);
});

test('diasHasta calcula días naturales', () => {
  assert.equal(diasHasta('2026-10-17', new Date(2026, 9, 7)), 10);
  assert.equal(diasHasta('2026-10-05', new Date(2026, 9, 7)), -2);
  assert.equal(diasHasta(null), null);
});

test('snapshot usa CFDI cuando no hay paquete fiscal', () => {
  const s = buildExecutiveSnapshot({ facturas, mes: 9, anio: 2026 });
  assert.equal(s.origen, 'cfdi');
  assert.equal(s.ingresos, 10000);
  assert.equal(s.gastos, 3480);
  assert.equal(s.variacionIngresos, -50);
  assert.equal(s.concentracionClientes.topPct, 80);
});

test('snapshot prefiere los servicios existentes', () => {
  const paquete = {
    resumen_ingresos_egresos: {
      ingresos: { total: 500, cantidad: 2 },
      egresos: { total: 100, cantidad: 1 },
      utilidad_neta: 400,
      margen_pct: 80,
    },
  };
  const s = buildExecutiveSnapshot({
    paquete,
    facturas,
    mes: 9,
    anio: 2026,
    movimientosBanco: [
      { id: 1, fecha: '2026-08-30', tipo: 'abono', monto: 50, saldo: 300 },
      { id: 2, fecha: '2026-09-02', tipo: 'abono', monto: 900, saldo: 1200 },
      { id: 3, fecha: '2026-09-20', tipo: 'cargo', monto: 400, saldo: 800 },
      { id: 4, fecha: '2026-10-01', tipo: 'cargo', monto: 100, saldo: 700 },
    ],
    resumenSat: { totales: { total_a_pagar: 120 } },
  });
  assert.equal(s.origen, 'servicios');
  assert.equal(s.utilidad, 400);
  assert.equal(s.flujoBancario, 500);
  assert.equal(s.impuestosPendientes, 120);
  assert.equal(s.saldoBancario, 800);
  assert.equal(s.movimientosBanco, 2);
});

test('score promedia solo componentes con datos', () => {
  const s = buildExecutiveSnapshot({ facturas, mes: 9, anio: 2026 });
  const info = calcularScoreFinanciero(s);
  assert.ok(info.score >= 0 && info.score <= 100);
  assert.equal(info.componentes.find((c) => c.id === 'liquidez').score, null);
  assert.equal(info.cobertura, 5);
});

test('score sin datos devuelve nivel sin-datos', () => {
  const s = buildExecutiveSnapshot({ facturas: [], mes: 9, anio: 2026 });
  const info = calcularScoreFinanciero(s);
  assert.equal(info.score, null);
  assert.equal(info.nivel.id, 'sin-datos');
  assert.equal(nivelDeScore(85).id, 'excelente');
  assert.equal(nivelDeScore(30).id, 'critica');
});

test('alertas detectan caída, concentración y vencimientos', () => {
  const s = buildExecutiveSnapshot({
    facturas,
    mes: 9,
    anio: 2026,
    resumenSat: {
      sugerencias_pago: [{ clave: 'iva', concepto: 'IVA a cargo', monto: 1600, accion: 'pagar', vencimiento: '2026-10-14' }],
      declaraciones: [{ tipo: 'DIOT', proximo_vencimiento: '2026-10-17', periodo_corresponde: 'Septiembre 2026' }],
    },
  });
  const alertas = detectarAlertas(s, new Date(2026, 9, 7));
  const ids = alertas.map((a) => a.id);
  assert.ok(ids.includes('caida-ingresos'));
  assert.ok(ids.includes('concentracion-clientes'));
  assert.ok(ids.includes('pago-iva'));
  assert.equal(alertas.find((a) => a.id === 'caida-ingresos').severity, 'critical');
  assert.equal(alertas.find((a) => a.id === 'pago-iva').severity, 'warning');
  assert.equal(alertas[0].severity, 'critical');
});

test('alerta de saldo bajo cuando no cubre obligaciones', () => {
  const s = buildExecutiveSnapshot({
    facturas,
    mes: 9,
    anio: 2026,
    movimientosBanco: [{ id: 1, fecha: '2026-09-02', tipo: 'abono', monto: 1000, saldo: 1000 }],
  });
  const alerta = detectarAlertas(s, new Date(2026, 9, 7)).find((a) => a.id === 'saldo-bajo');
  assert.equal(alerta.severity, 'warning');
});

test('recomendaciones reflejan alertas', () => {
  const s = buildExecutiveSnapshot({ facturas, mes: 9, anio: 2026 });
  const alertas = detectarAlertas(s, new Date(2026, 9, 7));
  const recs = generarRecomendaciones(calcularScoreFinanciero(s), alertas, s);
  assert.ok(recs.length > 0);
  assert.ok(recs.every((r) => typeof r === 'object' && r.texto));
});

test('impuestos detalle expone IVA/ISR con vencimiento', () => {
  const s = buildExecutiveSnapshot({
    facturas,
    mes: 9,
    anio: 2026,
    resumenSat: {
      totales: { total_a_pagar: 20450 },
      impuestos: {
        iva_por_pagar: 12000,
        iva_acreditable: 3000,
        isr_provisional: 8450,
        retenciones: 500,
      },
      sugerencias_pago: [
        { clave: 'iva', concepto: 'IVA a cargo', monto: 12000, accion: 'pagar', vencimiento: '2026-10-17' },
        { clave: 'isr', concepto: 'ISR provisional', monto: 8450, accion: 'pagar', vencimiento: '2026-10-17' },
        { clave: 'iva_acreditable', concepto: 'IVA acreditable', monto: 3000, accion: 'acreditar' },
      ],
    },
  });
  assert.equal(s.impuestosDetalle.totalPagar, 20450);
  assert.ok(s.impuestosDetalle.items.some((i) => i.id.includes('iva') && i.accion === 'pagar'));
  assert.ok(s.impuestosDetalle.items.some((i) => i.id.includes('isr') && i.accion === 'pagar'));
  assert.ok(s.accionesFiscales.length > 0);
  assert.ok(s.kpiAhorro.cfdiAnalizados >= 3);
});

test('agrupa conceptos CFDI del periodo', async () => {
  const { agruparConceptosPeriodo, normalizarConcepto } = await import('./financialHealth.js');
  assert.equal(normalizarConcepto('Hospedaje Hab. 101'), normalizarConcepto('hospedaje hab 202'));
  const grupo = agruparConceptosPeriodo([
    {
      tipo_operacion: 'VENTA',
      fecha: '2026-09-10',
      subtotal: 1000,
      total: 1160,
      conceptos: [
        { descripcion: 'Hospedaje doble', importe: 700 },
        { descripcion: 'Restaurante', importe: 300 },
      ],
    },
    {
      tipo_operacion: 'COMPRA',
      fecha: '2026-09-11',
      total: 500,
      conceptos: [{ descripcion: 'Nómina quincena', importe: 500 }],
    },
  ], 9, 2026);
  assert.ok(grupo.ingresos.items.length >= 2);
  assert.ok(grupo.egresos.items.some((i) => /nomina/i.test(i.label) || /n[oó]mina/i.test(i.label)));
});
