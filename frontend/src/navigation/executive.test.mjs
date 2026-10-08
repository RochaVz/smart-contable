import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INFORMES,
  INFORMES_PLANOS,
  INTELIGENCIA_CATEGORIAS,
  SIDEBAR_ITEMS,
  SIDEBAR_SECTIONS,
  activeSidebarId,
  getInforme,
  sidebarHref,
} from '../navigation/executive.js';
import { COMPANY_HUB_ITEMS, getHubItem, hubPath, legacyQueryToHubPath } from '../navigation/companyHub.js';

const TIPOS_FUENTE = new Set(['informes', 'fiscal', 'bancos', 'polizas', 'balance']);
const TABS_INFORMES = new Set(['resumen', 'estado', 'padron', 'trasladados', 'acreditables', 'retenidos', 'sugerencias']);
const TABS_FISCAL = new Set(['resumen', 'indicadores', 'isr', 'iva', 'diot', 'anual', 'diferencias', 'config', 'bitacora', 'complementos']);

const unicos = (valores) => new Set(valores).size === valores.length;

test('el sidebar muestra como máximo 8 elementos con ids únicos', () => {
  assert.ok(SIDEBAR_ITEMS.length <= 8);
  assert.ok(unicos(SIDEBAR_ITEMS.map((i) => i.id)));
  assert.equal(SIDEBAR_SECTIONS.flatMap((s) => s.items).length, SIDEBAR_ITEMS.length);
});

test('sidebarHref construye rutas por negocio', () => {
  const dashboard = SIDEBAR_ITEMS.find((i) => i.id === 'dashboard');
  const sat = SIDEBAR_ITEMS.find((i) => i.id === 'sat');
  assert.equal(sidebarHref(5, dashboard), '/empresa/5');
  assert.equal(sidebarHref('local-abc', sat), '/empresa/local-abc/modulos/fiscal');
});

test('activeSidebarId resuelve la ruta actual', () => {
  assert.equal(activeSidebarId('/empresa/1', 1), 'dashboard');
  assert.equal(activeSidebarId('/empresa/1/', 1), 'dashboard');
  assert.equal(activeSidebarId('/empresa/1/modulos/documentos', 1), 'cfdi');
  assert.equal(activeSidebarId('/empresa/1/modulos/polizas', 1), 'contabilidad');
  assert.equal(activeSidebarId('/empresa/1/modulos/conciliacion', 1), 'bancos');
  assert.equal(activeSidebarId('/empresa/1/modulos/fiscal', 1), 'sat');
  assert.equal(activeSidebarId('/empresa/1/inteligencia', 1), 'inteligencia');
  assert.equal(activeSidebarId('/empresa/1/inteligencia/gastos', 1), 'inteligencia');
  assert.equal(activeSidebarId('/empresa/1/informes/balance-general', 1), 'informes');
  assert.equal(activeSidebarId('/empresa/1/configuracion', 1), 'configuracion');
});

test('las rutas legacy /reportes resaltan Inteligencia y lo desconocido cae a Dashboard', () => {
  assert.equal(activeSidebarId('/empresa/1/reportes/ingresos', 1), 'inteligencia');
  assert.equal(activeSidebarId('/empresa/1/algo-raro', 1), 'dashboard');
  assert.equal(activeSidebarId('/otra/ruta', 1), 'dashboard');
});

test('los módulos del sidebar apuntan a rutas de hub existentes', () => {
  SIDEBAR_ITEMS.filter((i) => i.path.startsWith('/modulos/')).forEach((item) => {
    const slug = item.path.split('/').pop();
    assert.ok(getHubItem('modulos', slug), `no existe el módulo ${slug}`);
  });
});

test('las 9 categorías de inteligencia tienen ids únicos y fuente válida', () => {
  assert.equal(INTELIGENCIA_CATEGORIAS.length, 9);
  assert.ok(unicos(INTELIGENCIA_CATEGORIAS.map((c) => c.id)));
  INTELIGENCIA_CATEGORIAS.forEach((c) => {
    assert.ok(TIPOS_FUENTE.has(c.fuente.tipo), `${c.id}: tipo inválido`);
  });
});

test('las fuentes referencian pestañas que existen en los paneles', () => {
  const fuentes = [
    ...INTELIGENCIA_CATEGORIAS.map((c) => c.fuente),
    ...INFORMES_PLANOS.filter((i) => i.fuente).map((i) => i.fuente),
  ];
  fuentes.forEach((f) => {
    if (f.tipo === 'informes') assert.ok(TABS_INFORMES.has(f.tab), `tab informes inválida: ${f.tab}`);
    if (f.tipo === 'fiscal') assert.ok(TABS_FISCAL.has(f.tab), `tab fiscal inválida: ${f.tab}`);
    if (f.tipo === 'balance') assert.ok(['balance', 'balanza'].includes(f.modo));
  });
});

test('el catálogo de informes cubre los 7 contables y 7 fiscales con ids únicos', () => {
  assert.equal(INFORMES.contables.length, 7);
  assert.equal(INFORMES.fiscales.length, 7);
  assert.ok(unicos(INFORMES_PLANOS.map((i) => i.id)));
});

test('cada informe tiene fuente o está marcado como no disponible', () => {
  INFORMES_PLANOS.forEach((i) => {
    assert.ok(i.fuente || i.disponible === false, `${i.id} sin fuente ni marca`);
  });
  assert.deepEqual(
    INFORMES_PLANOS.filter((i) => i.disponible === false).map((i) => i.id).sort(),
    ['auxiliares', 'flujo-efectivo'],
  );
});

test('getInforme encuentra por id y devuelve null si no existe', () => {
  assert.equal(getInforme('iva').label, 'IVA');
  assert.equal(getInforme('no-existe'), null);
});

test('las rutas de hub legacy siguen resolviéndose', () => {
  assert.ok(COMPANY_HUB_ITEMS.length > 0);
  const item = getHubItem('modulos', 'documentos');
  assert.equal(hubPath(3, item), '/empresa/3/modulos/documentos');
  assert.equal(legacyQueryToHubPath(3, 'fiscal', null), '/empresa/3/modulos/fiscal');
  assert.equal(legacyQueryToHubPath(3, 'informes', 'padron').startsWith('/empresa/3/reportes/'), true);
  assert.equal(legacyQueryToHubPath(3, 'desconocida', null), '/empresa/3');
});
