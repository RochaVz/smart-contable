import { test as base, expect } from '@playwright/test';
import { instalarMockApi } from './helpers/mocks.js';

/**
 * Fixture personalizado que instala los mocks de API en cada test
 * (automático: no hay que declararlo en el `test(...)`).
 *
 * Playwright crea un `BrowserContext` nuevo por test, por lo que
 * localStorage (token) e IndexedDB (respaldo local) ya están aislados; no
 * hace falta limpiar el almacenamiento manualmente.
 */
export const test = base.extend({
  mockApi: [async ({ page }, use) => {
    const api = await instalarMockApi(page);
    await use(api);
  }, { auto: true }],
});

/** Inyecta un token de sesión antes de navegar (simula login previo). */
export const autenticar = async (page, token = 'e2e-token') => {
  await page.addInitScript((valor) => {
    window.localStorage.setItem('token', valor);
  }, token);
};

export { expect };
