import { ArrowLeft } from 'lucide-react';

/**
 * Contenedor de página dedicada para un módulo o reporte.
 * Incluye botón de regreso al hub y cabecera limpia.
 */
export default function ModulePageShell({
  title,
  description,
  icon: Icon,
  badge,
  onBack,
  backLabel = 'Módulos y reportes',
  actions = null,
  children,
}) {
  return (
    <div className="module-page space-y-5 animate-page-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-3">
          <button
            type="button"
            onClick={onBack}
            className="btn-press inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm font-bold text-slate-300 hover:border-slate-600 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </button>

          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">
                <Icon className="h-6 w-6" />
              </div>
            ) : null}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-black text-white sm:text-2xl">{title}</h2>
                {badge ? (
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {badge}
                  </span>
                ) : null}
              </div>
              {description ? (
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
              ) : null}
            </div>
          </div>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
      </div>

      <section className="module-page-content min-w-0 rounded-3xl border border-slate-800/80 bg-slate-900/40 p-4 shadow-2xl shadow-black/20 sm:p-6">
        {children}
      </section>
    </div>
  );
}
