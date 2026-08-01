# SmartContable Summary for NotebookLM

## Project Status Summary

SmartContable is a SaaS platform for automated accounting and fiscal processing in Mexico. It includes a FastAPI backend, React frontend, MySQL database, JWT authentication, and support for CFDI invoice processing, policy generation, reconciliation, and reporting.

### Current state

- Backend and frontend are separated into `backend/` and `frontend/`.
- The backend uses FastAPI, SQLAlchemy, Pydantic, and MySQL.
- The frontend uses React, Vite, Axios, and Tailwind CSS.
- The application enforces multi-tenant behavior: companies belong to a specific user and users can only see their own companies.
- `ERNESTO JOSE MARTINEZ BULNES` was not visible because the company record belonged to a different `usuario_id` than the authenticated user.
- The root cause was data ownership mismatch, not a frontend filtering bug.
- The fix was to correct the company record to belong to the authenticated user's `usuario_id`.
- No additional code changes were needed for the root cause.

## Key Findings

- The backend uses user ownership filtering for company and invoice queries.
- Duplicate RFC values return `409 Conflict` through `DuplicateResourceException`.
- The company listing endpoint only returns active companies for the current user.
- The backend has explicit tenancy validation in endpoints such as companies, invoices, policies, configuration, and reconciliation.

## Documentation Included

This file contains:
- API reference for the current backend endpoints
- Implementation plan for the next phases

---

## API Reference

### Base URL

All endpoints are served under `/api/v1`.

Example:

`POST /api/v1/auth/login`

### Authentication

#### Authorization header

Protected endpoints require a bearer token header:

`Authorization: Bearer ACCESS_TOKEN`

#### Login

`POST /api/v1/auth/login`

- Content-Type: `application/x-www-form-urlencoded`
- Request fields:
  - `username`: user email
  - `password`: user password
- Response:
  - `access_token`: JWT token
  - `token_type`: `bearer`
- Error codes:
  - `400` invalid form data
  - `401` invalid credentials

#### Register user

`POST /api/v1/auth/registro`

- Content-Type: `application/json`
- Request body:
  - `nombre`: string
  - `email`: string (valid email)
  - `password`: string
  - `rol`: one of `admin`, `contador`, `auditor`, `auxiliar`, `cliente`
- Response: `UsuarioResponse`
  - `id`
  - `nombre`
  - `email`
  - `rol`
  - `activo`
- Error codes:
  - `409` email already registered

### Companies

#### Create company

`POST /api/v1/empresas`

- Content-Type: `application/json`
- Request body (`EmpresaCreate`):
  - `rfc`: string (12-13 characters)
  - `razon_social`: string
  - `tipo_persona`: string
  - `regimen_fiscal`: string
  - `codigo_postal`: string (optional)
- Response: `EmpresaResponse`
  - `id`
  - `usuario_id`
  - `activo`
  - `creado_en`
- Error codes:
  - `409` RFC already exists

#### List companies

`GET /api/v1/empresas`

- Query params:
  - `skip`: integer, default `0`
  - `limit`: integer, default `10`, maximum `100`
- Response: list of `EmpresaResponse`
- Only active companies belonging to the authenticated user are returned.

#### Get company details

`GET /api/v1/empresas/{empresa_id}`

- Response: `EmpresaResponse`
- Error codes:
  - `403` company does not belong to user
  - `404` company not found

#### Export company ZIP

`GET /api/v1/empresas/{empresa_id}/exportar`

- Query params:
  - `mes`: integer (1-12, optional)
  - `anio`: integer (2000-2100, optional)
- Response: `application/zip` attachment
- The response includes a `Content-Disposition` header with the ZIP filename.

#### Export company CSV

`GET /api/v1/empresas/{empresa_id}/exportar-csv`

- Query params:
  - `tipo`: string (optional). Valid values include `todo`, `facturas`, `polizas`, `movimientos`, `mapeos`, `comisiones`, `contable`
  - `mes`: integer (1-12, optional)
  - `anio`: integer (2000-2100, optional)
- Response: `text/csv` attachment

#### Update company

`PUT /api/v1/empresas/{empresa_id}`

- Content-Type: `application/json`
- Request body (`EmpresaUpdate`):
  - `razon_social`: string (optional)
  - `codigo_postal`: string (optional)
  - `regimen_fiscal`: string (optional)
  - `activo`: boolean (optional)
- Response:
  - `mensaje`
  - `empresa_id`

#### Deactivate company

`DELETE /api/v1/empresas/{empresa_id}`

- Soft delete: the company is marked inactive.
- Response:
  - `mensaje`

### Configuration

#### Create or update account mapping

`POST /api/v1/configuracion/mapeos`

- Content-Type: `application/json`
- Request body (`MapeoCuentaCreate`):
  - `rfc_emisor`: string
  - `nombre_cuenta`: string
  - `codigo_cuenta`: string (optional)
  - `empresa_id`: integer
- Response: `MapeoCuentaResponse`
  - `id`
  - `rfc_emisor`
  - `nombre_cuenta`
  - `codigo_cuenta`
  - `empresa_id`

#### List account mappings by company

`GET /api/v1/configuracion/mapeos/{empresa_id}`

- Response: list of `MapeoCuentaResponse`

#### List bank commissions by company

`GET /api/v1/configuracion/comisiones-banco/{empresa_id}`

- Response: list of `ComisionBancoResponse`

#### Create bank commission

`POST /api/v1/configuracion/comisiones-banco`

- Content-Type: `application/json`
- Request body (`ComisionBancoCreate`):
  - `nombre_banco`: string
  - `porcentaje_credito`: float
  - `porcentaje_debito`: float
  - `porcentaje_servicios`: float
  - `comision_fija`: float
  - `es_default`: boolean
  - `empresa_id`: integer
- Response: `ComisionBancoResponse`

#### Update bank commission

`PUT /api/v1/configuracion/comisiones-banco/{banco_id}`

- Content-Type: `application/json`
- Request body (`ComisionBancoUpdate`): fields are optional
- Response: `ComisionBancoResponse`

#### Delete bank commission

`DELETE /api/v1/configuracion/comisiones-banco/{banco_id}`

- Response: `204 No Content`

### Invoices

#### Upload single CFDI XML

`POST /api/v1/facturas/subir-xml`

- Content-Type: `multipart/form-data`
- Query params:
  - `empresa_id`: integer
- Body:
  - `archivo`: XML file
- Response includes:
  - `mensaje`
  - `uuid`
  - `factura_id`
  - `tipo_operacion`
  - `polizas_generadas`
  - `poliza_ids`
- Error codes:
  - `400` invalid file type or invalid XML
  - `409` duplicate invoice

#### Upload batch ZIP of CFDI XML files

`POST /api/v1/facturas/subir-zip`

- Content-Type: `multipart/form-data`
- Query params:
  - `empresa_id`: integer
- Body:
  - `archivo`: ZIP file
- Response includes:
  - `mensaje`
  - `exitos`
  - `duplicados`
  - `errores`
  - `polizas_generadas`
  - `errores_polizas`
  - `por_periodo`
  - `detalles`

#### List invoices for a company

`GET /api/v1/facturas`

- Query params:
  - `empresa_id`: integer
- Response: list of invoice summary objects.
- Example fields returned:
  - `id`
  - `uuid`
  - `fecha`
  - `tipo_operacion`
  - `emisor`
  - `rfc_emisor`
  - `nombre_cliente`
  - `forma_pago`
  - `forma_pago_label`
  - `metodo_pago`
  - `subtotal`
  - `iva`
  - `iva_retenido`
  - `isr_retenido`
  - `total`
  - `cuenta_contable`
  - `tiene_poliza`

#### Delete invoice

`DELETE /api/v1/facturas/{factura_id}`

- Response:
  - `mensaje`
  - `uuid`
  - `polizas_eliminadas`

#### Get invoice details

`GET /api/v1/facturas/{factura_id}/detalle`

- Response includes:
  - invoice metadata
  - `forma_pago`
  - `conceptos`
  - `desglose_impuestos`
  - `preview_poliza`

#### Generate invoice policies

`POST /api/v1/facturas/{factura_id}/generar-poliza`

- Response includes created policy IDs and types.
- Error `409` if policies already exist.

#### Get invoice policy

`GET /api/v1/facturas/{factura_id}/poliza`

- Response includes:
  - `poliza_id`
  - `total`
  - `movimientos`

#### List all invoices across the user's companies

`GET /api/v1/facturas/global`

- Returns all invoices for every company owned by the authenticated user.

### Policies

#### Create manual diario policy

`POST /api/v1/polizas/diario`

- Content-Type: `application/json`
- Request body (`PolizaDiarioInput`):
  - `empresa_id`: integer
  - `fecha`: date
  - `concepto`: string
  - `movimientos`: array of objects
    - `cuenta`: string
    - `nombre_cuenta`: string
    - `debe`: float
    - `haber`: float
    - `concepto`: string
- Response: serialized policy object

#### List organized policies

`GET /api/v1/polizas/organizadas`

- Query params:
  - `empresa_id`: integer
  - `mes`: integer (optional)
  - `anio`: integer (optional)
- Response includes grouped policies and pending previews.

#### Generate automatic policies

`POST /api/v1/polizas/generar-automatico`

- Query params:
  - `empresa_id`: integer
  - `mes`: integer (optional)
  - `anio`: integer (optional)
  - `banco_id`: integer (optional)
- Response includes:
  - `mensaje`
  - `total_polizas`
  - `facturas_procesadas`
  - `por_mes`
  - `errores`

#### Download policies CSV

`GET /api/v1/polizas/descargar-csv`

- Query params:
  - `empresa_id`: integer
  - `tipo`: `diario` | `ingreso` | `egreso`
  - `mes`: integer (optional)
  - `anio`: integer (optional)
- Response: `text/csv` attachment

#### List all policies

`GET /api/v1/polizas`

- Query params:
  - `empresa_id`: integer
- Response: list of serialized policy objects

#### Get policy by id

`GET /api/v1/polizas/{poliza_id}`

- Response: serialized policy object with movements.

#### Generate policy from invoice

`POST /api/v1/polizas/generar-desde-factura/{factura_id}`

- Query params:
  - `banco_id`: integer (optional)
- Response includes created policy objects.

### Financial reports

#### Fiscal package

`GET /api/v1/reportes/paquete-fiscal`

- Query params:
  - `empresa_id`: integer
  - `mes`: integer
  - `anio`: integer
- Response: fiscal report package structure

#### Financial summary

`GET /api/v1/reportes/financiero`

- Query params:
  - `empresa_id`: integer
  - `mes`: integer
  - `anio`: integer
- Response includes:
  - `resumen_kpi`
  - `detalle_por_categoria`

#### Expense breakdown

`GET /api/v1/reportes/desglose-gastos`

- Query params:
  - `empresa_id`: integer
  - `mes`: integer
  - `anio`: integer
- Response includes expense categories and totals.

#### KPI report

`GET /api/v1/reportes/kpis`

- Query params:
  - `empresa_id`: integer
  - `mes`: integer
  - `anio`: integer
- Response includes:
  - `ingresos_mes`
  - `gastos_mes`
  - `utilidad`
  - `margen_utilidad`
  - `iva_trasladado`
  - `impuestos_locales`
  - `iva_estimado`
  - `facturas_emitidas`

#### Global KPIs across companies

`GET /api/v1/reportes/global-kpis`

- Query params:
  - `mes`: integer
  - `anio`: integer
- Response includes:
  - `ingresos`
  - `gastos`
  - `utilidad`

### Bank reconciliation

#### Conciliation summary

`GET /api/v1/conciliacion/resumen`

- Query params:
  - `empresa_id`: integer
  - `mes`: integer (optional, defaults to current month)
  - `anio`: integer (optional, defaults to current year)
  - `banco_id`: integer (optional)
  - `tolerancia`: float (default `1.0`)
- Response: reconciliation summary object

#### Upload bank statement

`POST /api/v1/conciliacion/estado-cuenta`

- Content-Type: `multipart/form-data`
- Query params:
  - `empresa_id`: integer
  - `banco_id`: integer (optional)
  - `mes`: integer (optional)
  - `anio`: integer (optional)
- Body:
  - `archivo`: XML file
- Response includes:
  - `mensaje`
  - `carga_id`
  - `archivo`
  - `periodo_referencia`
  - `movimientos_detectados`
  - `movimientos_nuevos`
  - `duplicados`

### Common response schemas

#### UsuarioResponse

- `id`
- `nombre`
- `email`
- `rol`
- `activo`

#### EmpresaResponse

- `id`
- `rfc`
- `razon_social`
- `tipo_persona`
- `regimen_fiscal`
- `codigo_postal`
- `usuario_id`
- `activo`
- `creado_en`

#### Token

- `access_token`
- `token_type`

#### MapeoCuentaResponse

- `id`
- `rfc_emisor`
- `nombre_cuenta`
- `codigo_cuenta`
- `empresa_id`

#### ComisionBancoResponse

- `id`
- `empresa_id`
- `nombre_banco`
- `porcentaje_credito`
- `porcentaje_debito`
- `porcentaje_servicios`
- `comision_fija`
- `es_default`

### Common error responses

The API uses standard HTTP status codes and returns JSON errors in most cases.

Example error body:

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "Error interno del servidor"
  }
}
```

Common error codes:
- `400` bad request / validation error
- `401` unauthorized / invalid token
- `403` forbidden / access denied
- `404` resource not found
- `409` conflict / duplicate resource
- `500` internal server error

### Notes

- All endpoints that modify or return private data require authentication.
- `empresa_id` is the central tenancy key in the API and must refer to a company owned by the authenticated user.
- File uploads are accepted as multipart form data.
- `POST /api/v1/auth/login` uses OAuth2 password flow with form-encoded credentials.

---

## Implementation Plan

### Objective

Provide a clear technical roadmap to stabilize and scale SmartContable as a SaaS multi-tenant accounting platform.

### Phase 1 — Stabilization and Documentation

#### Priorities
- Document the API and existing schemas.
- Consolidate the current architecture.
- Ensure multi-tenant access controls.
- Add basic automated tests for critical flows.

#### Tasks
- Update `docs/API_REFERENCE.md` with all existing routes, input parameters, examples, and error codes.
- Review `docs/README.md` to resolve conflicts and consolidate installation instructions.
- Validate protected routes with `Authorization: Bearer <token>`.
- Add backend unit tests for authentication, company management, and invoice handling.

### Phase 2 — Security and Multi-Tenancy

#### Priorities
- Enforce data isolation by user and company.
- Review role-based permissions.
- Add consistent error handling.

#### Tasks
- Audit all endpoints and verify that users only access their own companies, invoices, and policies.
- Centralize tenancy validation in a shared core module.
- Review `app/core/permissions.py` and strengthen role enforcement with tests.
- Document 403, 404, and 409 behavior across the API.

### Phase 3 — Quality and UX

#### Priorities
- Improve the frontend experience.
- Reduce user errors during data creation and uploads.
- Add client-side validation and clearer messages.

#### Tasks
- Replace generic JavaScript alerts with structured UI notifications.
- Surface server error messages in forms for company creation and invoice uploads.
- Add loading states to buttons and form submissions.
- Ensure the frontend respects backend pagination and query parameters.

### Phase 4 — Exports and Reporting

#### Priorities
- Standardize CSV and ZIP exports.
- Ensure compatibility with Google Sheets and Excel.
- Improve financial reporting.

#### Tasks
- Document the `tipo` parameter and filters for company export endpoints.
- Add descriptive filenames and UTF-8 BOM encoding for CSV exports.
- Verify export data consistency with API query results.
- Improve financial reports for `reportes/financiero`, `kpis`, and `global-kpis`.

### Phase 5 — Deployment and Operations

#### Priorities
- Prepare the project for local and production deployment.
- Add health checks and CORS configuration.

#### Tasks
- Create `docker-compose` for backend, frontend, and database.
- Add consistent startup scripts for backend and frontend.
- Document required environment variables.
- Keep the `/health` endpoint available for readiness checks.

### Immediate Deliverables
- Updated API documentation in `docs/API_REFERENCE.md`.
- Technical implementation plan in `docs/IMPLEMENTATION_PLAN.md`.
- Prioritized task list aligned with stabilization, security, UX, export, and deployment.

### Next Steps
1. Finish documenting the remaining endpoints and validate them with manual tests.
2. Add or restore backend tests for company and invoice flows.
3. Confirm the API prevents cross-user access.
4. Review the frontend to ensure active companies and export options appear correctly.
