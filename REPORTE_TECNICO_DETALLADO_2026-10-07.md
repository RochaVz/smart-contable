# REPORTE TECNICO DETALLADO — Rediseño ejecutivo UI/UX (SMARTCONTABLE_MASTER)

**Fecha:** 2026-10-07  
**Proyecto:** SmartContable  
**Alcance:** Frontend (React/Vite). Implementación de `docs/SMARTCONTABLE_MASTER.md`  
**Restricción cumplida:** no se modificó backend, API, servicios, modelos, base de datos, parseadores CFDI, reglas fiscales/contables ni generación de indicadores.

---

## 1. Resumen ejecutivo

Se rediseñó la experiencia de la vista de negocio (`/empresa/:id`) bajo el principio *Dashboard First / Decision First / Executive First*:

- Sidebar de 8 elementos (Operación / Análisis / Configuración).
- Dashboard ejecutivo con 8 KPIs, Score Financiero (0–100), Salud Fiscal y sistema de alertas Info/Warning/Critical.
- Centro de **Inteligencia Financiera** (9 categorías) y catálogo de **Informes** contables y fiscales.
- Sistema de diseño claro por defecto (paleta y gradiente oficiales), con modo oscuro soportado.
- Los paneles existentes (CFDI, pólizas, conciliación, motor fiscal, informes) se **reutilizan sin cambiar su lógica**.

### Discrepancia detectada con el documento maestro

| Documento maestro | Proyecto real | Decisión |
|---|---|---|
| Next.js 15, Prisma, PostgreSQL | Vite + React 19 (JSX), FastAPI, SQLAlchemy, MySQL | Se implementó sobre el stack real; no se migró |
| shadcn/ui, React Hook Form, Zod, TypeScript | No instalados | No se agregaron dependencias; se usaron componentes propios + Tailwind |

---

## 2. Stack tecnológico

### 2.1 Utilizado en estos cambios (frontend)

| Capa | Tecnología | Versión |
|---|---|---|
| UI | React | 19.2.6 |
| Build/Dev | Vite | 8.2.2 |
| Estilos | Tailwind CSS (+ `@tailwindcss/postcss`) | 4.3.0 |
| Enrutamiento | react-router-dom | 7.18.3 |
| Gráficas | Recharts | 3.8.1 |
| Iconos | lucide-react | 1.16.0 |
| HTTP | axios | 1.20.0 |
| Notificaciones | react-hot-toast | 2.6.0 |
| Pruebas | `node --test` (runner nativo, Node 24.9) | — |
| Lint | ESLint 10 + react-hooks / react-refresh | — |

No se agregaron ni actualizaron dependencias (`package.json` solo cambió el script `test`).

### 2.2 Stack del proyecto (sin cambios hoy)

- **Backend:** Python 3.13+, FastAPI, SQLAlchemy, Alembic, MySQL, JWT, Pytest.
- **IA:** OpenAI API, arquitectura de agentes (`app/ai/`).
- **Despliegue:** `render.yaml`, `vercel.json` (frontend).

---

## 3. Arquitectura de la solución

```text
Rutas (App.jsx)
  └─ CompanyDetail (estado, handlers y paneles existentes)
       ├─ useExecutiveSnapshot  ──► useExecutiveData ──► servicios existentes (axios)
       │        └─ utils/financialHealth.js  (score, alertas, recomendaciones)
       └─ CompanyShell (sidebar + topbar)
            ├─ ExecutiveDashboard
            ├─ InteligenciaView   ─┐
            ├─ InformesView        ├─ renderFuente() ► paneles existentes / BalancePanel
            ├─ ConfiguracionView  ─┘
            └─ Módulos (CFDI, Contabilidad, Bancos, SAT)  ► renderSeccion() existente
```

Principio de diseño: las vistas nuevas son **presentacionales**; `CompanyDetail` inyecta `renderFuente(fuente)`, que resuelve cada categoría/informe al panel ya existente (`InformesPanel`, `FiscalConsolidadosPanel`, `ConciliacionBancariaPanel`, `PolizasPanel`).

---

## 4. Navegación y rutas

### 4.1 Sidebar (`navigation/executive.js`)

| Elemento | Ruta |
|---|---|
| Dashboard | `/empresa/:id` |
| CFDI | `/empresa/:id/modulos/documentos` |
| Contabilidad | `/empresa/:id/modulos/polizas` |
| Bancos | `/empresa/:id/modulos/conciliacion` |
| SAT | `/empresa/:id/modulos/fiscal` |
| Inteligencia Financiera | `/empresa/:id/inteligencia[/:categoria]` |
| Informes Fiscales y Contables | `/empresa/:id/informes[/:informe]` |
| Configuración | `/empresa/:id/configuracion` |

- Rutas legacy (`/modulos/*`, `/reportes/*`, `?seccion=&tab=`) siguen funcionando; `/reportes/*` se resalta bajo Inteligencia.
- Responsive: sidebar fijo en `lg+`; drawer con overlay en móvil.

### 4.2 Catálogos

- **Inteligencia (9):** Ingresos, Gastos, Utilidades, Clientes, Proveedores, Bancos, Balance General, Impuestos, Indicadores.
- **Informes contables (7):** Balance General, Estado de Resultados, Flujo de Efectivo*, Balanza de Comprobación, Libro Diario, Libro Mayor, Auxiliares Contables*.
- **Informes fiscales (7):** IVA, ISR, Declaraciones, Calendario Fiscal, Obligaciones Pendientes, Pagos Realizados, Cumplimiento Fiscal.

\* Marcados "Próximamente": no existe servicio backend que los alimente.

---

## 5. Fuentes de datos (solo lectura, endpoints existentes)

| Endpoint | Uso |
|---|---|
| `GET /reportes/paquete-fiscal` (mes actual y anterior) | Ingresos, gastos, utilidad, margen, IVA neto, variaciones |
| `GET /fiscal/resumen-sat` | Impuestos pendientes, sugerencias de pago, declaraciones y vencimientos |
| `GET /fiscal/indicadores` | Score fiscal, nivel de riesgo, cumplimiento, alertas SAT |
| `GET /conciliacion/movimientos` | Saldo bancario y flujo del periodo |
| `GET /reportes/financiero` | Balance General y Balanza (cargos/abonos por familia) |
| `GET /facturas/`, `GET /empresas/:id` | CFDI cargados (concentración clientes/proveedores) |

Decisiones relevantes:
- Se usa `/conciliacion/movimientos` (lectura pura) en lugar de `/conciliacion/resumen`, porque este último **persiste matches** en un GET; el dashboard no debe tener efectos secundarios.
- `Promise.allSettled`: cada fuente falla de forma independiente y se informa al usuario cuáles no respondieron.
- Negocios locales (`local-*`, sin API): el dashboard usa los CFDI locales; los indicadores fiscales/bancarios se muestran como no disponibles.

---

## 6. Capa de inteligencia (`utils/financialHealth.js`)

Funciones puras, sin acceso a red, cubiertas con pruebas unitarias.

### 6.1 Score Financiero (0–100)
Promedio de los componentes con datos disponibles (se excluyen los "sin datos", no cuentan como 0):

| Componente | Cálculo |
|---|---|
| Rentabilidad | `50 + margen × 2.5` (acotado 0–100) |
| Flujo | `ingresos / gastos / 1.2 × 100` |
| Liquidez | `saldo bancario (o flujo) / (gastos + impuestos pendientes) × 100` |
| Crecimiento | `60 + variación ingresos % × 2` |
| Endeudamiento | `100 − (impuestos pendientes / ingresos) × 300` |
| Clientes / Proveedores | `100 − max(0, % del mayor − 30) × 1.5` |
| Riesgo fiscal | `salud.score` del motor fiscal existente |

Niveles: ≥80 Excelente, ≥65 Buena, ≥40 Requiere atención, <40 Crítica. Se derivan fortalezas (≥75), oportunidades (<60) y recomendaciones.

### 6.2 Alertas (Info / Warning / Critical)
Caída de ingresos (≤−10% / ≤−30%), incremento de gastos (≥25% / ≥50%), flujo insuficiente, saldo bancario bajo, concentración de clientes y dependencia de proveedores (≥50% / ≥70%), pagos próximos y declaraciones (≤10 d warning, ≤3 d critical), desvíos SAT.

### 6.3 Limitaciones declaradas
- **Clientes morosos** no se detecta: no hay datos de cobranza en los servicios.
- Las fórmulas del score son heurísticas de presentación definidas en esta entrega (el documento no las especifica); no sustituyen el score fiscal del backend.
- "Saldo bancario" es el último saldo reportado en los movimientos importados; sin saldo, se degrada a flujo neto del periodo.

---

## 7. Sistema de diseño (`index.css`)

- Tokens CSS `--sc-*` (paleta oficial, gradiente `#1D4ED8 → #2563EB → #06B6D4 → #10B981`) con variante `[data-theme='dark']`.
- Clases `.sc-*` (card, nav-item, chip, badge, alert, table, progress, skeleton, field) para evitar colisión con los overrides de tema claro heredados, que remapean utilidades `text-white`, `bg-slate-*`, etc.
- Modo claro por defecto (`index.html` con `data-theme="light"`; `ThemeToggle` ya no sigue `prefers-color-scheme`).
- Estilos `@media print` (oculta sidebar/topbar) para "Exportar PDF".
- Accesibilidad: `aria-current`, `aria-pressed`, `aria-label` en controles icónicos, `role="img"` en el gauge.

---

## 8. Inventario de cambios

### 8.1 Archivos nuevos
| Archivo | Descripción |
|---|---|
| `src/navigation/executive.js` | Sidebar, categorías de inteligencia y catálogo de informes |
| `src/utils/financialHealth.js` | Snapshot, score, alertas, recomendaciones (≈405 líneas) |
| `src/utils/financialHealth.test.mjs` | 10 pruebas unitarias |
| `src/utils/facturas.js` | Helpers de CFDI extraídos de `CompanyDetail` |
| `src/hooks/useExecutiveData.js` | Carga paralela y tolerante a fallos |
| `src/hooks/useExecutiveSnapshot.js` | Une datos + CFDI y produce la lectura ejecutiva |
| `src/components/executive/CompanyShell.jsx` | Layout: sidebar + topbar + drawer móvil |
| `ExecutiveDashboard`, `KpiCard`, `ScoreGauge`, `AlertsList`, `FinancialHealthPanel`, `FiscalHealthPanel` | Dashboard y paneles de salud |
| `InteligenciaView`, `InformesView`, `ConfiguracionView`, `BalancePanel`, `format.js` | Vistas secundarias y utilidades |

### 8.2 Archivos modificados
| Archivo | Cambio |
|---|---|
| `src/pages/CompanyDetail.jsx` | Nuevo `return` con `CompanyShell`; `renderSeccion` parametrizable; `renderFuente`; menú "Más" (exportar/limpiar mes); helpers movidos a `utils/facturas.js`; import faltante de `FileBarChart` (bug previo que rompía informes locales) |
| `src/App.jsx` | 5 rutas nuevas (`vista` prop) |
| `src/components/FiscalConsolidadosPanel.jsx` | Prop opcional `initialTab` (por defecto `'resumen'`, comportamiento previo intacto) |
| `src/navigation/companyHub.js` | Eliminado `HUB_SEARCH_TOPICS` (sin uso) |
| `src/components/ThemeToggle.jsx`, `index.html`, `src/index.css` | Tema claro por defecto y tokens |
| `package.json` | `npm test` incluye la nueva suite |

### 8.3 Archivos eliminados
`components/HubCard.jsx`, `components/ModulePageShell.jsx` (reemplazados por el sidebar; sin referencias restantes).

Estadística de `git diff` sobre archivos rastreados: 10 archivos, +411 / −636 líneas (más ≈1,500 líneas en archivos nuevos).

---

## 9. Verificación

| Verificación | Resultado |
|---|---|
| `npm test` | 15/15 pruebas OK (5 previas + 10 nuevas) |
| `npm run build` | OK (Vite, 2411 módulos) |
| ESLint en archivos nuevos/modificados | Sin errores (los errores preexistentes en `FiscalConsolidadosPanel`, `DiotPanel`, `FiscalAnualPanel`, `CfdiComplementosPanel` no se tocaron) |
| Prueba visual en navegador | Dashboard, Inteligencia, Informes, Balance, Configuración y módulo CFDI revisados en tema claro y oscuro; layout móvil (drawer) y escritorio |

Nota: la verificación visual se hizo contra un servidor mock local (el backend no estaba en ejecución); no se ejecutó contra datos reales de producción ni se corrió `pytest` (backend sin cambios).

---

## 10. Riesgos y pendientes

1. **Validar con datos reales** el score, las alertas y el Balance General: este último presenta solo movimientos de pólizas del periodo y puede mostrar "descuadre" legítimo si no hay saldos iniciales.
2. **Informes sin servicio:** Flujo de Efectivo y Auxiliares Contables requieren endpoints nuevos (fuera del alcance por la restricción de no modificar backend).
3. **Costo de red:** el dashboard hace 5 llamadas paralelas por carga/cambio de periodo; considerar un endpoint agregado en el futuro.
4. **Bundle:** `index` pesa ≈800 kB (215 kB gzip); evaluar `React.lazy` para vistas y paneles pesados.
5. **Tests de UI:** la cobertura es de lógica pura; faltan pruebas de componentes/E2E (p. ej. Playwright).
6. **Exportar PDF** usa impresión del navegador; un PDF generado en servidor daría mayor fidelidad.
7. **Deuda previa de lint** (React Compiler) en paneles fiscales, no relacionada con estos cambios.

---

## 11. Roadmap sugerido

- Endpoints de Flujo de Efectivo, Auxiliares y KPIs agregados para el dashboard.
- Pruebas de componentes y E2E del flujo Dashboard → Inteligencia → Informe.
- Carga diferida de vistas y control de bundle.
- Persistencia de preferencias (tema, periodo) por usuario.
