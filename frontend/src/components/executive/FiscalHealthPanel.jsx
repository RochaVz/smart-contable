import { CalendarClock, ShieldCheck } from 'lucide-react';
import ScoreGauge from './ScoreGauge';
import { formatMoney, formatPct } from './format';
import { diasHasta } from '../../utils/financialHealth';

const TONO_RIESGO = {
  Bajo: 'sc-badge--success',
  Moderado: 'sc-badge--info',
  Alto: 'sc-badge--warning',
  'Crítico': 'sc-badge--danger',
};

const formatFecha = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || '—';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

/** Salud Fiscal: score, cumplimiento, pendientes y próximos vencimientos. */
export default function FiscalHealthPanel({ snapshot, loading, disponible, onOpenSat }) {
  const vencimientos = [
    ...snapshot.sugerenciasPago
      .filter((p) => p.accion === 'pagar' && p.vencimiento)
      .map((p) => ({ id: `pago-${p.clave}`, titulo: p.concepto, fecha: p.vencimiento, monto: p.monto })),
    ...snapshot.declaraciones
      .filter((d) => d.proximo_vencimiento)
      .map((d, i) => ({ id: `decl-${i}`, titulo: `Declaración ${d.tipo}`, fecha: d.proximo_vencimiento, monto: null })),
  ]
    .filter((v) => diasHasta(v.fecha) != null)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .slice(0, 4);

  const pendientes = snapshot.declaraciones.length;

  return (
    <section className="sc-card flex flex-col gap-5 p-5">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h3 className="sc-text text-base font-black">Salud Fiscal</h3>
          <p className="sc-muted text-xs font-semibold">Cumplimiento y obligaciones del periodo</p>
        </div>
        {snapshot.riesgoFiscal ? (
          <span className={`sc-badge ${TONO_RIESGO[snapshot.riesgoFiscal] || 'sc-badge--neutral'}`}>
            Riesgo {snapshot.riesgoFiscal.toLowerCase()}
          </span>
        ) : null}
      </header>

      {!disponible ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <ShieldCheck className="sc-muted h-8 w-8" />
          <p className="sc-muted max-w-xs text-sm font-semibold">
            La salud fiscal requiere un negocio sincronizado con el motor fiscal SAT.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-5">
            {loading ? (
              <div className="sc-skeleton h-28 w-28 rounded-full" />
            ) : (
              <ScoreGauge score={snapshot.scoreFiscal} label="fiscal" size={116} />
            )}
            <dl className="grid flex-1 grid-cols-2 gap-3 text-xs font-bold">
              <Dato label="Cumplimiento" value={formatPct(snapshot.cumplimientoFiscal, 0)} />
              <Dato label="Declaraciones del periodo" value={pendientes} />
              <Dato label="Impuestos pendientes" value={snapshot.impuestosPendientes == null ? '—' : formatMoney(snapshot.impuestosPendientes, { compact: true })} />
              <Dato label="Alertas SAT" value={snapshot.alertasSat.length} tone={snapshot.alertasSat.length ? 'warning' : null} />
            </dl>
          </div>

          <div>
            <h4 className="sc-text mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide">
              <CalendarClock className="sc-primary h-4 w-4" /> Próximos vencimientos
            </h4>
            {vencimientos.length === 0 ? (
              <p className="sc-muted text-xs font-semibold">Sin vencimientos próximos registrados.</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: 'var(--sc-divider)' }}>
                {vencimientos.map((v) => {
                  const dias = diasHasta(v.fecha);
                  const urgente = dias <= 3;
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-xs font-semibold" style={{ borderColor: 'var(--sc-divider)' }}>
                      <span className="sc-text truncate">{v.titulo}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {v.monto != null ? <span className="sc-muted tabular-nums">{formatMoney(v.monto, { compact: true })}</span> : null}
                        <span className={`sc-badge ${urgente ? 'sc-badge--danger' : 'sc-badge--neutral'}`}>{formatFecha(v.fecha)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {onOpenSat ? (
            <button type="button" onClick={onOpenSat} className="sc-primary self-start text-xs font-black hover:underline">
              Abrir motor fiscal SAT →
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}

function Dato({ label, value, tone }) {
  return (
    <div>
      <dt className="sc-muted font-semibold">{label}</dt>
      <dd className={`mt-0.5 text-lg font-black tabular-nums ${tone === 'warning' ? 'sc-warning' : 'sc-text'}`}>{value}</dd>
    </div>
  );
}
