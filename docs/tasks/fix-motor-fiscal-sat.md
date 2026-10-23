# MISIÓN

Realizar un análisis técnico exhaustivo y corregir EXCLUSIVAMENTE el módulo "Motor Fiscal SAT".

---

# CONTEXTO DEL PROYECTO

La aplicación ya cuenta con un pipeline funcional de procesamiento contable.

Los siguientes módulos están COMPLETAMENTE OPERATIVOS y NO deben ser modificados:

✅ Parser de CFDI XML
✅ Parser de estados de cuenta PDF
✅ Conciliación bancaria
✅ Generación de pólizas de Ingresos
✅ Generación de pólizas de Egresos
✅ Generación de pólizas de Diario
✅ Catálogo de cuentas
✅ Clasificación contable

Se confirma que los datos fiscales ya existen dentro de las pólizas generadas.

Por lo tanto:

EL PROBLEMA NO ESTÁ EN EL PARSEO.
EL PROBLEMA NO ESTÁ EN LA GENERACIÓN DE PÓLIZAS.

La información ya fue procesada correctamente y ya se encuentra almacenada.

---

# PROBLEMA IDENTIFICADO

Dentro del módulo "Motor Fiscal SAT" existen contenedores o tarjetas fiscales que actualmente muestran:

- Valores vacíos
- Valores nulos
- Valores en cero

Los módulos afectados son:

1. ISR Provisional
2. IVA del Período
3. Retenciones
4. ISH (Impuesto Sobre Hospedaje)

Sin embargo, dichos datos sí existen previamente dentro de las pólizas generadas.

---

# HIPÓTESIS PRINCIPAL

Existe una falla en alguna de las siguientes capas:

A) Extracción de datos desde pólizas

B) Transformación de datos

C) Mapeo de propiedades

D) Consolidación o agregación de impuestos

E) Flujo que alimenta el Dashboard Fiscal

F) Estado global / store

G) Selector de datos

H) API interna

I) Hooks o servicios de consulta

J) Serialización del objeto fiscal

La causa NO es la ausencia de datos.

La causa es que el Motor Fiscal SAT no está consumiendo correctamente la información ya existente.

---

# OBJETIVO

Corregir el Motor Fiscal SAT para que obtenga sus valores directamente desde las pólizas ya generadas.

NO se deben crear nuevas fuentes de información.

NO se deben recalcular impuestos desde XML.

NO se deben reprocesar CFDIs.

NO se debe modificar el motor de pólizas.

Únicamente debe aprovecharse la información contable ya persistida.

---

# RESTRICCIONES ABSOLUTAS

PROHIBIDO:

❌ Modificar parser XML
❌ Modificar parser PDF
❌ Modificar conciliación bancaria
❌ Modificar generador de pólizas
❌ Crear tablas nuevas
❌ Crear modelos nuevos
❌ Duplicar información fiscal
❌ Leer CFDIs nuevamente
❌ Crear cálculos paralelos
❌ Inventar fórmulas fiscales
❌ Hardcodear valores
❌ Crear mocks
❌ Crear datos sintéticos
❌ Cambiar arquitectura existente

---

# OBJETIVO TÉCNICO

Localizar exactamente:

1. Dónde se almacenan las pólizas.

2. Qué estructura poseen.

3. Qué propiedades contienen:
   - ISR
   - IVA trasladado
   - IVA acreditable
   - IVA retenido
   - ISR retenido
   - ISH
   - Bases gravables
   - Impuestos trasladados
   - Impuestos retenidos

4. Cómo debería consumirlas el Motor Fiscal SAT.

5. En qué punto exacto del flujo se pierde la información.

---

# PROCESO OBLIGATORIO DE INVESTIGACIÓN

ANTES DE MODIFICAR CUALQUIER ARCHIVO:

Realiza un análisis completo y entrega:

## 1. Flujo actual

Explica:

XML/PDF
↓
Generación de pólizas
↓
Persistencia
↓
Servicios
↓
Motor Fiscal SAT
↓
Dashboard

Muestra los archivos involucrados.

---

## 2. Mapa de dependencias

Identifica:

- Componentes
- Hooks
- Services
- Controllers
- Endpoints
- Repositories
- Stores
- Contexts
- Selectors

Relacionados con:

- ISR Provisional
- IVA del Período
- Retenciones
- ISH

---

## 3. Trazabilidad de datos

Indica:

Archivo origen
↓
Propiedad origen
↓
Transformación
↓
Propiedad destino
↓
Render UI

Para cada impuesto.

---

## 4. Diagnóstico

Determina exactamente cuál de estos casos ocurre:

- El dato nunca llega
- El dato llega vacío
- El dato cambia de nombre
- El dato se pierde en una transformación
- El dato se filtra incorrectamente
- El dato se sobrescribe
- El selector apunta a una propiedad incorrecta
- El dashboard consume una clave errónea

No hagas suposiciones.

Demuestra con evidencia de código.

---

# IMPLEMENTACIÓN

Una vez identificado el problema:

Realiza la corrección mínima posible.

Principio:

"Minimal Fix - Maximum Preservation"

El parche debe afectar únicamente los archivos estrictamente necesarios.

No refactorizar.

No reestructurar.

No reescribir módulos completos.

No introducir mejoras que no estén relacionadas con el error.

---

# VALIDACIÓN OBLIGATORIA

Después de aplicar la corrección:

Verificar que:

✅ ISR Provisional muestra montos.
✅ IVA del Período muestra montos.
✅ Retenciones muestran montos.
✅ ISH muestra montos.
✅ Los valores provienen de pólizas.
✅ No se reprocesan XML.
✅ No existen regresiones.
✅ No cambió la generación de pólizas.

---

# FORMATO DE RESPUESTA

Antes de escribir código:

ENTREGAR

1. Diagnóstico técnico.
2. Archivos afectados.
3. Causa raíz.
4. Plan de corrección.

Después:

5. Código modificado.
6. Explicación de los cambios.
7. Evidencia de que el origen de datos son las pólizas.

IMPORTANTE:

NO ASUMAS NADA.

INSPECCIONA EL CÓDIGO REAL.

SI NO ENCUENTRAS EL DATO EN EL MOTOR FISCAL SAT, RASTREA HACIA ATRÁS HASTA ENCONTRAR LA PROPIEDAD EXACTA DENTRO DE LA PÓLIZA Y CONECTA EL FLUJO.

LAS PÓLIZAS SON LA ÚNICA FUENTE DE VERDAD PARA EL MOTOR FISCAL SAT
