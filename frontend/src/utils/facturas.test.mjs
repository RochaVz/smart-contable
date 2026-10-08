import test from 'node:test';
import assert from 'node:assert/strict';
import {
  esIngreso,
  getContraparteFactura,
  getFechaFactura,
  getPeriodoFactura,
  parseFechaFactura,
  toNumber,
} from './facturas.js';

test('getFechaFactura prefiere fecha y cae a fecha_emision', () => {
  assert.equal(getFechaFactura({ fecha: '2026-01-02', fecha_emision: '2025-01-01' }), '2026-01-02');
  assert.equal(getFechaFactura({ fecha_emision: '2025-01-01' }), '2025-01-01');
  assert.equal(getFechaFactura({}), '');
});

test('parseFechaFactura interpreta YYYY-MM-DD en hora local sin desfase de día', () => {
  const date = parseFechaFactura({ fecha: '2026-03-01T23:59:59' });
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 2);
  assert.equal(date.getDate(), 1);
});

test('parseFechaFactura devuelve null para fechas vacías o inválidas', () => {
  assert.equal(parseFechaFactura({}), null);
  assert.equal(parseFechaFactura({ fecha: 'no-es-fecha' }), null);
});

test('getPeriodoFactura entrega mes (1-12) y año', () => {
  const p = getPeriodoFactura({ fecha: '2026-12-31' });
  assert.equal(p.mes, 12);
  assert.equal(p.anio, 2026);
  assert.equal(getPeriodoFactura({}), null);
});

test('toNumber tolera strings, nulos y basura', () => {
  assert.equal(toNumber('12.5'), 12.5);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber('abc'), 0);
  assert.equal(toNumber(7), 7);
});

test('esIngreso solo reconoce VENTA', () => {
  assert.equal(esIngreso({ tipo_operacion: 'VENTA' }), true);
  assert.equal(esIngreso({ tipo_operacion: 'COMPRA' }), false);
  assert.equal(esIngreso({}), false);
});

test('getContraparteFactura elige cliente en ventas y proveedor en compras', () => {
  assert.equal(
    getContraparteFactura({ tipo_operacion: 'VENTA', nombre_receptor: 'Cliente X', nombre_emisor: 'Yo' }),
    'Cliente X',
  );
  assert.equal(
    getContraparteFactura({ tipo_operacion: 'COMPRA', nombre_emisor: 'Prov Y', nombre_receptor: 'Yo' }),
    'Prov Y',
  );
});

test('getContraparteFactura prioriza cliente_o_proveedor y usa guion como último recurso', () => {
  assert.equal(
    getContraparteFactura({ tipo_operacion: 'VENTA', cliente_o_proveedor: 'Directo', nombre_cliente: 'Otro' }),
    'Directo',
  );
  assert.equal(getContraparteFactura({ tipo_operacion: 'COMPRA' }), '—');
});
