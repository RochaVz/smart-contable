# Roadmap SmartContable

## Estado Actual

**Versión:** MVP Funcional Avanzado

## Plan de seguimiento priorizado — 2026

La prioridad inmediata es mejorar la experiencia de los reportes existentes antes de
ampliar la cobertura fiscal. Cada etapa debe cerrar con pruebas técnicas y revisión
funcional antes de iniciar la siguiente.

### Etapa 0 — Reportes profesionales y ligeros

**Prioridad:** Crítica
**Estado:** Listo para beta

#### Objetivo

Convertir los reportes actuales en una experiencia clara, rápida y fácil de revisar,
sin cambiar la lógica contable existente.

#### Alcance

- [x] Reducir tarjetas y superficies visuales pesadas.
- [x] Mejorar jerarquía de KPI, periodos y pestañas.
- [x] Separar facturas de ingreso y facturas de egreso en los reportes.
- [x] Agregar filtro local por texto en las tablas.
- [x] Agregar ordenamiento por columna.
- [x] Agregar paginación compacta.
- [x] Agregar filtros específicos por proveedor, mes y tipo de operación.
- [x] Unificar estados de carga, vacío y error.
- [x] Revisar accesibilidad de tablas y controles.
- [x] Validar responsive en escritorio, tablet y móvil.

#### Criterios de aceptación

- Los reportes mantienen los datos actuales y cargan sin errores.
- Una tabla permite filtrar, ordenar y paginar sin recargar la página.
- El usuario identifica periodo, totales y acción de exportación rápidamente.
- La interfaz evita paneles anidados, exceso de bordes y radios grandes.
- `npm run build` pasa antes de integrar cambios adicionales.

### Etapa 0.1 — Renovación visual del modo claro

**Prioridad:** Alta
**Estado:** Pendiente

#### Objetivo

Mejorar la interfaz visual del modo claro en SmartContable para ofrecer una experiencia
más nítida, moderna y agradable, manteniendo consistencia con el modo oscuro.

#### Alcance

- [ ] Ajustar los fondos y textos de los contenedores de fecha y listados de reportes.
- [ ] Mejorar el contraste y la legibilidad de las acciones `Ver` y `Documentos`.
- [ ] Sustituir en modo claro `bg-slate-900/90` y `text-white` por variantes como
  `bg-slate-100`, `text-slate-800` y `hover:text-blue-600`.
- [ ] Usar colores más vivos para textos e indicadores, incluyendo azul, verde y grises
  claros, evitando una apariencia apagada.
- [ ] Aplicar colores con contraste suficiente a los iconos SVG, por ejemplo
  `text-blue-500` y `text-emerald-500`.
- [ ] Reforzar los bordes de contenedores y controles con `border-slate-300` en modo
  claro, en lugar de `border-slate-800`.
- [ ] Refactorizar los componentes `select`, `button` y `div` afectados para usar la
  nueva paleta mediante clases de Tailwind CSS.
- [ ] Configurar el botón `Ver` con fondo claro y estado hover azul.
- [ ] Configurar el botón `CSV` con fondo verde claro y hover verde intenso.
- [ ] Mantener el botón `Cargar CFDI` en azul, con una sombra más suave en modo claro.
- [ ] Conservar sin regresiones el estilo y contraste actuales del modo oscuro.
- [ ] Probar los cambios en las vistas de reportes y exportación de datos.

#### Criterios de aceptación

- `Ver` y `Documentos` son legibles en modo claro y cumplen un contraste visual
  suficiente en estado normal, hover y focus.
- Los bordes de fechas, filtros, listados y acciones se distinguen claramente.
- Los botones `Ver`, `CSV` y `Cargar CFDI` presentan jerarquía visual y estados
  interactivos consistentes.
- Los iconos SVG mantienen contraste en ambos temas.
- Las vistas de reportes y exportación conservan su funcionalidad y comportamiento
  responsive.
- `npm run build` pasa después del refactor visual.

### Etapa 1 — Calidad técnica y seguridad

**Prioridad:** Muy alta

- [x] Corregir errores y advertencias de lint del frontend.
- [ ] Agregar pruebas para reportes, filtros y exportaciones.
- [ ] Validar aislamiento entre usuarios y empresas.
- [ ] Completar pruebas de autenticación y permisos.
- [ ] Verificar migraciones Alembic desde una base limpia.
- [ ] Configurar CI para build, lint y pruebas backend.

### Etapa 0.1 — Refinamiento visual del modo claro

**Prioridad:** Alta
**Estado:** Listo para beta

#### Objetivo

Modernizar y mejorar la legibilidad del modo claro, conservando la coherencia con el
modo oscuro ya consolidado. El foco inicial son las vistas de reportes y exportación
de datos.

#### Contexto

- Los contenedores de fecha y listados de reportes requieren mejor definición visual.
- Las acciones `Ver` y `Documentos` pierden legibilidad sobre fondos oscuros.
- Bordes y botones actuales tienen poco contraste y una apariencia apagada.
- La paleta clara debe sentirse más nítida, viva y contemporánea, sin romper el
  lenguaje visual del modo oscuro.

#### Alcance

- [x] Refactorizar `select`, `button` y contenedores afectados para usar una paleta
  específica de modo claro.
- [x] Sustituir combinaciones oscuras como `bg-slate-900/90` y `text-white` por
  variantes claras apropiadas, como `bg-slate-100`, `text-slate-800` y
  `hover:text-blue-600`, cuando el modo claro esté activo.
- [x] Asegurar contraste suficiente en las acciones `Ver` y `Documentos`.
- [x] Aplicar bordes más definidos, por ejemplo `border-slate-300`, en lugar de
  bordes oscuros que se pierden en modo claro.
- [x] Usar colores más vivos para textos e iconos, incluyendo `text-blue-500` y
  `text-emerald-500` para SVG según su semántica.
- [x] Ajustar el botón `Ver` con fondo claro y estado hover azul.
- [x] Ajustar el botón `CSV` con fondo verde claro y estado hover verde intenso.
- [x] Mantener el botón `Cargar CFDI` azul, con una sombra más suave en modo claro.
- [x] Revisar visualmente reportes y exportación de datos en escritorio, tablet y
  móvil.

#### Criterios de aceptación

- Las acciones `Ver`, `Documentos`, `CSV` y `Cargar CFDI` son legibles y distinguibles
  en modo claro, incluidos sus estados hover y foco.
- Los contenedores de fecha y las listas de reportes muestran bordes nítidos y
  consistentes.
- Los iconos SVG conservan contraste suficiente sobre todos los fondos claros.
- La interfaz clara se percibe moderna y coherente con el modo oscuro, sin grises
  apagados predominantes.
- `npm run build` pasa tras el refactor visual.

### Etapa 0.2 — Detalle CFDI y listados fiscales dinámicos

**Prioridad:** Alta
**Estado:** Listo para beta

#### Objetivo

Mejorar el detalle de los CFDI y hacer que los resúmenes de ingresos, egresos e IVA
permitan explorar sus listados relacionados de forma clara y sin saturar la vista
inicial.

#### Contexto

- El detalle actual muestra montos y número de facturas, pero no el concepto de la
  operación.
- Los usuarios necesitan identificar qué se vendió en CFDI de ingresos y qué se
  compró en CFDI de egresos.
- Los listados deben iniciar ocultos y mostrarse únicamente al activar el resumen
  correspondiente.

#### Alcance

- [x] Agregar el campo `Concepto` a cada factura en el detalle CFDI.
- [x] Mostrar la descripción de lo vendido para CFDI de ingresos y la descripción de
  lo comprado para CFDI de egresos.
- [x] Aplicar tipografía consistente al concepto: `text-sm font-bold text-slate-700`
  en modo claro y `text-slate-300` en modo oscuro.
- [x] Refactorizar los resúmenes `Ingresos`, `Egresos` e `IVA del periodo` para
  activar la visualización dinámica de su contenido asociado.
- [x] Mantener los listados de facturas ocultos por defecto.
- [x] Mostrar exclusivamente el listado de CFDI de ingresos al seleccionar
  `Ingresos`.
- [x] Mostrar exclusivamente el listado de CFDI de egresos al seleccionar `Egresos`.
- [x] Mostrar una tabla comparativa de IVA acreditado contra IVA causado al seleccionar
  `IVA del periodo`.
- [x] Implementar los paneles con un componente colapsable, como `Disclosure` de
  Headless UI o un acordeón React reutilizable, con transiciones suaves.
- [x] Mantener los contenedores alineados con el estilo actual:
  `bg-slate-900 p-6 rounded-2xl border` en modo oscuro.
- [x] Aplicar colores semánticos: ingresos `text-emerald-400`, egresos
  `text-rose-400` e IVA `text-blue-400`.
- [x] Usar bordes definidos: `border-slate-300` en modo claro y `border-slate-800`
  en modo oscuro.
- [x] Validar la interacción en las vistas de reportes y detalle/exportación de datos.

#### Criterios de aceptación

- Cada factura muestra un concepto legible, consistente y coherente con su tipo de
  operación.
- Al cargar la vista no se muestra ningún listado de facturas ni tabla de IVA.
- Al activar `Ingresos`, `Egresos` o `IVA del periodo`, solo se muestra el panel
  correspondiente y los demás se ocultan.
- La tabla de IVA identifica claramente el IVA acreditado y el IVA causado.
- Las transiciones, colores, bordes y contraste funcionan de forma consistente en
  modo claro y oscuro.
- `npm run build` pasa tras el refactor.

### Etapa 0.3 — Informes fiscales y contables: modo claro

**Prioridad:** Alta
**Estado:** Listo para beta

#### Objetivo

Modernizar la interfaz del apartado `Informes fiscales y contables` en modo claro,
con mejor contraste, jerarquía visual y separación entre secciones, manteniendo la
coherencia del modo oscuro existente.

#### Contexto

- Los textos negros y grises apagados hacen que el modo claro se perciba antiguo.
- Los indicadores verdes, rojos y azules requieren mayor intensidad visual.
- Los bordes y divisores poco visibles reducen la legibilidad de las cajas y su
  jerarquía.

#### Alcance

- [x] Sustituir `text-slate-500` y `text-slate-700` por variantes con mayor presencia,
  como `text-slate-800` y `text-slate-900`, en los textos principales de modo claro.
- [x] Aplicar indicadores de ingresos con `text-emerald-600` y `bg-emerald-100`.
- [x] Aplicar indicadores de egresos con `text-rose-600` y `bg-rose-100`.
- [x] Aplicar indicadores de IVA con `text-blue-600` y `bg-blue-100`.
- [x] Asegurar contraste suficiente para todos los botones, etiquetas y badges.
- [x] Actualizar los botones de navegación `Resumen`, `Estado de resultados`,
  `Proveedores`, `IVA`, `Retenciones` y `Más informes` con `text-slate-700` en modo
  claro.
- [x] Agregar estados hover `hover:bg-slate-200 hover:text-blue-600` a la navegación.
- [x] Usar `border-slate-300` en modo claro en lugar de `border-slate-800`, conservando
  este último para modo oscuro.
- [x] Aplicar `shadow-sm` a las cajas para aportar profundidad sin recargar la interfaz.
- [x] Separar visualmente las secciones de ingresos, egresos e IVA mediante bordes y
  divisores nítidos.
- [x] Ajustar los montos a `text-2xl font-black text-slate-900` en modo claro.
- [x] Ajustar los subtítulos a `text-sm font-bold text-slate-600`.
- [x] Usar badges de colores vivos para distinguir ingresos y egresos.

#### Criterios de aceptación

- Los indicadores, botones y etiquetas mantienen contraste legible en modo claro.
- Las secciones de ingresos, egresos e IVA se distinguen visualmente entre sí.
- Los botones de navegación tienen estados normal, hover y foco coherentes y visibles.
- Las cajas y divisores muestran una jerarquía clara sin perder la consistencia con
  el modo oscuro.
- La revisión visual confirma un aspecto moderno, nítido y agradable en escritorio,
  tablet y móvil.
- `npm run build` pasa tras el refactor.

### Etapa 1.1 — Respaldo integral y portabilidad

**Prioridad:** Crítica
**Estado:** Listo para beta

#### Objetivo

Permitir que la información de una cuenta o empresa pueda trasladarse a otro equipo
sin depender de los IDs internos del navegador de origen.

#### Completado

- [x] Exportar empresas sincronizadas junto con sus CFDI.
- [x] Versionar el formato de respaldo.
- [x] Mantener compatibilidad con respaldos anteriores.
- [x] Remapear empresas e invoices por RFC y UUID.
- [x] Mostrar respaldo global desde el Dashboard.
- [x] Incluir polizas y movimientos contables en JSON restaurable.
- [x] Incluir mapeos de cuentas y configuraciones por empresa.
- [x] Incluir movimientos bancarios remotos.
- [x] Agregar resumen de cobertura antes de descargar.
- [x] Agregar prueba automatizada de exportar, limpiar, importar y comparar conteos.
- [x] Agregar migraciones de versiones del formato de respaldo.

#### Criterios de aceptacion

- Exportar en equipo A e importar en equipo B conserva los conteos por empresa.
- Ningun registro importado depende del ID local original.
- UUID de CFDI y RFC son claves de reconciliacion.
- Un respaldo incompatible genera un mensaje accionable.

### Etapa 2 — Modelo fiscal base

**Prioridad:** Crítica
**Estado:** Listo para beta

- [x] Crear periodos fiscales mensuales y anuales.
- [x] Crear operaciones fiscales auditables por empresa.
- [x] Registrar base gravable, IVA, ISR, IEPS y retenciones.
- [x] Registrar nacional, extranjero y global para operaciones DIOT.
- [x] Mantener fuente del dato: XML, póliza o captura manual.
- [x] Exponer API protegida para crear/listar periodos y operaciones fiscales.
- [x] Evitar duplicados por origen y referencia de operación.
- [x] Crear historial de declaraciones y modificaciones.

### Etapa 3 — Complementos CFDI

**Prioridad:** Alta

**Estado:** `Listo para beta`

- [x] Procesar percepciones de nómina.
- [x] Procesar deducciones de nómina.
- [x] Procesar subsidio al empleo.
- [x] Almacenar complementos de pago y relacionarlos con CFDI originales.
- [x] Incorporar intereses, dividendos y arrendamiento.
- [x] Consolidar retenciones ISR/IVA aplicadas a terceros.

### Etapa 4 — Cálculos y declaraciones

**Prioridad:** Crítica
**Estado:** Listo para beta

- [x] Implementar endpoint `/fiscal/isr` para pagos provisionales informativos.
- [x] Calcular ingresos acumulados, deducciones autorizadas y retenciones ISR.
- [x] Permitir estimación con tasa ISR explícita sin inventar tarifa legal por régimen.
- [x] Aplicar reglas base por régimen: RESICO sin deducciones, arrendamiento y coeficiente de utilidad parametrizados.
- [x] Reportar parámetros fiscales faltantes antes de marcar el cálculo como estimado.
- [x] Versionar tarifas progresivas oficiales por ejercicio fiscal.
- [x] Registrar pagos provisionales anteriores y pérdidas fiscales aplicables.
- [x] Implementar endpoint `/fiscal/iva` para pagos provisionales informativos.
- [x] Calcular IVA trasladado, acreditable, retenido y saldo estimado por periodo y acumulado.
- [x] Implementar cálculo de IEPS cuando aplique.
- [x] Implementar endpoint `/fiscal/anual`.
- [x] Calcular ingresos acumulados, deducciones y retenciones.
- [x] Calcular saldo a favor o impuesto por pagar.
- [x] Agregar pruebas con casos fiscales revisados por contador.

### Etapa 5 — DIOT y exportaciones SAT

**Prioridad:** Crítica
**Estado:** Listo para beta

- [x] Implementar endpoint `/fiscal/diot`.
- [x] Agrupar proveedores por RFC y periodo.
- [x] Calcular base gravable, IVA acreditable e IVA retenido.
- [x] Validar tipo de operación nacional, extranjero o global.
- [x] Detectar datos incompletos antes de exportar.
- [x] Generar el layout oficial SAT vigente.
- [x] Agregar exportación Excel, CSV, PDF y formato SAT según corresponda.

### Etapa 6 — Interfaz fiscal consolidada

**Prioridad:** Alta
**Estado:** Listo para beta

- [x] Agregar pestañas `ISR`, `IVA`, `DIOT` y `Anual`.
- [x] Mostrar estado del cálculo y datos pendientes.
- [x] Agregar filtros por proveedor, mes y tipo de operación.
- [x] Mostrar diferencias entre CFDI, pólizas y cálculo fiscal.
- [x] Agregar bitácora de cambios y exportaciones.

### Indicadores de seguimiento

**Estado:** Listo para beta

- [x] Porcentaje de requisitos fiscales implementados.
- [x] Cobertura de pruebas backend y frontend.
- [x] Porcentaje de tablas con filtro, ordenamiento y paginación.
- [x] Diferencias entre CFDI, pólizas y reportes fiscales.
- [x] Operaciones DIOT sin datos faltantes.
- [x] Errores de exportación por formato *(éxitos en bitácora; errores HTTP aún no persistidos)*.
- [x] Módulos aprobados por revisión contable.

API: `GET /api/v1/fiscal/indicadores`, `POST /api/v1/fiscal/indicadores/revision`  
UI: pestaña **Salud** en el centro fiscal.

### Estados de trabajo

`Pendiente` · `En análisis` · `En desarrollo` · `En pruebas` · `Validación contable` ·
`Listo para beta` · `Productivo` · `Bloqueado`

### Módulos Implementados

* Gestión de Empresas
* Gestión de Facturas CFDI
* Visualización de Facturas
* Generación de Pólizas
* Conciliación Bancaria
* Reportes
* Dashboard Financiero

---

## Backlog histórico

Las fases siguientes conservan ideas del roadmap inicial. El plan 2026 anterior es
la fuente vigente de prioridades y estados; estas fases no deben interpretarse como
un segundo calendario de ejecución.

# Fase 1 — Estabilización Técnica

## Prioridad: Alta

### Objetivos

Fortalecer la base técnica antes de escalar funcionalidades.

### Tareas

#### Infraestructura

* [ ] Docker Backend
* [ ] Docker Frontend
* [ ] Docker Compose
* [ ] Variables de entorno centralizadas
* [ ] Configuración para producción
* [ ] Estrategia de despliegue híbrido Azure + Oracle Cloud

#### Calidad

* [ ] Pytest
* [ ] React Testing Library
* [ ] Cobertura mínima 70%
* [ ] Linter Backend
* [ ] Linter Frontend

#### DevOps

* [ ] GitHub Actions
* [ ] CI/CD automático
* [ ] Deploy automatizado

### Resultado Esperado

Versión 1.0 estable y lista para pruebas con usuarios reales.

---

# Fase 2 — Seguridad y Multiempresa

## Prioridad: Muy Alta

### Objetivos

Convertir SmartContable en una plataforma SaaS segura.

### Tareas

#### Seguridad

* [ ] JWT Refresh Tokens
* [ ] Recuperación de contraseña
* [ ] Bloqueo por intentos fallidos
* [ ] Auditoría de accesos

#### Multiempresa

* [ ] Empresa activa por usuario
* [ ] Cambio rápido de empresa
* [ ] Aislamiento total de datos
* [ ] Validación de permisos

#### Roles

* [ ] Administrador
* [ ] Contador
* [ ] Capturista
* [ ] Auditor

### Resultado Esperado

Plataforma multiempresa preparada para clientes.

---

# Fase 3 — Integración SAT

## Prioridad: Crítica

### Objetivos

Automatizar procesos fiscales.

### Tareas

#### CFDI

* [ ] Validación SAT
* [ ] Consulta de estatus
* [ ] Verificación de cancelación
* [ ] Descarga automática

#### RFC

* [ ] Validación RFC
* [ ] Catálogo SAT

#### Monitoreo

* [ ] Facturas canceladas
* [ ] Facturas duplicadas
* [ ] Alertas fiscales

### Resultado Esperado

Automatización fiscal operativa.

---

# Fase 4 — Contabilidad Automatizada

## Prioridad: Alta

### Objetivos

Reducir trabajo manual contable.

### Tareas

#### Pólizas

* [ ] Reglas automáticas
* [ ] Plantillas contables
* [ ] Asientos recurrentes

#### Catálogo de Cuentas

* [ ] Gestión completa
* [ ] Importación masiva
* [ ] Configuración por empresa

#### Movimientos

* [ ] Libro Diario
* [ ] Libro Mayor

### Resultado Esperado

Contabilidad semi-automatizada.

---

# Fase 5 — Conciliación Inteligente

## Prioridad: Alta

### Objetivos

Automatizar conciliación bancaria.

### Tareas

#### Matching

* [ ] CFDI ↔ Banco
* [ ] Transferencias ↔ Facturas
* [ ] Pagos parciales

#### Reglas

* [ ] Reglas personalizadas
* [ ] Tolerancias configurables

#### Alertas

* [ ] Movimientos no conciliados
* [ ] Facturas sin pago
* [ ] Pagos sin CFDI

### Resultado Esperado

Conciliación automática superior al 80%.

---

# Fase 6 — Reportes Financieros

## Prioridad: Media

### Objetivos

Generar información financiera útil.

### Tareas

#### Estados Financieros

* [ ] Estado de Resultados
* [ ] Balance General
* [ ] Flujo de Efectivo

#### Indicadores

* [ ] Liquidez
* [ ] Rentabilidad
* [ ] Endeudamiento

#### Exportación

* [ ] PDF
* [ ] Excel
* [ ] CSV

### Resultado Esperado

Panel financiero completo.

---

# Fase 7 — SmartContable AI

## Prioridad: Estratégica

### Objetivos

Incorporar inteligencia artificial aplicada a procesos fiscales.

### Clasificación Inteligente

* [ ] Clasificación automática de gastos
* [ ] Sugerencia de cuentas contables
* [ ] Aprendizaje por usuario

### Predicción Fiscal

* [ ] IVA proyectado
* [ ] ISR proyectado
* [ ] Flujo de efectivo estimado

### Detección de Anomalías

* [ ] CFDI duplicados
* [ ] Gastos atípicos
* [ ] Variaciones fiscales

### Asistente Inteligente

* [ ] Consultas en lenguaje natural
* [ ] Resumen financiero automático
* [ ] Alertas proactivas

### Resultado Esperado

Plataforma de Inteligencia Fiscal.

---

# Fase 8 — SaaS Comercial

## Prioridad: Estratégica

### Objetivos

Preparar SmartContable para monetización.

### Facturación

* [ ] Plan Gratuito
* [ ] Plan Profesional
* [ ] Plan Despachos

### Pagos

* [ ] Stripe
* [ ] Mercado Pago

### Administración

* [ ] Panel de Suscripciones
* [ ] Gestión de Clientes
* [ ] Métricas SaaS

### Resultado Esperado

Producto listo para comercialización.

---

# Fase 9 — Integración Oracle Cloud

## Prioridad: Alta

### Objetivos

Integrar Oracle Cloud como capa de infraestructura para garantizar operación de bajo costo y alta disponibilidad del backend contable.

### Infraestructura OCI

* [ ] Crear tenancy y compartimentos por entorno (dev/beta/prod)
* [ ] Definir red base (VCN, subred pública/privada, reglas de seguridad)
* [ ] Provisionar instancia Always Free para backend y tareas programadas

### Datos y Persistencia

* [ ] Desplegar MySQL autoadministrado en Oracle Cloud
* [ ] Configurar backups automáticos y restauración validada
* [ ] Diseñar plan de migración desde SQLite/MySQL local a MySQL en OCI

### Integración Aplicativa

* [ ] Parametrizar `DATABASE_URL` por entorno para OCI
* [ ] Ejecutar migraciones Alembic en entorno Oracle Cloud
* [ ] Validar compatibilidad completa de módulos CFDI, conciliación y reportes

### Observabilidad y Seguridad

* [ ] Centralizar logs de backend y health checks
* [ ] Endurecer acceso SSH/puertos y rotación de secretos
* [ ] Definir runbook de incidentes para operación en Oracle Cloud

### Resultado Esperado

SmartContable operando con integración Oracle Cloud estable para la fase beta y preparado para escalar a producción.

---

# Objetivo 2027

Convertir SmartContable en una plataforma SaaS especializada en automatización fiscal y contable para PyMEs y despachos contables en México.

## Indicadores de Éxito

* 100+ empresas registradas
* 10,000+ CFDI procesados por mes
* 80% de conciliación automática
* 90% de pólizas generadas automáticamente
* Primer módulo de IA en producción
* Primeros clientes de pago

```
```

