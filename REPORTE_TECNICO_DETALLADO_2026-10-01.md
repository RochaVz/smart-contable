# REPORTE TECNICO DETALLADO — 2026-10-01 (Etapa 4)

## Objetivo
Completar Etapa 4 del roadmap: tarifas ISR progresivas versionadas, pagos provisionales previos, pérdidas fiscales, IEPS, endpoint anual y saldo a favor/cargo.

## Entregables

### Backend
- `backend/app/core/tarifas_isr_oficiales.py` — tablas mensuales/anuales 2024-2026 + `aplicar_tarifa_progresiva`.
- `backend/app/models/ajustes_fiscales.py` — `PagoProvisionalAnterior`, `PerdidaFiscal`.
- Migración Alembic `d3e4f5a6b7c8` (revises `c2d3e4f5a6b7`).
- `calculos_fiscales.py` ampliado:
  - ISR provisional con tarifa progresiva automática (regímenes TARIFA_PROGRESIVA).
  - Descuento de pagos provisionales anteriores y retenciones.
  - `calcular_isr_anual` con pérdidas aplicables y saldo.
  - `calcular_ieps_provisional` desde operaciones fiscales.
- Endpoints nuevos en `/api/v1/fiscal`:
  - `GET /anual`
  - `GET /ieps`
  - `GET /tarifas-isr/{ejercicio}`
  - `POST/GET /pagos-provisionales`
  - `POST/GET /perdidas-fiscales`

### Frontend
- `FiscalAnualPanel.jsx` en pestaña Fiscal de `CompanyDetail`.
- Registro de pagos provisionales y pérdidas + KPI anual/IEPS.

### Tests
- Casos tarifa 2025 (base 10,000 → ISR 759.22).
- ISR provisional con tarifa + pagos previos.
- Anual con pérdidas y saldo.
- IEPS sin operaciones.
- Tests previos ISR actualizados por nueva consulta de pagos.

## Validación
- `alembic upgrade head` → `d3e4f5a6b7c8`
- `pytest tests/test_calculos_fiscales.py`
- `npm run build`

## Notas
- Tarifas 2026 alias de 2025 hasta publicación oficial distinta.
- Cálculos informativos; requieren revisión de contador antes de declarar.
- IEPS solo si hay operaciones fiscales con campo `ieps` > 0.

## Siguiente
Etapa 5 — DIOT y exportaciones SAT.
