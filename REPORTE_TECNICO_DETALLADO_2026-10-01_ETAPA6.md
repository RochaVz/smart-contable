# REPORTE TECNICO DETALLADO — Etapa 6 Interfaz fiscal consolidada

**Fecha:** 2026-10-01  
**Proyecto:** SmartContable  
**Alcance:** Etapa 6 del roadmap fiscal (`docs/ROADMAP.md`)

---

## Objetivo

Unificar la experiencia fiscal en un solo centro con pestañas ISR / IVA / DIOT / Anual, estado de cálculo, filtros, conciliación de fuentes (CFDI vs pólizas vs motor fiscal) y bitácora de exportaciones.

---

## Cambios backend

### Nuevo servicio
- `backend/app/services/fiscal_diferencias.py`
  - `comparar_fuentes_fiscales(db, empresa_id, mes, anio)`
  - Totales CFDI del mes (ingresos/egresos + IVA)
  - Totales de pólizas del periodo (diario/ingreso/egreso)
  - IVA en cuentas contables 216.01 / 118.01
  - Cruce con `calcular_iva_provisional`, `calcular_isr_provisional`, `construir_diot`
  - Matriz de diferencias con tolerancia $0.05
  - `estado_general`: `ok` | `pendiente` | `desvios`
  - Lista `pendientes` y `alertas`

### API
- `GET /api/v1/fiscal/diferencias?empresa_id&mes&anio`
- `GET /api/v1/fiscal/diot/export` ahora registra evento en `historial_fiscal`:
  - `accion=actualizar`
  - `motivo=exportacion_fiscal`
  - `entidad_tipo=periodo`, `entidad_id=YYYYMM`
  - detalle con formato, filename, forzado, conteos

---

## Cambios frontend

### Nuevo
- `frontend/src/components/FiscalConsolidadosPanel.jsx`
  - Tabs: ISR, IVA, DIOT, Anual, Diferencias, Régimen, Bitácora, Complementos
  - Filtros compartidos: mes, año, proveedor/RFC, tipo operación DIOT
  - Badges de estado / pendientes / desvíos
  - ISR e IVA consumen endpoints reales `/fiscal/isr` y `/fiscal/iva`
  - Diferencias consume `/fiscal/diferencias`

### Ajustes
- `DiotPanel.jsx`: periodo controlado, filtros proveedor/tipo, `hidePeriodControls`
- `FiscalAnualPanel.jsx`: año controlado desde el shell
- `CompanyDetail.jsx`: pestaña fiscal monta solo `FiscalConsolidadosPanel`

---

## Pruebas

```text
pytest tests/test_fiscal_diferencias.py tests/test_calculos_fiscales.py -q
→ 10 passed

npm run build
→ OK (~2.3s)
```

---

## Criterios Etapa 6

| Criterio | Estado |
|----------|--------|
| Tabs ISR/IVA/DIOT/Anual | Cumplido |
| Estado del cálculo y pendientes | Cumplido |
| Filtros proveedor / mes / tipo | Cumplido |
| Diferencias CFDI vs pólizas vs fiscal | Cumplido |
| Bitácora cambios y exportaciones | Cumplido (historial + log export DIOT) |

---

## Notas / siguientes pasos

- La comparación de totales CFDI vs pólizas de ingreso puede marcar desvíos legítimos (PPD, comisiones, parcialidades); el UI marca "Revisar" sin bloquear.
- Posible mejora: exportar la matriz de diferencias a CSV y filtros de bitácora solo exportaciones.
- Roadmap: etapas 0–6 fiscales en estado **Listo para beta**.
