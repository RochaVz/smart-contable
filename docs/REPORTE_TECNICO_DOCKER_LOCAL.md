# Reporte Tecnico: Configuracion Docker Local de SmartContable

## 1. Objetivo

Configurar el entorno local de SmartContable para ejecutar el backend FastAPI y la base de datos MySQL mediante Docker, permitiendo desarrollo local, conexion desde MySQL Workbench y consumo desde el frontend React/Vite.

## 2. Alcance

La configuracion realizada cubre:

- Backend FastAPI en contenedor Docker.
- Base de datos MySQL 8.4 en contenedor Docker.
- `DATABASE_URL` funcional dentro de la red Docker Compose.
- Puerto MySQL expuesto para conexion desde MySQL Workbench.
- Validacion del endpoint de salud del backend.
- Creacion de usuario local de prueba.
- Validacion de login con JWT.
- Correccion de vulnerabilidades npm del frontend mediante `npm audit fix`.

## 3. Archivos Modificados o Creados

### Archivos creados

- `backend/docker-compose.yml`

Define los servicios locales:

- `db`: MySQL 8.4.
- `backend`: FastAPI usando el `Dockerfile` existente.

Tambien configura:

- Volumen persistente para MySQL.
- Volumen para datos del backend.
- Healthcheck de MySQL.
- Exposicion de puertos locales.

### Archivos modificados

- `.gitignore`

Se agrego exclusion para archivos locales de entorno:

```gitignore
**/.env.*
!**/.env*.example
```

Esto evita subir archivos como `backend/.env.docker` al repositorio.

- `backend/requirements.txt`

Se fijo la version de OpenAI:

```txt
openai==2.54.0
```

Motivo: evitar backtracking excesivo de `pip` durante el build Docker causado por `openai>=1.0.0`.

- `frontend/package-lock.json`

Actualizado automaticamente por:

```powershell
npm audit fix
```

Motivo: corregir vulnerabilidades detectadas por `npm audit`.

## 4. Configuracion de Docker

Se creo un `docker-compose.yml` local para levantar backend y base de datos:

```yaml
name: smartcontable

services:
  db:
    image: mysql:8.4
    container_name: smartcontable-db
    restart: unless-stopped
    environment:
      MYSQL_DATABASE: smart_contable
      MYSQL_USER: smartcontable
      MYSQL_PASSWORD: smartcontable_dev_password
      MYSQL_ROOT_PASSWORD: smartcontable_root_password
    ports:
      - "3307:3306"
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -usmartcontable -psmartcontable_dev_password --silent"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 30s

  backend:
    build: .
    container_name: smartcontable-backend
    restart: unless-stopped
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    env_file:
      - .env.docker
    ports:
      - "8000:8000"
    volumes:
      - backend_data:/app/data
    depends_on:
      db:
        condition: service_healthy

volumes:
  mysql_data:
  backend_data:
```

## 5. Configuracion de `DATABASE_URL`

Se creo un archivo local `backend/.env.docker` con la configuracion requerida para que el backend se conecte a MySQL dentro de Docker:

```env
DATABASE_URL=mysql+pymysql://smartcontable:smartcontable_dev_password@db:3306/smart_contable
SECRET_KEY=local_docker_secret_key_change_me_32_chars_minimum_123456
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480

ENVIRONMENT=development
DEBUG=false

CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000

MAX_XML_UPLOAD_BYTES=2097152
MAX_ZIP_UPLOAD_BYTES=26214400
MAX_XML_FILES_PER_ZIP=1000
MAX_PDF_UPLOAD_BYTES=10485760
```

Nota tecnica importante:

Dentro de Docker, el host de MySQL es:

```text
db
```

No debe usarse `localhost` dentro del contenedor, porque `localhost` apuntaria al propio contenedor del backend.

Por eso la URL correcta para Docker es:

```env
mysql+pymysql://smartcontable:smartcontable_dev_password@db:3306/smart_contable
```

## 6. Configuracion para MySQL Workbench

Para conectarse desde MySQL Workbench en Windows:

```text
Connection Name: SmartContable Local Docker
Connection Method: Standard TCP/IP
Hostname: 127.0.0.1
Port: 3307
Username: smartcontable
Password: smartcontable_dev_password
Default Schema: smart_contable
```

La conexion usa el puerto local `3307`, mapeado al puerto interno `3306` del contenedor MySQL.

## 7. Validaciones Realizadas

### Validacion de Docker Compose

Comando ejecutado:

```powershell
docker compose -f .\backend\docker-compose.yml config
```

Resultado: configuracion valida.

### Levantamiento de servicios

Comando ejecutado:

```powershell
docker compose -f .\backend\docker-compose.yml up -d --build
```

Resultado:

- Imagen `smartcontable-backend` construida correctamente.
- Contenedor `smartcontable-db` iniciado y healthy.
- Contenedor `smartcontable-backend` iniciado correctamente.

### Estado de contenedores

Comando:

```powershell
docker compose -f .\backend\docker-compose.yml ps
```

Servicios activos:

```text
smartcontable-backend
smartcontable-db
```

### Prueba de puerto MySQL

Comando:

```powershell
Test-NetConnection -ComputerName localhost -Port 3307
```

Resultado:

```text
TcpTestSucceeded: True
```

### Prueba de credenciales MySQL

Comando:

```powershell
docker exec smartcontable-db mysqladmin ping -h 127.0.0.1 -usmartcontable -psmartcontable_dev_password
```

Resultado:

```text
mysqld is alive
```

### Prueba de consulta SQL

Comando:

```powershell
docker exec smartcontable-db mysql -usmartcontable -psmartcontable_dev_password -D smart_contable -e "SELECT DATABASE() AS database_name, VERSION() AS mysql_version; SHOW TABLES;"
```

Resultado:

```text
database_name: smart_contable
mysql_version: 8.4.11
```

Tablas detectadas:

```text
alembic_version
comisiones_banco
empresas
estados_cuenta_cargas
facturas
mapeo_cuentas
movimientos_banco
movimientos_poliza
polizas
usuarios
```

### Prueba del backend

Comando:

```powershell
Invoke-RestMethod -Uri http://localhost:8000/health
```

Resultado:

```json
{
  "status": "ok"
}
```

## 8. Usuario Local de Prueba

Se creo un usuario administrador local mediante el endpoint de registro.

Credenciales:

```text
Correo: admin@smartcontable.com
Contrasena: Admin1234!
Rol: admin
```

Se valido el login contra:

```text
POST http://localhost:8000/api/v1/auth/login
```

Resultado: el backend respondio correctamente con token JWT tipo `bearer`.

## 9. Ejecucion de la Aplicacion

### Levantar backend y MySQL

Desde la raiz del proyecto:

```powershell
cd C:\Users\eduardo\proyecto-contabilidad
docker compose -f .\backend\docker-compose.yml up -d
```

### Ver estado de contenedores

```powershell
docker compose -f .\backend\docker-compose.yml ps
```

### Ver logs del backend

```powershell
docker compose -f .\backend\docker-compose.yml logs -f backend
```

### Acceder al backend

```text
http://localhost:8000
```

Documentacion Swagger:

```text
http://localhost:8000/docs
```

Healthcheck:

```text
http://localhost:8000/health
```

### Levantar frontend

```powershell
cd C:\Users\eduardo\proyecto-contabilidad\frontend
npm install
npm run dev
```

Acceso al frontend:

```text
http://localhost:5173
```

Credenciales de acceso:

```text
admin@smartcontable.com
Admin1234!
```

## 10. Correccion de Vulnerabilidades Frontend

Despues de ejecutar `npm install`, se detectaron vulnerabilidades en dependencias del frontend.

Se ejecuto:

```powershell
cd C:\Users\eduardo\proyecto-contabilidad\frontend
npm audit fix
npm audit --omit=dev
npm run build
```

Resultado:

```text
found 0 vulnerabilities
vite build completed successfully
```

El build finalizo correctamente.

## 11. Consideracion Tecnica sobre Alembic

El `Dockerfile` de produccion ejecuta:

```bash
alembic upgrade head
```

Sin embargo, la migracion inicial actual no crea el esquema completo desde cero. En una base vacia, Alembic intentaba modificar una tabla `facturas` antes de que existiera.

Para desarrollo local, se resolvio sobreescribiendo el comando del backend en `docker-compose.yml`:

```yaml
command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Como `ENVIRONMENT=development`, la aplicacion ejecuta:

```python
Base.metadata.create_all(bind=engine)
```

Esto permite crear las tablas automaticamente en desarrollo local.

Recomendacion futura: corregir el historial de migraciones Alembic para que una base vacia pueda construirse completamente con `alembic upgrade head`, especialmente antes de produccion.

## 12. Comandos Utiles

Levantar todo:

```powershell
docker compose -f .\backend\docker-compose.yml up -d
```

Reconstruir backend:

```powershell
docker compose -f .\backend\docker-compose.yml up -d --build
```

Ver contenedores:

```powershell
docker compose -f .\backend\docker-compose.yml ps
```

Ver logs:

```powershell
docker compose -f .\backend\docker-compose.yml logs -f backend
```

Apagar contenedores:

```powershell
docker compose -f .\backend\docker-compose.yml down
```

Apagar y borrar datos de MySQL:

```powershell
docker compose -f .\backend\docker-compose.yml down -v
```

Importante: `down -v` elimina el volumen de MySQL y borra los datos locales.

## 13. Estado Final

El entorno local de SmartContable queda configurado y validado con:

- Backend FastAPI funcionando en Docker.
- MySQL funcionando en Docker.
- Conexion disponible desde MySQL Workbench.
- API respondiendo correctamente.
- Usuario local de prueba creado.
- Login validado con JWT.
- Frontend con dependencias instaladas.
- Vulnerabilidades npm corregidas.
- Build del frontend validado correctamente.

Estado general: listo para desarrollo local.