# REPORTE TECNICO DETALLADO — 2026-10-01 (Etapa 5)

## Objetivo
Implementar DIOT y exportaciones SAT (layout, CSV, Excel, PDF).

## Entregables

### Backend
- `backend/app/services/diot.py`
  - Clasificacion nacional / extranjero / global por RFC
  - Agregacion por RFC + tipo desde operaciones fiscales y CFDI egreso
  - Deteccion de datos incompletos
  - Layout SAT pipe-separated
  - Export CSV, XLSX (openpyxl), PDF (reportlab)
- Endpoints:
  - `GET /api/v1/fiscal/diot`
  - `GET /api/v1/fiscal/diot/export?formato=sat|csv|xlsx|pdf`
  - Layout SAT bloqueado con 409 si hay incompletos (salvo `forzar=true`)

### Frontend
- `DiotPanel.jsx` en pestaña Fiscal: tabla proveedores, alertas, botones export

### Tests
- `tests/test_diot.py` (clasificacion, agrupacion, incompletos, layout, xlsx, pdf)

### Docs
- ROADMAP Etapa 5 → Listo para beta

## Validacion
- pytest test_diot
- npm run build
- Rutas DIOT registradas

## Notas
- Layout SAT es formato de referencia de despacho; no sustituye validacion contable final ante el SAT.
- Tipo operacion default `85` (otros); se puede refinar por catalogo en Etapa 6.

## Siguiente
Etapa 6 — Interfaz fiscal consolidada (pestañas ISR/IVA/DIOT/Anual).
