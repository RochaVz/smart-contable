# Roadmap SmartContable

## Estado Actual

**Versión:** MVP Funcional Avanzado

## Plan de seguimiento priorizado — 2026

La prioridad inmediata es mejorar la experiencia de los reportes existentes antes de
ampliar la cobertura fiscal. Cada etapa debe cerrar con pruebas técnicas y revisión
funcional antes de iniciar la siguiente.

### Etapa 0 — Reportes profesionales y ligeros

**Prioridad:** Crítica
**Estado:** En implementación

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
- [ ] Agregar filtros específicos por proveedor, mes y tipo de operación.
- [ ] Unificar estados de carga, vacío y error.
- [ ] Revisar accesibilidad de tablas y controles.
- [ ] Validar responsive en escritorio, tablet y móvil.

#### Criterios de aceptación

- Los reportes mantienen los datos actuales y cargan sin errores.
- Una tabla permite filtrar, ordenar y paginar sin recargar la página.
- El usuario identifica periodo, totales y acción de exportación rápidamente.
- La interfaz evita paneles anidados, exceso de bordes y radios grandes.
- `npm run build` pasa antes de integrar cambios adicionales.

### Etapa 1 — Calidad técnica y seguridad

**Prioridad:** Muy alta

- [ ] Corregir errores y advertencias de lint del frontend.
- [ ] Agregar pruebas para reportes, filtros y exportaciones.
- [ ] Validar aislamiento entre usuarios y empresas.
- [ ] Completar pruebas de autenticación y permisos.
- [ ] Verificar migraciones Alembic desde una base limpia.
- [ ] Configurar CI para build, lint y pruebas backend.

### Etapa 2 — Modelo fiscal base

**Prioridad:** Crítica

- [x] Crear periodos fiscales mensuales y anuales.
- [x] Crear operaciones fiscales auditables por empresa.
- [x] Registrar base gravable, IVA, ISR, IEPS y retenciones.
- [x] Registrar nacional, extranjero y global para operaciones DIOT.
- [x] Mantener fuente del dato: XML, póliza o captura manual.
- [x] Exponer API protegida para crear/listar periodos y operaciones fiscales.
- [x] Evitar duplicados por origen y referencia de operación.
- [ ] Crear historial de declaraciones y modificaciones.

### Etapa 3 — Complementos CFDI

**Prioridad:** Alta

- [ ] Procesar percepciones de nómina.
- [ ] Procesar deducciones de nómina.
- [ ] Procesar subsidio al empleo.
- [ ] Almacenar complementos de pago y relacionarlos con CFDI originales.
- [ ] Incorporar intereses, dividendos y arrendamiento.
- [ ] Consolidar retenciones ISR/IVA aplicadas a terceros.

### Etapa 4 — Cálculos y declaraciones

**Prioridad:** Crítica

- [x] Implementar endpoint `/fiscal/isr` para pagos provisionales informativos.
- [x] Calcular ingresos acumulados, deducciones autorizadas y retenciones ISR.
- [x] Permitir estimación con tasa ISR explícita sin inventar tarifa legal por régimen.
- [x] Aplicar reglas base por régimen: RESICO sin deducciones, arrendamiento y coeficiente de utilidad parametrizados.
- [x] Reportar parámetros fiscales faltantes antes de marcar el cálculo como estimado.
- [ ] Versionar tarifas progresivas oficiales por ejercicio fiscal.
- [ ] Registrar pagos provisionales anteriores y pérdidas fiscales aplicables.
- [x] Implementar endpoint `/fiscal/iva` para pagos provisionales informativos.
- [x] Calcular IVA trasladado, acreditable, retenido y saldo estimado por periodo y acumulado.
- [ ] Implementar cálculo de IEPS cuando aplique.
- [ ] Implementar endpoint `/fiscal/anual`.
- [ ] Calcular ingresos acumulados, deducciones y retenciones.
- [ ] Calcular saldo a favor o impuesto por pagar.
- [ ] Agregar pruebas con casos fiscales revisados por contador.

### Etapa 5 — DIOT y exportaciones SAT

**Prioridad:** Crítica

- [ ] Implementar endpoint `/fiscal/diot`.
- [ ] Agrupar proveedores por RFC y periodo.
- [ ] Calcular base gravable, IVA acreditable e IVA retenido.
- [ ] Validar tipo de operación nacional, extranjero o global.
- [ ] Detectar datos incompletos antes de exportar.
- [ ] Generar el layout oficial SAT vigente.
- [ ] Agregar exportación Excel, CSV, PDF y formato SAT según corresponda.

### Etapa 6 — Interfaz fiscal consolidada

**Prioridad:** Alta

- [ ] Agregar pestañas `ISR`, `IVA`, `DIOT` y `Anual`.
- [ ] Mostrar estado del cálculo y datos pendientes.
- [ ] Agregar filtros por proveedor, mes y tipo de operación.
- [ ] Mostrar diferencias entre CFDI, pólizas y cálculo fiscal.
- [ ] Agregar bitácora de cambios y exportaciones.

### Indicadores de seguimiento

- Porcentaje de requisitos fiscales implementados.
- Cobertura de pruebas backend y frontend.
- Porcentaje de tablas con filtro, ordenamiento y paginación.
- Diferencias entre CFDI, pólizas y reportes fiscales.
- Operaciones DIOT sin datos faltantes.
- Errores de exportación por formato.
- Módulos aprobados por revisión contable.

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
