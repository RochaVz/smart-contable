# Reporte Tecnico Detallado

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
