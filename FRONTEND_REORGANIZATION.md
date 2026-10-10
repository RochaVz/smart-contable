# SMARTCONTABLE - REORGANIZACIÓN FINAL DEL FRONTEND

## CONTEXTO

La lógica de negocio del sistema ya funciona correctamente.

Actualmente funcionan y NO deben modificarse:

- Descarga de CFDI.
- Parseo de XML.
- Clasificación de ingresos.
- Clasificación de egresos.
- Cálculo de impuestos.
- Generación de pólizas.
- Parseo de estados de cuenta.
- Conciliación bancaria.
- Indicadores financieros.
- Reportes existentes.

NO crear nuevas funcionalidades.

NO rediseñar el backend.

NO modificar servicios, reglas fiscales ni motores de cálculo.

La prioridad actual es:

- Reorganización del frontend.
- Arquitectura de información.
- Jerarquía visual.
- Navegación.
- Experiencia de usuario.

---

# VISIÓN DEL PRODUCTO

SmartContable es una plataforma que transforma:

CFDI + Estados de Cuenta Bancarios

en

Información financiera y fiscal fácil de entender.

El usuario principal NO es contador.

El usuario principal es:

- Emprendedor.
- Dueño de negocio.
- Pequeña empresa.
- Persona sin conocimientos profundos de contabilidad.

La aplicación debe sentirse como un:

Asistente financiero y fiscal.

No como un sistema contable complejo.

---

# OBJETIVO PRINCIPAL

Permitir que cualquier usuario pueda responder rápidamente:

- ¿Cuánto vendí?
- ¿Qué vendí?
- ¿Quién me compró?
- ¿Cómo me pagaron?
- ¿Cuánto gasté?
- ¿En qué gasté?
- ¿Cuál fue mi utilidad?
- ¿Cuánto debo pagar al SAT?
- ¿Cuándo debo pagar?
- ¿Mis bancos están conciliados?
- ¿Qué movimientos requieren atención?

---

# FUENTES PRINCIPALES DEL SISTEMA

SmartContable gira alrededor de dos fuentes principales:

## CFDI

Obtiene:

- Ingresos.
- Egresos.
- Clientes.
- Proveedores.
- Métodos de pago.
- IVA.
- ISR.
- Obligaciones fiscales.
- Tendencias.

## ESTADOS DE CUENTA BANCARIOS

Obtiene:

- Movimientos bancarios.
- Conciliaciones.
- Flujo de efectivo.
- Diferencias.
- Movimientos pendientes.
- Inconsistencias.

Ambas fuentes tienen la misma importancia estratégica.

---

# JERARQUÍA DE PRIORIDAD

Todo el frontend debe organizarse en este orden:

1. Ingresos
2. Egresos
3. Utilidad
4. Impuestos
5. Bancos y conciliación
6. Obligaciones fiscales
7. Pólizas
8. Reportes
9. Detalles técnicos

---

# DASHBOARD

El Dashboard debe convertirse en un centro de decisiones.

No debe ser un repositorio de información.

---

## BLOQUE 1

### RESUMEN DEL NEGOCIO

Siempre visible.

Mostrar:

- Ingresos del período.
- Egresos del período.
- Utilidad del período.
- IVA estimado.
- ISR estimado.

Estas son las métricas más importantes.

---

## BLOQUE 2

### ACCIONES REQUERIDAS

Mostrar:

- Declaraciones pendientes.
- Pagos pendientes.
- CFDI con incidencias.
- CFDI sin clasificar.
- Movimientos sin conciliar.
- Diferencias detectadas.
- Alertas fiscales.

Esta sección debe aparecer muy arriba.

---

## BLOQUE 3

### BANCOS Y CONCILIACIÓN

Esta es una funcionalidad crítica del producto.

Debe ser uno de los bloques más visibles.

Mostrar:

- Saldo bancario.
- Movimientos pendientes de conciliación.
- CFDI sin movimiento bancario.
- Movimientos bancarios sin CFDI.
- Diferencias detectadas.
- Estado general de conciliación.

La conciliación bancaria es una funcionalidad principal del producto.

No debe quedar escondida.

---

## BLOQUE 4

### PRÓXIMAS OBLIGACIONES

Mostrar:

- IVA.
- ISR.
- DIOT.
- Retenciones.
- Declaraciones.
- Fechas límite.

Objetivo:

Responder rápidamente:

¿Qué debo pagar y cuándo?

---

## BLOQUE 5

### SALUD DEL NEGOCIO

Mostrar:

- Tendencias.
- Comparativos.
- Salud financiera.
- Riesgo fiscal.

Información importante pero secundaria.

---

# INGRESOS

La pantalla de ingresos debe responder:

- ¿Cuánto vendí?
- ¿Qué vendí?
- ¿Quién compró?
- ¿Cómo pagaron?
- ¿Cuánto IVA generé?

Mostrar inicialmente:

- Total vendido.
- Facturas emitidas.
- Clientes activos.
- IVA generado.
- Ticket promedio.

Detalles bajo demanda:

- Clientes.
- Productos.
- Servicios.
- Métodos de pago.
- Tendencias.
- Comparativos.

---

# EGRESOS

La pantalla de egresos debe responder:

- ¿Cuánto gasté?
- ¿En qué gasté?
- ¿A quién le pagué?
- ¿Cuánto impuesto pagué?

Mostrar inicialmente:

- Total gastado.
- Facturas recibidas.
- Proveedores activos.
- Categorías.
- Impuestos.

Detalles bajo demanda.

---

# IMPUESTOS

La pantalla fiscal debe enfocarse en acciones.

Mostrar primero:

- IVA estimado.
- ISR estimado.
- Próxima obligación.
- Próximo vencimiento.
- Riesgo fiscal.

Mostrar después:

- Desglose técnico.
- Bases gravables.
- Retenciones.
- Informativas.

---

# BANCOS

Bancos es una funcionalidad estratégica del producto.

No es una funcionalidad secundaria.

El sistema debe aprovechar el parseo automático de estados de cuenta para mostrar:

- Movimientos bancarios.
- Flujo de efectivo.
- Depósitos.
- Retiros.
- Diferencias.
- Movimientos pendientes.

Objetivo:

Permitir entender rápidamente la situación bancaria del negocio.

---

# CONCILIACIÓN

La conciliación bancaria es una funcionalidad principal.

Debe responder inmediatamente:

- ¿Todo está conciliado?
- ¿Qué no está conciliado?
- ¿Qué requiere atención?

Mostrar:

- Movimientos pendientes.
- CFDI sin banco.
- Banco sin CFDI.
- Diferencias detectadas.

La conciliación debe tener alta prioridad visual.

---

# PÓLIZAS

Las pólizas son importantes pero no deben competir visualmente con:

- Ingresos.
- Egresos.
- Utilidad.
- Impuestos.
- Bancos.

Objetivo:

Auditoría y revisión.

Mantener como módulo especializado.

---

# REPORTES

Eliminar redundancias.

Consolidar reportes.

Categorías:

## Financieros

- Ingresos.
- Egresos.
- Utilidad.

## Fiscales

- IVA.
- ISR.
- Declaraciones.

## Bancarios

- Conciliaciones.
- Movimientos bancarios.

---

# REGLA DE ORO

UNA INFORMACIÓN = UN SOLO LUGAR

Eliminar:

- Indicadores duplicados.
- Reportes duplicados.
- Gráficas duplicadas.
- Módulos redundantes.

Si dos pantallas muestran la misma información:

Fusionarlas.

---

# REGLA FINAL

No agregar funcionalidades.

No cambiar backend.

No modificar motores de cálculo.

No modificar parseos.

La tarea principal es reorganizar la experiencia de usuario alrededor de:

1. Ingresos.
2. Egresos.
3. Utilidad.
4. Impuestos.
5. Bancos.
6. Conciliación.
7. Obligaciones fiscales.
8. Pólizas.

Mostrar primero resúmenes.

Mostrar después análisis.

Mostrar al final detalles técnicos.

La meta es que un usuario entienda el estado completo de su negocio en menos de 30 segundos.
