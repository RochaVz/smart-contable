import {
  Clock3,
  FileCheck2,
  FileSearch2,
  GitCompareArrows,
  Scale,
  Sparkles,
} from 'lucide-react';

const METRICAS = [
  { key: 'cfdiAnalizados', label: 'CFDI analizados', icon: FileSearch2 },
  { key: 'cfdiConciliados', label: 'CFDI conciliados', icon: GitCompareArrows },
  { key: 'cfdiClasificados', label: 'CFDI clasificados', icon: FileCheck2 },
  { key: 'diferenciasDetectadas', label: 'Diferencias detectadas', icon: Scale },
  { key: 'declaracionesPreparadas', label: 'Declaraciones preparadas', icon: Sparkles },
];

/** Ahorro operativo medible del periodo. */
export default function KpiAhorroPanel({ snapshot, loading }) {
  const kpi = snapshot.kpiAhorro || {
    cfdiAnalizados: 0,
    cfdiConciliados: 0,
    cfdiClasificados: 0,
    diferenciasDetectadas: 0,
    declaracionesPreparadas: 0,
    horasAhorradas: 0,
  };

  return (
    <section className="sc-card flex flex-col gap-4 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="sc-label">Productividad SmartContable</p>
          <h3 className="sc-heading mt-0.5">Ahorro del periodo</h3>
        </div>
        <div className="rounded-xl border border-[color:var(--sc-border)]/50 bg-[color:var(--sc-soft)] px-3 py-2 text-right">
          <p className="sc-label flex items-center justify-end gap-1">
            <Clock3 className="h-3.5 w-3.5" /> Horas ahorradas
          </p>
          {loading ? (
            <div className="sc-skeleton mt-1 ml-auto h-7 w-16" />
          ) : (
            <p className="sc-metric text-2xl tabular-nums text-[color:var(--sc-primary)]">
              {kpi.horasAhorradas}
              <span className="sc-muted ml-1 text-sm font-semibold">h</span>
            </p>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {METRICAS.map(({ key, label, icon: Icon }) => (
          <div
            key={key}
            className="rounded-xl border border-[color:var(--sc-border)]/50 bg-[color:var(--sc-bg)] p-3"
          >
            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--sc-soft)', color: 'var(--sc-primary)' }}>
              <Icon className="h-4 w-4" />
            </div>
            {loading ? (
              <div className="sc-skeleton h-6 w-10" />
            ) : (
              <p className="sc-metric text-xl tabular-nums">{kpi[key] ?? 0}</p>
            )}
            <p className="sc-muted mt-1 text-[11px] font-semibold leading-snug">{label}</p>
          </div>
        ))}
      </div>

      <p className="sc-muted text-[11px] leading-relaxed">
        Estimación con tiempos de despacho (4 min análisis, 3 min clasificación, 5 min conciliación, 45 min/declaración).
      </p>
    </section>
  );
}
