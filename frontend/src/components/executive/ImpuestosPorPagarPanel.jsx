import { CalendarClock, Receipt } from 'lucide-react';
import { formatMoney } from './format';
import { diasHasta } from '../../utils/financialHealth';

const formatFecha = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
};

/** Bloque prioritario: qué pagar, cuánto y cuándo. */
export default function ImpuestosPorPagarPanel({ snapshot, loading, disponible, onOpenSat }) {
  const detalle = snapshot.impuestosDetalle || { items: [], totalPagar: null };
  const pagables = detalle.items.filter((i) => i.accion === 'pagar');
  const informativos = detalle.items.filter((i) => i.accion !== 'pagar');
  const total = detalle.totalPagar;

  return (
    <section className="sc-card sc-card--priority flex flex-col gap-4 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sc-label">Prioridad de pago</p>
          <h3 className="sc-heading mt-0.5">Impuestos por pagar</h3>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--sc-soft)', color: 'var(--sc-warning)' }}>
          <Receipt className="h-5 w-5" />
        </span>
      </header>

      {!disponible ? (
        <p className="sc-muted text-sm leading-relaxed">
          Requiere negocio sincronizado con el motor fiscal SAT para calcular IVA, ISR y retenciones.
        </p>
      ) : loading ? (
        <div className="space-y-3">
          <div className="sc-skeleton h-10 w-40" />
          <div className="sc-skeleton h-16 w-full" />
          <div className="sc-skeleton h-16 w-full" />
        </div>
      ) : pagables.length === 0 && informativos.length === 0 ? (
        <div className="rounded-xl border border-[color:var(--sc-border)]/50 bg-[color:var(--sc-bg)] p-4">
          <p className="sc-text text-sm font-semibold">Sin impuestos a cargo en este periodo.</p>
          <p className="sc-muted mt-1 text-xs leading-relaxed">
            Cuando el motor detecte IVA, ISR o retenciones aparecerán aquí con fecha de vencimiento.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[color:var(--sc-divider)]">
            {pagables.map((item) => {
              const dias = item.dias ?? diasHasta(item.vencimiento);
              const urgente = dias != null && dias <= 5;
              return (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="sc-text text-sm font-semibold tracking-tight">{item.label}</p>
                    {item.nota ? <p className="sc-muted mt-0.5 text-xs leading-snug">{item.nota}</p> : null}
                    {item.vencimiento ? (
                      <p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${urgente ? 'sc-danger' : 'sc-muted'}`}>
                        <CalendarClock className="h-3.5 w-3.5" />
                        Vence {formatFecha(item.vencimiento)}
                        {dias != null ? ` · ${dias < 0 ? `hace ${Math.abs(dias)}d` : `${dias}d`}` : ''}
                      </p>
                    ) : null}
                  </div>
                  <p className="sc-metric shrink-0 text-lg tabular-nums">{formatMoney(item.monto)}</p>
                </li>
              );
            })}
          </ul>

          {informativos.length > 0 ? (
            <div className="rounded-xl border border-[color:var(--sc-border)]/40 bg-[color:var(--sc-bg)] p-3">
              <p className="sc-label mb-2">Referencia</p>
              <ul className="space-y-2">
                {informativos.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 text-xs">
                    <span className="sc-muted font-semibold">{item.label}</span>
                    <span className="sc-text font-bold tabular-nums">{formatMoney(item.monto, { compact: true })}</span>
                  </li>
                ))}
              </ul>
              {(detalle.ivaTrasladado != null || detalle.ivaAcreditable != null) ? (
                <p className="sc-muted mt-2 text-[11px] leading-relaxed">
                  IVA trasladado {formatMoney(detalle.ivaTrasladado || 0, { compact: true })}
                  {' · '}
                  Acreditable {formatMoney(detalle.ivaAcreditable || 0, { compact: true })}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-end justify-between gap-3 border-t border-[color:var(--sc-border)]/50 pt-4">
            <div>
              <p className="sc-label">Total a pagar</p>
              <p className="sc-metric mt-0.5 text-2xl tabular-nums sm:text-3xl">
                {total == null ? '—' : formatMoney(total)}
              </p>
            </div>
            {onOpenSat ? (
              <button type="button" onClick={onOpenSat} className="sc-link text-xs font-semibold">
                Ir al motor SAT →
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
