# Reporte tecnico de deployment de SmartContable

## 1. Resumen ejecutivo

SmartContable quedo desplegado como una aplicacion web responsive/PWA con esta separacion de responsabilidades:

```text
Telefono o laptop
        |
        v
Frontend React/Vite en Vercel
        |
        | HTTPS + CORS
        v
Backend FastAPI en Docker sobre Amazon EC2
        |
        | red privada dentro de AWS
        v
Amazon RDS for MySQL
        |
        v
Amazon S3 privado para artefactos y archivos controlados
```

El acceso publico de la beta es:

```text
Frontend: https://smart-contable.vercel.app
Backend:  https://3-12-148-63.nip.io
Health:   https://3-12-148-63.nip.io/health
```

La comprobacion final del backend devuelve:

```json
{"status":"ok"}
```

La version publicada corresponde a la rama `feat/conciliacion-csv-upload`, commit `b568971`, y no a la version atrasada que inicialmente estaba en `main`.

## 2. Objetivo del despliegue

El objetivo fue poner una beta utilizable por colegas contadores desde telefono y laptop, sin reescribir el motor Python de CFDI, XML, PDF, conciliacion y polizas.

La decision tecnica fue mantener el procesamiento en el backend y utilizar el telefono como cliente web/PWA. Esto evita intentar ejecutar en el celular las dependencias Python del motor contable y permite que varios usuarios compartan una base centralizada.

El alcance de esta beta es:

- Frontend accesible por HTTPS desde navegadores moviles.
- Instalacion opcional como PWA mediante "Agregar a pantalla de inicio".
- Backend FastAPI centralizado.
- Autenticacion mediante JWT.
- Persistencia en MySQL administrado por AWS.
- Aislamiento de empresas mediante `usuario_id` y `empresa_id`.
- Cargas de XML, ZIP, CSV y PDF conforme a los limites actuales.
- Generacion y consulta de facturas, polizas, reportes y conciliacion.

Esta beta no debe considerarse todavia una plataforma de produccion fiscal definitiva. Se debe utilizar primero con datos de prueba y validar los flujos con los colegas.

## 3. Componentes del repositorio

### 3.1 Backend

El backend esta en `backend/` y utiliza:

- Python 3.13.
- FastAPI.
- Uvicorn.
- SQLAlchemy.
- Alembic.
- PyMySQL.
- JWT para autenticacion.
- Procesamiento XML/CFDI con `lxml`, `xmltodict`, `cfdiclient` y `sat-ws`.
- Procesamiento PDF con `pymupdf`, `pdfplumber` y `pdfminer.six`.
- Generacion de Excel y PDF con `openpyxl` y `reportlab`.
- Dependencias preparadas para Celery y Redis, aunque no forman parte del camino activo de este deployment.

El endpoint de salud es:

```text
GET /health
```

El backend aplica las migraciones Alembic antes de arrancar en la imagen Docker mediante el `CMD` del `Dockerfile`. En el Compose productivo se usa un comando explicito de Uvicorn, por lo que durante la migracion inicial las migraciones tambien se ejecutaron manualmente con `alembic upgrade head`.

### 3.2 Frontend

El frontend esta en `frontend/` y utiliza:

- React 19.
- Vite.
- React Router.
- Axios.
- Tailwind CSS.
- Lucide React.
- Recharts.
- React Hot Toast.

La URL del backend se resuelve en `frontend/src/services/api.js` mediante:

```javascript
import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1'
```

En Vercel se establecio:

```text
VITE_API_URL=https://3-12-148-63.nip.io/api/v1
```

La aplicacion incluye `manifest.webmanifest` y un service worker minimo. El service worker no cachea las respuestas de la API, una decision importante para no mostrar datos contables desactualizados.

## 4. Entorno local con Docker

### 4.1 Servicios locales

El archivo `backend/docker-compose.yml` define dos servicios:

```text
db       MySQL 8.4
backend  FastAPI + Uvicorn
```

Configuracion principal:

| Elemento | Valor |
|---|---|
| MySQL interno | `3306` |
| MySQL publicado en Windows | `3307` |
| FastAPI publicado | `8000` |
| Nombre del servicio MySQL | `db` |
| Volumen MySQL | `smartcontable_mysql_data` |
| Volumen de datos backend | `smartcontable_backend_data` |

Dentro de la red Docker, el backend no debe usar `localhost` para MySQL. Debe usar el nombre del servicio:

```text
mysql+pymysql://smartcontable:...@db:3306/smart_contable
```

El archivo local `backend/.env.docker` contiene la configuracion de desarrollo y no debe publicarse en Git.

### 4.2 Inicializacion local

```powershell
cd C:\Users\eduardo\proyecto-contabilidad\backend
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose ps
```

Validacion:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:8000/health
```

Frontend local:

```powershell
cd C:\Users\eduardo\proyecto-contabilidad\frontend
npm install
npm run dev
```

URL local esperada:

```text
http://localhost:5173
```

### 4.3 Persistencia local

El volumen `smartcontable_mysql_data` conserva la base aunque se detengan o eliminen los contenedores:

```powershell
docker compose down
```

No se debe ejecutar sin autorizacion:

```powershell
docker compose down -v
```

El sufijo `-v` elimina los volumenes y puede borrar la base local.

Un incidente observado durante el trabajo fue que Docker Desktop estaba detenido. En Windows, ese estado provoca que Compose falle antes de ejecutar la aplicacion:

```text
failed to connect to the docker API
```

Recuperacion:

```powershell
Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
```

## 5. Empaquetado del backend

### 5.1 Dockerfile

`backend/Dockerfile` utiliza `python:3.13-slim` y realiza estas operaciones:

1. Define `/app` como directorio de trabajo.
2. Copia `requirements.txt`.
3. Instala bibliotecas del sistema necesarias para XML y PDF.
4. Instala dependencias Python fijadas por version.
5. Elimina herramientas de compilacion para reducir la imagen final.
6. Copia el codigo del backend.
7. Crea `/app/data`.
8. Expone el puerto `8000`.
9. Arranca Alembic y Uvicorn.

Construccion local:

```powershell
cd C:\Users\eduardo\proyecto-contabilidad\backend
docker compose build backend
docker save smartcontable-backend:latest -o "$env:TEMP\smartcontable-backend-local.tar"
```

La imagen local se pudo guardar correctamente como un artefacto aproximado de `160 MB`.

### 5.2 Compose productivo

`backend/docker-compose.prod.yml` define:

```text
backend  FastAPI en red interna
caddy    terminacion HTTPS y reverse proxy
```

Caddy publica los puertos `80` y `443` y reenvia las solicitudes a:

```text
backend:8000
```

El archivo `.env.production` se crea en la EC2 y no se almacena en Git.

## 6. Arquitectura AWS

La infraestructura se administra mediante `infra/aws/smartcontable.yaml` y el stack:

```text
smartcontable-pilot
```

Region:

```text
us-east-2 (Ohio)
```

### 6.1 EC2

La instancia que ejecuta el backend es:

| Elemento | Valor |
|---|---|
| Instance ID | `i-050bd9cc1e31ff11b` |
| Tipo | `t3.micro` |
| Estado | `running` |
| IP publica actual | `3.12.148.63` |
| Sistema | Amazon Linux 2023 |
| Runtime | Docker Compose productivo |

La instancia tiene un Instance Profile con permisos para:

- Administracion por SSM.
- Lectura de parametros de SSM bajo `/smartcontable/`.
- Acceso controlado al bucket S3.

El acceso remoto se realizo mediante AWS Systems Manager Run Command, evitando depender de SSH abierto.

### 6.2 Caddy y HTTPS

Caddy recibe las solicitudes en la EC2 y las reenvia al contenedor FastAPI. El dominio usado es:

```text
3-12-148-63.nip.io
```

`nip.io` resuelve automaticamente el nombre hacia la IP publica. Esto permitio obtener HTTPS sin registrar un dominio adicional durante la beta.

Riesgo operativo: si la IP publica de EC2 cambia, el dominio `nip.io` deja de apuntar a la instancia correcta. Para una etapa posterior se recomienda Elastic IP o un dominio administrado con DNS estable.

### 6.3 RDS MySQL

RDS significa **Amazon Relational Database Service**. En este proyecto es el MySQL administrado donde persisten los usuarios, empresas, facturas, polizas y conciliaciones.

RDS administra:

- Motor MySQL.
- Almacenamiento.
- Cifrado.
- Backups automaticos.
- Ventanas de mantenimiento y backup.
- Endpoint de conexion privado.

Configuracion final:

| Elemento | Valor |
|---|---|
| Clase | `db.t3.micro` |
| Estado | `available` |
| Acceso publico | deshabilitado |
| Cifrado | habilitado |
| Deletion protection | habilitado |
| Retencion automatica | `1` dia |
| Base | `smart_contable` |

El endpoint no se publica en el frontend. Solo la EC2 debe conectarse a RDS mediante el grupo de seguridad de base de datos.

### 6.4 Grupos de seguridad

El grupo de seguridad de la aplicacion permite trafico publico en:

```text
TCP 80
TCP 443
```

El grupo de seguridad de RDS permite:

```text
TCP 3306 solamente desde el security group de la EC2
```

La base no debe abrirse a `0.0.0.0/0`.

### 6.5 S3

El bucket creado por CloudFormation es privado, cifrado y con bloqueo de acceso publico:

```text
smartcontable-pilot-filesbucket-cbehh4unfux3
```

Se utilizo temporalmente para transportar el dump de migracion hacia EC2. Los archivos de transferencia fueron eliminados despues de validar la restauracion. El bucket conserva el artefacto del backend bajo `releases/`.

Aunque existe la infraestructura IAM para archivos por empresa, la integracion activa del backend con S3 para almacenar automaticamente XML/PDF originales sigue siendo una brecha futura documentada. No se debe asumir que todos los archivos subidos ya estan respaldados en S3.

### 6.6 SSM Parameter Store

Los parametros usados por el backend son:

```text
/smartcontable/database-url
/smartcontable/secret-key
/smartcontable/s3-bucket
/smartcontable/domain
```

Los valores sensibles se almacenan como `SecureString`. Nunca deben copiarse al reporte, al frontend, a Git ni a los logs.

## 7. Flujo de conexion completo

### 7.1 Solicitud de una pantalla publica

1. El usuario abre `https://smart-contable.vercel.app`.
2. Vercel entrega el bundle estatico construido por Vite.
3. React monta la aplicacion y muestra login.
4. Axios utiliza `VITE_API_URL` para construir las rutas de API.

### 7.2 Login

1. El usuario envia correo y contrasena desde React.
2. Axios envia `POST /api/v1/auth/login` a AWS.
3. Caddy recibe la solicitud HTTPS.
4. Caddy la reenvia a `backend:8000`.
5. FastAPI consulta el usuario en RDS.
6. FastAPI devuelve un JWT.
7. React guarda el token en `localStorage`.
8. Las solicitudes siguientes agregan `Authorization: Bearer ...`.

### 7.3 Solicitud autenticada

1. React solicita, por ejemplo, `/api/v1/empresas/`.
2. El navegador envia el header `Origin` de Vercel.
3. FastAPI valida CORS.
4. El middleware o dependencia valida el JWT.
5. El endpoint valida la pertenencia del usuario a la empresa.
6. SQLAlchemy consulta RDS.
7. La respuesta vuelve por Caddy y HTTPS hasta el navegador.

La configuracion CORS final autoriza:

```text
https://smart-contable.vercel.app
```

La prueba desde el navegador confirmo que el frontend puede invocar `/health` en AWS sin bloqueo CORS.

## 8. Configuracion Vercel

### 8.1 Proyecto

| Elemento | Valor |
|---|---|
| Proyecto | `smart-contable` |
| Equipo | Inge Carlos Rocha's projects |
| Repositorio | `RochaVz/smart-contable` |
| Framework | Vite |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Dominio | `smart-contable.vercel.app` |

El archivo `frontend/vercel.json` contiene el rewrite hacia `index.html`, necesario para que React Router funcione cuando el usuario abre directamente `/login` u otra ruta.

### 8.2 Ramas y version publicada

Inicialmente Vercel publico `main`, cuyo commit era `77b6635`. Esa rama no contenia los cambios recientes, incluida la opcion de recuperar contrasena.

Se creo un preview con:

```text
feat/conciliacion-csv-upload
commit b568971
```

Despues se promovio ese preview a produccion. Vercel confirmo `Created Production Deployment successfully`.

La version actual incluye:

- Crear cuenta.
- Recuperar contrasena.
- Mostrar u ocultar contrasena.
- Manejo actualizado de errores de autenticacion.

## 9. Migracion de datos locales a RDS

### 9.1 Estado inicial

La base local conservaba:

```text
usuarios:             2
empresas:             1
facturas:           604
polizas:           1052
movimientos_poliza: 3348
```

RDS estaba inicialmente vacio:

```text
usuarios:  0
empresas:  0
```

### 9.2 Respaldo local

Se genero un dump con:

```powershell
docker compose exec -T db mysqldump -usmartcontable -p... --single-transaction --no-tablespaces --routines --triggers smart_contable
```

El respaldo principal conservado localmente es:

```text
backend/smartcontable-backup-20260903-220307.sql
```

No se debe subir ese archivo a Git porque contiene datos fiscales y hashes de contrasenas.

### 9.3 Incidente durante la restauracion

Durante el primer intento se registro una cuenta nueva en produccion al mismo tiempo que se importaba el dump. Esto genero una colision de claves y referencias:

- El usuario nuevo tomo `id=1`.
- La empresa local apuntaba a `usuario_id=2`.
- La importacion con `--force` oculto errores de dependencias.
- Ademas, la primera ejecucion de `docker run` no tenia `-i`, por lo que el cliente MySQL no recibia correctamente el dump por stdin.

La recuperacion se hizo sin borrar la cuenta de produccion:

1. Se tomo snapshot del estado parcial.
2. Se preparo un script de reparacion.
3. La empresa se remapeo al usuario de produccion existente.
4. Se ejecuto el importador con `docker run -i`.
5. Las polizas se importaron antes que sus movimientos.
6. Los movimientos se reimportaron despues para respetar las claves foraneas.

### 9.4 Resultado final

La validacion final en RDS fue:

```text
usuarios:             1
empresas:             1
facturas:           604
polizas:           1052
movimientos_poliza: 3348
movimientos_banco:    0
estados_cuenta:       0
```

Empresa restaurada:

```text
HOTEL MESON DE LOS CRISTEROS
RFC HMC911104DR5
empresa_id 1
usuario_id 1
```

La empresa `2` no estaba en el dump local final y por eso no fue posible recuperarla desde ese respaldo.

## 10. Respaldos y recuperacion

### 10.1 Snapshots manuales

Se crearon snapshots cifrados:

```text
smartcontable-pre-migration-20260904
smartcontable-pre-repair-20260904
smartcontable-post-migration-20260904
```

El snapshot posterior a la migracion quedo en estado `available`.

### 10.2 Backup automatico de RDS

RDS conserva actualmente:

```text
BackupRetentionPeriod: 1 dia
```

Se intento elevar la retencion a `7` dias, pero AWS la rechazo con `FreeTierRestrictionError` porque la cuenta esta sujeta a una limitacion del plan gratuito.

Por tanto:

- El backup automatico esta habilitado.
- La ventana de recuperacion automatica es de un dia.
- Los snapshots manuales son puntos adicionales de recuperacion.
- Los snapshots manuales no sustituyen una politica programada de largo plazo.

Para ampliar esta proteccion se debe revisar el plan AWS y el costo de retencion antes de cambiar la configuracion.

### 10.3 Proteccion contra borrado

Se habilito:

```text
DeletionProtection: true
```

Esto evita borrar accidentalmente la instancia RDS desde una operacion ordinaria. Aun asi, se debe revisar la politica CloudFormation antes de eliminar o reemplazar el stack.

## 11. Validaciones ejecutadas

### Frontend

```powershell
cd frontend
npm run build
```

Resultado: build Vite exitoso.

### Backend local

```text
GET http://localhost:8000/health -> 200
```

Se hicieron diez solicitudes consecutivas y todas devolvieron `200`.

### Backend AWS

```text
GET https://3-12-148-63.nip.io/health -> 200
```

### CORS

Se envio una solicitud con:

```text
Origin: https://smart-contable.vercel.app
```

La respuesta incluyo el origen autorizado y el navegador pudo ejecutar la solicitud desde Vercel.

### Vercel

Se comprobo que:

- La raiz publica responde `200`.
- `/login` responde correctamente despues de una recarga.
- La opcion `Recuperar contraseña` aparece en la version promovida.
- El dominio estable apunta al deployment correcto.

### AWS

Se comprobo:

- Stack CloudFormation en `UPDATE_COMPLETE`.
- EC2 en `running`.
- RDS en `available`.
- RDS privado y cifrado.
- S3 con acceso publico bloqueado.
- Parametros sensibles presentes en SSM.
- Snapshot final disponible.

## 12. Operacion diaria

### Comprobar backend AWS

```powershell
Invoke-WebRequest -UseBasicParsing https://3-12-148-63.nip.io/health
```

### Consultar estado de EC2/RDS

```powershell
$env:AWS_PAGER=''
aws ec2 describe-instances --region us-east-2 --instance-ids i-050bd9cc1e31ff11b
aws rds describe-db-instances --region us-east-2 --db-instance-identifier smartcontable-smartcontable-pilot
```

### Consultar logs del backend en EC2

El acceso recomendado es AWS Systems Manager Run Command. No se deben exponer secretos en los comandos ni en la salida.

### Actualizar backend

El flujo actual de publicacion utiliza el script existente `scripts/publish-aws.ps1`, que:

1. Lee los outputs de CloudFormation.
2. Guarda valores sensibles en SSM.
3. Empaqueta el backend excluyendo archivos `.env`.
4. Sube el artefacto a S3.
5. Ejecuta comandos remotos mediante SSM.
6. Instala o actualiza Docker en EC2.
7. Descarga el backend.
8. Genera `.env.production`.
9. Levanta Docker Compose productivo.

### Actualizar frontend

Los pushes a la rama conectada de Vercel generan deployments. Antes de promover cambios a produccion se debe revisar:

```powershell
cd frontend
npm run lint
npm run build
```

Tambien se debe confirmar que Vercel usa:

```text
Root Directory: frontend
VITE_API_URL: https://3-12-148-63.nip.io/api/v1
```

## 13. Procedimiento de prueba para colegas

Se recomienda este orden:

1. Abrir `https://smart-contable.vercel.app`.
2. Crear una cuenta de prueba.
3. Iniciar sesion.
4. Crear una empresa de prueba.
5. Cargar un XML, CSV o PDF de prueba.
6. Revisar facturas y polizas.
7. Cerrar sesion.
8. Iniciar sesion de nuevo.
9. Confirmar que los datos persisten.
10. Probar desde telefono y laptop.

No se deben cargar inicialmente:

- XML de clientes reales.
- Estados de cuenta reales.
- Credenciales SAT.
- Documentos con informacion personal innecesaria.
- Archivos que no tengan respaldo independiente.

Formato recomendado para reportar un problema:

```text
Celular y modelo:
Sistema operativo:
Navegador:
Pantalla o modulo:
Mensaje exacto:
Pasos para reproducir:
Archivo de prueba utilizado:
```

## 14. Riesgos y pendientes tecnicos

### 14.1 Retencion de backups

La retencion automatica de RDS es de un dia por la restriccion Free Tier. Se debe definir una politica de snapshots y revisar costos antes de la beta prolongada.

### 14.2 IP publica de EC2

El dominio `nip.io` depende de la IP `3.12.148.63`. Una sustitucion de instancia puede cambiarla. Se recomienda una Elastic IP o dominio estable antes de una adopcion mas amplia.

### 14.3 Almacenamiento de archivos

La infraestructura S3 existe, pero el backend todavia procesa varios archivos en memoria y la integracion de almacenamiento original en S3 no es el comportamiento general activo.

### 14.4 Procesamiento pesado

Una `t3.micro` tiene recursos limitados. Cargas grandes de ZIP o PDF pueden consumir CPU y memoria. Se deben mantener los limites de carga y medir tiempos antes de ampliar el numero de colegas.

### 14.5 Versiones coordinadas

Frontend y backend deben publicarse de forma compatible. Vercel ofrece una recomendacion de proteccion contra desincronizacion de frontend/backend; debe evaluarse antes de cambios frecuentes.

### 14.6 Observabilidad

Actualmente se dispone de health check, logs de Docker, logs de aplicacion y validaciones manuales. Falta una estrategia formal de alertas, metricas y seguimiento de errores.

### 14.7 Pruebas moviles automatizadas

El build y la navegacion movil fueron comprobados, pero aun se recomienda incorporar pruebas E2E con Playwright para login, empresas, carga de documentos, conciliacion y reportes.

## 15. Conclusion

SmartContable esta disponible para una beta controlada desde telefono y laptop mediante Vercel y AWS.

El camino critico funciona:

```text
Vercel -> HTTPS/Caddy -> FastAPI/Docker/EC2 -> RDS MySQL
```

La base local fue migrada y validada en RDS con sus conteos principales. La aplicacion publica carga la version actual de la rama de trabajo, el login y la opcion de recuperacion estan presentes, CORS esta configurado y el backend responde correctamente.

La beta puede comenzar con usuarios de prueba. Antes de aceptar informacion fiscal real de manera habitual, se deben fortalecer la politica de respaldos, el dominio estable, el almacenamiento S3, la observabilidad y las pruebas automatizadas.