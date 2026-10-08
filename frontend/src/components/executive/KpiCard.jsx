import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

/**
 * Tarjeta de KPI ejecutiva.
 * `trend` es la variación % contra el periodo anterior; `invertTrend` marca que
 * subir es malo (p. ej. gastos).
 */
export default function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  trend = null,
  invertTrend = false,
  tone = 'primary',
  loading = false,
  onClick,
}) {
  const sube = trend != null && trend > 0;
  const bueno = trend == null ? null : (invertTrend ? trend <= 0 : trend >= 0);
  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`sc-card flex min-w-0 flex-col gap-3 p-4 text-left ${onClick ? 'transition hover:-translate-y-0.5' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="sc-muted text-xs font-bold uppercase tracking-wide">{label}</span>
        {Icon ? (
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'var(--sc-soft)', color: `var(--sc-${tone})` }}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="sc-skeleton h-8 w-3/4" />
      ) : (
        <p className="sc-text truncate text-2xl font-black tabular-nums">{value}</p>
      )}

      <div className="flex min-h-5 flex-wrap items-center gap-2 text-xs">
        {!loading && trend != null ? (
          <span className={`sc-badge ${bueno ? 'sc-badge--success' : 'sc-badge--danger'}`}>
            {sube ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        ) : null}
        {hint ? <span className="sc-muted font-semibold">{hint}</span> : null}
      </div>
    </Wrapper>
  );
}
