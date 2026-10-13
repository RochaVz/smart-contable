# SmartContable — Estructura del proyecto

> Mapa de carpetas y responsabilidades. Pensado como base para clonar la aplicación.
> Ver también: [ARQUITECTURA_APLICACION.md](./ARQUITECTURA_APLICACION.md) y [REPORTE_TECNICO_CLONACION.md](./REPORTE_TECNICO_CLONACION.md).

## 1. Vista general

Monorepo con dos aplicaciones independientes:

```text
proyecto-contabilidad/
├── AGENTS.md                 # Reglas del proyecto (stack, capas, convenciones)
├── README.md                 # Introducción y arranque rápido
├── FRONTEND_REORGANIZATION.md# Notas del refactor de navegación del frontend
├── render.yaml               # Blueprint alterno (Render) para el backend
├── .pylintrc                 # Configuración de lint Python
├── backend/                  # API FastAPI (Python 3.13)
├── frontend/                 # SPA React + Vite + Tailwind (PWA)
├── docs/                     # Documentación técnica y operativa
└── .azure/                   # Plan de despliegue Azure (opcional)
```

## 2. Backend (`backend/`)

```text
backend/
├── Dockerfile                # python:3.13-slim; corre `alembic upgrade head` y luego uvicorn
├── docker-compose.yml        # Desarrollo local
├── docker-compose.prod.yml   # Producción: backend + Caddy (HTTPS)
├── Caddyfile                 # Reverse proxy → backend:8000 (dominio nip.io)
├── alembic.ini / alembic/    # Migraciones de esquema (versions/*.py)
├── pytest.ini
├── requirements.txt          # Dependencias fijadas
├── .env.example              # Plantilla de variables (sin secretos)
├── prueba_datos.py           # Script auxiliar de datos de prueba
├── tests/                    # Pruebas pytest (≈25 archivos)
└── app/
    ├── main.py               # App FastAPI, CORS, manejadores de error, /health y /ready
    ├── api/v1/
    │   ├── router.py         # Registro de routers bajo /api/v1
    │   └── endpoints/        # auth, empresas, facturas, cfdi_complementos, conciliacion,
    │                         # configuracion, fiscal, polizas, reportes
    ├── core/                 # config, database, security (JWT/bcrypt), dependencies,
    │                         # permissions (roles), tenancy_validators (aislamiento por empresa),
    │                         # exceptions, validators, logging_config,
    │                         # sat_fiscal, tarifas_isr_oficiales, bancos
    ├── models/               # ORM SQLAlchemy (ver sección 4 de la arquitectura)
    ├── schemas/              # Modelos Pydantic de entrada/salida
    ├── services/             # Lógica de negocio (ver tabla abajo)
    │   └── bank_parser/      # Parsers de estados de cuenta (base, bbva, generic, factory, analyzer)
    ├── ai/
    │   └── bank_statement_agent.py  # Extracción de movimientos de PDF con OpenAI (gpt-4o-mini)
    └── tasks/                # Reservado para procesos asíncronos (Celery/Redis declarados)
```

### Servicios (`app/services/`)

| Servicio | Responsabilidad |
|---|---|
| `sat_parser.py`, `cfdi_helpers.py` | Parseo/validación de XML CFDI 4.0 (UUID, emisor/receptor, impuestos, conceptos) |
| `cfdi_complementos.py` | Complementos de pago, nómina y retenciones |
| `clasificador.py` | Clasificación automática de comprobantes/cuentas por reglas |
| `polizas.py` | Generación de pólizas (automática, desde factura, desde movimiento bancario) |
| `conciliacion.py`, `estados_cuenta.py`, `estados_cuenta_validacion.py` | Carga de estados de cuenta y conciliación automática/manual |
| `comisiones.py` | Comisiones bancarias configurables |
| `calculos_fiscales.py` | ISR, IVA, IEPS, pagos provisionales, anual |
| `fiscal_diferencias.py`, `fiscal_indicadores.py`, `validaciones_fiscales.py` | Diferencias, indicadores y validaciones fiscales |
| `resumen_fiscal_sat.py`, `historial_declaraciones.py` | Resumen SAT y versionado de declaraciones |
| `diot.py` | Generación/exportación DIOT |
| `informes_contables.py` | Informes contables (balanza, estado de resultados, etc.) |
| `exportacion_empresa.py`, `purga_datos.py` | Exportación y purga de datos por empresa |
| `file_storage.py` | Almacenamiento local o S3 de archivos (`S3_ENABLED`) |

## 3. Frontend (`frontend/`)

```text
frontend/
├── index.html                # Entrada; favicon con ?v= (versión PWA)
├── vite.config.js, eslint.config.js, postcss.config.js, tailwind.config.js
├── vercel.json               # Rewrite SPA → /index.html
├── package.json              # Scripts: dev, build, lint, preview, test
├── .env.example              # VITE_API_URL
├── public/
│   ├── sw.js                 # Service Worker (APP_VERSION)
│   └── manifest.webmanifest  # Manifiesto PWA
└── src/
    ├── main.jsx              # Arranque, registro de SW, recarga en `controllerchange`
    ├── App.jsx               # Router y rutas protegidas por token
    ├── index.css             # Tailwind + utilidades (btn-physical, hub-accent-*, btn-ui)
    ├── pages/
    │   ├── Login.jsx
    │   ├── Dashboard.jsx     # Hub de empresas (degradado azul, respaldos al final)
    │   ├── CompanyDetail.jsx # Contenedor de empresa: módulos, inteligencia, informes, config
    │   ├── GlobalFacturas.jsx
    │   └── Reportes.jsx
    ├── navigation/
    │   ├── executive.js      # SIDEBAR_SECTIONS, INTELIGENCIA_CATEGORIAS, INFORMES, hubPath…
    │   ├── companyHub.js
    │   └── executive.test.mjs
    ├── components/
    │   ├── executive/        # ExecutiveDashboard, KpiCard, paneles de salud, InformesView…
    │   ├── ui/               # Button y primitivas
    │   └── *.jsx             # Paneles de dominio (Polizas, Conciliación, Diot, Fiscal*, Cfdi…),
    │                         # modales (FileUpload, ClassifyModal, NewCompany…), DeviceBackupPanel
    ├── hooks/                # useExecutiveData, useExecutiveSnapshot
    ├── services/
    │   ├── api.js            # Instancia axios (token + snapshot local + manejo 401)
    │   ├── localBackup.js    # Respaldo local (IndexedDB); empresas `local-*`
    │   ├── backupCore.js     # Formato/serialización de respaldos (ZIP)
    │   └── conciliacionService.js
    └── utils/                # csv, download, facturas, financialHealth, format (+ tests .mjs)
```

### Rutas del frontend

| Ruta | Vista |
|---|---|
| `/login` | Inicio de sesión / registro |
| `/dashboard` | Lista de empresas y respaldos |
| `/empresa/:id` | Dashboard ejecutivo de la empresa |
| `/empresa/:id/modulos/:moduloId` | Módulos: `documentos` (CFDI), `polizas`, `conciliacion`, `fiscal`… |
| `/empresa/:id/reportes/:reporteId` | Reportes (ingresos/egresos abren el historial CFDI filtrado) |
| `/empresa/:id/inteligencia[/:categoria]` | Centro de Inteligencia Financiera |
| `/empresa/:id/informes[/:informe]` | Informes fiscales y contables |
| `/empresa/:id/configuracion` | Configuración de la empresa |

## 4. Documentación existente (`docs/`)

`ARCHITECTURE.md`, `ARQUITECTURA_DETALLADA_ESQUELETO.md`, `API_REFERENCE.md`, `DATABASE.md`,
`REPORTE_TECNICO_DEPLOYMENT_VERCEL_AWS.md`, `REPORTE_TECNICO_DOCKER_LOCAL.md`, `PWA_BETA_SIN_CLOUD.md`,
`ROADMAP*.md`, `IMPLEMENTATION_PLAN.md`, `PRODUCT_VISION.md`, `SMARTCONTABLE_MASTER.md`, `ORACLE_*`.
Los reportes fechados en la raíz (`REPORTE_TECNICO_DETALLADO*.md`) son históricos.
