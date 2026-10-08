import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MESES,
  etiquetaPeriodo,
  formatMoney,
  formatPct,
  toneColor,
  toneFromScore,
} from '../components/executive/format.js';

test('formatMoney da formato MXN con decimales y soporta nulos', () => {
  assert.match(formatMoney(1234.5), /1,234\.50/);
  assert.match(formatMoney(null), /0\.00/);
  assert.match(formatMoney('abc'), /0\.00/);
});

test('formatMoney compacto omite decimales y abrevia millones', () => {
  assert.doesNotMatch(formatMoney(1500, { compact: true }), /\.00/);
  assert.equal(formatMoney(2_500_000, { compact: true }), '$2.5 M');
  assert.equal(formatMoney(-3_000_000, { compact: true }), '-$3 M');
});

test('formatPct maneja null y limita decimales', () => {
  assert.equal(formatPct(null), '—');
  assert.equal(formatPct(undefined), '—');
  assert.equal(formatPct(12.345), '12.3%');
  assert.equal(formatPct(72, 0), '72%');
});

test('etiquetaPeriodo usa nombres de mes en español', () => {
  assert.equal(MESES.length, 12);
  assert.equal(etiquetaPeriodo(1, 2026), 'Enero 2026');
  assert.equal(etiquetaPeriodo(12, 2025), 'Diciembre 2025');
});

test('toneFromScore respeta los cortes 80 / 65 / 40', () => {
  assert.equal(toneFromScore(null), 'neutral');
  assert.equal(toneFromScore(80), 'success');
  assert.equal(toneFromScore(79), 'primary');
  assert.equal(toneFromScore(65), 'primary');
  assert.equal(toneFromScore(64), 'warning');
  assert.equal(toneFromScore(40), 'warning');
  assert.equal(toneFromScore(39), 'danger');
});

test('toneColor devuelve variable CSS y cae a neutral', () => {
  assert.equal(toneColor('danger'), 'var(--sc-danger)');
  assert.equal(toneColor('inexistente'), 'var(--sc-muted)');
});
