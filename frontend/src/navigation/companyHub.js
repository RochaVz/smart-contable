/**
 * Catálogo de módulos y reportes del negocio.
 * Cada ítem tiene ruta dedicada: /empresa/:id/modulos|reportes/:slug
 */
import {
  BookOpen,
  DollarSign,
  FileText,
  Landmark,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';

/** @typedef {'modulos' | 'reportes'} HubKind */

/**
 * @typedef {Object} HubItem
 * @property {string} id
 * @property {HubKind} kind
 * @property {string} slug
 * @property {string} label
 * @property {string} desc
 * @property {string} seccion
 * @property {string|null} tab
 * @property {import('lucide-react').LucideIcon} icon
 * @property {string} [accent]
 */

/** @type {HubItem[]} */
export const COMPANY_HUB_ITEMS = [
  {
    id: 'documentos',
    kind: 'modulos',
    slug: 'documentos',
    label: 'Documentos CFDI',
    desc: 'Facturas de ingresos y gastos del periodo',
    seccion: 'historial',
    tab: null,
    icon: FileText,
    accent: 'orange',
    emoji: '🧾',
  },
  {
    id: 'polizas',
    kind: 'modulos',
    slug: 'polizas',
    label: 'Registro contable',
    desc: 'Pólizas de diario, ingresos y egresos',
    seccion: 'polizas',
    tab: null,
    icon: BookOpen,
    accent: 'violet',
    emoji: '📚',
  },
  {
    id: 'conciliacion',
    kind: 'modulos',
    slug: 'conciliacion',
    label: 'Conciliación bancaria',
    desc: 'Cruce bancario con pólizas y comisiones',
    seccion: 'conciliacion',
    tab: null,
    icon: Landmark,
    accent: 'cyan',
    emoji: '🏦',
  },
  {
    id: 'fiscal',
    kind: 'modulos',
    slug: 'fiscal',
    label: 'Motor fiscal SAT',
    desc: 'Régimen, obligaciones, ISR e IVA',
    seccion: 'fiscal',
    tab: null,
    icon: Scale,
    accent: 'amber',
    emoji: '⚖️',
  },
  {
    id: 'ingresos',
    kind: 'reportes',
    slug: 'ingresos',
    label: 'Ingresos y ventas',
    desc: 'Estado de resultados y detalle de ventas',
    seccion: 'informes',
    tab: 'estado',
    icon: TrendingUp,
    accent: 'emerald',
    emoji: '📈',
  },
  {
    id: 'egresos',
    kind: 'reportes',
    slug: 'egresos',
    label: 'Gastos y egresos',
    desc: 'Gastos clasificados y proveedores',
    seccion: 'informes',
    tab: 'padron',
    icon: TrendingDown,
    accent: 'rose',
    emoji: '📉',
  },
  {
    id: 'utilidades',
    kind: 'reportes',
    slug: 'utilidades',
    label: 'Resumen financiero',
    desc: 'Utilidad, margen y balance del periodo',
    seccion: 'informes',
    tab: 'resumen',
    icon: DollarSign,
    accent: 'blue',
    emoji: '📊',
  },
  {
    id: 'impuestos',
    kind: 'reportes',
    slug: 'impuestos',
    label: 'Pago de impuestos',
    desc: 'IVA trasladado y desglose impositivo',
    seccion: 'informes',
    tab: 'trasladados',
    icon: Receipt,
    accent: 'orange',
    emoji: '💰',
  },
  {
    id: 'proveedores',
    kind: 'reportes',
    slug: 'proveedores',
    label: 'Padrón de proveedores',
    desc: 'Directorio de RFCs y montos acumulados',
    seccion: 'informes',
    tab: 'padron',
    icon: Users,
    accent: 'indigo',
    emoji: '👥',
  },
];

const bySlug = new Map(
  COMPANY_HUB_ITEMS.map((item) => [`${item.kind}:${item.slug}`, item]),
);

export function getHubItem(kind, slug) {
  if (!kind || !slug) return null;
  return bySlug.get(`${kind}:${slug}`) || null;
}

export function hubPath(empresaId, item) {
  return `/empresa/${empresaId}/${item.kind}/${item.slug}`;
}

export function hubHomePath(empresaId) {
  return `/empresa/${empresaId}`;
}

/** Convierte query legacy ?seccion=&tab= a ruta de hub. */
export function legacyQueryToHubPath(empresaId, seccion, tab) {
  const match = COMPANY_HUB_ITEMS.find((item) => {
    if (item.seccion !== seccion) return false;
    if (tab) return item.tab === tab;
    return !item.tab;
  });
  if (match) return hubPath(empresaId, match);
  const bySeccion = COMPANY_HUB_ITEMS.find((item) => item.seccion === seccion);
  if (bySeccion) return hubPath(empresaId, bySeccion);
  return hubHomePath(empresaId);
}
