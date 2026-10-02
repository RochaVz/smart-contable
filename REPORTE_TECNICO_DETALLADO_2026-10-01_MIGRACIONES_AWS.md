# REPORTE TECNICO — Migraciones y backend AWS (2026-10-01)

## Objetivo
Evitar fallas manana en la PWA movil por schema desactualizado: publicar backend con migraciones nuevas y validar RDS.

## Resultado
- **Backend redeploy** en EC2 `i-050bd9cc1e31ff11b` (SSM Success).
- **Alembic production:** `d3e4f5a6b7c8` (head).
- Migraciones aplicadas en arranque Docker:
  - `f4a1b2c3d4e5` → `a8c7d6e5f4b3` (periodos/operaciones fiscales)
  - `a8c7d6e5f4b3` → `b1c2d3e4f5a6` (historial declaraciones)
  - `b1c2d3e4f5a6` → `c2d3e4f5a6b7` (complementos CFDI)
  - `c2d3e4f5a6b7` → `d3e4f5a6b7c8` (pagos provisionales / perdidas)
- **Tablas OK:** declaraciones_fiscales, historial_fiscal, cfdi_*, pagos_provisionales_anteriores, perdidas_fiscales, periodos_fiscales, operaciones_fiscales.
- **Health:** `https://3-12-148-63.nip.io/health` = 200
- **OpenAPI** expone `/api/v1/fiscal/*`, indicadores, DIOT, diferencias, complementos.
- **Local MySQL** ya estaba en head `d3e4f5a6b7c8`.

## Notas
- `docker-compose.prod.yml` no sobreescribe CMD; el Dockerfile ejecuta `alembic upgrade head && uvicorn`.
- Frontend Vercel apunta a `VITE_API_URL=https://3-12-148-63.nip.io/api/v1`.
- Script de verificacion: `scripts/verify-prod-migrations.sh`.
