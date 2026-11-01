const money = (v) => {
  if (v == null) return 'Sin registro';
  return Number(v).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
};

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
 * Contenedor reingenierizado de impuestos SAT para el dashboard.
 * Fuente única: `impuestos`, `totales` y `obligaciones` de /fiscal/resumen-sat.
 */
export default function ImpuestosSatCards({ impuestos, obligaciones, totales }) {
  const imp = impuestos || {};
  const tot = totales || {};
  const metodo = formatMetodo(obligaciones?.calculo_isr_tipo);

  const isr = tot.isr_a_cargo;
  const ivaCargo = tot.iva_a_cargo;
  const ivaFavor = tot.iva_a_favor;
  const retenciones = tot.retenciones;
  const ish = tot.ish;

  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
      <SourceCard
        title="ISR provisional"
        badge={metodo}
        rows={[
          ['Método', metodo || '—'],
          ['A cargo', money(isr)],
          ['Resumen', imp.isr?.resumen || '—'],
        ]}
      />
      <SourceCard
        title="IVA del periodo"
        rows={[
          ['A cargo', money(ivaCargo)],
          ['A favor', money(ivaFavor)],
          ['Resumen', imp.iva?.resumen || '—'],
        ]}
      />
      <SourceCard
        title="Retenciones"
        rows={[
          ['ISR retenido', money(imp.retenciones?.isr)],
          ['IVA retenido', money(imp.retenciones?.iva)],
          ['Total retenciones', money(retenciones)],
        ]}
      />
      <SourceCard
        title="ISH (hospedaje)"
        rows={[
          ['En facturas de ingreso', money(ish)],
          ['Origen', imp.ish?.resumen || 'Impuesto local persistido en CFDI de ingreso.'],
        ]}
      />
    </div>
  );
}
