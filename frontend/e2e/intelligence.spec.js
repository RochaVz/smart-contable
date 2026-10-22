import { test, expect, autenticar } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await autenticar(page);
});

test.describe('Centro de Inteligencia', () => {
  test('muestra todas las categorías del resumen', async ({ page }) => {
    await page.goto('/empresa/c1/inteligencia');
    await expect(page.getByRole('heading', { name: 'Inteligencia Financiera' })).toBeVisible();

    const toolbar = page.getByRole('toolbar', { name: 'Categorías de inteligencia' });
    for (const id of [
      'Resumen',
      'Ingresos',
      'Gastos',
      'Clientes',
      'Proveedores',
      'Balance General',
      'Impuestos',
      'Indicadores',
      'Bancos',
      'Utilidades',
    ]) {
      await expect(toolbar.getByRole('button', { name: new RegExp(`^${id}$`) })).toBeVisible();
    }
  });

  test('selecciona una categoría y muestra su detalle', async ({ page }) => {
    // Categorías con motor disponible (paquete fiscal) muestran el detalle; las
    // categorías movimientos heredan al módulo CFDI cuando se hace click.
    await page.goto('/empresa/c1/inteligencia');

    await page.getByRole('toolbar', { name: 'Categorías de inteligencia' })
      .getByRole('button', { name: /^Impuestos$/ })
      .click();

    await expect(page.getByRole('heading', { name: 'Impuestos' })).toBeVisible();
    await expect(page.getByText(/Resumen SAT: ISR, IVA y pagos/)).toBeVisible();
  });

  test('pasa a una categoría de informes desde la inteligencia', async ({ page }) => {
    await page.goto('/empresa/c1/inteligencia');

    await page.getByRole('toolbar', { name: 'Categorías de inteligencia' })
      .getByRole('button', { name: /^Indicadores$/ })
      .click();

    await expect(page).toHaveURL(/\/inteligencia\/indicadores$/);
  });

  test('selecciona Gastos y navega al módulo CFDI con el filtro egresos', async ({ page }) => {
    await page.goto('/empresa/c1/inteligencia');

    await page.getByRole('toolbar', { name: 'Categorías de inteligencia' })
      .getByRole('button', { name: /^Gastos$/ })
      .click();

    // El motor de inteligencia hereda "gastos" -> módulo CFDI con ?movimiento=egresos
    await expect(page).toHaveURL(/\/modulos\/documentos\?movimiento=egresos$/);
  });
});
