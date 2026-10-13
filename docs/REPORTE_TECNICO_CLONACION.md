# SmartContable — Reporte técnico detallado (guía de clonación)

> Bases para clonar y levantar la aplicación desde cero. Estado documentado: commit `134f736`, PWA `2026.10.11.01`.
> Ver [ESTRUCTURA_PROYECTO.md](./ESTRUCTURA_PROYECTO.md) y [ARQUITECTURA_APLICACION.md](./ARQUITECTURA_APLICACION.md).

## 1. Stack y versiones

| Capa | Tecnología |
|---|---|
| Backend | Python 3.13, FastAPI 0.136, Uvicorn 0.46, SQLAlchemy 2.0, Alembic 1.18, Pydantic 2.13 / pydantic-settings |
| Base de datos | MySQL compatible (RDS, TiDB Cloud Free) vía PyMySQL; SQLite posible en desarrollo |
| Auth | JWT (python-jose, HS256), bcrypt/passlib |
| CFDI/SAT | lxml, defusedxml, xmltodict, cfdiclient, sat-ws |
| PDF/Reportes | pymupdf, pdfplumber, reportlab, openpyxl |
| IA | openai 2.x (`gpt-4o-mini`) para extraer movimientos de PDF |
| Async (declarado) | celery, redis (carpeta `tasks/` aún sin tareas) |
| Almacenamiento | Local (`/app/data`) o S3 (`boto3`) |
| Frontend | React 19, Vite 8, Tailwind 4, react-router 7, axios, recharts, lucide-react, react-hot-toast, jszip, pdfjs-dist |
| Infra | Vercel (frontend), AWS EC2 + Docker + Caddy + RDS (backend); alterno Render / Oracle Cloud |

## 2. Requisitos previos

Git, Python 3.13+, Node 20+ (recomendado 22), MySQL 8 (o cuenta TiDB/RDS), Docker (opcional).

## 3. Variables de entorno (sin valores secretos)

### Backend (`backend/.env`, plantilla en `.env.example`)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | `mysql+pymysql://USUARIO:PASSWORD@HOST:PUERTO/BASE` (o `sqlite:///./data/smartcontable.db`) |
| `SECRET_KEY` | Sí | ≥ 32 caracteres aleatorios |
| `LOCAL_PASSWORD_RESET_KEY` | No | Clave de recuperación local de contraseña |
| `ALGORITHM` / `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `HS256` / `480` |
| `ENVIRONMENT` / `DEBUG` | No | `development`\|`production` / `false` (debe ser false en producción) |
| `CORS_ORIGINS` | Sí en prod | Lista separada por comas o JSON con el dominio del frontend |
| `MAX_XML_UPLOAD_BYTES`, `MAX_ZIP_UPLOAD_BYTES`, `MAX_XML_FILES_PER_ZIP`, `MAX_PDF_UPLOAD_BYTES` | No | Límites de carga (2 MB / 25 MB / 1000 / 10 MB) |
| `DATABASE_POOL_SIZE`, `DATABASE_MAX_OVERFLOW`, `DATABASE_POOL_TIMEOUT_SECONDS` | No | Pool (5 / 0 / 30) |
| `S3_ENABLED`, `S3_BUCKET`, `AWS_REGION` | No | Almacenamiento S3 (credenciales AWS por rol IAM o entorno) |
| `OPENAI_API_KEY` | Solo si se usa IA | Extracción de estados de cuenta con IA |
| `REDIS_URL` | No | Reservado para Celery |

### Frontend (`frontend/.env`)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL del API, p. ej. `http://localhost:8000/api/v1` (en producción, `https://<host>/api/v1`) |

> Nunca versionar `.env`, `.env.production`, claves, credenciales SAT ni datos de clientes.

## 4. Puesta en marcha local

### Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env        # editar DATABASE_URL, SECRET_KEY, CORS_ORIGINS
alembic upgrade head               # crea/actualiza el esquema
uvicorn app.main:app --reload --port 8000
```
Verificar: `http://localhost:8000/health`, `/ready` y `/docs`.

### Frontend
```powershell
cd frontend
npm install
Copy-Item .env.example .env        # VITE_API_URL
npm run dev                        # http://localhost:5173
```

### Docker (backend)
```powershell
cd backend
docker compose up --build          # desarrollo
```
El `Dockerfile` ejecuta `alembic upgrade head` y arranca uvicorn en `${PORT:-8000}`.

## 5. Pruebas y calidad

| Comando | Alcance |
|---|---|
| `cd backend; pytest` | ≈25 archivos: parsers bancarios, cálculos fiscales, DIOT, conciliación, CFDI, exportación, límites de carga, pool DB, health |
| `cd frontend; npm test` | `node --test "src/**/*.test.mjs"` (77 pruebas: navegación, respaldo, finanzas, formato) |
| `cd frontend; npm run build` | Build de producción (`dist/`) |
| `cd frontend; npm run lint` | ESLint (existen 7 errores previos en componentes no relacionados; usar lint focalizado en archivos tocados) |

## 6. Despliegue

### Frontend → Vercel
Proyecto `smart-contable`, **Root Directory** `frontend`, build `npm run build`, output `dist`,
variable `VITE_API_URL` apuntando al backend. `vercel.json` reescribe todas las rutas a `index.html`.
Push a `main` dispara el deploy automático.

### Backend → AWS EC2 (Docker + Caddy)
1. Crear `backend/.env.production` (mismas variables, `ENVIRONMENT=production`).
2. Editar `Caddyfile` con el dominio (`<IP>.nip.io` o dominio propio).
3. `docker compose -f docker-compose.prod.yml up -d --build`; Caddy emite el certificado HTTPS.
4. Abrir puertos 80/443 en el Security Group y permitir EC2 → RDS (3306).
5. Añadir el dominio de Vercel a `CORS_ORIGINS`.

Alternativas: `render.yaml` (Render, `healthCheckPath: /ready`) y guías `ORACLE_*` / `REPORTE_TECNICO_DEPLOYMENT_VERCEL_AWS.md`.

### Publicar una nueva versión del frontend (PWA)
Subir la versión en `public/sw.js` (`APP_VERSION`), `index.html` (`?v=`) y `public/manifest.webmanifest`
para invalidar caché; el cliente recarga al detectar `controllerchange`.

## 7. Pasos para clonar como producto nuevo

1. Copiar el repositorio (`git clone` + eliminar historial si se desea) y renombrar marca (`SmartContableMark.jsx`, `index.html`, `manifest`, títulos en `main.py`).
2. Crear nueva base de datos y ejecutar `alembic upgrade head`.
3. Generar un `SECRET_KEY` nuevo y configurar CORS/URLs propias.
4. Crear nuevo proyecto Vercel y nueva instancia/servicio de backend.
5. Revisar `.azure/`, `render.yaml`, `Caddyfile` y `docs/ORACLE_*` para sustituir dominios, regiones e IDs.
6. Ejecutar pruebas (`pytest`, `npm test`) antes de abrir a usuarios.

## 8. Funcionalidad implementada (resumen)

Autenticación y recuperación; multiempresa; carga XML/ZIP de CFDI 4.0; complementos de pago, nómina y retenciones;
pólizas automáticas/manuales; conciliación bancaria (parsers + IA); cálculos ISR/IVA/IEPS, anual, pagos provisionales,
pérdidas; declaraciones versionadas con historial; DIOT; diferencias e indicadores fiscales; informes contables y KPIs;
exportación/purga por empresa; respaldo local offline (IndexedDB/ZIP); PWA.

## 9. Deuda técnica y riesgos conocidos

- Falta la capa `repositories/` y tareas reales en `tasks/` (Celery/Redis sin uso).
- `CompanyDetail.jsx` es muy grande; conviene dividirlo por vistas.
- Lint global del frontend con 7 errores previos.
- Reportes fechados en la raíz y varios docs pueden estar desactualizados frente a este documento.
- Integración SAT directa (descarga masiva con e.firma) y SmartContable AI avanzada siguen en roadmap ([ROADMAP.md](./ROADMAP.md)).
- Verificar manualmente el último deploy de Vercel (no confirmado desde esta sesión).

## 10. Roadmap prioritario (de `AGENTS.md`)

Dockerización → pruebas automatizadas → multiempresa → integración SAT → SmartContable AI → conciliación avanzada → reportes financieros inteligentes.
