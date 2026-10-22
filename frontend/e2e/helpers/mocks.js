/**
 * Mock API para Playwright E2E.
 *
 * Las pruebas E2E no deben depender del backend ni de MySQL. Este modulo
 * registra una ruta comodin (todas las URLs bajo /api/v1) mediante
 * `page.route` y responde con JSON simulado para todos los endpoints que
 * consume el frontend. Cualquier ruta sin definicion usa un valor por
 * defecto permisivo (GET devuelve un objeto con "data"; el resto devuelve
 * un objeto vacio) para que las vistas no fallen y las protecciones de
 * error se puedan validar de forma aislada.
 */

export const EMPRESA = {
  id: 'c1',
  rfc: 'ABC010203AB1',
  razon_social: 'Ejemplo SA de CV',
  correo: 'contacto@ejemplo.mx',
  regimen_fiscal: '601',
  tipo_persona: 'moral',
  codigo_postal: '64000',
};

export const EMPRESA_NUEVA = {
  ...EMPRESA,
  id: 'c2',
  razon_social: 'Nueva Empresa de Distribucion',
  rfc: 'XYZ990203XYZ1',
};

/** Mapa clave -> { status, body }. La clave es "METODO /ruta". */
const RUTAS_BASE = new Map([
  // -- Auth --------------------------------------------------------------
  ['POST /auth/login', { status: 200, body: { access_token: 'e2e-token', token_type: 'bearer', expires_in: 3600 } }],
  ['POST /auth/registro', { status: 409, body: { error: { message: 'Ya existe una cuenta con ese correo.' } } }],
  ['POST /auth/recuperar-contrasena', { status: 503, body: { error: { message: 'La recuperación local aún no está configurada.' } } }],

  // -- Dashboard / Empresas ----------------------------------------------
  ['GET /empresas', { status: 200, body: [EMPRESA] }],
  ['POST /empresas', { status: 201, body: EMPRESA_NUEVA }],
  ['DELETE /empresas/{id}', { status: 204, body: {} }],

  // -- Datos del negocio (slices) ---------------------------------------
  ['GET /facturas', { status: 200, body: { data: [] } }],
  ['GET /polizas', { status: 200, body: { data: [] } }],
  ['GET /configuracion/mapeos/{id}', { status: 200, body: { data: [] } }],
  ['GET /conciliacion/movimientos', { status: 200, body: { data: [] } }],

  // -- Panel ejecutivo (usado en /inteligencia e /informes) --------------
  ['GET /reportes/paquete-fiscal', { status: 200, body: { data: null } }],
  ['GET /fiscal/resumen-sat', { status: 200, body: { data: null } }],
  ['GET /fiscal/indicadores', { status: 200, body: { data: null } }],

  // -- Complementos CFDI -------------------------------------------------
  ['GET /cfdi-complementos/pagos', { status: 200, body: { data: { items: [] } } }],
  ['GET /cfdi-complementos/nominas', { status: 200, body: { data: { items: [] } } }],
  ['GET /cfdi-complementos/retenciones-terceros', { status: 200, body: { data: { items: [] } } }],

  // -- Configuracion / mapeos / bancos -----------------------------------
  ['POST /configuracion/mapeos', { status: 201, body: {} }],
  ['GET /configuracion/comisiones-banco', { status: 200, body: { data: [] } }],
  ['GET /configuracion/comisiones-banco/{id}', { status: 200, body: { data: [] } }],
  ['POST /configuracion/comisiones-banco', { status: 201, body: {} }],
  ['PUT /configuracion/comisiones-banco/{id}', { status: 200, body: { data: [] } }],
  ['DELETE /configuracion/comisiones-banco/{id}', { status: 200, body: {} }],

  // -- Conciliacion / panel financiero -----------------------------------
  ['GET /conciliacion/bancos-catalogo', { status: 200, body: { data: [] } }],
  ['GET /conciliacion/resumen', { status: 200, body: { data: {} } }],
  ['POST /conciliacion/auto-conciliar', { status: 200, body: { ok: true } }],
  ['POST /conciliacion/estado-cuenta', { status: 201, body: { ok: true } }],
  ['POST /conciliacion/convertir-pdf-csv', { status: 200, body: { ok: true } }],

  // -- Reportes genericos ------------------------------------------------
  ['GET /reportes/tendencias', { status: 200, body: { data: { tendencias: [] } } }],
]);

const CLAVE = (metodo, ruta) => `${metodo} ${ruta}`;

/** Prefijo de la API en el backend; las claves del mapa no lo incluyen. */
const PREFIJO_API = '/api/v1';

/**
 * Registra las rutas base en `page` eliminando antes las anteriores (el
 * orden de registro importa en Playwright, por lo que limpiamos primero).
 *
 * Devuelve un control para ajustar el comportamiento en un test concreto,
 * por ejemplo forzar un 401 en el login:
 *
 *   const api = await instalarMockApi(page);
 *   api.setRuta('POST /auth/login', { status: 401, body: {} });
 */
export async function instalarMockApi(page) {
  await page.unroute(/\/api\/v1\/.*/);

  const mapa = new Map(RUTAS_BASE);

  await page.route(/\/api\/v1\/.*/, async (route) => {
    const url = new URL(route.request().url());
    const metodo = route.request().method().toUpperCase();
    // Se quita el prefijo de la API para comparar contra las claves del mapa.
    const ruta = url.pathname.startsWith(PREFIJO_API)
      ? url.pathname.slice(PREFIJO_API.length)
      : url.pathname;
    const rutaNormalizada = ruta.replace(/\/+$/, '') || '/';
    const clave = CLAVE(metodo, rutaNormalizada);

    let resp = mapa.get(clave);

    if (!resp) {
      // Ruta sin definicion: valor por defecto permisivo que no provoca
      // crashes si las vistas usan "data" con null o [] como default.
      resp = metodo === 'GET'
        ? { status: 200, body: { data: [] } }
        : { status: 200, body: {} };
    }

    // El mapeo devuelve { status, body }; el cuerpo real a enviar es body solo.
    const cuerpo = resp?.body;
    route.fulfill({
      status: resp?.status ?? 200,
      contentType: 'application/json',
      body: JSON.stringify(cuerpo),
    });
  });

  return {
    setRuta: (clave, respuesta) => mapa.set(clave, respuesta),
    eliminarRuta: (clave) => mapa.delete(clave),
    rutas: mapa,
  };
}
