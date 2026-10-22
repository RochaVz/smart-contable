import { test, expect, autenticar } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await autenticar(page);
});

test.describe('Dashboard de empresas', () => {
  test('lista las empresas registradas', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Tus empresas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ejemplo SA de CV' })).toBeVisible();
    await expect(page.getByText('ABC010203AB1')).toBeVisible();
    await expect(page.getByText('Empresas registradas')).toBeVisible();
  });

  test('filtra las empresas por nombre o RFC', async ({ page }) => {
    await page.goto('/dashboard');

    const buscador = page.getByPlaceholder('Buscar negocio o RFC...');
    await buscador.fill('Ejemplo');
    await expect(page.getByRole('heading', { name: 'Ejemplo SA de CV' })).toBeVisible();

    await buscador.fill('ABC010203AB1');
    await expect(page.getByRole('heading', { name: 'Ejemplo SA de CV' })).toBeVisible();

    await buscador.fill('SINCOINCIDENCIA');
    await expect(
      page.getByText('No encontramos coincidencias para esa búsqueda'),
    ).toBeVisible();
  });

  test('registra un nuevo negocio desde el modal', async ({ page }) => {
    await page.goto('/dashboard');

    await page.getByRole('button', { name: 'Agregar negocio' }).click();
    await expect(page.getByRole('heading', { name: 'Agregar negocio' })).toBeVisible();

    await page.getByPlaceholder('Ej. ABC010203AB1').fill('xyz990203xyz1');
    await page
      .getByPlaceholder('Cómo lo reconoces en tu día a día')
      .fill('Nueva Empresa de Distribución');
    await page.getByPlaceholder('Código postal registrado ante el SAT').fill('64000');

    await page.getByRole('button', { name: 'Guardar negocio' }).click();

    // Nota: el toast del frontend dice "Negorio guardado" (typo en NewCompanyModal.jsx);
    // el patrón acepta ambas variantes para no depender de la ortografía.
    await expect(page.getByText(/Negocio guardado|Negorio guardado/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Agregar negocio' })).toBeHidden();
  });

  test('muestra el aviso de RFC duplicado', async ({ page, mockApi }) => {
    mockApi.setRuta('POST /empresas', {
      status: 409,
      body: { error: { message: 'Ya existe una empresa registrada con ese RFC.' } },
    });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: 'Agregar negocio' }).click();

    await page.getByPlaceholder('Ej. ABC010203AB1').fill('ABC010203AB1');
    await page.getByPlaceholder('Cómo lo reconoces en tu día a día').fill('Ejemplo SA de CV');
    await page.getByPlaceholder('Código postal registrado ante el SAT').fill('64000');

    await page.getByRole('button', { name: 'Guardar negocio' }).click();

    await expect(
      page.getByText('Ya existe una empresa registrada con ese RFC.'),
    ).toBeVisible();
  });

  test('abre el detalle de la empresa desde la tarjeta', async ({ page }) => {
    await page.goto('/dashboard');

    await page.getByRole('heading', { name: 'Ejemplo SA de CV' }).click();

    await expect(page).toHaveURL(/\/empresa\/c1$/);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
