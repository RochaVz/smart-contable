import { ArrowLeft } from 'lucide-react';
import AlertsList from './AlertsList';
import FinancialHealthPanel from './FinancialHealthPanel';
import { INTELIGENCIA_CATEGORIAS } from '../../navigation/executive';
import { formatMoney, formatPct } from './format';

const metricaCategoria = (id, s) => {
  switch (id) {
    case 'ingresos': return formatMoney(s.ingresos, { compact: true });
    case 'gastos': return formatMoney(s.gastos, { compact: true });
    case 'utilidades': return formatPct(s.margen);
    case 'clientes': return s.concentracionClientes.cantidad ? `${s.concentracionClientes.contrapartes} cliente(s)` : '—';
    case 'proveedores': return s.concentracionProveedores.cantidad ? `${s.concentracionProveedores.contrapartes} proveedor(es)` : '—';
    case 'bancos': {
      const base = s.saldoBancario ?? s.flujoBancario;
      return base == null ? '—' : formatMoney(base, { compact: true });
    }
    case 'impuestos': return s.impuestosPendientes == null ? '—' : formatMoney(s.impuestosPendientes, { compact: true });
    case 'indicadores': return s.scoreFiscal == null ? '—' : `${s.scoreFiscal}/100`;
    default: return '';
  }
};

/** Centro de Inteligencia: categorías con métrica de cabecera y detalle bajo demanda. */
export default function InteligenciaView({ lectura, categoriaId, onSelect, onNavigate, renderFuente }) {
  const categoria = INTELIGENCIA_CATEGORIAS.find((c) => c.id === categoriaId) || null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Categorías de inteligencia">
        <button type="button" className="sc-chip" aria-pressed={!categoria} onClick={() => onSelect(null)}>
          Resumen
        </button>
        {INTELIGENCIA_CATEGORIAS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" className="sc-chip" aria-pressed={categoriaId === id} onClick={() => onSelect(id)}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {categoria ? (
        <section className="space-y-4">
          <header className="flex items-center gap-3">
            <button type="button" onClick={() => onSelect(null)} className="sc-chip" aria-label="Volver al resumen">
              <ArrowLeft className="h-3.5 w-3.5" /> Resumen
            </button>
            <div>
              <h2 className="sc-text text-lg font-black">{categoria.label}</h2>
              <p className="sc-muted text-xs font-semibold">{categoria.desc}</p>
            </div>
          </header>
          <div className="sc-card min-w-0 p-4 sm:p-5">{renderFuente(categoria.fuente)}</div>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {INTELIGENCIA_CATEGORIAS.map(({ id, label, desc, icon: Icon }) => {
              const metrica = metricaCategoria(id, lectura.snapshot);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect(id)}
                  className="sc-card flex items-center gap-4 p-4 text-left transition hover:-translate-y-0.5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--sc-soft)', color: 'var(--sc-primary)' }}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sc-text block text-sm font-black">{label}</span>
                    <span className="sc-muted block truncate text-xs font-semibold">{desc}</span>
                  </span>
                  {metrica ? <span className="sc-text shrink-0 text-sm font-black tabular-nums">{metrica}</span> : null}
                </button>
              );
            })}
          </div>

          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <FinancialHealthPanel score={lectura.score} recomendaciones={lectura.recomendaciones} loading={lectura.loading} />
            <AlertsList alertas={lectura.alertas} onNavigate={onNavigate} />
          </div>
        </>
      )}
    </div>
  );
}
