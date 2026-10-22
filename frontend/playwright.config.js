/**
 * Configuración Playwright E2E.
 *
 * Arranca Vite (`npm run dev`) como servidor web, punto base y proyectos
 * desktop + móvil. Las pruebas interceptan la API mediante el fixture
 * `mockApi` (ver e2e/fixtures.js) por lo que no requieren backend.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 5173);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // El service worker de la app puede recargar la pagina durante la carga y
    // abortar la navegacion (net::ERR_ABORTED). En E2E se desactiva.
    serviceWorkers: 'block',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /movil\.spec\.js$/,
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
      testIgnore: /desktop\.spec\.js$/,
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
