# REPORTE TECNICO DETALLADO — Indicadores de seguimiento fiscal

**Fecha:** 2026-10-01  
**Proyecto:** SmartContable  
**Alcance:** Panel/API de salud fiscal (roadmap *Indicadores de seguimiento*)

---

## Objetivo

Materializar los KPIs del roadmap fiscal en un endpoint y una pestaña **Salud** del centro fiscal, para medir avance, calidad y riesgos del periodo (no impuestos a pagar).

---

## Backend

### Servicio
- `backend/app/services/fiscal_indicadores.py`
  - Checklist etapas 0–6 (requisitos)
  - Snapshot de cobertura de pruebas BE/FE
  - Inventario UX de tablas (filtro/orden/paginación)
  - Métricas live de diferencias y DIOT
  - Exportaciones exitosas desde `historial_fiscal` (`motivo=exportacion_fiscal`)
  - Revisiones contables (`motivo=revision_contable_aprobada`)
  - Score ponderado 0–100 + nivel (`saludable` … `critico`)

### API
- `GET /api/v1/fiscal/indicadores?empresa_id&mes&anio`
- `POST /api/v1/fiscal/indicadores/revision`  
  Body: `{ empresa_id, modulo, mes, anio, notas? }`  
  Módulos: `isr|iva|diot|anual|diferencias|exportaciones`

---

## Frontend

- Pestaña **Salud** en `FiscalConsolidadosPanel` (tab inicial)
- Score, KPIs, checklist, DIOT, desvíos, exportaciones
- Botones **Aprobar** por módulo → bitácora

---

## Pruebas

```text
pytest tests/test_fiscal_indicadores.py tests/test_fiscal_diferencias.py -q
npm run build
```

---

## Limitaciones conocidas

- Errores de exportación HTTP (409/422) aún no se persisten; solo éxitos.
- Cobertura de pruebas es snapshot de ingeniería, no coverage.py en CI.
- Score de revisión contable es 0% hasta que un contador apruebe módulos del periodo.

---

## Roadmap

Sección *Indicadores de seguimiento* marcada Listo para beta en `docs/ROADMAP.md`.
