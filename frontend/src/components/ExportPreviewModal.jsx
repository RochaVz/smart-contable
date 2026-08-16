import { useEffect, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, Columns3, Download, FileSpreadsheet,
  Loader2, Rows3, X,
} from 'lucide-react';

const parseCsv = (text) => {
  const cleanText = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < cleanText.length; index += 1) {
    const character = cleanText[index];
    const nextCharacter = cleanText[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && nextCharacter === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value.trim())) rows.push(row);
  }

  return rows;
};

const buildSections = (rows) => {
  const sections = [];
  let current = null;

  rows.forEach((row) => {
    const firstCell = row[0]?.trim() || '';
    const isSectionTitle = row.length === 1 && /^(===|---)/.test(firstCell);

    if (isSectionTitle) {
      if (current?.headers?.length) sections.push(current);
      current = { title: firstCell, headers: null, rows: [] };
      return;
    }

    if (!current) {
      current = { title: null, headers: row, rows: [] };
    } else if (!current.headers) {
      current.headers = row;
    } else {
      current.rows.push(row);
    }
  });

  if (current?.headers?.length) sections.push(current);
  return sections;
};

const COLUMN_LABELS = {
  periodo: 'Periodo',
  anio: 'Año',
  mes: 'Mes',
  mes_nombre: 'Mes',
  id: 'ID',
  uuid: 'UUID',
  tipo_movimiento: 'Tipo',
  tipo_comprobante: 'Comprobante',
  fecha_emision: 'Fecha',
  fecha_timbrado: 'Timbrado',
  rfc_emisor: 'RFC emisor',
  nombre_emisor: 'Proveedor / emisor',
  rfc_receptor: 'RFC receptor',
  nombre_receptor: 'Cliente / receptor',
  subtotal: 'Subtotal',
  descuento: 'Descuento',
  iva_trasladado: 'IVA',
  iva_retenido: 'IVA retenido',
  isr_retenido: 'ISR retenido',
  impuestos_locales: 'Impuestos locales',
  total: 'Total',
  moneda: 'Moneda',
  concepto: 'Concepto',
  cuenta: 'Cuenta',
  nombre_cuenta: 'Nombre de cuenta',
  debe: 'Debe',
  haber: 'Haber',
};

const getColumnKey = (header) => header.trim().toLowerCase().replace(/\s+/g, '_');

const PRIORITY_COLUMNS = [
  'fecha_emision', 'fecha', 'tipo_movimiento', 'tipo', 'nombre_receptor',
  'nombre_emisor', 'concepto', 'subtotal', 'iva_trasladado', 'total',
  'debe', 'haber', 'cuenta',
];

const MONEY_COLUMNS = new Set([
  'subtotal', 'descuento', 'iva_trasladado', 'iva_retenido', 'isr_retenido',
  'impuestos_locales', 'total', 'debe', 'haber', 'ingresos_mxn', 'egresos_mxn',
  'resultado_neto_mxn', 'comision_fija',
]);

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const isMoneyValue = (key, row, columnIndex) => {
  if (MONEY_COLUMNS.has(key)) return true;
  if (key !== 'valor' || columnIndex !== 1) return false;
  return /ingresos|egresos|resultado|total_.*(mxn|polizas|movimientos)|comision/i.test(row[0] || '');
};

const formatCellValue = (value, key, row, columnIndex) => {
  if (!value || !isMoneyValue(key, row, columnIndex)) return value;
  const numericValue = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(numericValue) ? moneyFormatter.format(numericValue) : value;
};

const prepareSection = (section) => {
  const columns = section.headers
    .map((header, index) => ({ header, index, key: getColumnKey(header) }))
    .sort((left, right) => {
      const leftPriority = PRIORITY_COLUMNS.indexOf(left.key);
      const rightPriority = PRIORITY_COLUMNS.indexOf(right.key);
      return (leftPriority === -1 ? 999 : leftPriority) - (rightPriority === -1 ? 999 : rightPriority);
    });
  return { ...section, columns };
};

const ExportPreviewModal = ({ isOpen, onClose, title, content, loading, onDownload }) => {
  const rows = useMemo(() => parseCsv(content || ''), [content]);
  const sections = useMemo(() => buildSections(rows).map(prepareSection), [rows]);
  const visibleRows = sections.reduce((total, section) => total + section.rows.length, 0);
  const columnCount = sections.reduce((max, section) => Math.max(max, section.headers.length), 0);
  const hasError = content?.startsWith('Error:');

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-3 py-5 sm:px-6">
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/40">
        <div className="flex flex-col gap-4 border-b border-slate-800 px-5 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                <FileSpreadsheet className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-lg font-black text-white sm:text-xl">{title}</h3>
                <p className="mt-1 text-sm text-slate-400">Comprueba los datos antes de generar el archivo.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa"
              title="Cerrar vista previa"
              className="shrink-0 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {!loading && !hasError && sections.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                <Rows3 className="h-4 w-4 text-blue-400" />
                <span><strong className="text-white">{visibleRows}</strong> filas visibles</span>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                <Columns3 className="h-4 w-4 text-violet-400" />
                <span><strong className="text-white">{columnCount}</strong> columnas máximas</span>
              </div>
              <div className="col-span-2 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300 sm:col-span-1">
                <CheckCircle2 className="h-4 w-4" />
                Revisión completa del contenido
              </div>
            </div>
          )}
        </div>

        <div className="min-h-[220px] overflow-auto bg-slate-950/70 p-3 sm:p-5" style={{ maxHeight: '62vh' }}>
          {loading ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
              <span className="text-sm font-semibold">Preparando tus datos...</span>
              <span className="text-xs text-slate-600">Esto puede tardar unos segundos</span>
            </div>
          ) : hasError ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
              <AlertTriangle className="h-9 w-9 text-rose-400" />
              <p className="font-bold text-rose-300">No pudimos preparar la vista previa</p>
              <p className="max-w-md text-sm text-slate-500">{content.replace(/^Error:\s*/, '')}</p>
            </div>
          ) : sections.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center text-sm text-slate-500">
              No hay datos para mostrar en este periodo.
            </div>
          ) : (
            <div className="space-y-5">
              {sections.map((section, sectionIndex) => (
                <div key={`${section.title || 'datos'}-${sectionIndex}`} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  {section.title && (
                    <div className="border-b border-slate-800 bg-slate-800/70 px-4 py-3 text-xs font-black uppercase tracking-wider text-emerald-300">
                      {section.title.replace(/^===\s*|\s*===$/g, '').replace(/^---\s*|\s*---$/g, '')}
                    </div>
                  )}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                        <tr>
                          {section.columns.map(({ header, index, key }) => (
                            <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-slate-700 px-4 py-3 font-black">
                              {COLUMN_LABELS[key] || header || `Columna ${index + 1}`}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {section.rows.map((row, rowIndex) => (
                          <tr key={`row-${rowIndex}`} className="transition-colors hover:bg-slate-800/60">
                            {section.columns.map(({ index, key }) => (
                              <td key={`cell-${rowIndex}-${index}`} className="max-w-[280px] whitespace-nowrap px-4 py-3 text-slate-300">
                                {row[index]
                                  ? formatCellValue(row[index], key, row, index)
                                  : <span className="text-slate-700">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800 sm:w-auto"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={loading || hasError || sections.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.75 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 transition-all hover:bg-emerald-500 hover:shadow-emerald-800/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            Descargar archivo CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportPreviewModal;
