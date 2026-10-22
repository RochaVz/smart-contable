import { test, expect } from './fixtures.js';
import { completarFormulario } from './helpers/forms.js';

const CREDENCIALES = {
  email: 'contador@ejemplo.mx',
  password: 'Contraseña1!',
};

/** Completa el formulario de acceso (correo + contraseña). */
const completarLogin = async (page, credenciales = CREDENCIALES) => {
  await completarFormulario([
    [page.locator('input[type="email"]'), credenciales.email],
    [page.locator('input[type="password"]'), credenciales.password],
  ]);
};

test.describe('Autenticación', () => {
  test('las rutas protegidas redirigen al inicio de sesión', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/empresa/c1');
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/empresa/c1/inteligencia');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('muestra el formulario de acceso', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
  });

  test('exige correo y contraseña antes de enviar', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page).toHaveURL(/\/login$/);
    const correoInvalido = await page
      .locator('input[type="email"]')
      .evaluate((elemento) => elemento.validity.valueMissing);
    expect(correoInvalido).toBe(true);
  });

  test('muestra error cuando las credenciales son inválidas', async ({ page, mockApi }) => {
    mockApi.setRuta('POST /auth/login', { status: 401, body: {} });

    await page.goto('/login');
    await completarLogin(page);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(
      page.getByText('Usuario, contraseña o clave de recuperación inválidos.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('inicia sesión y muestra las empresas del usuario', async ({ page }) => {
    await page.goto('/login');
    await completarLogin(page);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Tus empresas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ejemplo SA de CV' })).toBeVisible();
    await expect(page.getByText('ABC010203AB1')).toBeVisible();
  });

  test('cierra sesión y vuelve al inicio de sesión', async ({ page }) => {
    await page.goto('/login');
    await completarLogin(page);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('button', { name: 'Salir' }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
  });

  test('informa que la recuperación local no está configurada', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Recuperar contraseña' }).click();
    await expect(page.getByRole('heading', { name: 'Recuperar acceso' })).toBeVisible();

    await completarFormulario([
      [page.locator('input[type="email"]'), CREDENCIALES.email],
      [page.locator('input[type="password"]').first(), 'clave-local'],
      [page.locator('input[type="password"]').nth(1), 'NuevaClave1!'],
    ]);

    await page.getByRole('button', { name: 'Actualizar contraseña' }).click();

    await expect(
      page.getByText('La recuperación local aún no está configurada.'),
    ).toBeVisible();
  });

  test('no permite crear una cuenta con un correo duplicado', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.getByRole('heading', { name: 'Crear cuenta' })).toBeVisible();

    await completarFormulario([
      [page.locator('input[type="text"]').first(), 'Ana Contadora'],
      [page.locator('input[type="email"]'), CREDENCIALES.email],
      [page.locator('input[type="password"]'), CREDENCIALES.password],
    ]);

    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByText('Ya existe una cuenta con ese correo.')).toBeVisible();
  });
});
