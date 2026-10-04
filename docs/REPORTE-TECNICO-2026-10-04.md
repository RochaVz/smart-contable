# Reporte técnico detallado — SmartContable

**Fecha:** 4 de octubre de 2026  
**Proyecto:** RochaVz/smart-contable  
**Ruta del repo:** `c:\Users\eduardo\proyecto-contabilidad`  

**Alcance del día**

1. Conciliación bancaria automática y manual (persistencia + trazabilidad).
2. Motor fiscal SAT informativo (ISR, IVA, retenciones, declaraciones y sugerencias).
3. Rediseño de navegación de módulos y reportes (hub → páginas dedicadas).
4. Migración Alembic aplicada en MySQL.

---

## 1. Resumen ejecutivo

| Frente | Problema previo | Solución entregada |
|--------|-----------------|--------------------|
| **Conciliación bancaria** | Matching en memoria; movimientos sin póliza sin asignación; sin trazabilidad auto/manual | Persistencia del vínculo movimiento↔póliza; auto-asignación por reglas; edición manual con modo |
| **Motor fiscal SAT** | Sin vista unificada de obligaciones/pagos informativos | Endpoint + UI «Resumen SAT» (ISR/IVA/retenciones, calendario, sugerencias) con disclaimer |
| **Navegación UI** | Módulos/reportes en la misma pantalla (botones + contenido embebido) | Hub inicial con botones flotantes y **páginas dedicadas por ruta** |

### Validación

| Prueba | Resultado |
|--------|-----------|
| Pytest (conciliación + fiscal + relacionados) | **25 passed** |
| Build frontend Vite | **OK** |
| Alembic `upgrade head` | **OK** → `e1f2a3b4c5d6 (head)` |

### Estado Git (al cierre del día)

- Cambios en working tree (sin commit obligatorio en este reporte).
- Volumen aproximado: ~1 104 inserciones / ~383 eliminaciones en 13 archivos modificados + 7 archivos nuevos.

---

## 2. Contexto y arquitectura

### 2.1 Stack

- **Backend:** Python 3.13+, FastAPI, SQLAlchemy, Alembic, MySQL, JWT  
- **Frontend:** React + Vite + Tailwind  
- **Capas:** API → Services → ORM/DB (sin lógica de negocio en endpoints)

### 2.2 Principios respetados

- Multiempresa: filtros por `empresa_id` y validación de pertenencia.
- Endpoints delgados.
- CFDI/SAT: resumen fiscal **informativo**, no oficial.
- UI: módulos/reportes en rutas propias (no modales de módulo).

---

## 3. Bloque A — Conciliación bancaria automática y manual

### 3.1 Problema de origen

- El estado de cuenta ya se parseaba y los movimientos con póliza «match» se conciliaban en memoria.
- **No se persistía** el vínculo a póliza.
- Movimientos **sin póliza** no se convertían automáticamente en asientos.
- No existía distinción **automático vs manual**.

### 3.2 Modelo de datos

**Migración:** `backend/alembic/versions/e1f2a3b4c5d6_add_movimiento_conciliacion_estado.py`  
**Revisa:** `d3e4f5a6b7c8`  
**Estado en DB:** aplicada (`alembic current` = `e1f2a3b4c5d6 (head)`)

Columnas nuevas en `movimientos_banco`:

| Columna | Tipo | Significado |
|--------|------|------------|
| `poliza_id` | FK → `polizas.id` (+ índice) | Póliza vinculada |
| `modo_conciliacion` | `String(20)` | `automatico` \| `manual` |
| `tipo_asignacion` | `String(20)` | `ingreso` \| `egreso` \| `diario` |
| `conciliado_en` | `DateTime(tz)` | Timestamp del vínculo |
| `created_at` / `updated_at` | `DateTime(tz)` | Auditoría estándar del proyecto |

**Modelo:** `backend/app/models/conciliacion.py`

### 3.3 Reglas de negocio (clasificación)

Implementadas en `clasificar_tipo_poliza_movimiento` (`backend/app/services/conciliacion.py`):

| Señal | Tipo de póliza |
|-------|----------------|
| Descripción con patrones de ajuste (`AJUSTE`, `RECLASIFIC`, `TRASPASO`, `COMPENSACIÓN`, `ASIENTO`, `DIARIO`, etc.) | **diario** |
| Movimiento `abono` (depósito) | **ingreso** |
| Movimiento `cargo` (pago/gasto) | **egreso** |

**Cuentas contrapartida por defecto**

| Tipo | Cuenta | Nombre |
|------|--------|--------|
| Ingreso | `401.01.01` | Ingresos por ventas |
| Egreso | `601.01.01` | Gastos generales |
| Diario | `601.84.01` | Ajustes contables |

Comisiones bancarias detectadas por patrón se **excluyen** de la auto-creación de póliza (permanecen en cola de comisiones).

### 3.4 Servicios backend

Archivo núcleo: `backend/app/services/conciliacion.py`

| Función | Responsabilidad |
|---------|-----------------|
| `clasificar_tipo_poliza_movimiento` | Regla auto ingreso/egreso/diario |
| `vincular_movimiento_poliza` | Persiste `poliza_id`, modo, tipo, timestamp |
| `conciliar_periodo` | Matching + opción de **persistir** matches; serializa modos |
| `auto_conciliar_sin_poliza` | Empareja existentes y **crea** pólizas para pendientes |
| `asignar_conciliacion_manual` | Reasigna / crea póliza y marca `modo=manual` |

**Extensión en pólizas:** `backend/app/services/polizas.py`

- `generar_poliza_movimiento_banco(..., tipo=opcional)` admite **diario** además de ingreso/egreso.

### 3.5 API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/v1/conciliacion/auto-conciliar` | Body: `empresa_id`, `mes`, `anio`, `banco_id?`, `tolerancia?` |
| `PATCH` | `/api/v1/conciliacion/movimientos/{id}` | Body: `empresa_id`, `tipo_poliza`, `poliza_id?`, contrapartida/concepto opcionales |
| (existente + efecto) | Crear póliza desde movimiento | Marca conciliación **manual** |

Archivos:

- `backend/app/api/v1/endpoints/conciliacion.py`
- `backend/app/api/v1/endpoints/polizas.py`

### 3.6 Frontend de conciliación

`frontend/src/components/ConciliacionBancariaPanel.jsx`

- Botón **Auto-conciliar**
- Estados de fila: `conciliado_auto` \| `conciliado_manual` \| `sin_poliza` \| `comision`
- Fila expandible para reasignar a **Ingresos / Egresos / Diario**
- Filtros exclusivos y botones con `.btn-press`
- Helpers API en `frontend/src/services/conciliacionService.js`:
  - `autoConciliarAPI`
  - `asignarConciliacionManualAPI`
  - `resumenFiscalSatAPI`

### 3.7 Tests

`backend/tests/test_conciliacion_auto_manual.py`

- Clasificación parametrizada (depósito / pago / ajuste)
- `vincular_movimiento_poliza` (auto y manual)
- `asignar_conciliacion_manual` (happy path + tipo inválido)

### 3.8 Nota técnica / riesgo conocido

`conciliar_periodo(..., persistir_matches=True)` puede **hacer commit** al consultar/resumir.  
`auto_conciliar_sin_poliza` lo usa de forma intencional; conviene no activar persistencia en GETs de solo lectura si se desea idempotencia estricta de lectura.

---

## 4. Bloque B — Motor fiscal SAT (informativo)

### 4.1 Objetivo

Dar al usuario una **vista única** de:

- Cómo se estiman ISR, IVA y retenciones
- Qué declaraciones aplican y con qué periodicidad
- Sugerencias de pago y vencimiento aproximado

**No sustituye** el cálculo ni el portal del SAT (disclaimer explícito en payload y UI).

### 4.2 Servicio

`backend/app/services/resumen_fiscal_sat.py`

**Entradas:** `empresa_id`, `mes`, `anio`  
**Fuentes:** `calcular_isr_provisional`, `calcular_iva_provisional`, reglas de régimen (`SAT_REGIMEN_RULES`)

**Salida (estructura):**

```text
aviso
empresa { id, rfc, régimen, tipo_persona, ... }
periodo { mes, anio, etiqueta }
impuestos {
  isr { a_cargo, resumen, detalle }
  iva { a_cargo, a_favor, resumen, detalle }
  retenciones { isr, iva, total, resumen }
}
declaraciones[] {
  tipo, periodicidad, descripción, base_legal,
  periodo_corresponde, proximo_vencimiento
}
sugerencias_pago[] { concepto, monto_estimado, vencimiento, nota }
obligaciones_regimen { calculo_isr_tipo, exige_diot, ... }
```

**Periodicidad**

- Mensual: IVA, ISR provisional, DIOT (si aplica)
- Bimestral: caso régimen tipo RIF (`621`)
- Anual: ISR anual (marzo moral / abril física — texto orientativo)

**Vencimiento aproximado:** día **17** del mes siguiente (sin calendario oficial de inhábiles SAT).

### 4.3 API

```http
GET /api/v1/fiscal/resumen-sat?empresa_id={id}&mes={1-12}&anio={yyyy}
```

Archivo: `backend/app/api/v1/endpoints/fiscal.py`

### 4.4 Frontend fiscal

`frontend/src/components/FiscalConsolidadosPanel.jsx`

- Nueva pestaña **Resumen SAT** (default al entrar)
- Bloques expandibles: impuestos / declaraciones / sugerencias de pago
- KPIs: ISR a cargo, IVA a cargo/favor, retenciones
- Aviso de carácter informativo
- Tabs con `.btn-press` y contraste de selección

### 4.5 Tests

`backend/tests/test_resumen_fiscal_sat.py`

- Estructura del payload
- Montos mockeados
- Presencia de declaraciones
- Vencimiento aproximado `YYYY-MM-17`

---

## 5. Bloque C — Rediseño de navegación (módulos y reportes)

### 5.1 Problema UX

En `CompanyDetail`, los botones de módulos/reportes y el contenido vivían **en la misma vista**.

Requisitos cubiertos:

- Vista inicial solo con botones
- Clic → **página nueva** con el contenedor
- Regreso claro al hub
- Sin modales para módulos
- Rutas legibles (`/modulos/...`, `/reportes/...`)

### 5.2 Diseño de rutas

Registradas en `frontend/src/App.jsx`:

| Ruta | Vista |
|------|--------|
| `/empresa/:id` | **Hub** (solo botones) |
| `/empresa/:id/modulos/:moduloId` | Página de módulo |
| `/empresa/:id/reportes/:reporteId` | Página de reporte |

**Catálogo:** `frontend/src/navigation/companyHub.js`

#### Módulos

| Slug | Contenido |
|------|-----------|
| `documentos` | Historial CFDI |
| `polizas` | Registro contable |
| `conciliacion` | Revisión bancaria |
| `fiscal` | Motor fiscal |

#### Reportes

| Slug | Contenido |
|------|-----------|
| `ingresos` | Informes / tab estado |
| `egresos` | Informes / tab padrón (gastos-proveedores) |
| `utilidades` | Informes / tab resumen |
| `impuestos` | Informes / tab trasladados |
| `proveedores` | Informes / tab padrón |

Helpers: `hubPath`, `hubHomePath`, `getHubItem`, `legacyQueryToHubPath`

### 5.3 Componentes reutilizables

| Componente | Rol |
|------------|-----|
| `frontend/src/components/HubCard.jsx` | Botón flotante con acento, badge Módulo/Reporte, presión |
| `frontend/src/components/ModulePageShell.jsx` | Shell de página: back, título, descripción, contenedor limpio |

### 5.4 Refactor de `CompanyDetail`

`frontend/src/pages/CompanyDetail.jsx`

- Deriva vista desde `moduloId` / `reporteId`
- **Hub:** grid de módulos + reportes + buscador
- **Página:** `ModulePageShell` + `renderSeccion()` (paneles existentes)
- Redirect de URLs legacy `?seccion=&tab=`
- Redirect a hub si slug inválido
- `InformesPanel` con `key` por tab para remount correcto

### 5.5 Dashboard

`frontend/src/pages/Dashboard.jsx`

- `handleNavigateEmpresa` mapea secciones antiguas a rutas nuevas.

### 5.6 CSS global

`frontend/src/index.css`

- `.btn-press` — hover / active / focus-visible
- `.hub-card` — sombra flotante y presión
- `.animate-page-in` — entrada suave hub ↔ página
- `.module-page-content` — contenedor con blur ligero

---

## 6. Inventario de archivos del día

### 6.1 Nuevos

| Archivo | Propósito |
|---------|-----------|
| `backend/alembic/versions/e1f2a3b4c5d6_add_movimiento_conciliacion_estado.py` | Migración conciliación |
| `backend/app/services/resumen_fiscal_sat.py` | Motor resumen SAT |
| `backend/tests/test_conciliacion_auto_manual.py` | Tests conciliación |
| `backend/tests/test_resumen_fiscal_sat.py` | Tests fiscal |
| `frontend/src/navigation/companyHub.js` | Catálogo y rutas hub |
| `frontend/src/components/HubCard.jsx` | Botón hub |
| `frontend/src/components/ModulePageShell.jsx` | Shell de página |
| `docs/REPORTE-TECNICO-2026-10-04.md` | Este reporte |

### 6.2 Modificados (principales)

| Archivo | Cambio |
|---------|--------|
| `backend/app/models/conciliacion.py` | Campos de vínculo |
| `backend/app/services/conciliacion.py` | Auto/manual + persistencia |
| `backend/app/services/polizas.py` | Tipo póliza opcional (diario) |
| `backend/app/api/v1/endpoints/conciliacion.py` | POST auto + PATCH manual |
| `backend/app/api/v1/endpoints/fiscal.py` | GET resumen-sat |
| `backend/app/api/v1/endpoints/polizas.py` | Marca manual al crear desde banco |
| `frontend/src/components/ConciliacionBancariaPanel.jsx` | UI auto/manual |
| `frontend/src/components/FiscalConsolidadosPanel.jsx` | Tab Resumen SAT |
| `frontend/src/services/conciliacionService.js` | Clientes API |
| `frontend/src/App.jsx` | Rutas modulos/reportes |
| `frontend/src/pages/CompanyDetail.jsx` | Hub + páginas |
| `frontend/src/pages/Dashboard.jsx` | Navegación a rutas nuevas |
| `frontend/src/index.css` | btn-press, hub, page-in |

---

## 7. Flujos de usuario resultantes

### 7.1 Conciliación

1. Usuario entra a **Conciliación bancaria** (ruta módulo).
2. Ve movimientos parseados; los ya matcheados aparecen conciliados.
3. Pulsa **Auto-conciliar** → pendientes sin póliza reciben póliza ingreso/egreso/diario y modo `automatico`.
4. Puede expandir una fila y reasignar tipo → modo `manual`.
5. La UI distingue claramente auto vs manual.

### 7.2 Fiscal

1. En módulo **Fiscal**, pestaña **Resumen SAT**.
2. Ve KPIs, explicación de cálculo, declaraciones con periodicidad y sugerencias.
3. El aviso deja claro el carácter **informativo**.

### 7.3 Navegación empresa

1. `/empresa/:id` → hub con todos los botones.
2. Clic → página dedicada con contenido y «Volver al inicio».
3. Transición suave; sin modal de módulo.

---

## 8. Calidad y verificación

| Prueba | Resultado |
|--------|-----------|
| `pytest` conciliación auto/manual + resumen SAT + relacionados | **25 passed** |
| `vite build` frontend | **OK** |
| `alembic upgrade head` | **OK** (`e1f2a3b4c5d6`) |

### Cobertura de tests nuevos (orientativa)

- Reglas de clasificación
- Persistencia de vínculo
- Validación de tipo manual
- Shape del resumen fiscal y vencimiento

### No cubierto aún (recomendado)

- Tests de integración E2E del endpoint auto-conciliar con DB real
- Tests de rutas React (hub → módulo)
- Pruebas de regresión de migración en staging adicional

---

## 9. Migración Alembic (ejecutada)

```text
Antes:  d3e4f5a6b7c8
Después: e1f2a3b4c5d6 (head)
Comando: python -m alembic upgrade head
Motor:   MySQLImpl (DDL no transaccional)
```

**Revision:** `e1f2a3b4c5d6` — *add movimiento banco conciliacion estado*

Columnas aplicadas en `movimientos_banco`:

- `poliza_id` (+ índice `ix_movimientos_banco_poliza_id`)
- `modo_conciliacion`
- `tipo_asignacion`
- `conciliado_en`
- `created_at`
- `updated_at`

---

## 10. Riesgos, deudas y siguientes pasos

### 10.1 Riesgos

1. **Side effect de persistencia** en `conciliar_periodo` si se invoca con `persistir_matches=True` desde lecturas.
2. **Cuentas default** fijas (401/601) pueden no calzar el catálogo de cada empresa; la edición manual mitiga.
3. **Vencimiento día 17** es aproximación; no contempla días inhábiles SAT.
4. Cambios pueden estar **sin commit** — versionar en Git cuando corresponda.

### 10.2 Mejoras sugeridas (no hechas en este día)

- Forzar `persistir_matches=False` en todos los GET de solo lectura.
- Mapear contrapartidas con clasificador de concepto existente antes del default.
- Calendario de vencimientos oficial o configurable.
- Tests E2E (Playwright) del hub.
- Commit/PR por bloque (conciliación / fiscal / navegación) o monorelease documentado.

### 10.3 Checklist de despliegue

- [x] `alembic upgrade head` (entorno local/dev de esta sesión)
- [ ] Reiniciar API en el entorno de ejecución
- [ ] Deploy frontend (build ya verificado)
- [ ] Smoke test: hub → conciliación → auto-conciliar → fiscal resumen SAT
- [ ] Commit + notas de release

---

## 11. Conclusión

El trabajo del **4 de octubre de 2026** convierte tres gaps de producto en capacidades concretas:

1. **Conciliación completa del estado de cuenta** con trazabilidad automático/manual y persistencia en BD (migración aplicada).
2. **Motor fiscal informativo SAT** para orientar pagos y declaraciones.
3. **UX de módulos/reportes** moderna: hub de botones flotantes y páginas dedicadas con rutas claras.

La base queda alineada con la arquitectura multiempresa de SmartContable y con el roadmap (conciliación avanzada + inteligencia fiscal + experiencia de uso).

---

*Documento generado para SmartContable — sesión de desarrollo 2026-10-04.*
