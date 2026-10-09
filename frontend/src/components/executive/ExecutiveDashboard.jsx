import {
  Activity,
  Landmark,
  Percent,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import KpiCard from './KpiCard';
import AlertsList from './AlertsList';
import FinancialHealthPanel from './FinancialHealthPanel';
import FiscalHealthPanel from './FiscalHealthPanel';
import ImpuestosPorPagarPanel from './ImpuestosPorPagarPanel';
import IngresosEgresosBreakdown from './IngresosEgresosBreakdown';
import KpiAhorroPanel from './KpiAhorroPanel';
import { etiquetaPeriodo, formatMoney, formatPct } from './format';
import { periodoAnterior } from '../../utils/financialHealth';

/** Dashboard ejecutivo: el estado del negocio en menos de 30 segundos. */
export default function ExecutiveDashboard({ lectura, mes, anio, onNavigate }) {
  const { snapshot: s, score, alertas, recomendaciones, loading, esLocal, fallidos } = lectura;
  const previo = periodoAnterior(mes, anio);
  const sinBanco = s.saldoBancario == null && s.flujoBancario == null;
  const sinDatos = !loading && s.cfdiIngresos + s.cfdiEgresos === 0;

  const comparativo = [
    { nombre: etiquetaPeriodo(previo.mes, previo.anio), Ingresos: s.ingresosPrev ?? 0, Gastos: s.gastosPrev ?? 0 },
    { nombre: etiquetaPeriodo(mes, anio), Ingresos: s.ingresos, Gastos: s.gastos },
  ];

  const totalImpuestos = s.impuestosDetalle?.totalPagar ?? s.impuestosPendientes;

  return (
    <div className="sc-stack">
      <section className="sc-gradient flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">
            Resumen · {etiquetaPeriodo(mes, anio)}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            {loading ? 'Analizando tu negocio…' : mensajeEjecutivo(s, score, totalImpuestos)}
          </h2>
          {!loading && totalImpuestos != null && totalImpuestos > 0 ? (
            <p className="mt-2 text-sm font-medium opacity-90">
              Impuestos por pagar: {formatMoney(totalImpuestos)}
              {s.impuestosDetalle?.vencimientoPrincipal
                ? ` · vence ${s.impuestosDetalle.vencimientoPrincipal}`
                : ''}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-8 text-center">
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{score.score ?? '—'}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">Salud financiera</p>
          </div>
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{s.scoreFiscal ?? '—'}</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">
              Riesgo fiscal {s.riesgoFiscal ? `· ${s.riesgoFiscal}` : ''}
            </p>
          </div>
        </div>
      </section>

      {fallidos.length > 0 ? (
        <p className="sc-alert sc-alert--warning rounded-xl p-3.5 text-xs font-medium sc-text">
          Algunos servicios no respondieron ({fallidos.join(', ')}). Se muestran los datos disponibles.
        </p>
      ) : null}
      {sinDatos ? (
        <p className="sc-alert sc-alert--info rounded-xl p-3.5 text-xs font-medium sc-text">
          No hay CFDI en {etiquetaPeriodo(mes, anio)}. Usa “Cargar CFDI” o cambia el periodo para ver indicadores.
        </p>
      ) : null}

      <section aria-label="Indicadores principales" className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Ingresos del periodo" value={formatMoney(s.ingresos, { compact: true })} icon={TrendingUp} tone="success" trend={s.variacionIngresos} hint="vs mes anterior" loading={loading} onClick={() => onNavigate('ingresos')} />
        <KpiCard label="Gastos del periodo" value={formatMoney(s.gastos, { compact: true })} icon={TrendingDown} tone="warning" trend={s.variacionGastos} invertTrend hint="vs mes anterior" loading={loading} onClick={() => onNavigate('gastos')} />
        <KpiCard label="Utilidad neta" value={formatMoney(s.utilidad, { compact: true })} icon={Wallet} tone={s.utilidad >= 0 ? 'primary' : 'danger'} hint={s.utilidad >= 0 ? 'Resultado positivo' : 'Resultado negativo'} loading={loading} onClick={() => onNavigate('utilidades')} />
        <KpiCard label="Margen neto" value={formatPct(s.margen)} icon={Percent} tone="primary" hint="Utilidad / ingresos" loading={loading} onClick={() => onNavigate('utilidades')} />
        <KpiCard
          label="Saldo bancario"
          value={sinBanco ? '—' : formatMoney(s.saldoBancario ?? s.flujoBancario, { compact: true })}
          icon={Landmark}
          tone="primary"
          hint={sinBanco ? 'Sin estados de cuenta' : s.saldoBancario != null ? 'Último saldo reportado' : 'Flujo neto del periodo'}
          loading={loading}
          onClick={() => onNavigate('bancos')}
        />
        <KpiCard
          label="Impuestos por pagar"
          value={totalImpuestos == null ? '—' : formatMoney(totalImpuestos, { compact: true })}
          icon={Receipt}
          tone={totalImpuestos > 0 ? 'warning' : 'success'}
          hint={esLocal ? 'Requiere negocio sincronizado' : (s.impuestosDetalle?.vencimientoPrincipal ? `Vence ${s.impuestosDetalle.vencimientoPrincipal}` : 'IVA + ISR + retenciones')}
          loading={loading}
          onClick={() => onNavigate('impuestos')}
        />
        <KpiCard
          label="Cumplimiento fiscal"
          value={s.cumplimientoFiscal == null ? '—' : formatPct(s.cumplimientoFiscal, 0)}
          icon={Scale}
          tone="success"
          hint={s.riesgoFiscal ? `Riesgo ${s.riesgoFiscal.toLowerCase()}` : 'Sin datos fiscales'}
          loading={loading}
          onClick={() => onNavigate('indicadores')}
        />
        <KpiCard
          label="Score financiero"
          value={score.score == null ? '—' : `${score.score}/100`}
          icon={Activity}
          tone={score.nivel.tone === 'danger' ? 'danger' : score.nivel.tone === 'warning' ? 'warning' : 'success'}
          hint={score.nivel.label}
          loading={loading}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <ImpuestosPorPagarPanel
          snapshot={s}
          loading={loading}
          disponible={!esLocal}
          onOpenSat={() => onNavigate('sat')}
        />
        <FiscalHealthPanel
          snapshot={s}
          loading={loading}
          disponible={!esLocal}
          onOpenSat={() => onNavigate('sat')}
          onNavigate={onNavigate}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <FinancialHealthPanel score={score} recomendaciones={recomendaciones} loading={loading} />
        <AlertsList alertas={alertas} onNavigate={onNavigate} />
      </div>

      <IngresosEgresosBreakdown snapshot={s} loading={loading} />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="sc-card p-5 sm:p-6">
          <header className="mb-4">
            <p className="sc-label">Tendencia</p>
            <h3 className="sc-heading mt-0.5">Ingresos vs gastos</h3>
          </header>
          <div className="h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparativo} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--sc-divider)" vertical={false} />
                <XAxis dataKey="nombre" tick={{ fill: 'var(--sc-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => formatMoney(v, { compact: true })} tick={{ fill: 'var(--sc-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                <Tooltip
                  formatter={(v) => formatMoney(v)}
                  contentStyle={{
                    background: 'var(--sc-card)',
                    border: '1px solid var(--sc-border)',
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend />
                <Bar dataKey="Ingresos" fill="#2563EB" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Gastos" fill="#06B6D4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {s.ingresosPrev == null ? (
            <p className="sc-muted mt-3 text-xs leading-relaxed">No hay información del mes anterior para comparar.</p>
          ) : (
            <p className="sc-muted mt-3 text-xs leading-relaxed">
              Utilidad actual {formatMoney(s.utilidad, { compact: true })}
              {s.variacionIngresos != null ? ` · ingresos ${s.variacionIngresos > 0 ? '+' : ''}${s.variacionIngresos}%` : ''}
              {s.variacionGastos != null ? ` · gastos ${s.variacionGastos > 0 ? '+' : ''}${s.variacionGastos}%` : ''}
            </p>
          )}
        </section>

        <KpiAhorroPanel snapshot={s} loading={loading} />
      </div>
    </div>
  );
}

function mensajeEjecutivo(s, score, totalImpuestos) {
  if (score.score == null) return 'Carga tus CFDI para ver el estado de tu negocio';
  if (totalImpuestos > 0 && s.impuestosDetalle?.vencimientoPrincipal) {
    const diasHint = s.impuestosDetalle.vencimientoPrincipal;
    if (s.utilidad < 0) return `Pérdida en el periodo · ${formatMoney(totalImpuestos)} de impuestos (vence ${diasHint})`;
    return `A pagar ${formatMoney(totalImpuestos)} · salud ${score.nivel.label.toLowerCase()}`;
  }
  if (s.utilidad < 0) return 'Este periodo cierra con pérdida: revisa gastos y cobranza';
  if (score.score >= 80) return 'Tu negocio está en excelente forma';
  if (score.score >= 65) return 'Tu negocio va bien, con oportunidades de mejora';
  if (score.score >= 40) return 'Tu negocio requiere atención en algunos frentes';
  return 'Tu negocio necesita acción inmediata';
}
