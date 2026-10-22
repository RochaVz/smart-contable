# Reporte de Suite E2E (Playwright) — Frontend SmartContable

**Fecha:** 21 de octubre de 2026
**Alcance:** `frontend/` (React + Vite), sin backend ni MySQL
**Estado final:** 🟢 **45/45 pruebas pasan** (2 ejecuciones consecutivas en verde)

---

## 1. Resumen ejecutivo

Se configuró y estabilizó una suite E2E con Playwright para el frontend de SmartContable.
La suite **no depende del backend ni de MySQL**: todas las llamadas a `/api/v1` se interceptan
con `page.route` y se responden con datos simulados.

| Métrica | Valor |
|---|---|
| Pruebas únicas escritas | 25 |
| Ejecuciones totales (2 proyectos) | 45 |
| Proyectos | `chromium` (Desktop Chrome) + `mobile-chromium` (Pixel 5) |
| Specs | 6 (`auth`, `dashboard`, `intelligence`, `informes`, `navigation.desktop`, `menu-movil`) |
| Duración de la suite | ~39 s (paralela, local) |
| Estado | 45 passed / 0 failed / 0 flaky (verificado en 2 corridas seguidas) |
| Backend requerido | Ninguno |
| MySQL requerido | No |

### Evolución durante la estabilización

| Corrida | Resultado | Causa dominante |
|---|---|---|
| Inicial | 15 passed / 28 failed | Mock con clave de ruta mal formada + locators ambiguos |
| Corrida 2 | 27 passed / 18 failed | Cuerpo del mock serializado con envoltorio `{status, body}` |
| Corrida 3 | 36 passed / 11 failed | Etiquetas de UI inexistentes / con mayúsculas por CSS |
| Corrida 4 | 44 passed / 2 failed | Helper `SIDEBAR()` fuera de scope + enlace fuera del `<nav>` |
| Corrida 5 | 44 passed / 1 failed | Flake de React (StrictMode + `lazy()`) sobre inputs controlados |
| Corrida 6-7 | 45 passed / 0 failed | — (verificación de estabilidad) |
| Corrida 8 | 44 passed / 1 failed + 1 skipped | Flake del service worker (`ERR_ABORTED`) y test móvil que nunca se ejecutaba |
| **Corrida 9-10 (final)** | **45 passed / 0 failed / 0 skipped** | — |

---

## 2. Arquitectura de la suite

```
frontend/
├── playwright.config.js        # Vite como webServer, 2 proyectos, report HTML + trazas
└── e2e/
    ├── fixtures.js             # Fixture `mockApi` (auto) + helper `autenticar`
    ├── helpers/
    │   ├── mocks.js            # Mapa de rutas simuladas + normalización de URL
    │   └── forms.js            # Helper de formularios con verificación y reintento
    ├── auth.spec.js            # 8 pruebas
    ├── dashboard.spec.js       # 5 pruebas
    ├── intelligence.spec.js    # 4 pruebas
    ├── informes.spec.js        # 3 pruebas
    ├── navigation.desktop.spec.js # 4 pruebas (solo desktop)
    └── menu-movil.spec.js      # 1 prueba (solo móvil)
```

**Aislamiento:** Playwright crea un `BrowserContext` nuevo por prueba, por lo que `localStorage`
(token) e `IndexedDB` (respaldo local) quedan limpios sin limpieza manual.

**Comandos disponibles** (`frontend/package.json`):

```bash
npm run test:e2e            # suite completa
npm run test:e2e:watch      # modo watch
npm run test:e2e:ui         # depurador visual
npm run test:e2e:report     # abrir el reporte HTML
npx playwright test --project=chromium        # solo desktop
npx playwright test --project=mobile-chromium # solo móvil
```

---

## 3. Resultados por spec

| Spec | Únicas | Ejecuciones | Cobertura funcional |
|---|---|---|---|
| `auth.spec.js` | 8 | 16 | Redirección de rutas protegidas, render del formulario, validación `required`, error 401, login exitoso, cierre de sesión, recuperación no configurada (503), registro duplicado (409) |
| `dashboard.spec.js` | 5 | 10 | Listado de empresas, filtro por nombre/RFC, alta de negocio, aviso de RFC duplicado (409), navegación al detalle |
| `intelligence.spec.js` | 4 | 8 | Render de las 10 categorías, detalle de categoría, navegación a subcategoría, redirección a módulo CFDI |
| `informes.spec.js` | 3 | 6 | Catálogo completo de informes, marca "Próximamente", detalle + KPIs + export |
| `navigation.desktop.spec.js` | 4 | 4 | Sidebar y `aria-current`, navegación entre módulos, retorno a "Mis empresas", reportes rápidos de la tarjeta |
| `menu-movil.spec.js` | 1 | 1 | Apertura del drawer lateral y navegación a Inteligencia en Pixel 5 |

### Cobertura por proyecto

| Proyecto | Pruebas | Resultado |
|---|---|---|
| `chromium` (Desktop Chrome) | 24 | ✅ 24/24 |
| `mobile-chromium` (Pixel 5) | 21 | ✅ 21/21 |


---

## 4. Diagnóstico de fallos: 5 causas raíz y sus correcciones

### 4.1 La clave del mock incluía el prefijo `/api/v1` (crítico)

**Síntoma:** todas las vistas quedaban en estado de carga; el dashboard mostraba
*"Aún no tienes negocios registrados"* con contador `0`.

**Causa:** la clave se construía con `url.pathname` completo (`/api/v1/empresas/`), mientras que
el mapa de rutas está definido sin prefijo (`GET /empresas`). La coincidencia nunca ocurría y
**todas** las peticiones caían al valor por defecto.

**Corrección** (`e2e/helpers/mocks.js`):

```js
const PREFIJO_API = '/api/v1';
const ruta = url.pathname.startsWith(PREFIJO_API)
  ? url.pathname.slice(PREFIJO_API.length)
  : url.pathname;
const rutaNormalizada = ruta.replace(/\/+$/, '') || '/';
const clave = CLAVE(metodo, rutaNormalizada);
```

### 4.2 El cuerpo de la respuesta iba envuelto en `{status, body}` (crítico)

**Síntoma:** el backend "respondía" 200 pero el frontend recibía
`{"status":200,"body":[...]}`. `remoteCompanies.map(...)` fallaba y la lista quedaba vacía.

**Causa:** `route.fulfill` serializaba el objeto completo del mapa en lugar de su propiedad `body`.

**Corrección:**

```js
const cuerpo = resp?.body;
route.fulfill({
  status: resp?.status ?? 200,
  contentType: 'application/json',
  body: JSON.stringify(cuerpo),
});
```

El valor por defecto también se corrigió a la misma estructura (`{ status: 200, body: { data: [] } }`);
antes devolvía `{data:{}}`, que provocaba un `TypeError` en `.map()` dentro del Dashboard.

### 4.3 Locators ambiguos → *strict mode violation*

**Síntoma:** `getByText('Declaraciones')` resolvía a 4 elementos (uno era el subtítulo
*"Historial de declaraciones"*).

**Corrección:** coincidencia exacta (`{ exact: true }`), regex anclados (`/^Impuestos$/`) y
`.first()` únicamente donde el duplicado es legítimo (badge "Próximamente", KPIs repetidos).

### 4.4 Selectores acoplados a etiquetas que el CSS transforma

**Síntoma:** `getByText('Ingresos')` no encontraba nada aunque el KPI fuera visible.

**Causa:** `.sc-label` aplica `text-transform: uppercase`; el texto del DOM es `Ingresos` pero el
renderizado es `INGRESOS`.

**Corrección:** validar valores y comparativos (`$0`, `/vs mes anterior/`) en lugar del label.

### 4.5 Etiquetas inexistentes y errores de scope

| Problema | Detalle | Corrección |
|---|---|---|
| Catálogo incorrecto | `'Padrón de proveedores'` y `'Pago de impuestos'` **no existen** en `INFORMES` (`navigation/executive.js`); los reales son `IVA`, `ISR`, `Declaraciones`, `Cumplimiento Fiscal`, `Balanza de Comprobación`, `Libro Diario` | Se usaron las etiquetas reales del catálogo |
| `ReferenceError: page is not defined` | `const SIDEBAR = () => page.getByRole(...)` definido a nivel de módulo | `const SIDEBAR = (page) => ...` |
| Enlace fuera del `<nav>` | *"Mis empresas"* es hermano del `<nav>` dentro del `<aside>` | `page.getByRole('link', { name: 'Mis empresas' })` sin scope al nav |

---

## 5. Flake corregido: React `StrictMode` + `lazy()`

**Síntoma:** intermitente (~1 de cada 4 corridas). El campo de correo quedaba **vacío** en el
snapshot de error y el mensaje "credenciales inválidas" nunca aparecía.

**Causa:** `App.jsx` carga el login con `lazy()` dentro de `<Suspense>` y `main.jsx` usa
`<StrictMode>`. En desarrollo React monta el componente dos veces; si el `fill()` ocurre durante
ese remount, el estado controlado se reinicia y React restaura el valor vacío del input.
La validación nativa de `required` bloqueaba el `submit`, así que **nunca se hacía la petición**
y no se mostraba ningún error.

**Corrección** (`e2e/helpers/forms.js`): llenar → verificar → reintentar.

```js
export const completarFormulario = async (campos, intentos = 3) => {
  for (let intento = 0; intento < intentos; intento += 1) {
    for (const [campo, valor] of campos) await campo.fill(valor);
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
```

---

## 5 bis. Segundo flake corregido: service worker (`net::ERR_ABORTED`)

**Síntoma:** `page.goto: net::ERR_ABORTED at http://localhost:5173/empresa/c1`, intermitente y
sólo en el proyecto móvil.

**Causa:** `main.jsx` registra un service worker (`/sw.js`) y su manejador `controllerchange`
ejecuta `window.location.reload()`. Cuando el SW toma control durante la carga, la navegación
original se cancela y Playwright reporta `ERR_ABORTED`.

**Corrección** (`playwright.config.js`):

```js
use: {
  // El service worker de la app puede recargar la pagina durante la carga y
  // abortar la navegacion (net::ERR_ABORTED). En E2E se desactiva.
  serviceWorkers: 'block',
}
```

---

## 5 ter. Cobertura móvil que **nunca se ejecutaba** (falso positivo)

**Síntoma:** la prueba `menu-movil.spec.js` reportaba "passed" siempre, pero no ejercitaba nada.

**Causa:** dos defectos combinados:
1. No llamaba a `autenticar(page)`, por lo que la app redirigía a `/login` y `CompanyShell`
   nunca se montaba (no existía el botón "Abrir menú").
2. La guarda `if (!(await abrir.isVisible())) { console.log(...); return; }` convertía el
   caso no ejecutable en un **éxito silencioso**.

**Corrección:** se autenticó la prueba y se sustituyó la guarda por `test.skip(...)`
(que reporta *skipped* en vez de *passed*). Además, la prueba ahora valida el flujo real:
abrir el drawer → ver el `<nav>` → navegar a *Inteligencia Financiera* → comprobar la URL y el
encabezado.

| | Antes | Ahora |
|---|---|---|
| Prueba | "abre y selecciona una categoría desde el drawer" | "abre el drawer lateral y navega a Inteligencia" |
| Resultado | `passed` (sin ejecutar nada) | `passed` (con verificación real) |

---

## 6. Hallazgos sobre el producto (detectados por la suite)

Estos no son fallos de las pruebas: son **comportamientos reales** que la suite dejó visibles.

1. **Las categorías "Ingresos" y "Gastos" de Inteligencia no abren un detalle.**
   En `CompanyDetail.jsx`, `onSelect` redirige a `/empresa/:id/modulos/documentos?movimiento=egresos|ingresos`.
   El usuario hace clic en un chip de "Inteligencia" y aterriza en el módulo CFDI, sin contexto
   de la sección de inteligencia. **Riesgo de UX: pérdida de contexto y de expectativa.**

2. **El catálogo de informes difiere del hub de empresa.**
   `COMPANY_HUB_ITEMS` ofrece *"Padrón de proveedores"*, pero `INFORMES` no lo incluye;
   el usuario llega a un destino sin equivalente en el módulo de informes. Falta una **fuente
   única de verdad**.

3. **Los KPI de informes muestran `$0` sin estado vacío explícito.**
   Con el snapshot del motor SAT en `null`, las tarjetas muestran `$0` en lugar de un mensaje
   *"requiere negocio sincronizado"* (que sí existe en otros paneles, p. ej. `BalancePanel`).
   Cero es un dato falso; debería ser un estado distinguible.

4. **El mensaje de error 401 depende del cuerpo de la respuesta.**
   `Login.jsx` solo muestra *"Usuario, contraseña o clave de recuperación inválidos."* cuando el
   backend **no** envía `error.message`. Si el backend lo envía, el texto cambia y el test
   se rompe. Contrato frágil entre front y back.

5. **Los KPI son accesibles por texto visible pero no por rol.**
   `.sc-label` es un `<span>` sin rol; un lector de pantalla anuncia el texto, pero las
   aserciones por rol no funcionan. Faltan `aria-label` o `<dt>/<dd>` semánticos.

---

## 7. Mejoras a implementar

### P0 — Robustez de la suite (alto impacto, bajo esfuerzo)

| # | Mejora | Detalle |
|---|---|---|
| 1 | **Mock estricto: fallar ante rutas no cubiertas** | Hoy una ruta no mockeada devuelve `{data: []}` y el fallo se manifiesta 3 vistas después. Lanzar un error en la ruta revela de inmediato el endpoint nuevo sin cobertura |
| 2 | **`data-testid` estables en elementos críticos** | Desacopla los tests de los textos de UI y del `text-transform: uppercase`. Ya se detecta en `KpiCard`, `.sc-label` y en los botones de categoría |
| 3 | **`expect` con timeout y `expect.poll`** | `expect: { timeout: 5_000 }` global y `poll` para datos que llegan por fetch |
| 4 | **Eliminar `console.log` de diagnóstico** | ✅ Hecho: `menu-movil.spec.js` ahora usa `test.skip(...)` para reportar la prueba como *skipped* en lugar de un `console.log` |
| 5 | **Pipeline CI** | Workflow con `npm ci`, `npx playwright install --with-deps chromium`, `CI=1 npm run test:e2e` y subida del reporte HTML como artefacto |
| 6 | **Estrategia anti-flake** | `retries: 1` en suites sensibles + `test.describe.configure({ mode: 'parallel' })`; el helper `completarFormulario` ya cubre el caso conocido |

### P1 — Ampliar cobertura funcional

| # | Mejora | Detalle |
|---|---|---|
| 7 | **Módulos operativos** | CFDI (listado, filtros, detalle), Contabilidad (pólizas), Bancos (conciliación), SAT (motor fiscal) y Configuración (mapeos) |
| 8 | **Carga de XML** | Subir CFDI vía `setInputFiles` con un XML de prueba y validar la clasificación automática |
| 9 | **Exportaciones** | Validar descarga de CSV/PDF (interceptando la descarga) |
| 10 | **Multiempresa** | Dos empresas en el mismo contexto, cambio de negocio y verificación de aislamiento de datos (requisito del AGENTS.md) |
| 11 | **Casos de error de red** | `route.abort()` para timeout, `500`, `503` y modo offline; validar los estados vacíos y los reintentos |
| 12 | **Accesibilidad** | Auditoría con `@axe-core/playwright` sobre login, dashboard e informes |
| 13 | **Contrato mock ↔ backend** | Test opcional contra un backend real (staging) que valide que las rutas del mock existen en FastAPI |

    } catch (error) {
      if (intento === intentos - 1) throw error;
    }
  }
};

### P2 — Mejoras del producto detectadas por las pruebas

| # | Mejora | Detalle |
|---|---|---|
| 14 | **Categoría Ingresos/Gastos en Inteligencia** | Decidir entre vista de detalle propia o mantener el redirect mostrando contexto (título y retorno) |
| 15 | **Catálogo único de informes** | Derivar `INFORMES` y `COMPANY_HUB_ITEMS` de la misma fuente para que no se desincronicen |
| 16 | **Estado vacío en KPI** | Mostrar *"Sin datos: sincroniza el motor SAT"* en lugar de `$0` cuando el snapshot es `null` |
| 17 | **Semántica de KPI** | Convertir `KpiCard` en `<dl>/<dt>/<dd>` o añadir `aria-label` para mejorar aserciones y accesibilidad |
| 18 | **Contrato de error 401** | Estandarizar `error.message` en el backend o documentar la precedencia en el frontend |
| 19 | **Carga diferida de la vista de login** | Evaluar `import()` estático para evitar el doble montaje en StrictMode y eliminar la clase de flake detectada |

---

## 8. Plan de trabajo sugerido

| Sprint | Objetivo | Entregable |
|---|---|---|
| **S1** | Blindar la suite actual | Items P0 (1–4): mock estricto, `data-testid`, `expect` global, limpieza de `console.log` |
| **S2** | Cubrir los módulos operativos | Items P1 (7–9): CFDI, pólizas, conciliación, SAT, exportación |
| **S3** | Integración continua | Item P0 (5) + seguimiento de flakes en CI con reintentos y reporte |
| **S4** | Multiempresa y resiliencia | Items P1 (10–12): multiempresa, errores de red, axe |
| **S5** | Cierre de brechas de producto | Items P2 (14–19) sobre los hallazgos de la sección 6 |

---

## 9. Limitaciones y riesgos actuales

1. **Los datos simulados son mínimos.** El snapshot ejecutivo es `null`, por lo que los paneles
   se validan en su estado vacío, no con cifras reales. *Mitigación:* construir fixtures
   realistas de `paquete-fiscal`, `resumen-sat` e `indicadores`.
2. **El mock cubre ~20 endpoints** de los que consume la app; el resto cae en el valor por
   defecto, lo que puede enmascarar errores reales (motivo del item P0-1).
3. **El servidor de desarrollo de Vite** es el `webServer` de Playwright; en CI se recomienda
   `vite preview` sobre el build de producción para validar el bundle real.
4. **El reporte HTML y `test-results/` están en `.gitignore`** (verificado), junto con
   `frontend/.playwright/`, `frontend/blob-report/` y `frontend/playwright/.cache/`.
5. **Los tiempos de espera son implícitos.** No hay `data-testid` ni estados de carga
   discriminables; las pruebas dependen de los textos y de la red local.

---

## 10. Estado de los archivos

Todos los archivos están **guardados en disco** y verificados:

| Archivo | Estado |
|---|---|
| `frontend/playwright.config.js` | ✅ guardado (2 proyectos, `serviceWorkers: 'block'`, reporte HTML, trazas) |
| `frontend/e2e/fixtures.js` | ✅ guardado |
| `frontend/e2e/helpers/mocks.js` | ✅ guardado (normalización de prefijo + body correcto) |
| `frontend/e2e/helpers/forms.js` | ✅ guardado (nuevo, anti-flake de StrictMode) |
| `frontend/e2e/auth.spec.js` | ✅ guardado (usa `completarFormulario`) |
| `frontend/e2e/dashboard.spec.js` | ✅ guardado |
| `frontend/e2e/intelligence.spec.js` | ✅ guardado (4 pruebas) |
| `frontend/e2e/informes.spec.js` | ✅ guardado (3 pruebas) |
| `frontend/e2e/navigation.desktop.spec.js` | ✅ guardado (`SIDEBAR(page)`) |
| `frontend/e2e/menu-movil.spec.js` | ✅ guardado (autenticado + `test.skip` real en lugar de `console.log`) |
| `frontend/package.json` | ✅ scripts `test:e2e*` agregados |
| `.gitignore` | ✅ artefactos excluidos |
| `frontend/e2e/_debug.spec.js` | 🗑️ eliminado (archivo temporal de diagnóstico) |
| `docs/REPORTE_E2E_PLAYWRIGHT.md` | ✅ reporte final (este documento) |
