const money = (v) =>
  Number(v || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });

const formatMetodo = (tipo) => (tipo ? String(tipo).replaceAll('_', ' ') : null);

export const SourceCard = ({ title, badge, rows }) => (
  <div className="rounded-xl border border-[color:var(--sc-border)] bg-[color:var(--sc-soft)] p-4">
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{title}</p>
      {badge && (
        <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
          {badge}
        </span>
      )}
    </div>
    <dl className="mt-3 space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-3 text-xs">
          <dt className="text-slate-500 dark:text-slate-400 font-medium">{k}</dt>
          <dd className="max-w-[65%] text-right font-mono font-bold text-slate-900 dark:text-white">{v}</dd>
        </div>
      ))}
    </dl>
  </div>
);

/**
 * Widgets fiscales ISR provisional / IVA del periodo / Retenciones.
 * Fuente única: `impuestos` y `obligaciones` de /fiscal/resumen-sat.
 */
export default function FiscalImpuestosCards({ impuestos, obligaciones }) {
  const imp = impuestos || {};
  const metodo = formatMetodo(obligaciones?.calculo_isr_tipo);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <SourceCard
        title="ISR provisional"
        badge={metodo}
        rows={[
          ['Método', metodo || '—'],
          ['A cargo', money(imp.isr?.a_cargo)],
          ['Resumen', imp.isr?.resumen || '—'],
        ]}
      />
      <SourceCard
        title="IVA del periodo"
        rows={[
          ['A cargo', money(imp.iva?.a_cargo)],
          ['A favor', money(imp.iva?.a_favor)],
          ['Resumen', imp.iva?.resumen || '—'],
        ]}
      />
      <SourceCard
        title="Retenciones"
        rows={[
          ['ISR retenido', money(imp.retenciones?.isr)],
          ['IVA retenido', money(imp.retenciones?.iva)],
          ['Total retenciones', money(imp.retenciones?.total)],
        ]}
      />
    </div>
  );
}
