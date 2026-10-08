import {
  BarChart3,
  BookOpen,
  Building2,
  FileBarChart,
  FileText,
  Gauge,
  Home,
  Landmark,
  Receipt,
  Scale,
  Settings,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';

/**
 * Arquitectura de navegación ejecutiva.
 * Máximo 8 elementos visibles en el sidebar; las rutas de módulos existentes
 * (/empresa/:id/modulos/:slug) se reutilizan sin cambios.
 */
export const SIDEBAR_SECTIONS = [
  {
    id: 'inicio',
    label: null,
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: Home, path: '' },
    ],
  },
  {
    id: 'operacion',
    label: 'Operación',
    items: [
      { id: 'cfdi', label: 'CFDI', icon: FileText, path: '/modulos/documentos' },
      { id: 'contabilidad', label: 'Contabilidad', icon: BookOpen, path: '/modulos/polizas' },
      { id: 'bancos', label: 'Bancos', icon: Landmark, path: '/modulos/conciliacion' },
      { id: 'sat', label: 'SAT', icon: Scale, path: '/modulos/fiscal' },
    ],
  },
  {
    id: 'analisis',
    label: 'Análisis',
    items: [
      { id: 'inteligencia', label: 'Inteligencia Financiera', icon: BarChart3, path: '/inteligencia' },
      { id: 'informes', label: 'Informes Fiscales y Contables', icon: FileBarChart, path: '/informes' },
    ],
  },
  {
    id: 'sistema',
    label: null,
    items: [
      { id: 'configuracion', label: 'Configuración', icon: Settings, path: '/configuracion' },
    ],
  },
];

export const SIDEBAR_ITEMS = SIDEBAR_SECTIONS.flatMap((section) => section.items);

export const sidebarHref = (empresaId, item) => `/empresa/${empresaId}${item.path}`;

/** Resuelve qué elemento del sidebar corresponde a la ruta actual. */
export const activeSidebarId = (pathname, empresaId) => {
  const base = `/empresa/${empresaId}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : '';
  if (rest === '' || rest === '/') return 'dashboard';
  if (rest.startsWith('/reportes')) return 'inteligencia';
  const match = SIDEBAR_ITEMS
    .filter((item) => item.path)
    .find((item) => rest === item.path || rest.startsWith(`${item.path}/`));
  return match?.id || 'dashboard';
};

/** Categorías del Centro de Inteligencia y el panel existente que las alimenta. */
export const INTELIGENCIA_CATEGORIAS = [
  { id: 'ingresos', label: 'Ingresos', icon: TrendingUp, desc: 'Ventas y estado de resultados', fuente: { tipo: 'informes', tab: 'estado' } },
  { id: 'gastos', label: 'Gastos', icon: TrendingDown, desc: 'Compras y gastos deducibles', fuente: { tipo: 'informes', tab: 'acreditables' } },
  { id: 'utilidades', label: 'Utilidades', icon: Wallet, desc: 'Utilidad, margen y resumen', fuente: { tipo: 'informes', tab: 'resumen' } },
  { id: 'clientes', label: 'Clientes', icon: Users, desc: 'Facturación emitida por cliente', fuente: { tipo: 'informes', tab: 'trasladados' } },
  { id: 'proveedores', label: 'Proveedores', icon: Truck, desc: 'Padrón y montos acumulados', fuente: { tipo: 'informes', tab: 'padron' } },
  { id: 'bancos', label: 'Bancos', icon: Landmark, desc: 'Conciliación y movimientos', fuente: { tipo: 'bancos' } },
  { id: 'balance', label: 'Balance General', icon: Building2, desc: 'Activo, pasivo y capital', fuente: { tipo: 'balance', modo: 'balance' } },
  { id: 'impuestos', label: 'Impuestos', icon: Receipt, desc: 'Resumen SAT: ISR, IVA y pagos', fuente: { tipo: 'fiscal', tab: 'resumen' } },
  { id: 'indicadores', label: 'Indicadores', icon: Gauge, desc: 'Salud fiscal y seguimiento', fuente: { tipo: 'fiscal', tab: 'indicadores' } },
];

/**
 * Catálogo de informes. `fuente` apunta a un panel existente; los informes sin
 * servicio disponible se marcan con `disponible: false`.
 */
export const INFORMES = {
  contables: [
    { id: 'balance-general', label: 'Balance General', desc: 'Activo, pasivo y capital del periodo', fuente: { tipo: 'balance', modo: 'balance' } },
    { id: 'estado-resultados', label: 'Estado de Resultados', desc: 'Ingresos, gastos y utilidad', fuente: { tipo: 'informes', tab: 'estado' } },
    { id: 'flujo-efectivo', label: 'Flujo de Efectivo', desc: 'Cobros contra pagos del periodo', disponible: false },
    { id: 'balanza', label: 'Balanza de Comprobación', desc: 'Cargos y abonos por familia de cuenta', fuente: { tipo: 'balance', modo: 'balanza' } },
    { id: 'libro-diario', label: 'Libro Diario', desc: 'Pólizas de diario, ingresos y egresos', fuente: { tipo: 'polizas' } },
    { id: 'libro-mayor', label: 'Libro Mayor', desc: 'Cuentas T con cargos, abonos y saldo', fuente: { tipo: 'informes', tab: 'estado' } },
    { id: 'auxiliares', label: 'Auxiliares Contables', desc: 'Detalle por cuenta y contraparte', disponible: false },
  ],
  fiscales: [
    { id: 'iva', label: 'IVA', desc: 'Trasladado, acreditable y saldo', fuente: { tipo: 'fiscal', tab: 'iva' } },
    { id: 'isr', label: 'ISR', desc: 'Pago provisional estimado', fuente: { tipo: 'fiscal', tab: 'isr' } },
    { id: 'declaraciones', label: 'Declaraciones', desc: 'Historial de declaraciones', fuente: { tipo: 'fiscal', tab: 'bitacora' } },
    { id: 'calendario', label: 'Calendario Fiscal', desc: 'Próximos vencimientos', fuente: { tipo: 'fiscal', tab: 'resumen' } },
    { id: 'obligaciones', label: 'Obligaciones Pendientes', desc: 'Diferencias y pendientes del periodo', fuente: { tipo: 'fiscal', tab: 'diferencias' } },
    { id: 'pagos', label: 'Pagos Realizados', desc: 'Bitácora de pagos y declaraciones', fuente: { tipo: 'fiscal', tab: 'bitacora' } },
    { id: 'cumplimiento', label: 'Cumplimiento Fiscal', desc: 'Salud y avance de revisión', fuente: { tipo: 'fiscal', tab: 'indicadores' } },
  ],
};

export const INFORMES_PLANOS = [...INFORMES.contables, ...INFORMES.fiscales];

export const getInforme = (id) => INFORMES_PLANOS.find((item) => item.id === id) || null;
