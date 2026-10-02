# REPORTE TÉCNICO DETALLADO — SmartContable como esqueleto de plataforma

**Fecha:** 2026-10-01  
**Proyecto:** SmartContable (`proyecto-contabilidad` / `RochaVz/smart-contable`)  
**Alcance:** Estado técnico consolidado al cierre del bloque fiscal (etapas 0–6 + indicadores), despliegue AWS/Vercel y lineamientos para reutilizar el repo como plantilla de nuevos productos.  
**Audiencia:** fundador/técnico, futuros agentes de IA, ingenieros que clonen el esqueleto.

---

## 1. Propósito de este reporte

Este documento no sustituye el código. Sirve para tres cosas:

1. **Trazabilidad de lo entregado hoy** (fiscal, PWA, migraciones, producción).
2. **Inventario técnico verificable** del monorepo (backend, frontend, datos, cloud).
3. **Contrato de reutilización**: qué copiar, qué renombrar y qué no arrastrar al siguiente proyecto.

Complementos:

| Documento | Rol |
|---|---|
| [docs/ARQUITECTURA_DETALLADA_ESQUELETO.md](docs/ARQUITECTURA_DETALLADA_ESQUELETO.md) | Arquitectura canónica y plantilla de capas |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Prioridades de producto |
| [AGENTS.md](AGENTS.md) | Reglas operativas para agentes/humanos |
| [REPORTE_TECNICO_DETALLADO_2026-10-01_MIGRACIONES_AWS.md](REPORTE_TECNICO_DETALLADO_2026-10-01_MIGRACIONES_AWS.md) | Deploy backend + Alembic en RDS |
| [docs/TECHNOLOGY_STACK_ENGINEERING_REPORT.md](docs/TECHNOLOGY_STACK_ENGINEERING_REPORT.md) | Inventario de librerías |

---

## 2. Resumen ejecutivo

SmartContable es un **SaaS multiempresa** para automatización contable/fiscal en México:

- **Frontend:** React 19 + Vite 8 + Tailwind 4 + PWA (`sw.js`).
- **Backend:** Python 3.13 + FastAPI + SQLAlchemy 2 + Alembic + MySQL.
- **Dominio fuerte:** CFDI 4.0, pólizas, conciliación bancaria, motor fiscal (ISR/IVA/DIOT/anual), indicadores de salud.
- **Despliegue beta:**
  - Frontend → **Vercel** (`smartcontable-beta.vercel.app`).
  - Backend → **AWS EC2 + Docker Compose + Caddy** (`https://3-12-148-63.nip.io`).
  - Datos → **Amazon RDS MySQL** + S3 opcional para archivos.
- **Esquema producción:** Alembic head `d3e4f5a6b7c8` verificado el 2026-10-01.

El valor del repo como **esqueleto** no es solo el dominio fiscal: es la **forma de trabajar** (capas, multiempresa, JWT, migraciones, health checks, PWA, scripts de publish y reportes de sesión).

---

## 3. Entregables del día 2026-10-01

### 3.1 Producto / código

| Bloque | Resultado |
|---|---|
| Motor fiscal etapas 0–6 | Cálculos, tarifas ISR, DIOT, historial, complementos CFDI, pagos provisionales, pérdidas, UI consolidada |
| Indicadores de seguimiento | `GET/POST /fiscal/indicadores`, tab **Salud** |
| PWA cache bump | `APP_VERSION = 2026.10.01.01` en `sw.js`, `index.html`, `manifest.webmanifest` |
| Commit principal | `d200794` — *feat: motor fiscal etapas 0-6, indicadores y bump PWA cache* |
| Backend producción | Redeploy SSM + `alembic upgrade head` hasta `d3e4f5a6b7c8` |
| Verificación tablas RDS | 11 tablas fiscales críticas = **OK**; `/health` = **200** |

### 3.2 Migraciones nuevas (cadena)

```text
… → f4a1b2c3d4e5 (opciones fiscales empresa)
  → a8c7d6e5f4b3 (periodos + operaciones fiscales)
  → b1c2d3e4f5a6 (declaraciones + historial_fiscal)
  → c2d3e4f5a6b7 (complementos pago/nómina/clasificaciones)
  → d3e4f5a6b7c8 (pagos provisionales + pérdidas)  ← HEAD
```

### 3.3 Pruebas backend (suite fiscal / relacionada)

Archivos relevantes en `backend/tests/`:

- `test_calculos_fiscales.py`
- `test_diot.py`
- `test_historial_declaraciones.py`
- `test_cfdi_complementos.py`
- `test_fiscal_diferencias.py`
- `test_fiscal_indicadores.py`
- `test_validaciones_fiscales.py`
- más suites de facturas, conciliación, health, storage, etc. (**22** archivos `test_*.py`)

Validación reciente de indicadores: **6 passed** (`test_fiscal_indicadores` + `test_fiscal_diferencias`).  
Build frontend: **Vite OK**.

---

## 4. Topología del monorepo

```text
proyecto-contabilidad/
├── AGENTS.md                          # Contrato de trabajo para agentes
├── README.md
├── docs/                              # Arquitectura, roadmap, cloud
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI, CORS, handlers, /health /ready
│   │   ├── api/v1/endpoints/          # Routers delgados
│   │   ├── core/                      # config, security, DB, tenancy, tarifas
│   │   ├── models/                    # ORM
│   │   ├── schemas/                   # Pydantic
│   │   ├── services/                  # Lógica de negocio
│   │   ├── ai/                        # Espacio IA (preparado)
│   │   └── tasks/                     # Celery preparado
│   ├── alembic/versions/              # 10 migraciones
│   ├── tests/
│   ├── Dockerfile                     # alembic upgrade head && uvicorn
│   ├── docker-compose.yml             # local
│   └── docker-compose.prod.yml        # EC2 + Caddy
├── frontend/
│   ├── public/sw.js                   # PWA cache versionada
│   ├── src/pages/                     # Login, Dashboard, CompanyDetail, Reportes
│   ├── src/components/                # Paneles de dominio
│   └── src/services/                  # api.js, backup local
├── infra/aws/                         # CloudFormation
├── scripts/
│   ├── deploy-aws.ps1
│   ├── publish-aws.ps1
│   └── verify-prod-migrations.sh
└── reportes REPORTE_TECNICO_*.md      # Bitácora de sesiones
```

### 4.1 Conteos aproximados (2026-10-01)

| Área | Cantidad |
|---|---:|
| Endpoints routers | 10 módulos en `api/v1/endpoints` |
| Services | 18+ módulos (+ `bank_parser/`) |
| Models | 11 módulos |
| Core | 12 módulos |
| Tests backend | 22 archivos |
| Migraciones Alembic | 10 |
| Páginas React | 5 |
| Componentes JSX | ~21 paneles/modales |

---

## 5. Backend — detalle técnico

### 5.1 Arranque y superficie HTTP

`backend/app/main.py`:

- Lifespan: en no-producción puede `create_all`; en producción **exige Alembic**.
- CORS configurable + regex localhost.
- Handlers: `SmartContableException`, `IntegrityError`, `SQLAlchemyError`, genérico.
- Router montado en **`/api/v1`**.
- Liveness: `GET /health`
- Readiness: `GET /ready` (SELECT 1)

### 5.2 Mapa de routers (`api/v1/router.py`)

| Prefix | Dominio |
|---|---|
| `/auth` | Login, JWT, recuperación local |
| `/empresas` | Multiempresa / tenancy |
| `/facturas` | CFDI I/E, upload ZIP/XML |
| `/cfdi-complementos` | Pagos, nómina, retenciones terceros |
| `/polizas` | Pólizas y movimientos |
| `/conciliacion` | Estados de cuenta / movimientos banco |
| `/fiscal` | ISR, IVA, DIOT, anual, historial, indicadores, etc. |
| `/configuracion` | Mapeos y reglas |
| `/reportes` | Informes y paquete fiscal |

### 5.3 Capa de servicios (núcleo reutilizable)

| Servicio | Responsabilidad reutilizable |
|---|---|
| `sat_parser.py` | Parseo defensivo de XML/CFDI |
| `file_storage.py` | Disco local vs S3 |
| `calculos_fiscales.py` | Motor de impuestos por reglas |
| `diot.py` | Agregación y export DIOT |
| `historial_declaraciones.py` | Versionado + bitácora |
| `fiscal_diferencias.py` | Triple comparación CFDI/pólizas/motor |
| `fiscal_indicadores.py` | KPIs de salud operativa |
| `cfdi_complementos.py` | Complementos de pago/nómina |
| `informes_contables.py` | Reportes contables |
| `conciliacion.py` + `bank_parser/` | Bancos y matching |
| `exportacion_empresa.py` | Export multi-artefacto |
| `clasificador.py` | Clasificación de conceptos |

### 5.4 Core transversal (copiar casi siempre)

| Módulo | Por qué es esqueleto |
|---|---|
| `config.py` | Settings tipados, validación SECRET_KEY/DEBUG |
| `database.py` | Engine + pool + `get_db` |
| `security.py` | JWT + password hashing |
| `dependencies.py` | Usuario actual |
| `permissions.py` / `tenancy_validators.py` | Aislamiento multiempresa |
| `exceptions.py` | Errores de dominio con código |
| `logging_config.py` | Logs estructurados |
| `tarifas_isr_oficiales.py` | Tablas oficiales versionadas por ejercicio |

### 5.5 Configuración sensible (env)

Obligatorias / críticas:

- `DATABASE_URL`
- `SECRET_KEY` (≥ 32)
- `ENVIRONMENT` / `DEBUG`
- `CORS_ORIGINS`
- `S3_ENABLED`, `S3_BUCKET`, `AWS_REGION`
- límites de upload (`MAX_*_UPLOAD_BYTES`)
- pool MySQL (`DATABASE_POOL_*`)

Nunca commitear `.env` (ignorado).

### 5.6 Modelos de dominio actuales

- Identidad: `usuario`
- Tenancy: `empresa` (+ opciones fiscales)
- Documentos: `factura`, complementos CFDI
- Contabilidad: `poliza`, `movimiento_poliza`, `mapeo_cuenta`
- Banco: `estado_cuenta_carga`, `movimiento_banco`, `comision_banco`
- Fiscal: `periodo_fiscal`, `operacion_fiscal`, `declaracion_fiscal`, `historial_fiscal`
- Ajustes: `pagos_provisionales_anteriores`, `perdidas_fiscales`

Convención de timestamps en fiscal nuevo: `creado_en` / `actualizado_en` (el AGENTS.md habla de `created_at`/`updated_at`; al clonar, unificar naming).

### 5.7 Dockerfile productivo (patrón clave)

```text
CMD: alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```

Esto garantiza que **cada redeploy de backend alinea el schema** antes de servir tráfico.

---

## 6. Frontend — detalle técnico

### 6.1 Stack UI

- React 19 + React Router 7
- Vite 8
- Tailwind 4
- Axios (interceptor JWT + snapshots locales)
- lucide-react, recharts, react-hot-toast
- pdfjs-dist, jszip
- PWA: `manifest.webmanifest` + `public/sw.js`

### 6.2 Páginas

| Página | Rol |
|---|---|
| `Login.jsx` | Auth |
| `Dashboard.jsx` | Home multiempresa |
| `CompanyDetail.jsx` | Hub por empresa (tabs de dominio) |
| `GlobalFacturas.jsx` | Vista global de CFDI |
| `Reportes.jsx` | Reportes |

### 6.3 Componentes de dominio (muestra)

- Fiscal: `FiscalConsolidadosPanel`, `DiotPanel`, `FiscalAnualPanel`, `HistorialDeclaracionesPanel`, `CfdiComplementosPanel`, `FiscalRegimenPanel`
- Contable: `PolizasPanel`, `InformesPanel`, `FacturaDetailModal`
- Banco: `ConciliacionBancariaPanel`, `ComisionesBancoPanel`, `LocalConciliacionPanel`
- Ops: `DeviceBackupPanel`, `ExportPreviewModal`, `ThemeToggle`

### 6.4 Cliente API

`frontend/src/services/api.js`:

- `baseURL = VITE_API_URL || http://localhost:8000/api/v1`
- Bearer desde `localStorage.token`
- 401 → logout a `/login`
- Snapshots opcionales a IndexedDB (`localBackup` / `backupCore`)

Producción Vercel:

```text
VITE_API_URL=https://3-12-148-63.nip.io/api/v1
```

### 6.5 PWA / cache busting

- Versionar `APP_VERSION` en cada release móvil relevante.
- SW **no** cachea `/api/*` (correcto para datos contables).
- Shell cacheada con nombre `smartcontable-app-{version}`.

Versión actual: **`2026.10.01.01`**.

---

## 7. Datos y migraciones

### 7.1 Política

- **Solo Alembic** para cambios de schema.
- Producción: no `create_all` como fuente de verdad.
- Multiempresa: casi toda entidad de negocio lleva `empresa_id` + validación de acceso.

### 7.2 Estado verificado

| Ambiente | Alembic |
|---|---|
| Local `sat_contabilidad` | `d3e4f5a6b7c8` |
| RDS producción | `d3e4f5a6b7c8` |

Tablas validadas en RDS: declaraciones, historial, cfdi_*, pagos provisionales, pérdidas, periodos, operaciones.

### 7.3 Script de verificación

`scripts/verify-prod-migrations.sh` — ejecutable vía SSM en EC2 para confirmar head + tablas + health interno.

---

## 8. Despliegue y operaciones

### 8.1 Diagrama de runtime beta

```text
[Celular / laptop]
        │ HTTPS
        ▼
   Vercel (SPA + SW)
        │ HTTPS API
        ▼
 Caddy (443) ──► FastAPI container :8000
                      │
                      ├── RDS MySQL :3306
                      └── S3 (archivos, si S3_ENABLED)
```

### 8.2 Artefactos cloud

- CloudFormation: `infra/aws/smartcontable.yaml`
- Publish: `scripts/publish-aws.ps1` (zip backend → S3 → SSM → compose up)
- Redeploy del 2026-10-01: SSM Success, container con `alembic upgrade…`
- Parámetros SSM: `/smartcontable/database-url`, `secret-key`, `s3-bucket`, `domain`

### 8.3 Checklist operativo pre-demo móvil

1. Vercel deploy del commit con `sw.js` nuevo (verde).
2. Backend health 200 y ready 200.
3. Alembic head en RDS.
4. CORS incluye origen Vercel.
5. Login real + empresa de prueba.
6. Abrir Fiscal → Salud / ISR / IVA / DIOT.
7. Si UI vieja: forzar update SW o limpiar datos del sitio.

---

## 9. Seguridad (estado y deudas)

### Implementado

- JWT Bearer
- Password hashing (bcrypt/passlib)
- SECRET_KEY mínima 32
- DEBUG prohibido en production settings
- Tenancy validators
- CORS allowlist
- Secrets fuera de git
- Errores genéricos en prod

### Deudas conscientes

- Capa `repositories/` declarada en AGENTS.md pero **poco usada** (queries aún en services/endpoints en varios sitios).
- Frontend tests mínimos (solo `backupCore.test.mjs`).
- Celery/Redis/OpenAI presentes en deps pero **no son el camino crítico beta**.
- Errores HTTP de exportación fiscal no siempre se bitacorean.
- Naming timestamps inconsistente (`creado_en` vs `created_at`).
- Health de API versionada no existe (`/api/v1/health` 404; usar `/health`).

---

## 10. Cómo usar este repo como esqueleto de un proyecto nuevo

### 10.1 Qué copiar tal cual (esqueleto genérico)

1. Estructura `backend/app/{api,core,models,schemas,services,main.py}`
2. Patrón FastAPI: routers delgados + services + exceptions + dependencies
3. Alembic + Dockerfile `upgrade head && uvicorn`
4. Settings Pydantic + validaciones de seguridad
5. Multiempresa (`empresa_id` + validators) si el producto es SaaS B2B
6. Frontend Vite/React: `api.js` interceptors, layout de páginas, Tailwind
7. PWA versionada
8. Scripts de publish/verify y cultura de `REPORTE_TECNICO_*.md`
9. `AGENTS.md` adaptado al dominio nuevo

### 10.2 Qué renombrar / vaciar

| Elemento SmartContable | Acción en proyecto nuevo |
|---|---|
| Dominio CFDI/SAT/pólizas/fiscal | Reemplazar por bounded contexts del nuevo producto |
| Modelos y migraciones históricas | Empezar migración `0001_initial` limpia o squash |
| Textos fiscales y tarifas ISR | Eliminar o aislar en paquete `mx_fiscal` si se reutiliza |
| Branding / Vercel project / nip.io | Nuevos |
| CORS y SSM parameter paths | Nuevos nombres de producto |
| OpenAI/Celery | Activar solo si el producto lo necesita |

### 10.3 Plantilla de “primer sprint” en un fork

1. Copiar monorepo → renombrar paquete/app.
2. Definir 2–3 entidades core + `empresa`/`usuario` si aplica.
3. Endpoint CRUD delgado + service + schema + test.
4. Página React + llamada Axios.
5. Migración Alembic + docker-compose local.
6. `/health` + `/ready`.
7. Deploy mínimo (Vercel FE + un host BE).
8. Primer `REPORTE_TECNICO` y actualizar arquitectura.

### 10.4 Anti-patrones a no heredar

- Lógica de negocio en JSX o en routers.
- SQL/DDL manual en producción.
- Commits con `.env`.
- Un solo “god file” tipo `CompanyDetail.jsx` sin extraer paneles (hoy ya hay paneles; al crecer, seguir extrayendo).
- Cachear API en service worker.
- Mezclar multi-tenant sin filtro `empresa_id`.

---

## 11. Métricas de calidad actuales (referencia)

| Señal | Estado |
|---|---|
| Capas backend | Buenas (API→service→ORM); repositories incompletos |
| Multiempresa | Presente y reforzado en fiscal |
| Migraciones | Cadena lineal a head `d3e4f5a6b7c8` |
| Tests backend | Cobertura crítica de dominio en crecimiento |
| Tests frontend | Débil |
| Observabilidad | Logs + health/ready; sin APM completo |
| IA | Dependencia y carpeta `ai/` listas; no núcleo beta |
| Documentación de sesión | Fuerte (reportes por fecha) |

---

## 12. Riesgos residuales antes de uso móvil masivo

1. **Datos de demo insuficientes** en prod → paneles vacíos no son bugs de schema.
2. **IP/nip.io** del backend puede cambiar si se recrea EC2 → actualizar `VITE_API_URL` y CORS.
3. **PWA sticky** en iOS/Android → bump de `APP_VERSION` obligatorio en cada release UX.
4. **Free tier AWS** — monitoreo de costo/cuota.
5. **Diferencias de schema local vs prod** — siempre verificar con `verify-prod-migrations.sh` tras publish.

---

## 13. Conclusión técnica

Al 2026-10-01 SmartContable es:

- un **producto beta usable** en móvil (FE Vercel + BE AWS + schema al día), y
- un **esqueleto de plataforma SaaS** con convenciones claras de capas, multiempresa, migraciones, PWA y despliegue.

Para nuevos proyectos, tratar este monorepo como **framework de entrega**, no como “código contable a forzar”. Extraer el armazón; reemplazar el dominio; conservar la disciplina de reportes, tests de servicios y Alembic en el arranque del contenedor.

---

## 14. Anexos rápidos

### Comandos locales útiles

```powershell
cd backend
.\venv\Scripts\python.exe -m alembic current
.\venv\Scripts\python.exe -m alembic upgrade head
.\venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm run build
```

### Endpoints de sanidad producción

```text
GET https://3-12-148-63.nip.io/health
GET https://3-12-148-63.nip.io/ready
GET https://3-12-148-63.nip.io/docs
```

### Commit de referencia del bloque fiscal

```text
d200794 feat: motor fiscal etapas 0-6, indicadores y bump PWA cache
```
