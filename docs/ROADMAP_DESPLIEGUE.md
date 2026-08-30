# Roadmap de planeación para despliegue de SmartContable

## 0. Regla de trabajo

Los artefactos locales de despliegue ya están preparados para validación: `backend/Dockerfile`, `backend/docker-compose.prod.yml` y `backend/.env.example`. No se crearán recursos cloud, no se configurarán secretos de producción ni se publicará la aplicación hasta que el usuario escriba exactamente:

> **VAMOS CON TODO**

La frase autoriza iniciar la fase de implementación, pero no sustituye las validaciones de seguridad, costos y datos definidas en este documento.

> **Estado actualizado:** TiDB Cloud, Render y Koyeb quedan descartados para esta beta. La ruta a probar es Vercel Free y AWS Free Tier. Es viable como prueba de hasta seis meses bajo las condiciones de elegibilidad y créditos de la cuenta AWS, pero no es una garantía de costo $0 por seis meses. Oracle Cloud queda como alternativa futura por falta de capacidad disponible en `VM.Standard.E2.1.Micro`.

## 0.1 Decisión vigente: Fase Piloto de Feedback

Esta es la decisión concreta y actual, por encima del análisis de alternativas de las secciones 5 y 6 (esas secciones se conservan como respaldo de análisis y como opciones futuras, no se descartan).

**Objetivo inmediato del usuario:**

- Usar la app en su propio celular y laptop.
- Compartir un acceso de prueba con algunos colegas contadores.
- Recibir feedback real de funcionamiento para mejorar la app.

**Enfoque elegido para esta fase:** Web responsive/PWA con backend centralizado mínimo, no app nativa instalable y no base de datos local por dispositivo. Motivo: es la ruta más rápida para obtener feedback de varias personas sin reescribir el procesamiento CFDI/PDF ni empaquetar instaladores nativos.

**Arquitectura de esta fase:**

| Componente | Elección | Costo esperado |
|---|---|---|
| Frontend | Vercel (plan Free) | $0 |
| Backend | Amazon EC2 `t3.micro` x86, si la consola la marca elegible, con Docker Compose | Crédito o beneficio de AWS Free Tier; no garantizado |
| Base de datos | Amazon RDS for MySQL `db.t3.micro`, si la consola la marca elegible | Crédito o beneficio de AWS Free Tier; no garantizado |
| Archivos | Amazon S3 privado para XML y PDF, con retención limitada | Requiere integración pendiente y control estricto de almacenamiento/solicitudes |
| Disco | Un volumen EBS `gp3` de hasta 30 GB para EC2 | Incluido solo según el plan, beneficio o crédito vigente |
| Dominio | Nombre deseado: `smartcontable-beta` (ver nota de disponibilidad abajo) | $0 usando subdominio de Vercel o dominio propio |
| Monitoreo | Nivel básico para ver errores sin depender del reporte manual de cada colega | $0 o mínimo |
| Acceso móvil | PWA ("Agregar a pantalla de inicio"), sin tienda de apps | $0 |

**Uso de cuentas:** cada colega contador usa el login y multiempresa ya existentes; sus datos quedan aislados por empresa sin mezclarse entre testers.

**Nota sobre duración de 6 meses y presupuesto $0:** para cuentas creadas desde el 15 de julio de 2025, AWS documenta un Free Account Plan de seis meses o hasta agotar los créditos, lo que ocurra primero. Ese plan no genera cargos mientras permanezca activo, pero no garantiza que los créditos alcancen los seis meses. Las cuentas anteriores tienen reglas distintas. Antes de crear recursos se debe confirmar el tipo de plan, los créditos disponibles, la elegibilidad vigente de la cuenta y región elegidas, y habilitar AWS Budgets con alertas de costo. Si AWS solicita cambiar a un plan de pago, los créditos no cubren el consumo estimado o la consola no marca un recurso como elegible, el despliegue no continúa sin una autorización nueva y explícita.

**Nota sobre el dominio `smartcontable-beta`:** Vercel permite asignar un subdominio de proyecto (`smartcontable-beta.vercel.app`) sujeto a disponibilidad. Si no está disponible, se usará una variante cercana o un dominio propio con subdominio `beta`.

**Expectativas a comunicar a los colegas antes de que prueben:**

- Es una versión beta, no el producto final.
- Los datos de prueba podrían resetearse mientras se ajusta la app.
- No cargar información fiscal real y sensible de clientes reales todavía.

**Relación con las alternativas locales (secciones 5 y 6):** no se descartan. La app local por dispositivo y la infraestructura propia siguen siendo posibles evoluciones futuras según el resultado de este piloto, pero no son el camino de esta fase porque requieren mantener equipo propio encendido o reescribir el motor de procesamiento en móvil.

### 0.2 Parámetros confirmados del piloto

1. **Usuarios:** aproximadamente 10 colegas contadores al inicio.
2. **Alta de cuentas:** autoservicio; cada colega crea su propio login usando el registro/autenticación ya existente.
3. **Nombre del piloto:** `smartcontable-beta` (sujeto a disponibilidad del subdominio; ver nota en la tabla de arquitectura).
4. **Duración:** 6 meses como fecha límite del piloto.
5. **Presupuesto:** $0. No hay presupuesto disponible para servicios de pago en esta fase.
6. **Región AWS:** `us-east-2` (Ohio).
7. **Elegibilidad confirmada en la consola EC2/RDS:** `t3.micro` para EC2 y `db.t3.micro` para RDS MySQL.

### 0.3 Ruta de datos y cómputo: AWS Free Tier

La beta conserva MySQL para no modificar los modelos SQLAlchemy, las migraciones Alembic ni el procesamiento contable existente. La ruta elegida es Amazon RDS for MySQL para la base de datos, Amazon S3 privado para los XML/PDF y una única instancia Amazon EC2 con Docker Compose para ejecutar FastAPI y Caddy.

`t2.micro` no es una elección válida para cuentas creadas desde el 15 de julio de 2025: AWS solo lista `t3.micro`, `t3.small`, `t4g.micro`, `t4g.small`, `c7i-flex.large` y `m7i-flex.large` como instancias EC2 elegibles para esas cuentas. Se prefiere `t3.micro` por compatibilidad x86 con la imagen Docker actual. Para RDS se debe preferir `db.t3.micro` cuando esté marcada como elegible; AWS recomienda migrar desde la generación `db.t2` en proceso de fin de soporte.

La consola de la cuenta confirmó `t3.micro` y `db.t3.micro` como elegibles en `us-east-2` (Ohio). Antes de crear recursos todavía se debe verificar que EBS, S3 y los límites de CloudWatch estén cubiertos por el plan o créditos vigentes. No se deben habilitar servicios adicionales ni tamaños de instancia que generen cobros sin revisar primero la estimación de AWS.

### 0.3.2 Ruta vigente: Vercel + AWS Free Tier + RDS MySQL + S3

La carga masiva mensual de XML CFDI es un requisito central. Por eso, la beta gratuita no debe depender de un request unico que procese todo el ZIP en el backend. La ruta vigente es:

1. Frontend PWA en Vercel Free.
2. Backend FastAPI y Caddy en una instancia EC2 `t3.micro` x86 elegible, usando Docker Compose y un volumen EBS `gp3` de hasta 30 GB.
3. Base de datos RDS for MySQL `db.t3.micro` elegible, sin acceso público desde internet.
4. Grupo de seguridad de RDS que solo permita MySQL desde el grupo de seguridad de EC2.
5. Bucket S3 privado, sin acceso público, con cifrado, prefijos por empresa y una política de retención/borrado para XML y PDF.
6. AWS Budgets, alertas de Free Tier y límites de CloudWatch configurados antes de exponer el backend públicamente.
7. XML CFDI masivo por lotes/chunks, con avance y errores guardados.
8. PDF bancarios en volumen bajo: 1 a 5 por carga, 10 MB por PDF, sin OCR inicial.
9. Datos normalizados persistidos y archivos originales almacenados solo cuando se complete la integración S3.

**Brecha antes del despliegue:** el backend actual lee XML, ZIP, CSV y PDF en memoria; no contiene una integración S3. Antes de almacenar archivos originales se debe añadir un servicio de almacenamiento en `app/services`, configuración por variables de entorno, permisos IAM mínimos mediante un rol de instancia y pruebas de carga, aislamiento por empresa y eliminación por retención. Hasta entonces, el almacenamiento S3 no forma parte del comportamiento activo de la aplicación.

**Límites de observabilidad:** usar únicamente métricas básicas de EC2/RDS y logs con retención corta. CloudWatch puede generar cargos por logs ingeridos/almacenados, métricas personalizadas, monitoreo detallado, alarmas y consultas; no habilitar esas características sin comprobar el límite o crédito disponible.

Limites iniciales propuestos:

| Recurso | Limite beta |
|---|---:|
| ZIP XML | 25 MB |
| XML por request | 50 a 100 |
| XML por carga mensual | 500 a 1000 |
| PDF por carga | 1 a 5 |
| PDF individual | 10 MB |

El sistema debe soportar exito parcial: si una carga contiene documentos duplicados o con error, los documentos validos se conservan y los fallidos quedan disponibles para revision o reintento.

### 0.6 Oracle Cloud como alternativa futura

Oracle Cloud queda pausado para esta beta porque la instancia gratuita `VM.Standard.E2.1.Micro` no tuvo capacidad disponible en el dominio de disponibilidad intentado. Si mas adelante hay capacidad o presupuesto operativo, este seria el plan minimo por etapas:

1. **Fundación OCI**
	- Crear tenancy/compartimentos y política de acceso mínima.
	- Configurar red base (VCN, subredes, NSG/security lists).
2. **Capa de datos**
	- Instalar y endurecer MySQL en VM Always Free.
	- Habilitar backup automático, retención y prueba de restauración.
3. **Conectividad app**
	- Parametrizar `DATABASE_URL` y secretos por entorno.
	- Validar latencia y estabilidad entre frontend (Vercel) y backend/db en OCI (si se elige opción híbrida).
4. **Operación y seguridad**
	- Monitoreo básico, rotación de credenciales y hardening de puertos.
	- Runbook de recuperación para caída de VM o corrupción de datos.

Documentacion didactica existente para retomar esta integracion en el futuro:

- `docs/ORACLE_CLOUD_SETUP_PASO_A_PASO.md`
- `docs/ORACLE_ENDPOINTS_ACCESOS_BETA.md`
- `backend/.env.oracle.example`
- `frontend/.env.oracle.example`

### 0.3.1 Google Cloud (GCP) como proveedor alternativo para el mismo piloto

Consultado por el usuario. Comparación honesta frente a Azure, sin cifras de precio en vivo (no se dispone de herramienta de precios GCP; solo se listan nombres de producto reales).

| Componente | Azure (ya documentado) | GCP equivalente |
|---|---|---|
| Frontend estatico gratis | Vercel | Firebase Hosting |
| Backend, corre el motor Python sin reescribirlo | Container Apps / App Service | Cloud Run (contenedor Docker, muy natural para el motor actual) |
| MySQL administrado gratis para siempre | No existe | No existe (mismo patr\u00f3n en toda la industria) |
| Disco persistente simple para SQLite | S\u00ed, en App Service Free (instancia \u00fanica) | M\u00e1s complicado: Cloud Run es "sin estado", el archivo SQLite no persiste de forma confiable sin montar almacenamiento aparte |
| VM peque\u00f1a "siempre gratis" para autoadministrar MySQL | No ofrece | S\u00ed (`e2-micro`), pero m\u00e1s limitada que la de Oracle Cloud |
| Protecci\u00f3n del motor CFDI/PDF (secci\u00f3n 0.5) | Total, sin cambios | Total, sin cambios |

**Conclusion registrada:** GCP es una alternativa valida y protege igual el motor de procesamiento (Cloud Run corre el contenedor Python tal cual). Sin embargo, la ruta vigente de la beta no sera GCP ni Azure: se prioriza Vercel + AWS Free Tier + RDS for MySQL, conservando compatibilidad MySQL y el motor Python actual.

### 0.4 Alternativa D — Instalación local por dispositivo con respaldo/carga manual ("estilo Compaq")

Consultada por el usuario como variante adicional, fuera de las opciones de nube A/B/C.

**Descripción:** cada dispositivo (laptop o celular) tiene la app instalada localmente con su propia base de datos (SQLite), sin servidor compartido. Para mover o compartir información, el usuario genera un archivo de respaldo ("Exportar respaldo") y lo carga en otro dispositivo ("Importar respaldo") por el medio que el usuario elija (USB, correo, Drive, etc.); la app no transmite ese archivo a ningún servidor propio.

**Componentes técnicos:**

- Laptop (Windows/Mac/Linux): empaquetado como app de escritorio (por ejemplo Tauri o Electron) con backend y SQLite embebidos en el instalador.
- Celular (Android/iOS): app instalable local (por ejemplo Capacitor) con SQLite local. Requiere reescribir en JavaScript la lógica de procesamiento CFDI/XML/PDF que hoy es Python, porque ese motor no corre nativamente en el empaquetado móvil.
- Función de respaldo: exportar toda la información (empresas, facturas, pólizas, conciliaciones, configuración) a un solo archivo, e importarla en otro dispositivo.

**Ventajas:**

- Costo de infraestructura $0 real e indefinido; ni siquiera requiere cuenta de nube.
- Privacidad máxima: el dato nunca sale del control directo del usuario salvo que él decida compartir el archivo.
- Funciona sin conexión a internet.

**Riesgos y conflicto directo con el objetivo de feedback del piloto:**

- **No hay visibilidad centralizada de errores.** A diferencia de las opciones A/B/C (nube compartida), aquí el usuario no puede ver qué le falla a cada colega salvo que el colega le mande su archivo de respaldo o describa el problema manualmente. Esto contradice el objetivo original declarado del piloto ("recibir feedback real de funcionamiento").
- No hay colaboración en tiempo real entre dueño y contador: cada copia es una fotografía del momento de exportación, sin resolución de conflictos si ambos editan por separado después.
- Requiere construir instalador de escritorio y función de respaldo/restauración antes de poder repartirlo a los colegas, lo cual retrasa el inicio del piloto comparado con las opciones A/B/C.
- El archivo de respaldo contiene datos fiscales; si se comparte sin cifrado, es responsabilidad del usuario protegerlo (se recomendaría cifrar el respaldo con contraseña si se construye esta opción).

**Conclusión registrada:** viable técnicamente y coherente con el modelo "local por dispositivo" (Alternativa C de la sección 5), pero **no reemplaza automáticamente el piloto de feedback con colegas** por la pérdida de visibilidad centralizada de errores. Pendiente de decisión del usuario: mantener el piloto en nube (A/B/C) para recibir feedback ahora y dejar esta Alternativa D como el producto local a construir después, o mover el piloto mismo a este modelo aceptando el trade-off de feedback manual.

### 0.5 Restricción crítica confirmada por el usuario: el corazón de la app es el motor CFDI/XML/PDF

El usuario aclaró que todo el motor de la app (clasificación, pólizas, conciliación, reportes) parte del procesamiento de CFDI/XML/PDF. Esta aclaración cambia la evaluación de riesgo de la Alternativa D:

- Ese motor está construido en Python (`lxml`, `cfdiclient`, `sat_ws`, `pymupdf`, `pdfplumber`, etc.) y ya tiene pruebas unitarias construidas alrededor (parsers CFDI, parser bancario, clasificador, conciliación).
- Para que el celular procesara CFDI/XML/PDF de forma local (como planteaba la Alternativa D en modo "cada dispositivo procesa por sí mismo"), habría que **reescribir ese motor completo en JavaScript**. Esto significa reescribir la parte más crítica y más probada del sistema, con alto riesgo de introducir errores fiscales, justo para lograr instalación local en celular.
- **Decisión de riesgo registrada: no se debe reescribir el motor de procesamiento para satisfacer instalación local en celular, al menos no en esta etapa.** El riesgo al corazón del producto no se justifica por la conveniencia de instalación local en móvil.
- En laptop esta restricción no aplica igual: el backend Python puede empaquetarse tal cual (por ejemplo con Tauri/Electron como proceso interno), sin reescribir el motor. Por lo tanto, la Alternativa D **queda limitada a laptop** como posible producto futuro; el celular no debe intentar procesamiento nativo propio por ahora.
- **Implicación para el piloto actual:** el motor debe seguir corriendo centralizado (servidor Python, sin tocar), y tanto laptop como celular deben consumirlo como clientes (vía navegador/PWA). Esto favorece directamente las Opciones A/B/C (nube) sobre mover el piloto completo a la Alternativa D, porque A/B/C no tocan el motor en absoluto.

**Implicaciones de estos parámetros:**

- 10 usuarios reales sostenidos por 6 meses ya no es una prueba de unos días: se debe presupuestar la base de datos como un gasto mensual real, no como algo cubierto por crédito gratuito.
- Con autoservicio de alta, se recomienda preparar una nota corta de bienvenida/instrucciones para los colegas (qué es, qué no cargar, que es beta) antes de compartir el link; esto se define en la etapa de ejecución, no ahora.
- Con 6 meses de uso continuo, deben revisarse antes de iniciar: expiración de sesión JWT razonable para un piloto largo, respaldo periódico real de la base de datos (no solo "promesa"), y un plan de cierre/depuración de datos al llegar al mes 6 (avisar a los colegas con anticipación si se van a borrar los datos de prueba).

## 1. Objetivo del despliegue

SmartContable debe permitir que emprendedores, personas físicas con actividad empresarial, dueños de empresas y contadores puedan:

- Revisar CFDI, ingresos, gastos, pólizas y conciliaciones.
- Trabajar desde laptop y teléfono mediante una interfaz clara.
- Mantener datos fiscales protegidos y aislados por empresa.
- Consultar información histórica sin depender de un equipo específico.
- Operar con un costo para el usuario final que sea transparente y, en el escenario SaaS, preferentemente absorbido por la suscripción o por el negocio, no cobrado como cargo técnico inesperado.

## 2. Estado técnico actual

### Frontend

- React con Vite.
- React Router y Axios.
- Tailwind CSS.
- `VITE_API_URL` controla la URL del backend.
- Ya existe cambio de tema claro/oscuro con `localStorage`.
- La interfaz es responsive en varios módulos, pero todavía requiere validación formal en teléfonos, tablets y laptops.

### Backend

- FastAPI con Uvicorn.
- SQLAlchemy y Alembic.
- MySQL como base de datos principal.
- JWT para autenticación.
- Procesamiento de XML/ZIP CFDI, PDF/CSV/XML bancario y generación de reportes.
- Carga de archivos y procesamiento que puede consumir CPU/memoria.
- Variables obligatorias: `DATABASE_URL` y `SECRET_KEY`.
- CORS configurable por `CORS_ORIGINS`.
- Redis/Celery están contemplados en dependencias, pero deben validarse antes de asumir que forman parte del camino de producción.
- Desarrollo local crea las tablas faltantes durante el startup; producción exige ejecutar `alembic upgrade head` antes de publicar una imagen y no modifica el esquema automáticamente.

### Pruebas actuales

- Existen pruebas backend para informes, carga CFDI, conciliación, parser bancario, exportación y clasificación.
- No existe todavía un baseline formal de cobertura.
- No existe suite frontend automatizada visible en `package.json`.
- No existe pipeline CI/CD ni Dockerfile declarado en el repositorio.
- No existe prueba formal de restauración de backup, carga, seguridad o compatibilidad móvil.

## 3. Fase 1: pruebas unitarias y predeployment

Esta fase es obligatoria antes de cualquier despliegue.

### 3.1 Backend unitario

Prioridad alta:

- Servicios de clasificación por concepto, clave SAT y RFC.
- Generación de pólizas de ingreso, egreso, diario y movimientos bancarios.
- Conciliación por tipo, monto, tolerancia y concepto.
- Parsers CFDI XML/ZIP.
- Parsers bancarios XML, CSV y PDF.
- Exportaciones y filtros por periodo.
- Validadores de empresa, periodo y aislamiento multiempresa.
- Reglas para duplicados, cancelaciones, retenciones y descuentos.

Meta propuesta:

- Cobertura inicial mínima: 70% en servicios críticos.
- Meta antes de producción: 80% en reglas contables, conciliación y seguridad.
- Pruebas de regresión para cada incidente corregido.

### 3.2 Backend integración/API

- Login, expiración y rechazo de credenciales.
- Acceso de usuario a su empresa y rechazo de otra empresa.
- Carga de CFDI y estados de cuenta.
- Creación de póliza desde factura y desde movimiento bancario.
- Reportes con periodo seleccionado.
- Exportación CSV y vista previa.
- Migraciones Alembic sobre una base vacía y una base con datos de prueba.
- Errores consistentes sin filtrar secretos, SQL ni datos sensibles.

### 3.3 Frontend

Incorporar una estrategia de pruebas, a seleccionar antes de ejecutar:

- Pruebas de componentes con Vitest + React Testing Library, o alternativa equivalente aprobada.
- Pruebas de formularios, modales, tema claro/oscuro y periodo global.
- Pruebas de estados de carga, error, vacío y permisos.
- Pruebas de conciliación: filtrar Sin póliza, abrir modal y confirmar payload.
- Pruebas de exportación: seleccionar periodo, abrir vista previa y descargar.

### 3.4 End-to-end

Con Playwright o herramienta equivalente:

1. Iniciar sesión.
2. Crear/seleccionar empresa.
3. Cargar datos de prueba.
4. Revisar documentos e informes por periodo.
5. Crear póliza desde un cargo y un abono sin póliza.
6. Confirmar que cambian a estado conciliable.
7. Exportar y revisar vista previa.
8. Probar móvil y laptop.

### 3.5 Predeployment checklist

- `pytest` completo.
- Build frontend reproducible.
- Lint/type checks sin nuevos errores.
- Escaneo de dependencias y vulnerabilidades.
- Variables de entorno documentadas y sin secretos en Git.
- Migración Alembic validada.
- Endpoint `/health` para comprobar que el proceso vive y `/ready` para comprobar la conexión a la base de datos; `/ready` debe devolver HTTP 503 cuando la base no esté disponible.
- Logs estructurados y correlation/request ID.
- Límites de tamaño y tipo de archivo.
- CORS limitado a dominios reales.
- Cookies/tokens, headers de seguridad y rate limits revisados.
- Backup, restore y prueba de pérdida controlada.
- Prueba de carga básica para login, reportes, carga CFDI y conciliación.
- Presupuesto y alertas aprobados.

## 4. Alcance multidispositivo

### 4.1 Teléfonos

Recomendación: comenzar con web responsive/PWA, no app nativa.

Debe validarse:

- Login y navegación con una mano.
- Selector de periodo y tema.
- Carga de XML, ZIP, PDF y CSV desde archivos del teléfono.
- Tablas con scroll horizontal y alternativa de tarjetas/resumen.
- Modales sin desbordamiento.
- Conciliación sin depender de hover.
- Descarga/compartición de CSV en Android y iOS.
- Red móvil intermitente y reintentos.
- Cámara/escaneo solo como fase posterior; no debe bloquear el primer lanzamiento.

Limitación: el procesamiento PDF/CFDI debe permanecer en backend para no depender de la capacidad del teléfono.

### 4.2 Laptops y desktops

- Soportar Chrome/Edge/Safari/Firefox en versiones vigentes.
- Validar resoluciones de 1280px, 1440px y pantallas pequeñas de laptop.
- Mantener accesibilidad de teclado.
- Probar arrastrar y soltar archivos cuando exista esa interacción.
- Considerar instalación PWA para acceso rápido, sin prometer capacidades offline completas.

### 4.3 Soporte técnico

Antes de ofrecer soporte amplio se debe definir:

- Navegadores y versiones soportadas.
- Tamaño máximo y formatos aceptados.
- Política de retención de archivos.
- Tiempo objetivo de respuesta.
- Exportación de diagnóstico sin datos sensibles.
- Procedimiento de recuperación de cuenta y datos.
- Qué casos requieren contador y cuáles soporte técnico.

## 5. Alternativas de despliegue

### Alternativa A: SaaS cloud administrado, recomendada

**Modelo:** frontend estático + API administrada + MySQL administrado.

Opciones Azure candidatas:

- Vercel para frontend.
- Azure Container Apps o App Service Linux para FastAPI.
- Azure Database for MySQL Flexible Server.
- Key Vault/secret references.
- Application Insights/Azure Monitor.
- Blob Storage opcional para archivos originales y exportaciones.

**Ventajas:**

- Acceso desde teléfono y laptop.
- Datos centralizados y backup administrado.
- Actualizaciones sin reinstalar en cada equipo.
- Mejor soporte multiempresa.
- Posibilidad de escalar procesamiento pesado.

**Impactos técnicos:**

- Dockerización o configuración de runtime.
- Migraciones controladas.
- CORS y dominio HTTPS.
- Persistencia de archivos fuera del contenedor.
- Monitoreo, backups y secretos.
- Separar tareas pesadas con worker si aumenta el volumen.

**Impacto económico:**

- El costo principal será la base MySQL administrada y el procesamiento de archivos.
- Vercel puede operar en plan Free para el piloto; API y base de datos no deben presupuestarse como gratuitas sin validar límites de uso.
- Para que el usuario no pague adicional, el costo debe incluirse en el plan del producto o absorberse durante el piloto.
- Deben configurarse presupuesto, alertas y límites antes de producción.
- La opción más barata no siempre es la más barata operativamente: backups, soporte y recuperación también tienen costo.

### Alternativa B: VPS o servidor cloud con Docker Compose

**Modelo:** un servidor virtual ejecuta frontend, FastAPI, MySQL y opcionalmente Redis.

**Ventajas:**

- Costo mensual más predecible.
- Menor complejidad inicial que varios servicios administrados.
- Fácil de entender para un piloto pequeño.

**Riesgos:**

- El equipo asume backups, parches, firewall, monitoreo y recuperación.
- Un fallo puede afectar toda la aplicación.
- Escalamiento y alta disponibilidad son manuales.
- Requiere disciplina de seguridad y operación.

**Uso recomendado:** demo, piloto controlado o despacho pequeño con responsable técnico.

### Alternativa C: Instalación local por usuario con SQLite

**Modelo:** aplicación empaquetada localmente con backend y base SQLite en el dispositivo.

**Ventajas:**

- Sin costo cloud recurrente por usuario.
- Puede funcionar sin internet.
- Datos permanecen en el equipo del usuario.

**Impactos técnicos importantes:**

- Empaquetar backend y frontend como desktop app o instalador.
- SQLite reemplaza o complementa MySQL.
- Migraciones, backups y recuperación pasan al usuario.
- Actualizaciones y soporte son más complejos.
- No hay colaboración natural entre contador y dueño.
- Sincronizar varios dispositivos requiere un protocolo de conflictos.
- Datos fiscales quedan expuestos si el equipo no está cifrado.
- Cada sistema operativo requiere pruebas e instalador.

**Conclusión:** viable como edición local posterior, no como primer despliegue general.

### Alternativa D: Navegador local con localStorage/IndexedDB

**Modelo:** frontend guarda datos en el navegador.

**Ventajas:**

- Sin servidor para una demo muy pequeña.
- Instalación casi nula.

**Problemas:**

- `localStorage` no es una base fiscal adecuada: es pequeño, plano y vulnerable a borrado del navegador.
- IndexedDB mejora capacidad, pero exige reescribir persistencia, autenticación, procesamiento CFDI/PDF y reglas contables.
- No resuelve backup, colaboración, multiempresa ni sincronización.
- Riesgo alto de pérdida de información y soporte difícil.

**Conclusión:** solo para preferencias, cache temporal o prototipo offline; no para la base contable principal.

### Alternativa E: Híbrida

**Modelo:** operación principal en cloud y cache/offline limitada en PWA o módulo local.

**Ventajas:**

- Acceso desde cualquier dispositivo.
- Puede soportar captura temporal sin conexión.
- Mantiene el backend central como fuente de verdad.

**Riesgos:**

- Sincronización, conflictos y cifrado.
- Mayor costo de desarrollo y pruebas.
- No debe almacenarse información fiscal crítica sin estrategia de reconciliación.

**Conclusión:** buena evolución después de estabilizar SaaS cloud, no primera fase.

### Comparativo resumido

| Alternativa | Costo recurrente | Complejidad técnica | Móvil/laptop | Multiusuario | Offline | Soporte |
|---|---:|---:|---|---|---|---|
| SaaS cloud administrado | Medio, optimizable | Media | Excelente | Excelente | Limitado | Centralizado |
| VPS + Docker Compose | Bajo/medio | Media-alta operativa | Excelente | Bueno | Limitado | Requiere operación |
| Local + SQLite | Bajo cloud | Alta por dispositivo | Variable | Limitado | Bueno | Distribuido |
| localStorage/IndexedDB | Bajo cloud | Alta por reescritura | Bueno | Malo | Bueno | Difícil |
| Híbrida | Medio/alto | Alta | Excelente | Excelente | Parcial | Complejo |

## 6. Recomendación por etapas

### Etapa 0 — Decisión y baseline

- Aprobar este documento.
- Confirmar usuarios iniciales, empresas, volumen de CFDI y presupuesto mensual máximo.
- Definir si el producto será SaaS con costo incluido o edición local.
- Congelar un conjunto de datos de prueba sin información sensible.

### Etapa 1 — Calidad antes de despliegue

- Completar unitarias e integración.
- Añadir frontend tests y E2E.
- Formalizar cobertura y CI.
- Agregar health/readiness.
- Corregir startup para ejecutar Alembic fuera de `create_all` en producción.
- Definir límites de carga y observabilidad.

### Etapa 2 — Empaquetado reproducible

- Validar los Dockerfiles y archivos de despliegue ya preparados localmente.
- Probar imágenes localmente.
- Definir variables de entorno por ambiente.
- Probar conexión con RDS for MySQL desde EC2; Redis/Celery solo si realmente se usan.
- Documentar backup y restore.

### Etapa 3 — Piloto de feedback (fase vigente, ver sección 0.1 y 0.2)

- Frontend estático (Vercel, Free).
- API FastAPI de una sola instancia en Amazon EC2, validada para soportar ~10 usuarios con alta autoservicio.
- Amazon RDS for MySQL como base de datos, con exportación y prueba de restauración documentadas para los datos de beta.
- PWA habilitada para acceso desde celular sin tienda de apps.
- Monitoring mínimo y presupuesto/alertas configurados desde el día uno.
- Usuarios: el propio usuario + ~10 colegas contadores con alta autoservicio.
- Duración confirmada: 6 meses, con revisión de resultados y plan de cierre/depuración de datos al final del periodo.

### Etapa 4 — Validación móvil y soporte

- Pruebas en Android/iOS y laptops.
- Manual de soporte.
- Pruebas de recuperación.
- Revisión de accesibilidad y comprensión de lenguaje.

### Etapa 5 — Escalamiento

- Workers para PDF/CFDI si el volumen lo requiere.
- Storage separado para archivos.
- Redis administrado solo con evidencia de necesidad.
- Réplicas, colas, alertas y políticas de retención.
- Evaluación de PWA offline o edición local únicamente con caso de negocio confirmado.

## 7. Decisión recomendada

Para esta fase piloto (ver decisión vigente en la sección 0.1):

1. **Web responsive/PWA con backend centralizado, sin app nativa todavía.**
2. **No usar localStorage ni SQLite local como base contable de este piloto.**
3. **No crear versión local por usuario hasta medir el costo real de soporte, la demanda offline y el resultado del feedback de los colegas contadores.**
4. **Piloto cloud pequeño: Vercel Free, Amazon EC2 y Amazon RDS for MySQL, sujetos a la elegibilidad, límites y vigencia de AWS Free Tier.**
5. **Mantener Oracle Cloud/VPS como alternativa futura si AWS Free Tier deja de cubrir el uso del piloto.**
6. **Usar edición local SQLite/nativa solo como producto separado y evolución futura, no como bifurcación improvisada de este piloto.**

## 8. Criterio de entrada a implementación

La integración puede comenzar únicamente cuando se cumplan ambas condiciones:

- El usuario escribe: **VAMOS CON TODO**.
- Se confirma la alternativa de despliegue, presupuesto objetivo, política de backups y alcance del piloto. La región AWS ya está confirmada: `us-east-2` (Ohio).

Después de esa autorización, el orden será:

1. Pruebas y predeployment.
2. Dockerización reproducible.
3. Validación local.
4. Infraestructura como código si se elige cloud.
5. Despliegue piloto.
6. Pruebas de humo.
7. Monitoreo y medición de costos.
8. Decisión de escalar o cambiar de alternativa.

## 9. Parámetros pendientes antes de publicar

- Usuarios: confirmado, aproximadamente 10 colegas contadores además del propietario.
- ¿Cuántos CFDI y movimientos bancarios se procesan por mes?
- ¿Se requiere operar sin internet o solo tener buena experiencia móvil?
- Presupuesto: confirmado, $0 durante los 6 meses del piloto.
- ¿Cuántas empresas tendrá el piloto?
- ¿Se necesita colaboración en tiempo real entre dueño y contador?
- Región AWS: confirmada, `us-east-2` (Ohio).
- ¿Cuál será el periodo de retención de XML, PDF, CSV y reportes?
