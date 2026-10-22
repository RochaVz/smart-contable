import { test, expect, autenticar } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await autenticar(page);
});

test.describe('Menú móvil', () => {
  test('abre el drawer lateral y navega a Inteligencia', async ({ page }) => {
    await page.goto('/empresa/c1');

    // El botón "Abrir menú" solo existe por debajo del breakpoint `lg`.
    const abrir = page.getByRole('button', { name: 'Abrir menú' });
    await expect(abrir).toBeVisible();
    await abrir.click();

    // El drawer renderiza su propio <nav>; en escritorio queda oculto.
    const drawer = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(drawer).toBeVisible();

    await drawer.getByRole('link', { name: 'Inteligencia Financiera' }).click();
    await expect(page).toHaveURL(/\/inteligencia$/);
    await expect(page.getByRole('heading', { name: 'Inteligencia Financiera' })).toBeVisible();
  });
});

