import { CheckCircle2, Circle, Clock3, ShieldAlert } from 'lucide-react';
import { formatMoney } from './format';
import { diasHasta } from '../../utils/financialHealth';

const TONO_RIESGO = {
  Bajo: { badge: 'sc-badge--success', label: 'Bajo' },
  Moderado: { badge: 'sc-badge--info', label: 'Medio' },
  Alto: { badge: 'sc-badge--warning', label: 'Alto' },
  Crítico: { badge: 'sc-badge--danger', label: 'Crítico' },
};

const ESTADO_ICON = {
  hecho: CheckCircle2,
  urgente: ShieldAlert,
  pendiente: Circle,
  info: Clock3,
};

const formatFecha = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso || '—';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

/**
 * Motor fiscal accionable: riesgo + checklist + próximos vencimientos.
 * Sin ruido; solo lo que el usuario debe hacer.
 */
export default function FiscalHealthPanel({ snapshot, loading, disponible, onOpenSat, onNavigate }) {
  const riesgo = snapshot.riesgoFiscal || null;
  const tono = TONO_RIESGO[riesgo] || { badge: 'sc-badge--neutral', label: riesgo || 'Sin datos' };
  const acciones = snapshot.accionesFiscales || [];
  const vencimientos = snapshot.vencimientosFiscales || [];

  return (
    <section className="sc-card flex h-full flex-col gap-5 p-5 sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="sc-label">Motor fiscal SAT</p>
          <h3 className="sc-heading mt-0.5">Acciones prioritarias</h3>
        </div>
      </header>

      {!disponible ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
          <ShieldAlert className="sc-muted h-8 w-8" />
          <p className="sc-muted max-w-xs text-sm leading-relaxed">
            Sincroniza el negocio con el motor fiscal SAT para ver riesgo y obligaciones.
          </p>
        </div>
      ) : loading ? (
        <div className="space-y-3">
          <div className="sc-skeleton h-20 w-full rounded-xl" />
          <div className="sc-skeleton h-28 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-[color:var(--sc-border)]/50 bg-[color:var(--sc-bg)] p-4">
            <p className="sc-label">Riesgo fiscal</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className={`sc-badge text-sm ${tono.badge}`}>{tono.label}</span>
              {snapshot.scoreFiscal != null ? (
                <span className="sc-metric text-2xl tabular-nums">
                  {snapshot.scoreFiscal}
                  <span className="sc-muted text-sm font-semibold">/100</span>
                </span>
              ) : (
                <span className="sc-muted text-sm">Sin score</span>
              )}
              {snapshot.cumplimientoFiscal != null ? (
                <span className="sc-muted text-xs font-semibold">Cumplimiento {snapshot.cumplimientoFiscal}%</span>
              ) : null}
            </div>
          </div>

          <div>
            <h4 className="sc-label mb-2">Checklist del periodo</h4>
            {acciones.length === 0 ? (
              <p className="sc-muted text-xs">Sin acciones detectadas. Carga CFDI o sincroniza el motor.</p>
            ) : (
              <ul className="space-y-2">
                {acciones.map((accion) => {
                  const Icon = ESTADO_ICON[accion.estado] || Circle;
                  const done = accion.estado === 'hecho';
                  const urgent = accion.estado === 'urgente';
                  return (
                    <li key={accion.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (accion.destino && onNavigate) onNavigate(accion.destino);
                          else if (onOpenSat) onOpenSat();
                        }}
                        className="flex w-full items-start gap-3 rounded-xl border border-[color:var(--sc-border)]/40 px-3 py-2.5 text-left transition hover:border-[color:var(--sc-primary)]/40 hover:bg-[color:var(--sc-soft)]"
                      >
                        <Icon
                          className={`mt-0.5 h-4 w-4 shrink-0 ${done ? 'sc-success' : urgent ? 'sc-danger' : 'sc-muted'}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className={`block text-sm font-semibold tracking-tight ${done ? 'sc-muted line-through' : 'sc-text'}`}>
                            {accion.titulo}
                          </span>
                          <span className="sc-muted mt-0.5 block text-xs leading-snug">{accion.detalle}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <h4 className="sc-label mb-2">Próximos vencimientos</h4>
            {vencimientos.length === 0 ? (
              <p className="sc-muted text-xs">Sin vencimientos próximos registrados.</p>
            ) : (
              <ul className="space-y-2">
                {vencimientos.map((v) => {
                  const dias = diasHasta(v.fecha);
                  const urgente = dias != null && dias <= 5;
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-3 rounded-lg px-1 py-1 text-sm">
                      <span className="sc-text min-w-0 truncate font-semibold">{v.titulo}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {v.monto != null ? (
                          <span className="sc-muted tabular-nums text-xs font-semibold">
                            {formatMoney(v.monto, { compact: true })}
                          </span>
                        ) : null}
                        <span className={`sc-badge ${urgente ? 'sc-badge--danger' : 'sc-badge--neutral'}`}>
                          {formatFecha(v.fecha)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {onOpenSat ? (
            <button type="button" onClick={onOpenSat} className="sc-link self-start text-xs font-semibold">
              Abrir detalle SAT →
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
