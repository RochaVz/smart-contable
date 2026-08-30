# Beta PWA con costo $0 sin servidor propio

## Objetivo

Publicar SmartContable como una PWA compartible para fase beta, manteniendo costos en $0 y sin depender de una computadora local encendida ni de capacidad disponible en Oracle Cloud.

La decision vigente para esta beta es:

- Frontend en Vercel Free.
- Backend FastAPI y Caddy en Amazon EC2 `t3.micro` x86, si la consola la marca elegible para AWS Free Tier.
- Base de datos en Amazon RDS for MySQL `db.t3.micro`, si la consola la marca elegible.
- Amazon S3 privado para XML/PDF una vez que se implemente la capa de almacenamiento.
- AWS Budgets, alertas de Free Tier y límites de CloudWatch configurados antes de crear recursos.
- Carga masiva de XML CFDI por lotes/chunks.
- Procesamiento de pocos PDF bancarios por carga.
- No conservar archivos originales en esta etapa; guardar datos extraidos, estados y errores.

Documentos complementarios clave:

- Roadmap de despliegue: `docs/ROADMAP_DESPLIEGUE.md`
- Variables minimas backend: `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS`
- Variables minimas frontend: `VITE_API_URL`

## Arquitectura recomendada

```text
Vercel Free
  React + Vite + PWA
  - carga ZIP/XML mensual
  - divide XML en lotes
  - sube pocos PDF bancarios
        |
        v
Amazon EC2 t3.micro
  Docker Compose: Caddy + FastAPI
  - valida y normaliza XML
  - deduplica por empresa + UUID
  - procesa PDF bancario pequeno
  - registra progreso y errores
        |
        v
Amazon RDS for MySQL db.t3.micro
  - CFDI normalizados
  - movimientos bancarios
  - polizas, conciliaciones y KPIs
    |
    v
  Amazon S3 privado
    - XML y PDF originales
    - retencion limitada
```

Vercel aloja el frontend. No aloja automaticamente el backend FastAPI ni la base de datos.
EC2 mantiene el backend disponible sin encender la computadora local. RDS conserva MySQL, por lo que no requiere reescribir el modelo SQLAlchemy ni las migraciones Alembic. S3 se usará para archivos originales después de implementar la integración correspondiente.

Para cuentas creadas desde el 15 de julio de 2025, AWS documenta un Free Account Plan que termina después de seis meses o al agotarse los créditos, lo que ocurra primero. Es una prueba viable, pero no una garantía de seis meses con $0. `t2.micro` no es elegible para esas cuentas; se prefiere `t3.micro` x86. La consola confirmó `t3.micro` y `db.t3.micro` como elegibles en `us-east-2` (Ohio).

Oracle Cloud queda como alternativa futura si vuelve a existir capacidad disponible, pero no es el camino bloqueante para iniciar la beta.

## Estrategia de carga masiva

La carga mensual de XML es el flujo principal del producto. No debe procesarse un ZIP completo dentro de un solo request largo. El flujo recomendado es:

1. El usuario sube un ZIP o selecciona multiples XML.
2. El frontend divide la carga en lotes pequenos.
3. El backend procesa cada lote y guarda avance.
4. Cada XML se deduplica por `empresa_id + UUID`.
5. El resultado conserva conteos de procesados, duplicados y errores.
6. El usuario puede reintentar solo los archivos fallidos.

Limites iniciales para beta gratuita:

| Tipo | Limite inicial |
|---|---:|
| ZIP de XML | 25 MB |
| XML por request | 50 a 100 |
| XML por lote mensual | 500 a 1000, ajustable por pruebas |
| PDF por carga | 1 a 5 |
| Tamano por PDF | 10 MB |

El objetivo no es bloquear al usuario, sino evitar que el backend gratuito agote CPU, RAM o tiempo de ejecucion.

## PDFs bancarios

Los estados de cuenta bancarios se mantienen dentro del alcance de la beta, pero con volumen bajo:

- Procesar pocos PDF por carga.
- Priorizar PDF con texto seleccionable.
- Registrar banco, periodo, hash y nombre de archivo.
- Guardar movimientos extraidos, no el PDF original.
- Registrar errores de formato no soportado.
- Dejar OCR fuera del alcance inicial salvo prueba controlada.

Los PDF alimentan conciliacion bancaria; los XML siguen siendo la base fiscal-contable principal.

## Desarrollo individual

Para usar la app solo en el equipo local:

```powershell
cd backend
py -m uvicorn app.main:app --reload

cd ..\frontend
npm run dev
```

En este modo el frontend usa por defecto `http://localhost:8000/api/v1`.

## Compartir con colegas

Para que otras personas puedan probar la aplicación desde su celular o laptop se necesitan dos URLs públicas:

- URL del frontend publicado en Vercel.
- URL HTTPS del backend FastAPI.

Configurar la URL del backend al crear el sitio:

```text
VITE_API_URL=https://tu-backend-de-prueba.example.com/api/v1
```

El backend debe permitir el dominio exacto de Vercel mediante `CORS_ORIGINS`, por ejemplo:

```text
CORS_ORIGINS=https://smartcontable-beta.vercel.app
```

No se debe usar `localhost` como `VITE_API_URL` en un sitio publicado: desde el celular de un colega, `localhost` apunta a su propio dispositivo.

## Publicar el frontend en Vercel

1. Crear un proyecto nuevo e importar el repositorio.
2. Seleccionar `frontend` como Root Directory.
3. Usar `npm run build` como Build Command.
4. Usar `dist` como Output Directory.
5. Crear `VITE_API_URL` con la URL HTTPS pública del backend.
6. Publicar y probar `/login`, `/dashboard` y `/empresa/:id`.

El archivo `vercel.json` conserva las rutas de React Router después de recargar la página.

## Preparar RDS for MySQL en AWS

La región confirmada para el piloto es `us-east-2` (Ohio), donde la consola ya mostró `t3.micro` y `db.t3.micro` como elegibles. Configurar AWS Budgets con alertas antes de habilitar servicios y confirmar los créditos disponibles.

1. Crear una instancia Amazon RDS for MySQL `db.t3.micro` solo si la consola la marca elegible dentro de los limites o créditos vigentes.
2. Crear la base de datos de la beta, por ejemplo `smart_contable`, y un usuario exclusivo para la aplicacion.
3. Marcar la instancia como no accesible publicamente.
4. Configurar el grupo de seguridad de RDS para aceptar el puerto MySQL solo desde el grupo de seguridad de EC2.
5. Construir `DATABASE_URL` para SQLAlchemy/PyMySQL con el endpoint privado de RDS:

```text
mysql+pymysql://usuario:password@endpoint-rds:3306/smart_contable
```

La contrasena debe codificarse como URL si contiene caracteres reservados. La conexion debe usar TLS segun la configuracion y el certificado CA vigente de RDS.

## Publicar backend en Amazon EC2

1. Crear una unica instancia EC2 elegible para AWS Free Tier, en la misma region y red que RDS.
2. Instalar Docker y Docker Compose; iniciar el stack existente desde `backend/docker-compose.prod.yml`.
3. Configurar las variables privadas:
  - `DATABASE_URL`
  - `SECRET_KEY`
  - `CORS_ORIGINS`
4. Usar `CORS_ORIGINS` con el dominio final de Vercel, por ejemplo:

```text
https://smartcontable-beta.vercel.app
```

5. Exponer solamente HTTPS mediante Caddy. El grupo de seguridad de EC2 no debe exponer MySQL ni el puerto interno de Uvicorn.
6. Validar `https://tu-backend.example.com/health` y `https://tu-backend.example.com/ready`.
7. Copiar la URL base del backend y usarla en Vercel como `VITE_API_URL` con `/api/v1` al final.

El periodo y los limites de AWS Free Tier dependen de la cuenta y pueden cambiar. No crear servicios adicionales ni aceptar cargos estimados sin una autorizacion explicita. Evitar NAT Gateway, balanceadores, monitoreo detallado, métricas personalizadas y retención extensa de logs: no forman parte de este piloto $0.

## Almacenamiento de XML y PDF en S3

S3 es la ruta elegida para conservar XML/PDF originales, pero todavía no está integrado al backend. Antes de activarlo se debe implementar un servicio de almacenamiento, el rol IAM mínimo para EC2, configuración de bucket privado y claves de objeto aisladas por empresa. El bucket debe usar cifrado, bloquear acceso público y tener una política de retención/borrado definida.

Hasta que se complete esa implementación, los endpoints actuales procesan los archivos en memoria; no se debe afirmar que ya se conservan en S3.

## Nota sobre Netlify

Netlify puede usarse como alternativa secundaria, pero la ruta oficial del proyecto para la beta es Vercel.

## PWA e instalación

La aplicación ya incluye manifest y service worker. Después de publicar con HTTPS:

- Android/Chrome: abrir el enlace y elegir `Instalar aplicación` o `Agregar a pantalla de inicio`.
- Windows/Edge: abrir el enlace y usar el icono de instalación de la barra de direcciones.
- iPhone/iPad: abrir en Safari, usar `Compartir` y elegir `Agregar a pantalla de inicio`.

La PWA no es una aplicación nativa y no procesa datos cuando está completamente desconectada. El service worker solo habilita la instalación; las solicitudes siempre requieren conexión con el backend.

## Backend de prueba gratuito

La beta puede procesar datos fiscales reales unicamente como beta privada, con colegas autorizados y despues de confirmar quien tendra acceso. El backend en AWS debe tener:

- HTTPS.
- `DATABASE_URL` configurado.
- `SECRET_KEY` segura de al menos 32 caracteres.
- `CORS_ORIGINS` limitado al dominio publicado.
- Límites de tamaño de archivos.
- Respaldos manuales o exportaciones periodicas desde RDS antes de sesiones importantes.
- Una prueba real de restauracion del respaldo al menos una vez por iteracion.
- Usuarios separados; nunca compartir la misma cuenta o token JWT.
- Acceso únicamente a colegas identificados y autorizados.
- Política clara para eliminar los datos al terminar la beta.

Los XML y PDF subidos por los endpoints actuales se procesan en memoria; la aplicación conserva los datos extraídos y, en estados de cuenta, el nombre y hash del archivo. Esto no sustituye un análisis de privacidad: los importes, RFC, proveedores, clientes, fechas y pólizas siguen siendo datos fiscales sensibles.

Antes de compartir datos reales, revisar también:

- Que cada empresa solo sea visible para sus usuarios autorizados.
- Que los logs no impriman XML, PDF, tokens, contraseñas ni información fiscal completa.
- Que los respaldos estén cifrados y no se sincronicen a una carpeta pública.
- Que las credenciales de AWS y Vercel no se compartan con testers.
- Que se limite el tamano de XML, ZIP y PDF para evitar saturacion de CPU y memoria.
- Que las cargas masivas usen lotes con exito parcial y reintento de fallidos.

Un tunel temporal desde laptop puede servir para una sesion corta de emergencia, pero no es la ruta de esta beta. La ruta base es infraestructura gratuita administrada por terceros, sin servidor propio encendido.

## Alcance de esta beta

- Usar solo datos propios o datos de clientes para los que exista autorización expresa para esta prueba.
- Avisar a los colegas que la beta puede reiniciarse o cambiar.
- Registrar errores y comentarios manualmente.
- Mantener backend y base de datos centralizados en servicios gratuitos para recopilar feedback real multiusuario.
- No considerar esta beta como un servicio de produccion ni como un sistema con SLA empresarial.
- No habilitar llamadas de IA de pago sin un límite explícito.

## Sesión de feedback móvil

Para cada sesión, registrar el dispositivo, navegador, banco/formato del archivo, periodo y resultado esperado. Probar al menos:

1. Instalar y abrir la PWA en Android, iPhone/iPad y laptop.
2. Crear sesión e ingresar a una empresa autorizada.
3. Cargar un XML individual y confirmar datos fiscales y póliza.
4. Cargar un ZIP y comparar cantidad de XML detectados, duplicados y errores.
5. Cargar un PDF de estado de cuenta y comparar cargos, abonos, fechas, referencias y saldo contra el documento original.
6. Revisar conciliación, pólizas y estado de resultados.
7. Exportar información y confirmar que el periodo y la empresa sean correctos.
8. Registrar cualquier diferencia como incidencia con el archivo original resguardado, el resultado esperado y el resultado obtenido.

El objetivo de cada iteración del motor es medir precisión por formato, no solo contar que el archivo "se procesó". Un movimiento omitido, duplicado, con signo incorrecto o con fecha equivocada debe contarse como error aunque la carga termine correctamente.
