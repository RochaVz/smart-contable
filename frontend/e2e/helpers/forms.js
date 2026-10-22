import { expect } from '@playwright/test';

/**
 * Llena uno o varios campos controlados por React y verifica que los valores
 * se mantengan.
 *
 * Motivo: la vista de Login se carga con `lazy()` dentro de `<Suspense>` y en
 * desarrollo React monta el componente dos veces (StrictMode). Si el `fill`
 * ocurre durante ese remount, el estado se reinicia y el campo queda vacío,
 * provoke que el `submit` sea bloqueado por la validación nativa de `required`.
 * Por eso se rellena, se verifica y, si algo se perdió, se reintenta.
 *
 * @param {Array<[import('@playwright/test').Locator, string]>} campos
 * @param {number} intentos
 */
export const completarFormulario = async (campos, intentos = 3) => {
  for (let intento = 0; intento < intentos; intento += 1) {
    for (const [campo, valor] of campos) {
      await campo.fill(valor);
    }

    try {
      for (const [campo, valor] of campos) {
        await expect(campo).toHaveValue(valor, { timeout: 1500 });
      }
      return;
    } catch (error) {
      if (intento === intentos - 1) throw error;
    }
  }
};
