const money = (v) =>
  Number(v || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });

const formatMetodo = (tipo) => (tipo ? String(tipo).replaceAll('_', ' ') : null);

const pick = (...valores) => {
  const candidatos = valores
    .filter((v) => v != null)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  const positivo = candidatos.find((v) => v > 0);
  return positivo ?? candidatos[0] ?? 0;
};

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

  const ivaDetalle = imp.iva?.detalle?.periodo_actual || imp.iva?.detalle || {};
  const isrDetalle = imp.isr?.detalle || {};
  const isrSaldo = isrDetalle.saldo || {};

  const isr = pick(
    tot.isr_a_cargo,
    imp.isr?.a_cargo,
    isrSaldo.isr_a_cargo,
    isrDetalle.isr_estimado,
  );
  const ivaCargo = pick(
    tot.iva_a_cargo,
    imp.iva?.a_cargo,
    ivaDetalle.iva_a_cargo,
  );
  const ivaFavor = pick(
    tot.iva_a_favor,
    imp.iva?.a_favor,
    ivaDetalle.saldo_a_favor,
  );
  const retenciones = pick(
    tot.retenciones,
    imp.retenciones?.total,
    (Number(imp.retenciones?.isr) || 0) + (Number(imp.retenciones?.iva) || 0) || null,
  );
  const ish = pick(
    tot.ish,
    imp.ish?.a_cargo,
    ivaDetalle.ish,
  );

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
          ['ISR retenido', money(pick(imp.retenciones?.isr))],
          ['IVA retenido', money(pick(imp.retenciones?.iva))],
          ['Total retenciones', money(retenciones)],
        ]}
      />
      <SourceCard
        title="ISH (hospedaje)"
        rows={[
          ['A cargo', money(ish)],
          ['Resumen', imp.ish?.resumen || 'Impuesto local cobrado en los CFDI emitidos.'],
        ]}
      />
    </div>
  );
}
