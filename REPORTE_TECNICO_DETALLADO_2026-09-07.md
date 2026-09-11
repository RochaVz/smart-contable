# Reporte Tecnico Detallado

## Sesion de trabajo: parsers CFDI y bancarios, respaldos portables, experiencia movil y despliegue productivo

## Fecha

2026-09-07

## Rama y version publicada

- Rama: `main`
- Commit: `1becc2c mejora parsers y experiencia movil`
- Remoto: `origin/main`
- Estado final de Git: limpio y sincronizado
- Frontend publicado: `https://smart-contable.vercel.app`
- Backend productivo: `https://3-12-148-63.nip.io`

## Objetivo de la sesion

Consolidar mejoras funcionales y operativas de SmartContable para que la aplicacion:

1. Permita eliminar empresas desde el dashboard.
2. Permita agregar/restaurar respaldos desde el dispositivo.
3. Transporte empresas y facturas entre computadoras sin colisiones de IDs.
4. Extraiga correctamente receptor, conceptos, claves SAT y descripciones de CFDI.
5. Clasifique mejor los egresos a partir de todos los conceptos del XML.
6. Corrija la separacion de cargos, abonos y saldos en PDFs BBVA.
7. Deje preparado el parser generico para futuras pruebas con Santander y Banamex.
8. Se adapte correctamente a celulares, tablets e iPad.
9. Actualice la cache PWA automaticamente.
10. Publique la version actualizada en frontend y backend productivo.

## Resumen ejecutivo

Se implemento un conjunto de mejoras de producto y confiabilidad. El dashboard ahora permite eliminar empresas remotas mediante desactivacion logica y empresas locales junto con sus datos del dispositivo. El panel de respaldo incorpora un boton visible `Agregar respaldo` para importar archivos JSON desde otra computadora.

El formato de respaldo se fortalecio para evitar colisiones de identificadores. Las empresas importadas se relacionan por RFC, las facturas se regeneran con IDs locales y se deduplican por UUID fiscal. Los movimientos bancarios se deduplican por fingerprint y los snapshots se almacenan con claves aisladas.

El parser CFDI ahora expone informacion estructurada del receptor, todos los conceptos, claves `ClaveProdServ`, descripciones, `ClaveUnidad`, `NoIdentificacion` y `ObjetoImp`. La generacion de polizas de egreso utiliza la descripcion completa y las claves SAT disponibles para clasificar gastos.

El parser BBVA fue reforzado para no sumar el saldo como cargo o abono. Tambien se preparo el parser generico para detectar columnas de cargos, abonos y saldo en futuros estados Santander y Banamex, manteniendo un fallback por signo para formatos simples.

La experiencia movil se ajusto con contenedores de ancho seguro, viewport dinamico, soporte para safe areas y control de overflow. Finalmente, el backend productivo fue reconstruido mediante AWS SSM y Docker, conservando variables de entorno, volumenes y base de datos.

## Cambios tecnicos

### 1. Eliminacion de empresas

Archivos principales:

- `frontend/src/pages/Dashboard.jsx`
- `backend/app/api/v1/endpoints/empresas.py`
- `frontend/src/services/localBackup.js`

El backend ya contaba con `DELETE /api/v1/empresas/{empresa_id}` como soft delete. Se conecto ese endpoint al dashboard.

Comportamiento implementado:

- Empresa remota: llamada a `DELETE /empresas/{id}`.
- Empresa local: elimina empresa, facturas locales y movimientos bancarios locales de IndexedDB.
- Confirmacion antes de eliminar.
- Estado visual `Eliminando...` durante la operacion.
- Notificacion de exito o error.
- El boton detiene la propagacion del clic para no abrir el detalle de la empresa.

### 2. Respaldo local y transferencia de empresas

Archivos principales:

- `frontend/src/components/DeviceBackupPanel.jsx`
- `frontend/src/services/localBackup.js`
- `frontend/src/pages/Dashboard.jsx`

Se agrego un boton visible `Agregar respaldo` en las tarjetas de negocios. El boton abre directamente el selector de archivos JSON.

La exportacion de una empresa sincronizada ahora consulta sus facturas remotas antes de generar el respaldo portable.

El formato de respaldo evoluciono a version 2:

- RFC como identidad funcional de la empresa.
- IDs internos regenerados al importar.
- UUID fiscal como criterio de deduplicacion de facturas.
- Fingerprint como criterio de deduplicacion de movimientos bancarios.
- Snapshots importados con namespace para no sobrescribir cache local.
- Token de autenticacion excluido del respaldo.
- Compatibilidad de importacion con formatos version 1 y 2.

Flujo resultante:

1. El usuario descarga el respaldo de una empresa.
2. El contador lleva el archivo a otra computadora.
3. Pulsa `Agregar respaldo`.
4. La empresa se crea como copia local independiente.
5. Las facturas y movimientos se remapean sin colisionar con otros registros.

Alcance actual:

- El respaldo permite revision local en otra computadora.
- No crea automaticamente una empresa remota en la cuenta cloud del segundo usuario.
- Para eso se requeriria un endpoint de importacion autenticada en backend.

### 3. Parseo CFDI y clasificacion de egresos

Archivos principales:

- `backend/app/services/sat_parser.py`
- `backend/app/services/polizas.py`
- `backend/tests/test_sat_parser_egresos.py`

El parser ahora conserva informacion estructurada del receptor:

- RFC.
- Nombre.
- Uso de CFDI.
- Regimen fiscal.
- Domicilio fiscal.

Cada concepto incluye:

- `clave_prod_serv`.
- `descripcion`.
- `clave_unidad`.
- `no_identificacion`.
- `objeto_imp`.
- Cantidad.
- Unidad.
- Valor unitario.
- Importe.
- Descuento.

Se agregaron campos consolidados:

- `claves_prod_serv`.
- `descripciones_conceptos`.
- `concepto_completo`.
- `clave_prod_serv_principal`.

La poliza de egreso ya no depende unicamente del primer concepto. La clasificacion utiliza todas las descripciones y claves SAT disponibles en el CFDI.

Prueba agregada:

- CFDI con dos conceptos.
- Verificacion del receptor completo.
- Verificacion de dos claves SAT.
- Verificacion de dos descripciones.
- Verificacion de `ClaveUnidad`.

### 4. Parser BBVA Bancomer

Archivos principales:

- `backend/app/services/bank_parser/bbva.py`
- `backend/tests/test_bank_parser_bbva.py`

Problemas corregidos:

- El saldo podia clasificarse como abono por desalineacion de columnas.
- Algunos importes con simbolo monetario no se detectaban correctamente.
- No se contemplaban importes negativos o expresados entre parentesis.

Correcciones:

- Deteccion de posiciones de `CARGOS`, `ABONOS` y `SALDO`.
- Separacion explicita del saldo respecto de cargos y abonos.
- Si el encabezado `SALDO` no existe, el importe mas a la derecha se trata como saldo cuando hay varios importes.
- Soporte para `$`, comas, negativos y parentesis.

Cobertura agregada:

- Cargo, abono y saldo en una misma linea.
- Importe con simbolo de moneda.
- Totales completos de cargos y abonos.
- Confirmacion de que el saldo no se suma a los totales contables.

### 5. Parser generico para Santander y Banamex

Archivos principales:

- `backend/app/services/bank_parser/generic.py`
- `backend/tests/test_bank_parser_generic.py`

Se preparo el parser generico para pruebas futuras con formatos Santander y Banamex.

Capacidades agregadas:

- Deteccion de encabezados `CARGOS`, `ABONOS` y `SALDO`.
- Inferencia de posiciones reales cuando el PDF desplaza los encabezados.
- Separacion del saldo del movimiento.
- Soporte para simbolos monetarios, comas, negativos y parentesis.
- Fallback por signo para estados de cuenta sin columnas confiables.

Nota operativa:

El parser generico es una base de compatibilidad. Cuando se disponga de PDFs reales de Santander y Banamex se deben agregar parsers especificos o reglas de reconocimiento para sus layouts particulares.

### 6. Experiencia responsive movil

Archivos principales:

- `frontend/src/index.css`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/CompanyDetail.jsx`

Cambios realizados:

- Contenedor global `.app-page` con ancho minimo seguro y altura `100dvh`.
- Contenedor `.app-container` con ancho completo, centrado y soporte para safe areas.
- Prevencion de overflow horizontal.
- `min-width: 0` en layouts principales para permitir que los hijos se reduzcan.
- Controles de periodo y exportacion ocupan el ancho disponible en movil.
- Contenido principal de `CompanyDetail` puede encogerse sin forzar el viewport.
- Inputs, selects y textareas no exceden el ancho de su contenedor.

Validacion visual en navegador:

- Celular: `390 x 844`.
- Tablet: `768 x 1024`.
- iPad: `1024 x 768`.

Resultado:

- No se detecto overflow horizontal en esos viewports.
- La pantalla de login monto correctamente.

### 7. Service worker y cache PWA

Archivo modificado:

- `frontend/public/sw.js`

Version actual:

```text
2026.09.07.01
```

Tambien se versiono el recurso del favicon:

```text
/favicon.svg?v=2026.09.07.01
```

La actualizacion invalida el cache anterior y permite que celulares descarguen los assets publicados mas recientes.

## Incidencias de produccion y resolucion

### 1. Backend productivo desactualizado

Durante la prueba desde otra computadora se detectaron:

```text
/api/v1/empresas/2/fiscal -> 404
/api/v1/auth/recuperar-contrasena -> 404
/api/v1/auth/login -> 401
```

El OpenAPI remoto no contenia las rutas fiscal ni de recuperacion, aunque el codigo local si las registraba.

Causa raiz:

- El frontend estaba publicado, pero el backend de EC2 aun ejecutaba una imagen anterior.
- El backend se publica mediante Docker Compose y AWS SSM, no automaticamente con el push de GitHub.

Accion aplicada:

- Se verifico la instancia EC2 `i-050bd9cc1e31ff11b`.
- Se confirmo SSM online.
- Se empaqueto el backend sin `logs`, `data`, `venv`, caches ni archivos `.env`.
- Se subio el release a S3.
- Se ejecuto un comando SSM para descargar el release y reconstruir Docker.
- Se conservaron `.env.production`, volumenes y base de datos.

Resultado:

- Comando SSM: `665039dc-a207-4665-a2fb-544e2245cd9d`.
- Estado: `Success`.
- Backend reconstruido y contenedor recreado.
- Caddy permanecio activo.

Verificacion posterior:

- `GET /health` -> `200`.
- `GET /ready` -> `200`, base de datos conectada.
- OpenAPI ya incluye:
  - `/api/v1/auth/recuperar-contrasena`.
  - `/api/v1/empresas/{empresa_id}/fiscal`.
  - `/api/v1/auth/login`.

### 2. Error de credenciales en celular

El `401` de login confirma que la solicitud llega correctamente al backend. No es un error de CORS ni de conectividad.

Causas posibles:

- Uso de nombre corto en lugar del correo completo.
- Cuenta creada en una base local distinta a la base de produccion.
- Contraseña diferente a la registrada en produccion.

La ruta de recuperacion ya se encuentra disponible en produccion despues del despliegue.

### 3. Dominio incorrecto

El dominio valido es:

```text
https://smart-contable.vercel.app
```

El dominio `smart-contable.vecer.app` no resuelve DNS.

## Validaciones realizadas

### Backend

```text
32 passed
```

Suite enfocada ejecutada:

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_bank_parser_generic.py backend/tests/test_bank_parser_bbva.py backend/tests/test_sat_parser_egresos.py -q
```

Resultados adicionales:

- Parser CFDI: `1 passed`.
- Parser BBVA: `29 passed` con regresiones y totales.
- Parser generico y BBVA combinados: `31 passed` antes de integrar la prueba CFDI.
- Compilacion Python de parser y pruebas: correcta.
- Diagnosticos estaticos en archivos modificados: sin errores.

### Frontend

```text
npm --prefix frontend run build
```

Resultado:

- Build exitoso.
- Vite transformo 2386 modulos.
- Service worker publicado con version `2026.09.07.01`.

El lint general conserva 17 diagnosticos preexistentes relacionados con la preservacion de memoizacion manual del React Compiler en otras pantallas. No impidio el build ni esta relacionado con los cambios del parser o del service worker.

### Produccion

Verificaciones realizadas contra:

```text
https://smart-contable.vercel.app
https://3-12-148-63.nip.io
```

Resultados:

- Frontend Vercel: `200`.
- Service worker Vercel: `200`, version `2026.09.07.01`.
- Backend `/health`: `200`.
- Backend `/ready`: `200`, base de datos conectada.
- Rutas fiscal y recuperacion: presentes en OpenAPI.

## Control de versiones

Commit publicado:

```text
1becc2c mejora parsers y experiencia movil
```

Push realizado:

```text
git push origin main
```

Estado final:

```text
main...origin/main
```

## Pendientes recomendados

1. Probar PDFs reales de Santander y Banamex y agregar fixtures anonimizados.
2. Implementar importacion autenticada de respaldos si se requiere crear la empresa en la cuenta cloud de otro usuario, no solo como copia local.
3. Revisar y corregir los 17 diagnosticos existentes del React Compiler en `CompanyDetail` y `GlobalFacturas`.
4. Sustituir `nip.io` por un dominio estable o Elastic IP para evitar dependencia de cambios de IP publica.
5. Automatizar el despliegue del backend para que el push de una version aprobada actualice EC2 sin intervencion manual.
6. Validar la recuperacion de contrasena con una cuenta no productiva y la clave configurada en `.env.production`.
7. Agregar una prueba end-to-end de login desde Vercel contra el backend productivo sin exponer credenciales.

## Conclusion

La version actual fue validada localmente y aplicada en produccion. El frontend y backend estan sincronizados con la version `1becc2c`, el service worker tiene cache renovada y las rutas que faltaban en produccion ya estan disponibles. La autenticacion fue confirmada hasta el punto de respuesta del backend; cualquier `401` restante corresponde a la identidad o contraseña almacenada en la base productiva, no a una falla de conectividad del celular.
