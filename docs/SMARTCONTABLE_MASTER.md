# SMARTCONTABLE_MASTER_PROMPT.md

## Rol esperado
Actúa como:
- Staff Software Architect
- Senior Product Designer
- UX Architect
- Fintech Product Manager
- Consultor de Inteligencia Financiera

## Misión
Rediseñar la experiencia visual, arquitectura de navegación, dashboard, componentes y sistema de reportes de **SmartContable**.

---

## Restricción crítica
La lógica actual funciona correctamente. **NO modificar:**
- Backend
- API Routes
- Services
- Prisma Models
- Base de datos
- Integraciones SAT / bancarias
- Parseadores CFDI
- Reglas fiscales / contables
- Generación de indicadores
- Procesos automáticos
- Algoritmos existentes
- Consultas SQL
- Transformaciones de datos

✅ Solo mejorar UI/UX, navegación, dashboards y reportes.  
✅ Reutilizar información existente.  
✅ Consumir servicios ya implementados.  
✅ Reorganizar vistas sin alterar lógica.  

---

## Objetivo
Mantener el motor funcional de SmartContable pero presentar resultados de forma más profesional, intuitiva y ejecutiva.  
El usuario debe entender el estado de su negocio en **menos de 30 segundos**.

---

## Stack
- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui
- Recharts
- Prisma
- PostgreSQL
- React Hook Form
- Zod

---

## Filosofía UX
- Menos módulos visibles
- Menos clics
- Menos complejidad
- Menos lenguaje técnico
- Más indicadores
- Más visualización
- Más contexto
- Más inteligencia
- Más claridad

**Dashboard First. Decision First. Executive First.**

---

## Arquitectura general
- Dashboard
- Operación
- Inteligencia Financiera
- Informes Fiscales y Contables
- Configuración

### Sidebar recomendado
🏠 Dashboard  
**Operación**  
📄 CFDI  
📚 Contabilidad  
🏦 Bancos  
⚖️ SAT  

**Análisis**  
📊 Inteligencia Financiera  
📑 Informes Fiscales y Contables  

⚙️ Configuración  

Máximo 8 elementos visibles.

---

## Dashboard principal
Debe mostrar KPIs ejecutivos:
- 💰 Ingresos
- 💸 Gastos
- 📈 Utilidad
- 🏦 Bancos
- 🧾 Impuestos
- 🎯 Salud Financiera
- ⚖️ Salud Fiscal

KPIs principales:
- Ingresos del periodo
- Gastos del periodo
- Utilidad neta
- Margen neto
- Saldo bancario
- Impuestos pendientes
- Cumplimiento fiscal
- Score financiero

---

## Inteligencia Financiera
Centro de Inteligencia agrupado en:
- Ingresos
- Gastos
- Utilidades
- Clientes
- Proveedores
- Bancos
- Balance General
- Impuestos
- Indicadores

---

## Informes
### Contables
- Balance General
- Estado de Resultados
- Flujo de Efectivo
- Balanza de Comprobación
- Libro Diario
- Libro Mayor
- Auxiliares Contables

Cada informe debe incluir:
- KPIs
- Comparativos
- Gráficas
- Exportar PDF/Excel

### Fiscales
- IVA
- ISR
- Declaraciones
- Calendario Fiscal
- Obligaciones Pendientes
- Pagos Realizados
- Cumplimiento Fiscal

---

## Salud Financiera
Panel central con **Score Financiero (0-100)** basado en:
- Liquidez
- Rentabilidad
- Flujo
- Crecimiento
- Endeudamiento
- Clientes
- Proveedores
- Riesgo fiscal

Mostrar fortalezas, oportunidades, alertas y recomendaciones.

---

## Salud Fiscal
Dashboard ejecutivo con:
- Score Fiscal
- Cumplimiento
- Declaraciones pendientes
- Próximos vencimientos
- Impuestos pendientes
- Riesgo fiscal
- Alertas SAT

---

## Sistema de alertas
Clasificación: Info / Warning / Critical  
Detectar:
- Caída de ingresos
- Incremento de gastos
- Clientes morosos
- Saldo bajo
- Flujo insuficiente
- Concentración de clientes
- Dependencia de proveedores
- Impuestos próximos
- Declaraciones pendientes

---

## Diseño visual
- **Modo Claro** como principal
- Inspiración: Stripe, Linear, Mercury, Ramp, Notion, Vercel Dashboard

### Paleta oficial
- Principal: `#2563EB`
- Azul oscuro: `#1D4ED8`
- Cyan: `#06B6D4`
- Éxito: `#10B981`
- Fondo: `#F8FAFC`
- Card: `#FFFFFF`
- Texto: `#0F172A`
- Texto secundario: `#64748B`
- Bordes: `#CBD5E1`
- Divisores: `#E2E8F0`
- Advertencia: `#F59E0B`
- Error: `#EF4444`

### Gradiente oficial
```css
linear-gradient(
  135deg,
  #1D4ED8 0%,
  #2563EB 35%,
  #06B6D4 70%,
  #10B981 100%
)
