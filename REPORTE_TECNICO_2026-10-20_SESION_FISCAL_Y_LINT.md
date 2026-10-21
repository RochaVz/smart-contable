# Reporte Técnico — Sesión 2026-10-20

**Proyecto:** SmartContable — Plataforma SaaS de automatización fiscal/contable (MX)
**Fecha:** 20 de octubre de 2026
**Alcance:** Corrección de importes fiscales en $0.00, refactor de estado de periodo, eliminación de deuda de lint en React, actualización de PWA y publicación a `origin/main`
**Commits:** `7fa64b2` (08:18) · `e32590c` (20:37)
**Estado final:** `main` sincronizado con `origin/main`, working tree limpio

---

## 1. Resumen ejecutivo

La sesión resolvió un **defecto de visualización fiscal** donde el panel del Motor Fiscal SAT mostraba `$0.00` en todos los impuestos mientras el Dashboard Ejecutivo mostraba los importes correctos. La causa no fue un error de mapeo de datos sino un **desalineamiento de periodo temporal** entre dos vistas que consultan el mismo endpoint con meses distintos.

Sobre esa corrección se aplicaron tres mejoras estructurales:

| # | Trabajo | Tipo | Impacto |
|---|---------|------|---------|
| 1 | Sincronización de periodo motor SAT ↔ dashboard | Fix | IVA pasa de `$0.00` → `$9,713.03` |
| 2 | Precedencia unificada de `totales` en tarjetas fiscales | Refactor | Elimina divergencia entre vistas |
| 3 | Patrón de estado controlado en `FiscalConsolidadosPanel` | Refactor | Elimina 1 error de lint y un render en cascada |
| 4 | Banner de resumen oculto vía flag | UI | Toggle reversible en 1 línea |
| 5 | Service worker `2026.10.20.02` + commit/push | Release | Despliegue de assets nuevos |

**Métrica de calidad:** lint no suprimido en `frontend/src` → **0** (de 1). Tests **79/79**. Build OK.

---

## 2. Diagnóstico del defecto `$0.00`

### 2.1 Síntoma

El bloque "Impuestos por pagar" del Motor Fiscal SAT mostraba:

```
ISR provisional   A cargo  $0.00
IVA del periodo   A cargo  $0.00    A favor $0.00
Retenciones       ISR $0.00   IVA $0.00   Total $0.00
```

mientras el Dashboard Ejecutivo, en la misma empresa y al mismo tiempo, mostraba `IVA = $9,713.03`.

### 2.2 Investigación — dos hipótesis, una correcta

**Hipótesis A (descartada):** precedencia de campos invertida en el mapeo de la respuesta del backend.

La refutación vino de `utils/financialHealth.js`, donde la función `construirImpuestosDetalle` ya aplicaba la precedencia correcta (`totales` primero, `impuestos` como respaldo). El dashboard funcionaba **precisamente porque** tenía acceso a `totales`. No era un bug de mapeo sino de **disponibilidad del dato** en una de las dos vistas.

**Hipótesis B (confirmada):** desalineamiento de periodo.

El endpoint `GET /fiscal/resumen-sat` es **parametrizado** (`empresa_id`, `mes`, `anio`). Las dos vistas lo invocaban con meses distintos:

| Vista | Periodo solicitado | CFDI existentes | Resultado SAT |
|-------|-------------------|-----------------|----------------|
| Dashboard Ejecutivo | **Agosto 2026** (auto-ajustado) | Sí (último CFDI `2026-08-31`) | IVA = `$9,713.03` ✅ |
| Motor Fiscal SAT | **Octubre 2026** (mes actual) | No | IVA = `$0.00` ❌ |

El backend respondía **correctamente** en ambos casos: en octubre no existen CFDI, por lo que el IVA acumulado del periodo es legítimamente cero. El panel no consultaba el mes equivocado por error de lógica, sino porque **nunca recibió el periodo que el padre ya tenía resuelto**.

### 2.3 Causa raíz

`FiscalConsolidadosPanel` era un componente **autónomo con estado propio de periodo**:

```jsx
// ANTES — el panel ignoraba el periodo del padre
const [mes, setMes] = useState(now.getMonth() + 1);      // → Octubre 2026
const [anio, setAnio] = useState(now.getFullYear());
```

Mientras tanto `CompanyDetail` ya mantenía el periodo resuelto y auto-ajustado:

```jsx
// CompanyDetail.jsx — estado de periodo (ya existía, con auto-ajuste al último mes con datos)
const [mesFiltro, setMesFiltro] = useState(hoy.getMonth() + 1);
const [anioFiltro, setAnioFiltro] = useState(hoy.getFullYear());
```

El resultado era **dos fuentes de verdad** para el mismo concepto. El dashboard y el panel fiscal no podían coincidir por construcción.

### 2.4 Verificación en backend

Validación directa contra el servicio de motor fiscal, saltando la capa HTTP:

| Periodo | `totales.iva_a_cargo` | `impuestos.iva.a_cargo` | `impuestos.isr.a_cargo` |
|---------|----------------------|------------------------|------------------------|
| `mes=8, anio=2026` | **9,713.03** | 9,713.03 | 86,060.50 |
| `mes=10, anio=2026` | 0.00 | 0.00 | 0.00 |

Confirmado: la API responde correctamente; el defecto estaba 100% en la capa de presentación.

<!-- CONTINUA -->
