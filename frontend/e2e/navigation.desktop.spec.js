import { test, expect, autenticar } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await autenticar(page);
});

const SIDEBAR = (page) => page.getByRole('navigation', { name: 'Navegación principal' });

test.describe('Navegación por módulos', () => {
  test('mostra las secciones del sidebar y activa la pestaña actual', async ({ page }) => {
    await page.goto('/empresa/c1');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    const nav = SIDEBAR(page);
    await expect(nav.getByRole('link', { name: 'CFDI' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Contabilidad' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Bancos' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'SAT' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Inteligencia Financiera' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Informes Fiscales y Contables' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Configuración' })).toBeVisible();

    // Asegura que la pestaña Dashboard esté activa cuando no hay modulo.
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('navega entre los módulos y cambia el título', async ({ page }) => {
    await page.goto('/empresa/c1');
    const nav = SIDEBAR(page);

    await nav.getByRole('link', { name: 'Contabilidad' }).click();
    await expect(page).toHaveURL(/\/modulos\/polizas$/);
    await expect(page.getByRole('heading', { name: 'Registro contable' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Contabilidad' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await nav.getByRole('link', { name: 'SAT' }).click();
    await expect(page).toHaveURL(/\/modulos\/fiscal$/);
    await expect(page.getByRole('heading', { name: 'Motor fiscal SAT' }).first()).toBeVisible();
  });

  test('vuelve al dashboard desde "Mis empresas"', async ({ page }) => {
    await page.goto('/empresa/c1');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // El enlace "Mis empresas" vive fuera del <nav> (es hermano en el aside).
    await page.getByRole('link', { name: 'Mis empresas' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Tus empresas' })).toBeVisible();
  });

  test('verifica los reportes rápidos de la tarjeta', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByText('Ejemplo SA de CV')).toBeVisible();

    for (const texto of ['Ingresos / Gastos', 'Utilidad', 'Proveedores', 'IVA / Impuestos', 'Conciliación', 'Motor SAT']) {
      await expect(page.getByText(texto)).toBeVisible();
    }
  });
});
