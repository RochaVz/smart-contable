# Reporte Tecnico Detallado

## Sesion de trabajo: PWA movil, modo local y respaldo en dispositivo

## Fecha
2026-09-04

## Rama y commits
- Rama de trabajo: feat/conciliacion-csv-upload
- Rama publicada a produccion: main
- Commit final publicado: f4f0ee0 - Mejora PWA movil y modo local
- Merge a main: fast-forward, sin conflictos
- Push realizados:
  - feat/conciliacion-csv-upload -> origin/feat/conciliacion-csv-upload
  - main -> origin/main

## Objetivo de la sesion
Convertir la experiencia movil de SmartContable en una PWA mas profesional, estable e intuitiva, y habilitar un modo local para que informacion sensible pueda guardarse y respaldarse en el propio dispositivo del usuario sin depender de nube o servidor para ciertos flujos.

Los objetivos especificos fueron:

1. Mejorar la interfaz movil y modo claro.
2. Reemplazar el branding de Vite por identidad visual de SmartContable.
3. Implementar actualizaciones automaticas de PWA mediante service worker versionado.
4. Agregar respaldo local descargable/restaurable.
5. Permitir alta de negocios locales aunque el backend no este disponible.
6. Evitar errores 422 al abrir empresas con IDs locales.
7. Importar CFDI XML y ZIP en modo local sin enviarlos al servidor.
8. Mostrar documentos, tendencia, registro contable, resumen fiscal, padron de proveedores y revision bancaria para negocios locales.
9. Publicar los cambios en GitHub y fusionarlos a main para despliegue en Vercel.

## Resumen ejecutivo de cambios
Durante esta sesion se implemento una evolucion importante del frontend/PWA. La app ahora soporta una capa local basada en IndexedDB, con respaldo por dispositivo y por negocio. Se agregaron vistas locales para negocios, facturas, informes, padron de proveedores, registro contable y conciliacion bancaria.

Tambien se corrigieron problemas de UX detectados directamente en navegador movil:

- Contenedores moviles que se desplazaban o se sentian de escritorio reducido.
- Modo claro con contraste bajo o botones con texto incorrecto.
- Logo/fav icon heredado de Vite.
- Pantallas locales que intentaban llamar al backend con IDs tipo local-..., provocando 422.
- Secciones locales que parecian vacias: Tendencia, Registro contable, Resumen/Padron y Revision bancaria.

## Cambios tecnicos por area

### 1) Base visual movil y modo claro
Archivos principales:
- frontend/src/index.css
- frontend/src/pages/Dashboard.jsx
- frontend/src/pages/CompanyDetail.jsx
- frontend/src/components/ThemeToggle.jsx
- frontend/src/components/InformesPanel.jsx
- frontend/src/components/ConciliacionBancariaPanel.jsx
- frontend/src/components/ComisionesBancoPanel.jsx
- frontend/src/components/FileUploadModal.jsx
- frontend/src/components/FacturaDetailModal.jsx
- frontend/src/components/NewCompanyModal.jsx

Cambios realizados:

- Se agrego base global para evitar overflow horizontal accidental:
  - box-sizing: border-box
  - html/body/root con min-width seguro
  - overflow-x hidden controlado
  - inputs/selects a 16px en movil para evitar zoom automatico del navegador
- Se ajustaron paddings, radios, botones tactiles y layouts responsive.
- En Dashboard se redujo ruido visual y se mejoraron tarjetas de negocio.
- En CompanyDetail se agregaron tarjetas moviles para facturas, evitando tabla forzada en celular.
- Se mejoro modo claro con:
  - fondo con mayor profundidad
  - superficies claras con mejor contraste
  - sombras mas suaves
  - correccion de texto blanco en botones de color
  - mejor legibilidad de inputs/selects/bordes

Decision tecnica:
Se opto por mejorar el tema claro desde overrides globales existentes porque la app ya estaba construida con clases Tailwind oscuras y una capa global de modo claro. Esto evito reescribir componente por componente.

### 2) Branding SmartContable y reemplazo de Vite
Archivos principales:
- frontend/public/favicon.svg
- frontend/index.html
- frontend/public/manifest.webmanifest
- frontend/src/components/SmartContableMark.jsx
- frontend/src/pages/Login.jsx
- frontend/src/pages/Dashboard.jsx

Cambios realizados:

- Se reemplazo el favicon de Vite por un icono propio de SmartContable.
- Se agrego apple-touch-icon para instalacion en celular.
- Se versiono el favicon con query string para evitar cache viejo:
  - /favicon.svg?v=2026.09.04.x
- Se creo SmartContableMark como componente reutilizable.
- Login dejo de usar un candado generico como marca principal.
- Dashboard dejo de usar icono de maletin generico como logo.

Decision tecnica:
El icono se mantuvo como SVG local para no depender de imagen externa y para que el manifest/PWA lo pueda cachear con el service worker.

### 3) PWA y actualizacion automatica
Archivos principales:
- frontend/public/sw.js
- frontend/src/main.jsx
- frontend/index.html
- frontend/public/manifest.webmanifest

Cambios realizados:

- Se agrego versionado explicito en service worker:
  - APP_VERSION = '2026.09.04.11'
  - CACHE_NAME = smartcontable-app-${APP_VERSION}
- Se limpio cache anterior al activar una version nueva.
- Se uso skipWaiting() para activacion automatica.
- Se agrego recarga automatica con controllerchange.
- Se excluyeron del cache:
  - /api/
  - peticiones no GET
  - recursos de desarrollo de Vite
  - rutas con parametro t de HMR
- Se agrego soporte basico de navegacion SPA con fallback a /index.html.

Decision tecnica:
No se cachean respuestas API porque contienen informacion fiscal/contable que puede quedar desactualizada o ser sensible. El service worker se usa para app shell y actualizacion de PWA, no para guardar datos de negocio.

### 4) Respaldo local en dispositivo
Archivos principales:
- frontend/src/services/localBackup.js
- frontend/src/components/DeviceBackupPanel.jsx
- frontend/src/services/api.js
- frontend/src/pages/Dashboard.jsx

Cambios realizados:

- Se creo una base local IndexedDB:
  - DB: smartcontable-local-vault
  - stores: snapshots, meta, companies, invoices, bankMovements
- Se agregaron funciones para:
  - guardar snapshots de respuestas API no sensibles
  - guardar empresas locales
  - guardar facturas locales
  - guardar movimientos bancarios locales
  - exportar respaldo completo del dispositivo
  - exportar respaldo por negocio
  - importar respaldo JSON
  - borrar respaldo local
- Se excluyo explicitamente localStorage.token del respaldo.
- Se excluyeron /auth/ y blobs/arraybuffers del snapshot automatico.
- Se agrego panel de respaldo dentro de cada negocio, como boton desplegable:
  - Descargar
  - Restaurar
  - Borrar

Decision tecnica:
IndexedDB fue elegido sobre localStorage porque soporta mayor volumen de datos, estructuras complejas y archivos procesados como facturas/movimientos. localStorage se mantiene solo para preferencias ligeras como tema.

### 5) Alta de negocio local y UX de busqueda
Archivos principales:
- frontend/src/pages/Dashboard.jsx
- frontend/src/components/NewCompanyModal.jsx
- frontend/src/services/localBackup.js

Problema detectado:
Al escribir un RFC en el buscador, el usuario percibia que la app solo buscaba y no permitia agregar el negocio.

Cambios realizados:

- Si la busqueda no encuentra resultados, aparece boton Agregar este negocio.
- El modal se abre con RFC o razon social prellenados segun lo escrito.
- El formulario de alta se volvio controlado.
- Si el backend falla, responde 401/500 o no esta disponible, el negocio se guarda localmente en IndexedDB.
- Las empresas locales aparecen con etiqueta:
  - Guardado en este dispositivo

Decision tecnica:
Se mantuvo primero el intento contra backend cuando aplica, pero se agrego fallback local para cumplir el requerimiento de datos en dispositivo y para que la UX no dependa de conectividad.

### 6) Empresas locales sin error 422
Archivos principales:
- frontend/src/pages/CompanyDetail.jsx
- frontend/src/components/FileUploadModal.jsx
- frontend/src/components/FacturaDetailModal.jsx
- frontend/src/services/localBackup.js

Problema detectado:
Al abrir /empresa/local-HMC911104DR5, CompanyDetail enviaba el ID local al backend:

- /api/v1/empresas/local-HMC911104DR5
- /api/v1/facturas/?empresa_id=local-HMC911104DR5

FastAPI esperaba un ID numerico y respondia 422 Unprocessable Content.

Cambios realizados:

- CompanyDetail detecta IDs que empiezan con local-.
- Para empresas locales ya no llama endpoints numericos del backend.
- Carga empresa, facturas y movimientos desde IndexedDB.
- FacturaDetailModal no pide detalle remoto para facturas locales.
- Eliminacion de facturas locales se hace en IndexedDB.

Resultado:
Se elimino el 422 para rutas locales y las pantallas locales cargan desde el dispositivo.

### 7) Importacion local de CFDI XML y ZIP
Archivos principales:
- frontend/src/services/localBackup.js
- frontend/src/components/FileUploadModal.jsx
- frontend/package.json
- frontend/package-lock.json

Dependencia agregada:
- jszip

Cambios realizados:

- Importacion XML individual local.
- Importacion ZIP local con multiples XML.
- Parseo local de CFDI en navegador usando DOMParser.
- Campos extraidos:
  - UUID
  - RFC emisor
  - RFC receptor
  - nombre emisor/receptor
  - fecha
  - subtotal
  - IVA trasladado
  - IVA retenido
  - ISR retenido
  - total
  - conceptos
- Determinacion de tipo:
  - VENTA si RFC emisor = RFC de la empresa
  - GASTO si RFC receptor = RFC de la empresa
- Duplicados detectados por UUID.
- ZIP reporta:
  - exitos
  - duplicados
  - errores
  - archivos no XML
  - detalles por archivo

Decision tecnica:
Se agrego JSZip porque el navegador no puede leer ZIP nativamente. El parseo XML se hizo con DOMParser para mantener el procesamiento dentro del dispositivo.

### 8) Tendencia 2026 local en movil
Archivo principal:
- frontend/src/pages/CompanyDetail.jsx

Problema detectado:
El contenedor Tendencia 2026 aparecia en blanco en movil. Recharts renderizaba una zona poco util o sin barras visibles en el viewport movil.

Cambios realizados:

- En movil se reemplazo Recharts por barras HTML/CSS estables.
- En pantallas medianas/grandes se conserva Recharts.
- Se agrego estado vacio cuando no hay movimientos.
- La vista movil muestra por mes:
  - Ingresos
  - Egresos
  - Neto
  - barras proporcionales

Decision tecnica:
Para PWA movil se prefirio un render HTML/CSS determinista. Es menos vistoso que un chart SVG, pero mucho mas estable y legible en celular.

### 9) Registro contable local
Archivo principal:
- frontend/src/pages/CompanyDetail.jsx

Problema detectado:
La seccion Registro contable para empresas locales se sentia en blanco porque solo mostraba un placeholder.

Cambios realizados:

- Se agrego vista Registro contable local.
- Muestra:
  - CFDI del periodo
  - total registrado
  - asientos provisionales por CFDI
  - columnas Cuenta / Debe / Haber
- Para ingresos:
  - Debe: Clientes / Bancos
  - Haber: Ventas generales
  - Haber: IVA trasladado
- Para gastos:
  - Debe: gasto/proveedor clasificado
  - Debe: IVA acreditable
  - Haber: Proveedores / Bancos

Decision tecnica:
Se implemento como registro provisional local, no como motor contable definitivo. Esto permite dar valor inmediato en modo local sin replicar toda la logica backend de polizas.

### 10) Resumen local y padron de proveedores
Archivo principal:
- frontend/src/pages/CompanyDetail.jsx

Problema detectado:
Faltaba Padron de proveedores en modo local.

Cambios realizados:

- La seccion Resumen del negocio ahora tiene una vista local propia.
- Calcula desde CFDI locales:
  - ingresos
  - gastos
  - IVA trasladado
  - IVA acreditable
  - clientes detectados
  - padron de proveedores
- El padron agrupa CFDI de gastos por RFC proveedor.
- Muestra por proveedor:
  - RFC
  - nombre
  - cantidad de CFDI
  - subtotal
  - IVA
  - total
- Si no hay gastos, muestra un mensaje claro para importar XML donde el RFC de la empresa sea receptor.

Decision tecnica:
El padron local se deriva directamente de CFDI, sin servidor. Esto cumple el principio de privacidad y permite aprendizaje contable desde los documentos cargados.

### 11) Revision bancaria local, PDF/CSV y movimientos sin relacion
Archivos principales:
- frontend/src/components/LocalConciliacionPanel.jsx
- frontend/src/pages/CompanyDetail.jsx
- frontend/src/services/localBackup.js
- frontend/package.json
- frontend/package-lock.json

Dependencia agregada:
- pdfjs-dist

Problema detectado:
En empresas locales, Revision bancaria no mostraba opcion para parsear PDF del estado de cuenta ni conciliacion contra polizas/CFDI locales.

Cambios realizados:

- Se creo LocalConciliacionPanel.
- En empresas locales, la seccion Revision bancaria usa este panel.
- Se agregaron botones:
  - PDF
  - CSV
- CSV se parsea localmente buscando columnas:
  - fecha
  - descripcion/concepto/detalle
  - referencia/folio
  - cargo/retiro/debito
  - abono/deposito/credito
  - monto/importe
- PDF se parsea localmente con pdfjs-dist:
  - extraccion de texto por pagina
  - deteccion heuristica de lineas con fecha y monto
  - inferencia de cargo/abono por palabras clave
- Los movimientos se guardan en IndexedDB.
- La conciliacion local compara movimientos contra CFDI del periodo:
  - Abono se compara contra VENTA
  - Cargo se compara contra GASTO
  - Tolerancia por monto: hasta 1 peso
  - Tolerancia por fecha: hasta 7 dias
- La vista muestra:
  - total movimientos
  - con poliza/relacionados
  - sin relacion
  - abonos/cargos del banco
  - lista de movimientos
  - etiqueta Movimiento sin relacion de poliza cuando no hay match

Decision tecnica:
pdfjs-dist se cargo con import dinamico para evitar inflar el bundle principal. El worker PDF queda como asset separado y solo se carga al procesar PDF.

## Validaciones ejecutadas

### Build frontend
Comando ejecutado varias veces durante la sesion:

```bash
npm run build
```

Resultado:
- Build exitoso.
- La version final genero assets separados, incluyendo worker PDF.

### Lint enfocado
Se ejecuto ESLint de forma enfocada en archivos nuevos o modificados por cada cambio, por ejemplo:

```bash
npx eslint src/services/localBackup.js src/components/FileUploadModal.jsx
npx eslint src/components/LocalConciliacionPanel.jsx src/services/localBackup.js src/components/DeviceBackupPanel.jsx
```

Resultado:
- Lint enfocado limpio en los archivos nuevos principales.
- Persisten errores existentes de React Compiler/memoizacion en CompanyDetail.jsx cuando se ejecuta lint completo o enfocado a ese archivo. No bloquearon build de produccion.

### Verificaciones con navegador movil
Se uso viewport movil aproximado:

```text
390 x 844
```

Validaciones realizadas:

- Login movil sin overflow horizontal.
- Dashboard movil sin overflow horizontal.
- CompanyDetail movil sin overflow horizontal.
- Favicon nuevo servido desde /favicon.svg versionado.
- Service worker registrado y respondiendo version.
- Empresa local /empresa/local-HMC911104DR5 sin llamadas al backend con ID local.
- Alta local de negocio cuando backend falla.
- Importacion de XML CFDI local.
- Importacion de ZIP local con 2 XML validos y 1 archivo no XML.
- Tendencia 2026 mostrando barras en movil.
- Registro contable local mostrando Debe/Haber.
- Resumen local mostrando padron de proveedores y clientes detectados.
- Revision bancaria local mostrando botones PDF/CSV.
- Importacion CSV bancaria local con:
  - 1 movimiento relacionado con CFDI.
  - 1 movimiento sin relacion de poliza.

## Publicacion

Comandos finales ejecutados:

```bash
git add .
git commit -m "Mejora PWA movil y modo local"
git push
git switch main
git pull origin main
git merge feat/conciliacion-csv-upload
git push origin main
```

Resultado:
- Commit f4f0ee0 publicado.
- main actualizado en GitHub.
- Vercel deberia desplegar produccion desde main si el proyecto esta conectado a esa rama.

## Riesgos y limitaciones actuales

1. El parser PDF local es heuristico.
   - Funciona con PDFs que tengan texto seleccionable.
   - Puede fallar con PDFs escaneados como imagen.
   - Puede requerir reglas por banco para formatos complejos.

2. El registro contable local es provisional.
   - Sirve para visualizacion y aprendizaje.
   - No reemplaza completamente el motor backend de polizas.

3. La conciliacion local usa matching simple.
   - Monto con tolerancia de 1 peso.
   - Fecha con tolerancia de 7 dias.
   - No usa todavia reglas avanzadas por referencia, folio o comisiones.

4. IndexedDB es almacenamiento del navegador/dispositivo.
   - Si el usuario borra datos del sitio o desinstala la PWA sin respaldo, puede perder informacion local.
   - Por eso el boton Respaldo por negocio es critico.

5. npm audit reporto 1 vulnerabilidad high severity despues de instalar dependencias.
   - No se ejecuto npm audit fix para evitar cambios colaterales sin revision.

## Aprendizajes tecnicos de la sesion

1. En PWAs, cambiar APP_VERSION no siempre actualiza de inmediato si el usuario esta en una sesion abierta; por eso se combino skipWaiting con controllerchange.
2. Los datos sensibles no deben guardarse en cache del service worker. IndexedDB permite control mas explicito y exportacion manual.
3. Los IDs locales tipo local-RFC deben tratarse como una ruta distinta; enviarlos al backend numerico provoca 422.
4. Para movil, algunos componentes SVG/chart pueden verse tecnicamente montados pero visualmente inutiles. Un grafico HTML/CSS simple puede ser mas robusto.
5. La UX debe diferenciar claramente buscar de crear. Un buscador sin CTA de alta se percibe como bloqueo.
6. En modo local, cada pantalla remota debe tener equivalente local o un estado vacio accionable.

## Recomendaciones siguientes

1. Agregar reglas especificas de parser PDF por banco: BBVA, Banorte, Santander, HSBC, Banamex.
2. Agregar OCR opcional para PDFs escaneados si se decide aceptar imagenes.
3. Crear un indicador global de Modo local / En este dispositivo.
4. Permitir editar/eliminar movimientos bancarios locales desde Revision bancaria.
5. Mejorar conciliacion local con referencia, descripcion normalizada y tolerancia configurable.
6. Separar utilidades locales en modulos mas pequenos si localBackup.js sigue creciendo.
7. Agregar pruebas unitarias frontend para parser XML, ZIP, CSV y conciliacion local.
8. Resolver errores existentes de React Compiler/memoizacion en CompanyDetail.jsx.

## Estado final de esta sesion

- Cambios implementados.
- Build frontend exitoso.
- Lint enfocado limpio en archivos nuevos principales.
- Commit creado y publicado.
- Merge a main realizado.
- main publicado en GitHub para despliegue Vercel.

---

## Proyecto
SmartContable

## Fecha
2026-08-11

## Rama y commits
- Rama: feat/conciliacion-csv-upload
- Commit base previo: 2285b90
- Commit final de esta fase: de27bb5

## Resumen ejecutivo
Durante esta iteracion se estabilizo y endurecio el flujo de carga CFDI y la generacion de polizas, con foco en:

1. Corregir causas reales de no guardado en carga ZIP.
2. Mejorar diagnostico backend y frontend para diferenciar duplicados, XML invalidos/vacios y archivos no XML.
3. Revertir quirurgicamente el modal de carga CFDI al flujo estable para eliminar regresiones de UX/logica.
4. Implementar clasificacion inteligente de egresos por concepto de factura, manteniendo fallback por clave SAT.
5. Introducir reglas configurables por empresa (RFC, concepto, clave SAT) con migracion de esquema.
6. Corregir transaccionalidad de generacion automatica mensual para evitar rollback global por errores parciales.
7. Ajustar poliza de ingresos para usar contrapartida Baucher/Efectivo segun forma de pago.
8. Corregir historico de polizas de ingreso en BD para eliminar contrapartidas antiguas contra Clientes.

## Incidencias atendidas

### 1) Carga CFDI ZIP no guardaba registros
**Sintoma**
- Mensaje ambiguo de no guardado, sin identificar causa real.

**Causas observadas**
- ZIP con archivos no XML.
- XML duplicados.
- XML invalidos o vacios.
- En etapas previas, error de esquema por longitud de serie.

**Acciones**
- Backend: respuesta enriquecida con no_xml, archivos_no_xml y detalles por archivo.
- Frontend: mensajes explicitos para cada causa y muestra de nombres de archivos problematicos.
- Mensajeria de error no ambigua para soporte y usuario.

### 2) Error de esquema en factura.serie
**Sintoma**
- Falla por longitud insuficiente de serie en algunos CFDI.

**Accion**
- Se amplio longitud de serie en modelo y base de datos.

### 3) Generar del mes con errores parciales
**Sintoma**
- Si una factura fallaba, podia revertirse trabajo valido del lote.

**Causa**
- Uso de rollback global dentro del ciclo de facturas.

**Accion**
- Se aislo cada factura con savepoint (transaccion anidada) para que un fallo no revierta las demas.

### 4) Poliza de ingresos contra Clientes
**Sintoma**
- Polizas de ingreso mostraban haber en 105.01.01 Clientes.

**Accion funcional**
- Se cambio contrapartida segun forma de pago:
  - Tarjeta: 102.02.01 Baucher
  - Efectivo/Cheque: 102.03.01 Depositos en efectivo
- Bancos (102.01.01) se mantiene como cuenta de deposito neto.

**Accion de datos historicos**
- Migracion de datos para reemplazar contrapartidas antiguas de ingreso en movimientos historicos.

## Cambios tecnicos por componente

### Backend

#### A) Endpoint de facturas
Archivo: backend/app/api/v1/endpoints/facturas.py

- Carga ZIP reforzada:
  - Conteo de archivos no XML.
  - Lista de nombres no XML.
  - Detalles por archivo con estatus no_xml, duplicado, error, omitido_complemento_pago y ok.
- Mensajes de salida diferenciados cuando exitos = 0:
  - Todos duplicados.
  - XML con error/vacios.
  - Solo no XML.
  - Solo complementos de pago omitidos.

#### B) Motor de polizas
Archivo: backend/app/services/polizas.py

- Clasificacion inteligente de egresos:
  - Prioridad efectiva:
    1. Regla RFC por empresa.
    2. Regla configurable por concepto.
    3. Catalogo base por concepto.
    4. Regla configurable por clave SAT.
    5. Catalogo base por clave SAT.
    6. Fallback gastos generales.
- Generacion automatica mensual:
  - Savepoint por factura para evitar rollback global.
- Poliza de ingresos:
  - Contrapartida dinamica por forma de pago.
  - Integracion de cuentas Baucher/Efectivo.

#### C) Clasificador
Archivo: backend/app/services/clasificador.py

- Se agregaron reglas por texto de concepto.
- Normalizacion de texto para matching robusto (minusculas, sin acentos, limpieza de simbolos).

#### D) Configuracion de mapeos
Archivo: backend/app/api/v1/endpoints/configuracion.py

- Upsert de mapeos por tipo_regla.
- Validaciones por tipo:
  - rfc exige rfc_emisor.
  - concepto exige patron.
  - clave_sat exige patron.
- Listado con filtro opcional por tipo_regla.
- Validacion de acceso multiempresa.

#### E) Modelo y schema de mapeos
Archivos:
- backend/app/models/mapeo_cuenta.py
- backend/app/schemas/mapeo_cuenta.py

- Nuevos campos:
  - tipo_regla
  - patron
- Compatibilidad hacia atras para registros RFC.

### Migraciones Alembic

1. backend/alembic/versions/6f4e1c2b9a11_expand_factura_serie_length.py
   - Amplia longitud de facturas.serie.

2. backend/alembic/versions/9b2ad1e77c31_mapeo_cuentas_reglas_configurables.py
   - Agrega tipo_regla y patron a mapeo_cuentas.

3. backend/alembic/versions/c3f84a91d2aa_corregir_contrapartida_ingresos_a_baucher.py
   - Corrige historico de movimientos de ingreso:
     - 105.01.01 Clientes -> 102.02.01 Baucher para tarjeta.
     - 105.01.01 Clientes -> 102.03.01 Depositos en efectivo para efectivo/cheque.

### Frontend

#### A) Modal de carga CFDI
Archivo: frontend/src/components/FileUploadModal.jsx

- Reversion al flujo estable de carga.
- Mensajes claros de diagnostico en ZIP.
- Soporte visual para errores con nombres de archivos.

#### B) Panel de polizas
Archivo: frontend/src/components/PolizasPanel.jsx

- Mensajeria mejorada para errores parciales en Generar del mes.
- Incluye ejemplos de UUID y motivo para depuracion rapida.

## Validacion y pruebas ejecutadas

### Backend
- python -m pytest tests/test_facturas_upload.py
- python -m pytest tests/test_clasificador_concepto.py tests/test_facturas_upload.py

Resultado:
- 6 pruebas en verde en la corrida conjunta mas reciente.

### Frontend
- npm run build

Resultado:
- Build exitoso en las iteraciones validadas.

### Verificacion de datos historicos
- Consulta SQL de control posterior a migracion de contrapartida:
  - Conteo de movimientos de poliza ingreso en cuenta 105.01.01 = 0

## Impacto funcional esperado

1. Carga ZIP informa causa real de no guardado.
2. Menor soporte reactivo por mensajes ambiguos.
3. Clasificacion de egresos mas cercana a operacion contable real por concepto.
4. Reglas por empresa permiten personalizacion estilo CONTPAQi sin hardcode por cliente.
5. Generacion mensual no pierde progreso por fallos puntuales.
6. Ingresos ya no quedan contra Clientes, sino contra Baucher/Efectivo segun forma de pago.

## Riesgos residuales

1. Puede haber conceptos fuera del vocabulario base; se mitiga con reglas configurables por empresa.
2. Diferencias de catalogo entre despachos requieren ajuste inicial de mapeos.
3. Advertencias de estilo/lint existentes no criticas pueden persistir fuera del alcance funcional.

## Recomendaciones siguientes

1. Crear una pantalla dedicada para administrar reglas tipo_regla y patron.
2. Agregar pruebas especificas de poliza ingreso por forma de pago (tarjeta, efectivo, cheque, PPD).
3. Agregar pruebas de integracion para Generar del mes con mezcla de facturas validas e invalidas.
4. Documentar payloads API de configuracion para uso operativo (Postman/Swagger).

## Estado final

- Cambios implementados, validados localmente y publicados en remoto.
- Flujo de carga y polizas con diagnostico y control contable reforzados.
