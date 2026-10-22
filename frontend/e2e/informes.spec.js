import { test, expect, autenticar } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await autenticar(page);
});

test.describe('Informes', () => {
  test('muestra todos los informes del catálogo', async ({ page }) => {
    await page.goto('/empresa/c1/informes');
    await expect(page.getByRole('heading', { name: 'Informes Fiscales y Contables' })).toBeVisible();

    for (const etiqueta of [
      'Balance General',
      'Estado de Resultados',
      'Balanza de Comprobación',
      'Libro Diario',
      'IVA',
      'ISR',
      'Declaraciones',
      'Cumplimiento Fiscal',
    ]) {
      await expect(page.getByText(etiqueta, { exact: true })).toBeVisible();
    }
  });

  test('marca como próximamente los informes sin servicio', async ({ page }) => {
    await page.goto('/empresa/c1/informes');
    await expect(page.getByText('Próximamente', { exact: true }).first()).toBeVisible();
  });

  test('selecciona un informe y muestra sus KPIs', async ({ page }) => {
    await page.goto('/empresa/c1/informes');
    await page.getByText('Balance General', { exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Balance General' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exportar PDF' })).toBeVisible();
    // Las etiquetas de las tarjetas KPI seuppercasean por CSS, por eso se
    // validan los valores y el comparativo, no el texto del label.
    await expect(page.getByText('$0').first()).toBeVisible();
    await expect(page.getByText(/vs mes anterior/).first()).toBeVisible();
  });
});
