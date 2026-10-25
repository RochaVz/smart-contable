# Auditoria de presentacion, trazabilidad y transparencia fiscal

**Proyecto:** SmartContable
**Fecha:** 2026-10-24
**Alcance:** Validacion de que los resultados ya calculados por el sistema se muestren con origen, detalle y trazabilidad suficientes.
**Restriccion respetada:** No se modifico logica de negocio, calculos, parseo de CFDI/PDF ni generacion de polizas.

## 1. Resumen ejecutivo

El motor fiscal de SmartContable calcula correctamente IVA, ISR, retenciones, ISH, IEPS y diferencias entre fuentes. Sin embargo, la capa de presentacion expone principalmente totales agregados y no la evidencia que los compone. El usuario puede ver el resultado, pero no puede auditar de forma directa:

- que CFDI participaron,
- que bases gravables se sumaron,
- que retenciones se restaron,
- que polizas respaldan el calculo,
- como se obtuvo el saldo final.

**Conclusion:** el problema no es de calculo, sino de trazabilidad y presentacion. La informacion ya existe en Factura, Poliza, MovimientoPoliza y en los resultados intermedios del backend, pero no se expone de forma estructurada al frontend.
## 2. Fuentes y modulos revisados

### Backend

- backend/app/services/calculos_fiscales.py
  - _resumen_iva()
  - calcular_iva_provisional()
  - _resumen_isr()
  - calcular_isr_provisional()
  - calcular_isr_anual()
  - calcular_ieps_provisional()
- backend/app/services/resumen_fiscal_sat.py
  - construir_resumen_fiscal_sat()
- backend/app/services/fiscal_diferencias.py
  - comparar_fuentes_fiscales()
- backend/app/services/fiscal_indicadores.py
  - construir_indicadores_fiscales()
- backend/app/api/v1/endpoints/fiscal.py
- backend/app/models/factura.py

### Frontend

- frontend/src/components/FiscalConsolidadosPanel.jsx
- frontend/src/components/FiscalImpuestosCards.jsx
- frontend/src/components/FiscalAnualPanel.jsx
- frontend/src/components/executive/ImpuestosPorPagarPanel.jsx
- frontend/src/hooks/useExecutiveData.js
## 3. Hallazgos por impuesto

### 3.1 IVA del periodo

Estado actual:

- _resumen_iva() agrega en memoria: iva_trasladado, iva_acreditable, iva_retenido, iva_a_cargo, saldo_a_favor, ish.
- calcular_iva_provisional() devuelve unicamente agregados en periodo_actual y acumulado_anual.
- No devuelve cantidad de CFDI, UUID, folio, emisor/receptor, subtotal, base gravable ni relacion con polizas.
- FiscalImpuestosCards.jsx muestra solo: IVA a cargo, IVA a favor, resumen textual.

Informacion que ya existe pero no se muestra:

- Factura.uuid
- Factura.serie, Factura.folio
- Factura.tipo_comprobante
- Factura.fecha_emision
- Factura.rfc_emisor, Factura.nombre_emisor
- Factura.rfc_receptor, Factura.nombre_receptor
- Factura.subtotal
- Factura.iva_trasladado
- Factura.iva_retenido
- Factura.impuestos_locales (ISH)
- Factura.total
- Factura.estatus
- Relacion con Poliza via Factura.polizas

Gap de trazabilidad:

El usuario ve IVA acreditable, IVA causado y saldo estimado, pero no puede identificar que CFDI de ingresos formaron el IVA causado, que CFDI de egresos formaron el IVA acreditable, que notas de credito (tipo E) restaron, que bases gravables se usaron, que CFDI contienen retenciones de IVA ni que CFDI contienen ISH.

Recomendacion sin cambiar logica:

Agregar una capa de detalle (no un nuevo calculo) al resultado de calcular_iva_provisional() y/o a un endpoint de detalle que devuelva:

1. Lista de CFDI de ingresos utilizados: UUID, fecha, emisor/receptor, subtotal, IVA trasladado, IVA retenido, ISH, total.
2. Lista de CFDI de egresos/acreditables: UUID, fecha, emisor/receptor, subtotal, IVA trasladado (acreditable), total.
3. Totales de integracion: IVA causado acumulado, IVA acreditable acumulado, IVA retenido acumulado, ISH acumulado, resultado final con formula explicita.

Formula a mostrar (sin recalcular):

IVA causado
(-) IVA acreditable
(-) IVA retenido
(=) Resultado final

### 3.2 ISR provisional

Estado actual:

- _resumen_isr() agrega: ingresos acumulados, deducciones acumuladas, retenciones ISR, base gravable.
- calcular_isr_provisional() ya expone parametros utiles: coeficiente_utilidad_aplicado, coeficiente_utilidad_origen, deduccion_ciega_pct_aplicada, tasa_isr_aplicada, pagos_provisionales_anteriores.
- Pero no expone los CFDI que componen ingresos y deducciones.

Informacion que ya existe pero no se muestra:

- CFDI emitidos tipo I que suman ingresos.
- CFDI emitidos tipo E que restan ingresos.
- CFDI recibidos deducibles que suman/restan deducciones.
- Factura.es_deducible
- Factura.isr_retenido
- UUID, fecha, emisor/receptor, subtotal, total.

Gap de trazabilidad:

El usuario no puede identificar que ingresos participaron, que deducciones participaron, que CFDI respaldan cada subtotal ni que polizas se relacionan con esos CFDI.

Recomendacion sin cambiar logica:

Exponer en el resultado (o en detalle aparte) dos listas:

1. CFDI de ingresos: UUID, fecha, contraparte, subtotal (ingreso), ISR retenido, total.
2. CFDI de deducciones: UUID, fecha, proveedor, subtotal, es_deducible, total.

Y una integracion paso a paso:

Ingresos acumulados
(-) Deducciones aplicadas
(=) Base gravable antes de perdidas
(-) Perdidas fiscales aplicadas
(=) Base gravable final
(x) Tasa / tarifa ISR
(=) ISR causado
(-) Retenciones ISR
(-) Pagos provisionales anteriores
(=) ISR a cargo / saldo a favor
### 3.3 Retenciones

Estado actual:

- El motor calcula: iva_retenido en _resumen_iva() y retenciones_isr en _resumen_isr().
- resumen_fiscal_sat.py suma retenciones desde OperacionFiscal cuando existe data de polizas, o usa el calculo CFDI en caso contrario.
- FiscalImpuestosCards.jsx muestra totales de retenciones ISR e IVA.

Gap de trazabilidad:

No se muestra CFDI que contienen retenciones, tipo de retencion (ISR/IVA), monto por CFDI, polizas relacionadas ni diferencia entre retencion detectada en CFDI y retencion registrada en polizas.

Recomendacion sin cambiar logica:

Agregar detalle por CFDI: UUID, fecha, tipo de comprobante, contraparte, ISR retenido, IVA retenido, total.

Y un cuadro de conciliacion:

Retenciones ISR segun CFDI
Retenciones IVA segun CFDI
Retenciones segun polizas
Diferencia CFDI vs polizas

### 3.4 ISH (Impuesto sobre hospedaje)

Estado actual:

- _resumen_iva() suma Factura.impuestos_locales solo en CFDI emitidos tipo I y resta en tipo E.
- resumen_fiscal_sat.py expone ish desde iva_periodo.
- Problema detectado: cuando existe has_poliza_data, el bloque de IVA construido manualmente asigna ish = 0.0. Esto puede ocultar el ISH calculado desde CFDI cuando el resumen SAT usa datos de polizas.
- Ademas, aplica_ish es False por defecto en todos los regimenes, por lo que el frontend puede mostrar no aplica aunque exista ISH real en CFDI.

Gap de trazabilidad:

El usuario no puede visualizar claramente base gravable del hospedaje, CFDI involucrados, tasa aplicada, ISH calculado ni relacion con polizas.

Recomendacion sin cambiar logica:

1. Corregir la presentacion para que el ISH proveniente de CFDI se muestre aunque el resumen SAT use datos de polizas.
2. Exponer lista de CFDI con impuestos_locales > 0: UUID, fecha, emisor/receptor, concepto, base/subtotal, impuesto local (ISH), total.
3. Mostrar integracion: CFDI emitidos con impuestos locales = ISH acumulado del periodo.
4. Diferenciar entre aplica como obligacion del regimen (aplica_ish) y existe ISH efectivamente cobrado en CFDI (ish > 0).

### 3.5 IEPS

Estado actual:

- calcular_ieps_provisional() ya devuelve detalle por operacion: operacion_id, periodo_id, mes, ieps, descripcion.
- Esto es uno de los mejores ejemplos de trazabilidad del sistema.

Gap menor:

- El frontend no siempre muestra el detalle por operacion.
- No vincula la operacion con CFDI/UUID ni con la poliza origen.

Recomendacion:

Reutilizar este patron de detalle para IVA, ISR y retenciones.
## 4. Consistencia entre modulos

### 4.1 CFDI vs polizas vs motor fiscal

comparar_fuentes_fiscales() ya compara:

- IVA trasladado CFDI vs fiscal
- IVA acreditable CFDI vs fiscal
- IVA trasladado CFDI vs polizas
- IVA acreditable CFDI vs polizas
- IVA trasladado fiscal vs polizas
- IVA acreditable fiscal vs polizas
- Totales egreso CFDI vs polizas
- Totales ingreso CFDI vs polizas/diario

Gap:

- La comparacion es agregada, no documental.
- No muestra que CFDI o polizas causan el desvio.
- No incluye ISH ni retenciones en la matriz de diferencias.
- No muestra UUIDs ni folios.

Recomendacion:

Extender la presentacion (no la logica) para que cada diferencia incluya lista de documentos involucrados, montos por documento, poliza vinculada y motivo probable del desvio.

### 4.2 Polizas como fuente fiscal

En resumen_fiscal_sat.py, cuando existen OperacionFiscal de origen poliza, el resumen usa esos datos y deja acumulado_anual vacio e ish = 0.

Gap:

- Se pierde el acumulado anual.
- Se pierde ISH.
- No se muestra que polizas se usaron.
- No se muestra relacion poliza <-> CFDI.

Recomendacion:

Sin cambiar calculo, exponer metadata de origen: IDs de operaciones fiscales usadas, IDs de polizas, mes/año, totales por poliza, indicador de si el resultado proviene de CFDI o de polizas.

## 5. Vistas que requieren mayor nivel de detalle

### 5.1 FiscalImpuestosCards.jsx

Actualmente muestra solo totales. Debe incluir expandibles por impuesto, formula de integracion, cantidad de CFDI y drill-down a detalle documental.

### 5.2 FiscalConsolidadosPanel.jsx

Actualmente concentra el resumen SAT. Debe incluir pestaña o seccion Trazabilidad, origen del dato (CFDI o poliza), periodo analizado, CFDI incluidos/excluidos y CFDI cancelados excluidos.

### 5.3 FiscalAnualPanel.jsx

Debe mostrar ingresos acumulados por CFDI, deducciones por CFDI, retenciones acumuladas, perdidas aplicadas con origen, pagos provisionales registrados e integracion paso a paso.

### 5.4 Dashboard ejecutivo (ImpuestosPorPagarPanel.jsx)

Debe mostrar IVA a cargo/a favor con formula, ISR a cargo con formula, retenciones, ISH y origen de cada importe.

## 6. Informacion existente que no se muestra (inventario)

| Dato existente | Ubicacion | No se muestra en |
|---|---|---|
| UUID CFDI | Factura.uuid | IVA/ISR/retenciones |
| Fecha emision | Factura.fecha_emision | Cards fiscales |
| Tipo comprobante | Factura.tipo_comprobante | Detalle fiscal |
| Emisor/receptor | Factura.rfc_*, nombre_* | Detalle fiscal |
| Subtotal | Factura.subtotal | IVA/ISR detalle |
| IVA trasladado | Factura.iva_trasladado | Detalle por CFDI |
| IVA retenido | Factura.iva_retenido | Detalle por CFDI |
| ISR retenido | Factura.isr_retenido | Detalle por CFDI |
| ISH / impuestos locales | Factura.impuestos_locales | Detalle por CFDI |
| Deducible | Factura.es_deducible | ISR detalle |
| Estatus | Factura.estatus | Filtros CFDI incluidos |
| Polizas vinculadas | Factura.polizas | Trazabilidad fiscal |
| Operaciones fiscales | OperacionFiscal | Origen poliza |
| Coeficiente ISR | calcular_isr_provisional | UI parcial |
| Pagos provisionales | PagoProvisionalAnterior | Anual detallado |
| Perdidas fiscales | PerdidaFiscal | Anual detallado |
| IEPS por operacion | calcular_ieps_provisional | UI parcial |

## 7. Plan recomendado de mejora (sin tocar logica)

### Fase A - Exponer detalle documental

1. Crear endpoints de detalle (solo lectura) que reutilicen las mismas consultas existentes: /fiscal/iva/detalle, /fiscal/isr/detalle, /fiscal/retenciones/detalle, /fiscal/ish/detalle.
2. No recalcular: reutilizar _facturas_del_periodo, _facturas_hasta_periodo, _resumen_iva, _resumen_isr.
3. Devolver listas de CFDI y totales ya calculados.

### Fase B - Mostrar integracion paso a paso

1. En backend, agregar bloque integracion a respuestas existentes: pasos con concepto, importe y signo.
2. En frontend, renderizar la formula textual.

### Fase C - Trazabilidad CFDI <-> poliza

1. Incluir en detalle fiscal: UUID CFDI, poliza vinculada (id, tipo, numero), cuenta contable de IVA/ISR.
2. Agregar indicador de origen: origen cfdi, origen poliza, origen mixto.

### Fase D - Consistencia y auditoria

1. Extender comparar_fuentes_fiscales() para incluir retenciones, ISH y listas de documentos desviados.
2. Mostrar en UI que documento causa cada diferencia.

## 8. Conclusion

La logica fiscal actual es solida y no requiere cambios. El trabajo pendiente es de presentacion y trazabilidad: exponer la evidencia documental que ya existe en CFDI y polizas, mostrar la integracion paso a paso de cada impuesto y hacer explicito el origen de cada resultado.

Objetivo final: convertir cada impuesto mostrado por SmartContable en un resultado completamente auditable por el usuario, sin modificar ningun calculo existente.
