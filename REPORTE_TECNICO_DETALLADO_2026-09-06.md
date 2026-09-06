# Reporte Tecnico Detallado

## Sesion de trabajo: conciliacion bancaria, polizas y motor fiscal SAT

## Fecha
2026-09-06

## Objetivo de la sesion

Mejorar la confiabilidad de los flujos contables que dependen de CFDI y estados de cuenta bancarios, corregir incidencias visibles en polizas y exportacion, e implementar la base del Motor de Regimen Fiscal y Obligaciones Tributarias para empresas mexicanas.

Objetivos abordados:

1. Mostrar al receptor en polizas de egreso de nomina.
2. Corregir la descarga CSV de Egresos y gastos.
3. Corregir la clasificacion de cargos, abonos y saldos al importar estados BBVA Bancomer en PDF.
4. Restringir conciliaciones de ingresos por canal de cobro: tarjeta versus transferencia/SPEI.
5. Permitir registrar movimientos bancarios personales o no facturados con cuentas adecuadas.
6. Aumentar la cobertura de pruebas de PDF BBVA y XML bancario.
7. Implementar el Motor de Regimen Fiscal, reglas de retencion y configuracion fiscal por empresa.
8. Corregir la migracion pendiente que provocaba error 500 al crear empresas.
9. Hacer visible y editable la configuracion fiscal desde la interfaz.

## Resumen ejecutivo

Se corrigieron dos defectos operativos de polizas: las nominas ya identifican al receptor en el panel y el boton CSV de la pestaña Egresos usa el valor de tipo que acepta el API. La importacion de PDF BBVA ahora separa los saldos de las columnas de Cargo y Abono usando el ancho real del encabezado, evitando alteraciones de totales.

La conciliacion evita asociar una venta cobrada con tarjeta a un SPEI o viceversa. Los movimientos sin CFDI siguen disponibles para generar polizas manuales de aportaciones, depositos en efectivo, retiros, gastos personales y donativos.

Se implemento una base declarativa para reglas SAT y un servicio puro de retenciones. La configuracion fiscal se persiste en Empresa y se agrego una migracion Alembic. Al probar la aplicacion se detecto y corrigio la falta de aplicacion de esa migracion en MySQL local.

Finalmente se extendio la interfaz para que el usuario seleccione regimen y tipo de persona al dar de alta una empresa, y para que consulte obligaciones y retenciones en una nueva pestaña Fiscal. Esta ultima extension de interfaz permanece pendiente de commit al cierre de este reporte.

## Cambios tecnicos

### 1. Polizas de egreso y exportacion CSV

Archivos modificados:

- `backend/app/services/polizas.py`
- `backend/tests/test_informes_contables.py`
- `frontend/src/components/PolizasPanel.jsx`
- `frontend/src/components/PolizaDetailModal.jsx`

Cambios realizados:

- Se detecta CFDI tipo `N` al serializar polizas de egreso.
- Se agrega al contrato `egreso.receptor` y `egreso.rfc_receptor` a partir del CFDI de nomina.
- La tarjeta de egreso muestra el receptor cuando existe y el detalle lo identifica como receptor de nomina.
- Se corrigio la descarga CSV: la UI usaba `egresos`, mientras el API valida `egreso`. Se incorporo la conversion explicita antes de ejecutar la solicitud.
- Se agrego prueba para verificar que una poliza historica de nomina serialice el nombre de la persona receptora.

Resultado:

- Las nominas no se presentan como si solo tuvieran proveedor/emisor.
- La descarga desde `Egresos - gastos` deja de responder 400 por el valor de tipo incorrecto.

### 2. Parser de PDF BBVA Bancomer

Archivos modificados:

- `backend/app/services/bank_parser/bbva.py`
- `backend/tests/test_bank_parser_bbva.py`

Problema detectado:

El parser usaba una distancia fija de 20 caracteres entre los montos extraidos y las cabeceras `CARGOS`/`ABONOS`. En PDFs con saldo al final de la fila, ese saldo podia quedar dentro del margen de Abonos y sobrescribir un importe real.

Correccion aplicada:

- El margen se calcula con la distancia real entre columnas del encabezado.
- Cada importe se asigna a Cargo, Abono o Saldo sin que el saldo pueda contaminar las columnas contables.
- Se incorporaron aserciones de importe y sentido para ventas con tarjeta/debito y comisiones BBVA.
- Se agrego una prueba de regresion con Cargo, Abono y Saldo en la misma linea.

Resultado:

- `VENTAS DEBITO` se reconoce como abono.
- `APLI TASA DE DES DEBITO` se reconoce como cargo.
- El saldo de operacion permanece solo como saldo.

### 3. Conciliacion por canal de cobro

Archivos modificados:

- `backend/app/services/conciliacion.py`
- `backend/tests/test_conciliacion_pdf.py`

Reglas incorporadas:

- Abonos con textos de terminal, TPV, tarjeta, ventas debito o ventas credito se asocian solo con polizas de ingreso cuyo concepto identifica tarjeta.
- Abonos SPEI, transferencias o pagos de cuenta de terceros se asocian solo con polizas de transferencia.
- Cuando banco o poliza no aportan un canal identificable se conserva el mecanismo previo de conciliacion por tipo, monto, concepto y fecha.
- Las comisiones bancarias se mantienen separadas antes del matching para no registrarlas como pendientes.

Resultado:

- Se reduce el riesgo de conciliar un cobro por tarjeta con una factura cobrada por transferencia solo porque los montos coinciden.
- Los movimientos no relacionados con CFDI permanecen en `banco_sin_poliza` para revision y registro manual.

### 4. Registro manual de movimientos personales

Archivo modificado:

- `frontend/src/components/CrearPolizaMovimientoModal.jsx`

Opciones agregadas para cargos:

- Retiros de socios.
- Gastos personales no deducibles.
- Donativos familiares no deducibles.

Opciones agregadas para abonos:

- Aportaciones de socios.
- Deposito en efectivo por aportacion.
- Donativos recibidos.

Resultado:

Los depositos de efectivo, aportaciones, retiros y gastos que no tienen CFDI o no son actividad ordinaria pueden contabilizarse desde la conciliacion sin forzar una factura de venta o gasto.

### 5. Cobertura de entradas bancarias PDF y XML

Archivos modificados:

- `backend/tests/test_bank_parser_bbva.py`
- `backend/tests/test_conciliacion_pdf.py`
- `backend/app/services/conciliacion.py`

Pruebas agregadas:

- Clasificacion exacta de cargos y abonos en la muestra BBVA.
- Conservacion del saldo sin alterar columnas contables.
- Normalizacion XML de abono SPEI y cargo de pago a terceros, incluyendo fecha, referencia, importe y saldo.

Defecto detectado por las nuevas pruebas:

El parser XML recorria el nodo contenedor y podia construir un movimiento adicional con atributos heredados de nodos hijos.

Correccion aplicada:

- Solo se procesan nodos de movimiento conocidos o nodos que tengan fecha como atributo o campo hijo directo.

Resultado de validacion:

- Suite bancaria conjunta: `33 passed`.

### 6. Motor de Regimen Fiscal y Obligaciones Tributarias

Archivos agregados:

- `backend/app/core/sat_fiscal.py`
- `backend/app/services/validaciones_fiscales.py`
- `backend/tests/test_validaciones_fiscales.py`
- `backend/alembic/versions/f4a1b2c3d4e5_add_empresa_fiscal_options.py`

Archivos modificados:

- `backend/app/models/empresa.py`
- `backend/app/schemas/empresa.py`
- `backend/app/api/v1/endpoints/empresas.py`

Componentes implementados:

- `SatRegimenEnum` con regimenes SAT soportados: 601, 603, 605, 606, 612, 621, RESICO PF y RESICO PM.
- `CalculoIsrTipo` para flujo de efectivo RESICO, coeficiente de utilidad, tarifa progresiva, deduccion ciega y retenciones de nomina.
- `SAT_REGIMEN_RULES` con obligaciones DIOT, contabilidad electronica, deducciones ISR y retenciones por regimen.
- Servicio `validar_retenciones_cfdi(...)` que devuelve validez, retenciones sugeridas y mensajes de revision.
- Campo `opcion_deduccion` en Empresa para Arrendamiento: `CIEGA` o `REAL`.

Reglas configuradas:

- RESICO PF a Persona Moral: ISR 1.25%, con aviso de obligacion.
- Actividades empresariales/profesionales PF (`612`) a Persona Moral: ISR 10% e IVA 10.6667%.
- Arrendamiento PF a Persona Moral: ISR 10% e IVA 10.6667%.
- Persona Moral regimen general (`601`) a Persona Moral: no se sugieren retenciones entre morales.
- RESICO PM: ISR a flujo de efectivo, con DIOT y contabilidad electronica.

Precision contable:

- Las retenciones se calculan con `Decimal` y `ROUND_HALF_UP` a dos decimales.
- Se probo el caso de honorarios por $999.99: ISR $100.00 e IVA $106.67.

Resultado de validacion:

- Motor fiscal: `4 passed`.

### 7. Migracion y correccion de error 500

Incidencia observada al crear empresa:

```text
pymysql.err.OperationalError: (1054, "Unknown column 'empresas.opcion_deduccion' in 'field list'")
```

Causa raiz:

El codigo ORM ya incluia `opcion_deduccion`, pero la migracion no se habia aplicado a la base MySQL local. La consulta de existencia por RFC carga el modelo completo, por lo que fallaba antes de insertar.

Accion realizada:

```powershell
.\venv\Scripts\python.exe -m alembic upgrade head
```

Validaciones posteriores:

- Alembic aplico la revision `d7e8f9a0b1c2 -> f4a1b2c3d4e5`.
- Se verifico la existencia de la columna mediante inspeccion SQLAlchemy.
- Se ejecuto una consulta ORM sobre `Empresa` correctamente.

### 8. API e interfaz visible del Motor Fiscal

Cambios pendientes de commit al cierre:

- `backend/app/api/v1/endpoints/empresas.py`
- `backend/app/schemas/empresa.py`
- `frontend/src/components/NewCompanyModal.jsx`
- `frontend/src/components/FiscalRegimenPanel.jsx`
- `frontend/src/pages/CompanyDetail.jsx`

Implementacion realizada:

- Nuevo endpoint autenticado: `GET /api/v1/empresas/{empresa_id}/fiscal`.
- El endpoint devuelve configuracion de empresa, obligaciones del regimen, retenciones sugeridas por CFDI emitido y totales por impuesto.
- El analisis es informativo: no modifica CFDIs timbrados ni polizas historicas.
- La pantalla de alta de negocio expone selectores para tipo de persona y regimen fiscal. Para Arrendamiento exige seleccionar deduccion ciega o gastos reales.
- La pantalla de detalle incorpora la pestaña `Fiscal`.
- El nuevo panel muestra obligaciones, retenciones sugeridas y un formulario para modificar tipo de persona, regimen y deduccion.
- `EmpresaUpdate` y el endpoint `PUT /empresas/{id}` ahora admiten actualizar `tipo_persona`.

Validaciones realizadas:

- `npm run build`: compilacion de frontend exitosa.
- `pytest tests/test_validaciones_fiscales.py -q`: `4 passed`.
- Importacion del endpoint fiscal: correcta.
- Diagnosticos de archivos modificados: sin errores.

## Ejecucion local

Servicios iniciados durante la prueba manual:

- Frontend Vite: `http://127.0.0.1:5173`.
- Backend FastAPI: `http://127.0.0.1:8000`.
- Healthcheck verificado: `GET /health` respondio `{"status":"ok"}`.

Incidencia de conectividad resuelta:

El login mostraba `ERR_CONNECTION_REFUSED` porque el frontend estaba activo pero FastAPI no estaba ejecutandose. Se inicio Uvicorn con:

```powershell
Push-Location backend
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Control de versiones

Commit publicado durante la sesion:

```text
286a5fa feat: fortalece conciliacion y reglas fiscales
```

Destino publicado:

```text
origin/main
https://github.com/RochaVz/smart-contable.git
```

El commit contiene 16 archivos, 367 inserciones y 11 eliminaciones. Incluye parser BBVA, conciliacion, polizas, motor fiscal, migracion y pruebas iniciales.

Estado al cierre del reporte:

- El commit `286a5fa` esta publicado en `origin/main`.
- La capa visual Fiscal y su endpoint estan validados localmente, pero aun aparecen como cambios sin commit y requieren una publicacion posterior.

## Riesgos y siguientes acciones recomendadas

1. Publicar los cambios pendientes de la interfaz Fiscal para que sean visibles fuera del entorno local.
2. Aplicar `alembic upgrade head` en cada entorno antes de desplegar la version con `opcion_deduccion`.
3. Validar el parser contra PDFs reales anonimizados de BBVA y agregar fixtures por cada variacion de formato encontrada.
4. Incorporar la validacion fiscal al flujo de carga/emision como advertencia visible por CFDI, no solo en el resumen por empresa.
5. Revisar cada regla SAT con un contador o asesor fiscal antes de usarla para determinacion definitiva o presentacion de declaraciones.

## Conclusión

La sesion fortalecio los dos origenes principales de datos contables de SmartContable: XML CFDI y estados de cuenta bancarios. Se corrigieron errores que afectaban totales y conciliaciones, se ampliaron las pruebas de regresion y se introdujo una base mantenible para reglas fiscales por regimen. La configuracion ya puede hacerse visible por empresa; queda pendiente publicar esa ultima capa de interfaz junto con el endpoint asociado.