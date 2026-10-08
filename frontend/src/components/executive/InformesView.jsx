import { ArrowLeft, Clock, FileDown, Printer } from 'lucide-react';
import KpiCard from './KpiCard';
import { INFORMES, getInforme } from '../../navigation/executive';
import { etiquetaPeriodo, formatMoney, formatPct } from './format';

const GRUPOS = [
  { id: 'contables', titulo: 'Informes contables', desc: 'Estados financieros y libros del periodo' },
  { id: 'fiscales', titulo: 'Informes fiscales', desc: 'Impuestos, declaraciones y cumplimiento' },
];

/** Catálogo de informes; cada informe muestra KPIs y comparativo antes del detalle. */
export default function InformesView({ lectura, informeId, onSelect, renderFuente, mes, anio }) {
  const informe = informeId ? getInforme(informeId) : null;

  if (informe) {
    const s = lectura.snapshot;
    return (
      <section className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => onSelect(null)} className="sc-chip sc-no-print">
              <ArrowLeft className="h-3.5 w-3.5" /> Informes
            </button>
            <div>
              <h2 className="sc-text text-lg font-black">{informe.label}</h2>
              <p className="sc-muted text-xs font-semibold">{informe.desc} · {etiquetaPeriodo(mes, anio)}</p>
            </div>
          </div>
          {informe.disponible === false ? null : (
            <button type="button" onClick={() => window.print()} className="btn-ui btn-ui--secondary btn-ui--sm sc-no-print">
              <Printer className="h-4 w-4" /> Exportar PDF
            </button>
          )}
        </header>

        {informe.disponible === false ? (
          <div className="sc-card flex flex-col items-center gap-2 p-10 text-center">
            <Clock className="sc-muted h-8 w-8" />
            <p className="sc-text text-sm font-black">Informe en preparación</p>
            <p className="sc-muted max-w-md text-xs font-semibold">
              Este informe aún no cuenta con un servicio de datos habilitado. Mientras tanto
              puedes consultar el Estado de Resultados y el Libro Diario.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard label="Ingresos" value={formatMoney(s.ingresos, { compact: true })} tone="success" trend={s.variacionIngresos} hint="vs mes anterior" loading={lectura.loading} />
              <KpiCard label="Gastos" value={formatMoney(s.gastos, { compact: true })} tone="warning" trend={s.variacionGastos} invertTrend hint="vs mes anterior" loading={lectura.loading} />
              <KpiCard label="Utilidad" value={formatMoney(s.utilidad, { compact: true })} tone={s.utilidad >= 0 ? 'primary' : 'danger'} loading={lectura.loading} />
              <KpiCard label="Margen" value={formatPct(s.margen)} tone="primary" loading={lectura.loading} />
            </div>
            <div className="sc-card min-w-0 p-4 sm:p-5">{renderFuente(informe.fuente)}</div>
            <p className="sc-muted flex items-center gap-1.5 text-xs font-semibold sc-no-print">
              <FileDown className="h-3.5 w-3.5" />
              Cada tabla incluye su descarga en CSV, compatible con Excel.
            </p>
          </>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {GRUPOS.map((grupo) => (
        <section key={grupo.id} className="space-y-3">
          <header>
            <h2 className="sc-text text-base font-black">{grupo.titulo}</h2>
            <p className="sc-muted text-xs font-semibold">{grupo.desc}</p>
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {INFORMES[grupo.id].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelect(item.id)}
                className="sc-card flex flex-col gap-1 p-4 text-left transition hover:-translate-y-0.5"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="sc-text text-sm font-black">{item.label}</span>
                  {item.disponible === false ? <span className="sc-badge sc-badge--neutral">Próximamente</span> : null}
                </span>
                <span className="sc-muted text-xs font-semibold">{item.desc}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
