import { AlertOctagon, AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';

const ICONOS = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
};

const ETIQUETAS = {
  critical: ['Crítica', 'sc-badge--danger'],
  warning: ['Atención', 'sc-badge--warning'],
  info: ['Info', 'sc-badge--info'],
};

/** Lista de alertas Info / Warning / Critical con acceso directo al detalle. */
export default function AlertsList({ alertas, onNavigate, limit = 6, title = 'Alertas' }) {
  const visibles = alertas.slice(0, limit);

  return (
    <section className="sc-card flex h-full flex-col gap-3 p-5">
      <header className="flex items-center justify-between">
        <h3 className="sc-text text-sm font-black">{title}</h3>
        <span className="sc-badge sc-badge--neutral">{alertas.length}</span>
      </header>

      {visibles.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <CheckCircle2 className="sc-success h-8 w-8" />
          <p className="sc-muted text-sm font-semibold">Sin alertas activas en este periodo.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visibles.map((alerta) => {
            const Icon = ICONOS[alerta.severity];
            const [etiqueta, claseBadge] = ETIQUETAS[alerta.severity];
            return (
              <li key={alerta.id} className={`sc-alert flex items-start gap-3 rounded-lg p-3 sc-alert--${alerta.severity}`}>
                <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: alerta.severity === 'critical' ? 'var(--sc-danger)' : alerta.severity === 'warning' ? 'var(--sc-warning)' : 'var(--sc-primary)' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="sc-text text-sm font-bold">{alerta.titulo}</p>
                    <span className={`sc-badge ${claseBadge}`}>{etiqueta}</span>
                  </div>
                  <p className="sc-muted mt-0.5 text-xs font-semibold">{alerta.detalle}</p>
                </div>
                {alerta.destino && onNavigate ? (
                  <button
                    type="button"
                    onClick={() => onNavigate(alerta.destino)}
                    className="sc-primary shrink-0 rounded-md p-1 hover:opacity-70"
                    aria-label={`Ver ${alerta.titulo}`}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {alertas.length > limit ? (
        <p className="sc-muted text-xs font-semibold">+{alertas.length - limit} alerta(s) más</p>
      ) : null}
    </section>
  );
}
