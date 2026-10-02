# SmartContable - Reporte de tecnologias, librerias y herramientas

## 1. Proposito del documento

Este documento describe el stack tecnico real de SmartContable para:

- Incorporar nuevos ingenieros al proyecto.
- Entender por que existe cada tecnologia.
- Identificar los puntos de integracion entre frontend, backend, base de datos y despliegue.
- Facilitar mantenimiento, depuracion y decisiones futuras.
- Servir como material de aprendizaje para proyectos SaaS contables y fiscales.

El inventario se elaboro a partir de `backend/requirements.txt`, `frontend/package.json`,
configuraciones Docker/Vite/Render/Vercel y la estructura actual del codigo.

---

## 2. Resumen arquitectonico

```text
Usuario / navegador
        |
        v
React + Vite + Tailwind + Axios
        |
        | HTTP/JSON + JWT Bearer
        v
FastAPI /api/v1
        |
        v
Servicios de dominio
        |
        v
SQLAlchemy ORM + Alembic
        |
        v
MySQL 8.4

Almacenamiento adicional:
- IndexedDB para modo local y respaldos del navegador.
- S3 opcional para archivos originales.
- Redis/Celery preparado para tareas asincronas.
```

La arquitectura sigue una separacion aproximada:

```text
Frontend
  -> API routers
      -> validaciones y dependencias
          -> services
              -> models/ORM
                  -> MySQL
```

La logica de negocio no debe colocarse directamente en los componentes React ni en
los endpoints FastAPI. Los endpoints reciben, validan, delegan y responden.

---

## 3. Matriz general del stack

| Capa | Tecnologia | Version declarada | Funcion |
|---|---|---:|---|
| Lenguaje backend | Python | 3.13 en Docker | Servicios, calculos fiscales y procesamiento |
| API backend | FastAPI | 0.136.1 | API REST, OpenAPI y dependencias |
| Servidor ASGI | Uvicorn | 0.46.0 | Ejecutar FastAPI |
| Framework frontend | React | 19.2.6 | Interfaz de usuario |
| Bundler frontend | Vite | 8.0.12 | Desarrollo, build y HMR |
| Estilos | Tailwind CSS | 4.3.0 | Utilidades visuales |
| Base de datos | MySQL | 8.4 en Docker | Persistencia relacional |
| ORM | SQLAlchemy | 2.0.49 | Modelos y consultas |
| Migraciones | Alembic | 1.18.4 | Evolucion controlada del esquema |
| Validacion | Pydantic | 2.13.3 | Schemas, parametros y configuracion |
| Autenticacion | JWT / python-jose | 3.5.0 | Tokens de acceso |
| Hash de password | bcrypt / passlib | bcrypt 5.0.0 | Proteccion de contrasenas |
| XML fiscal | lxml, defusedxml, cfdiclient, sat-ws | declaradas | CFDI y comunicacion SAT |
| PDF | PyMuPDF, pdfplumber, pdfminer.six | declaradas | Estados de cuenta y documentos |
| Excel | openpyxl | 3.1.5 | Lectura/generacion de hojas de calculo |
| PDF generado | ReportLab | 4.5.0 | Reportes PDF |
| Cliente HTTP | httpx, requests | declaradas | Integraciones externas |
| IA | OpenAI | 2.54.0 | Servicios de inteligencia artificial |
| Tareas | Celery + Redis | Celery 5.6.3 | Procesamiento asincrono preparado |
| Cloud SDK | boto3 | 1.43.83 | AWS/S3 y servicios AWS |
| Testing | pytest, pytest-asyncio | declaradas | Pruebas backend |
| Lint frontend | ESLint | 10.3.0 | Calidad estatica JavaScript/JSX |
| Iconografia | lucide-react | 1.16.0 | Iconos de interfaz |
| Graficas | Recharts | 3.8.1 | Visualizaciones |
| Archivos locales | JSZip, DOMParser, IndexedDB | JSZip 3.10.1 | CFDI local y respaldos |
| Hosting frontend | Vercel | configurado | SPA y despliegue frontend |
| Hosting backend | Render/Docker | render.yaml | API containerizada |

---

## 4. Backend Python

### 4.1 FastAPI

FastAPI es el framework HTTP principal. Se usa para:

- Crear routers por dominio.
- Inyectar sesiones SQLAlchemy con `Depends`.
- Inyectar el usuario actual mediante JWT.
- Generar documentacion OpenAPI/Swagger.
- Validar parametros con Pydantic.
- Exponer health checks.

Rutas principales:

| Prefijo | Responsabilidad |
|---|---|
| `/api/v1/auth` | Registro, login y autenticacion |
| `/api/v1/empresas` | Empresas, ownership y configuracion fiscal |
| `/api/v1/facturas` | Carga y consulta de CFDI |
| `/api/v1/fiscal` | Periodos, operaciones, IVA e ISR informativos |
| `/api/v1/polizas` | Polizas y movimientos contables |
| `/api/v1/reportes` | Informes financieros y fiscales |
| `/api/v1/conciliacion` | Conciliacion bancaria |
| `/api/v1/configuracion` | Mapeos de cuentas y bancos |

Puntos de entrada:

- `backend/app/main.py`
- `backend/app/api/v1/router.py`

Health checks:

- `GET /health`: liveness basico.
- `GET /ready`: verifica conectividad con la base de datos.

### 4.2 Uvicorn y ASGI

Uvicorn ejecuta la aplicacion ASGI:

```bash
uvicorn app.main:app --reload
```

En Docker de produccion se ejecuta despues de migrar:

```bash
alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### 4.3 Pydantic y pydantic-settings

Pydantic se usa para:

- Validar cuerpos de entrada.
- Convertir tipos.
- Definir respuestas.
- Validar periodos y parametros fiscales.
- Leer variables de entorno mediante `Settings`.

Variables criticas:

- `DATABASE_URL`
- `SECRET_KEY`
- `ENVIRONMENT`
- `DEBUG`
- `CORS_ORIGINS`
- Limites de XML, ZIP y PDF.
- `REDIS_URL`
- `S3_ENABLED`, `S3_BUCKET`, `AWS_REGION`.

Reglas de seguridad incorporadas:

- `SECRET_KEY` exige al menos 32 caracteres.
- `DATABASE_URL` es obligatoria.
- `DEBUG=true` se rechaza en produccion.
- CORS se normaliza desde lista, JSON o cadena separada por comas.

Archivo de referencia: `backend/app/core/config.py`.

---

## 5. Persistencia y datos

### 5.1 SQLAlchemy 2

SQLAlchemy es el ORM. Los modelos se encuentran en:

- `backend/app/models/empresa.py`
- `backend/app/models/usuario.py`
- `backend/app/models/factura.py`
- `backend/app/models/poliza.py`
- `backend/app/models/conciliacion.py`
- `backend/app/models/fiscal.py`
- `backend/app/models/mapeo_cuenta.py`
- `backend/app/models/comision_banco.py`

Entidades fiscales recientes:

- `PeriodoFiscal`.
- `OperacionFiscal`.

Principios de datos:

- Toda entidad de negocio debe pertenecer a una empresa.
- La empresa pertenece a un usuario.
- Las relaciones se expresan con claves foraneas.
- Las restricciones unicas deben considerar el tenant cuando aplique.
- Las operaciones fiscales conservan su origen: CFDI, poliza o captura manual.

### 5.2 PyMySQL

PyMySQL es el driver utilizado para conectar SQLAlchemy con MySQL.

Desarrollo local:

```text
MySQL Docker: localhost:3307
Base: smart_contable
Usuario: smartcontable
```

Nunca usar las credenciales de Docker local en produccion.

### 5.3 Alembic

Alembic controla la evolucion del esquema. Las migraciones se encuentran en:

`backend/alembic/versions/`

La cabeza actual del modelo fiscal es:

```text
a8c7d6e5f4b3_add_fiscal_model.py
```

Flujo recomendado:

```bash
cd backend
alembic current
alembic heads
alembic upgrade head
```

No modificar tablas manualmente en produccion. Toda alteracion debe tener migracion
reversible cuando sea posible.

### 5.4 IndexedDB

El frontend usa IndexedDB para modo local y respaldos:

- Base: `smartcontable-local-vault`.
- Stores: `snapshots`, `meta`, `companies`, `invoices`, `bankMovements`.
- Implementacion: `frontend/src/services/localBackup.js`.

IndexedDB es apropiado para datos estructurados y volumen mayor que localStorage.
La aplicacion excluye el token JWT de los respaldos.

---

## 6. Seguridad

### 6.1 JWT

La autenticacion usa:

- `python-jose` para tokens.
- `bcrypt` y `passlib` para passwords.
- `Authorization: Bearer <token>` en llamadas frontend.
- Interceptor Axios para adjuntar el token.

El frontend elimina el token y redirige a login si recibe `401`.

### 6.2 Multiempresa

La pertenencia se valida en backend, no solo en UI. El helper principal es:

`backend/app/core/tenancy_validators.py`

Debe usarse antes de consultar o modificar empresas, facturas, polizas y datos
fiscales. La regla es:

```text
usuario actual -> empresa propia -> recurso perteneciente a esa empresa
```

### 6.3 Errores

`backend/app/main.py` registra handlers globales para:

- Excepciones de negocio.
- Errores de integridad.
- Errores SQLAlchemy.
- Excepciones inesperadas.

En produccion no se deben devolver detalles SQL ni trazas internas.

### 6.4 Rate limiting

`slowapi` esta declarado como dependencia y preparado para limitar endpoints sensibles,
especialmente login y recuperacion de password. Debe verificarse su activacion completa
antes de declarar este control como productivo.

---

## 7. Procesamiento fiscal y documental

### 7.1 CFDI y XML

Librerias:

- `lxml`: parsing XML de alto rendimiento.
- `defusedxml`: parsing defensivo contra XML malicioso.
- `xmltodict`: conversion XML/diccionario cuando conviene.
- `cfdiclient` y `sat-ws`: integraciones relacionadas con SAT.

El parser interno extrae, entre otros:

- UUID.
- Tipo de comprobante.
- RFC emisor y receptor.
- Fechas.
- Subtotal y total.
- IVA trasladado.
- IVA retenido.
- ISR retenido.
- Conceptos.
- Impuestos locales.

Los XML cargados deben validarse antes de crear facturas o polizas.

### 7.2 PDF

Librerias:

- `PyMuPDF`: lectura y procesamiento PDF.
- `pdfplumber`: extraccion de texto/tablas.
- `pdfminer.six`: soporte de parsing de PDF.
- `Pillow`: manejo de imagenes cuando el flujo lo necesita.

Se usan principalmente para estados de cuenta y conciliacion bancaria.

### 7.3 Excel y PDF de salida

- `openpyxl`: hojas Excel.
- `reportlab`: documentos PDF.

El frontend tambien genera CSV para reportes interactivos. La exportacion oficial SAT
requiere layouts y validaciones especificas; no debe confundirse con un CSV generico.

---

## 8. Frontend React

### 8.1 React y React DOM

React 19 organiza la UI en paginas y componentes:

- `frontend/src/pages/`: vistas principales.
- `frontend/src/components/`: componentes reutilizables.
- `frontend/src/services/`: API y persistencia local.
- `frontend/src/utils/`: descarga y CSV.

Entrada:

`frontend/src/main.jsx`

La app usa `StrictMode` y registra el service worker despues de cargar.

### 8.2 React Router

`react-router-dom` administra rutas como:

- Login.
- Dashboard.
- Detalle de empresa.
- Reportes.
- Facturas globales.

Los parametros de consulta se usan para sincronizar seccion y tab en el detalle de
empresa, lo que permite URLs reproducibles para navegacion y soporte.

### 8.3 Axios

Axios es el cliente HTTP. El interceptor:

- Agrega el JWT.
- Detecta `401`.
- Guarda snapshots JSON permitidos en IndexedDB.
- Evita guardar respuestas binarias y auth.

Archivo: `frontend/src/services/api.js`.

### 8.4 Vite

Vite proporciona:

- Servidor de desarrollo.
- HMR.
- Build de produccion.
- Integracion React mediante `@vitejs/plugin-react`.
- Code splitting manual para React y Axios.

Comandos:

```bash
npm run dev
npm run build
npm run preview
```

### 8.5 Tailwind CSS

Tailwind se carga mediante PostCSS y se usa principalmente con clases utilitarias.
La configuracion esta en:

- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `frontend/src/index.css`

El proyecto tiene un tema oscuro base y overrides para tema claro. Los cambios visuales
deben conservar responsive y no crear superficies excesivamente anidadas.

### 8.6 Iconos, notificaciones y graficas

- `lucide-react`: iconos coherentes en botones y controles.
- `react-hot-toast`: feedback de operaciones.
- `recharts`: graficas en escritorio y pantallas amplias.
- HTML/CSS: fallback para visualizaciones moviles cuando una grafica no es estable.

---

## 9. PWA y modo offline/local

Tecnologias:

- Service Worker nativo.
- Web App Manifest.
- IndexedDB.
- `DOMParser` para XML local.
- `JSZip` para ZIP local.
- `pdfjs-dist` para lectura PDF en navegador.

El service worker:

- Versiona el cache de app shell.
- Limpia caches anteriores.
- Excluye API y respuestas sensibles del cache.
- Soporta fallback SPA.
- Fuerza actualizacion mediante `controllerchange`.

El modo local permite:

- Crear una empresa local.
- Importar XML/ZIP sin backend.
- Revisar facturas e informes locales.
- Guardar movimientos bancarios locales.
- Descargar y restaurar respaldo JSON.

Limitacion: el respaldo actual aun no reconstruye polizas remotas como entidades
contables editables.

---

## 10. Procesamiento asincrono e integraciones externas

### Celery y Redis

Dependencias declaradas:

- `celery`.
- `redis`.
- `kombu`.
- `amqp`.
- `billiard`.
- `vine`.

Objetivo arquitectonico:

- Procesar lotes grandes de CFDI fuera del request.
- Ejecutar conciliacion o tareas programadas.
- Desacoplar trabajos pesados del servidor HTTP.

Antes de usarlo en produccion deben definirse workers, colas, reintentos, idempotencia,
observabilidad y manejo de errores permanentes.

### OpenAI

`openai` esta declarado para funciones de IA dentro de `backend/app/ai/`.
Las claves deben permanecer en variables de entorno. Los prompts deben mantenerse
separados de endpoints y servicios fiscales.

### AWS y S3

`boto3` y configuraciones `S3_ENABLED`, `S3_BUCKET` y `AWS_REGION` preparan almacenamiento
externo de archivos originales. El flujo debe conservar metadata, ownership, permisos
privados y politicas de retencion.

---

## 11. Calidad y pruebas

### Backend

Herramientas:

- `pytest`.
- `pytest-asyncio`.
- Python virtual environment.

Comando de pruebas focalizadas:

```bash
cd backend
..\backend\venv\Scripts\python.exe -m pytest tests/test_calculos_fiscales.py tests/test_informes_contables.py -q
```

Las pruebas deben priorizar:

1. Services y calculos.
2. Repositories y consultas.
3. Endpoints y permisos.
4. Flujos de importacion/exportacion.

### Frontend

Herramientas:

- ESLint.
- `eslint-plugin-react-hooks`.
- `eslint-plugin-react-refresh`.
- `@eslint/js`.

Comandos:

```bash
cd frontend
npm run lint
npm run build
```

### Validacion de cambios

Antes de publicar:

```bash
git diff --check
```

Debe revisarse tambien que no existan secretos, archivos `.env`, dumps SQL o artefactos
de build en el commit.

---

## 12. Contenedores y despliegue

### Docker

El backend usa `python:3.13-slim`.

El Dockerfile instala dependencias del sistema para XML/PDF, instala requirements,
crea `/app/data` y ejecuta migraciones antes de arrancar Uvicorn.

Desarrollo local:

```bash
cd backend
docker compose up --build
```

Servicios locales:

- MySQL 8.4 en puerto host `3307`.
- Backend FastAPI en puerto `8000`.

### Render

`render.yaml` define el backend como servicio Docker:

- Plan free.
- Root directory `backend`.
- Health check `/ready`.
- Auto deploy desactivado en la configuracion actual.
- Secretos y `DATABASE_URL` como variables no sincronizadas.

### Vercel

`frontend/vercel.json` reescribe todas las rutas hacia `index.html`, necesario para
React Router en una SPA.

El frontend se construye con `npm run build` y Vercel sirve el resultado.

---

## 13. Estructura recomendada para nuevos ingenieros

```text
backend/app/
├── api/          Routers HTTP y endpoints
├── core/         Configuracion, seguridad, tenancy, errores
├── models/       Entidades SQLAlchemy
├── schemas/      Contratos Pydantic
├── services/     Logica de negocio y calculos
├── tasks/        Trabajos asincronos
└── ai/           Agentes, prompts y servicios de IA

frontend/src/
├── components/   UI reutilizable
├── pages/        Vistas y flujos principales
├── services/     Axios, IndexedDB y APIs
├── utils/        Descargas y transformaciones
├── App.jsx       Routing y composicion principal
└── index.css     Base visual y temas
```

Regla practica para ubicar cambios:

- Si recibe HTTP: `api`.
- Si valida forma de datos: `schemas`.
- Si calcula o decide: `services`.
- Si representa una tabla: `models`.
- Si es UI reutilizable: `components`.
- Si persiste localmente: `services/localBackup.js`.
- Si cambia esquema: migracion Alembic.

---

## 14. Riesgos y deuda tecnica

### Alta prioridad

- Completar exportacion/restauracion de polizas y movimientos contables.
- Crear pruebas automatizadas de respaldo cruzado entre equipos.
- Implementar CI para backend, frontend, lint, build y migraciones.
- Versionar tarifas fiscales oficiales por ejercicio.
- Completar DIOT y declaracion anual con revision contable.

### Media prioridad

- Confirmar uso real de Celery/Redis y evitar dependencias preparadas sin worker.
- Revisar dependencias transitivas y vulnerabilidades periodicamente.
- Separar requirements directos de un lockfile reproducible.
- Agregar pruebas de contrato de API.
- Medir consultas N+1 y rendimiento de reportes.

### Baja prioridad

- Unificar idioma y convenciones de nombres.
- Reemplazar comentarios historicos extensos por documentacion centralizada.
- Consolidar scripts de desarrollo Windows/Linux.

---

## 15. Guia de onboarding tecnico

1. Leer `AGENTS.md` y este documento.
2. Instalar Python 3.13+ y Node.js compatible con Vite.
3. Crear/activar el entorno virtual backend.
4. Instalar `backend/requirements.txt`.
5. Instalar `frontend/package.json` con `npm install`.
6. Configurar `.env` sin commitearlo.
7. Levantar MySQL con Docker Compose.
8. Aplicar `alembic upgrade head`.
9. Ejecutar backend y frontend por separado.
10. Ejecutar pruebas focalizadas.
11. Revisar Swagger en `/docs`.
12. Probar un flujo completo: login, empresa, CFDI, poliza, reporte y exportacion.
13. Verificar aislamiento con dos usuarios.
14. Ejecutar build antes de abrir Pull Request.

---

## 16. Checklist para Pull Request

- [ ] El cambio tiene una responsabilidad clara.
- [ ] No mezcla logica de negocio con UI o endpoint.
- [ ] Incluye pruebas cuando modifica calculos, datos o permisos.
- [ ] La migracion Alembic esta incluida si cambia el modelo.
- [ ] Se reviso aislamiento por empresa/usuario.
- [ ] No incluye secretos ni archivos locales.
- [ ] `pytest` focalizado pasa.
- [ ] `npm run lint` focalizado pasa.
- [ ] `npm run build` pasa.
- [ ] `git diff --check` pasa.
- [ ] La documentacion y el roadmap reflejan el cambio.

---

## 17. Principios de aprendizaje

SmartContable es tambien un proyecto de aprendizaje. Cada implementacion debe
responder estas preguntas:

1. Que problema de usuario resuelve?
2. En que capa vive la responsabilidad?
3. Cual es la fuente de verdad del dato?
4. Como se valida el aislamiento multiempresa?
5. Que ocurre si el proceso falla a mitad?
6. Como se puede probar sin depender de servicios externos?
7. Como se migra o respalda la informacion?
8. Que supuestos fiscales o tecnicos deben hacerse visibles?
9. Como se observara en produccion?
10. Que parte se podria reutilizar en otro proyecto?

La calidad profesional no es solo agregar funcionalidades: es poder explicar sus
fronteras, sus fallos, sus pruebas y sus decisiones.
