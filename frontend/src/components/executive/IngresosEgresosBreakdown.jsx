import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMoney, formatPct } from './format';

const COLORES = [
  '#2563EB', '#06B6D4', '#10B981', '#F59E0B', '#8B5CF6',
  '#F43F5E', '#0EA5E9', '#84CC16', '#64748B',
];

function Ranking({ titulo, grupo, empty }) {
  const items = grupo?.items || [];
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col justify-center rounded-xl border border-[color:var(--sc-border)]/40 bg-[color:var(--sc-bg)] p-4">
        <p className="sc-text text-sm font-semibold">{titulo}</p>
        <p className="sc-muted mt-1 text-xs">{empty}</p>
      </div>
    );
  }

  const data = items.map((item, i) => ({
    name: item.label,
    value: item.monto,
    pct: item.pct,
    fill: COLORES[i % COLORES.length],
  }));

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="sc-heading text-sm">{titulo}</h4>
        <span className="sc-metric text-sm tabular-nums">{formatMoney(grupo.total, { compact: true })}</span>
      </div>

      <div className="grid flex-1 gap-3 sm:grid-cols-[140px_1fr]">
        <div className="mx-auto h-36 w-36">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
                {data.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, name, props) => [formatMoney(v), `${name} (${formatPct(props.payload.pct)})`]}
                contentStyle={{
                  background: 'var(--sc-card)',
                  border: '1px solid var(--sc-border)',
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <ul className="flex min-w-0 flex-col justify-center gap-1.5">
          {items.slice(0, 6).map((item, i) => (
            <li key={item.id} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORES[i % COLORES.length] }} />
              <span className="sc-text min-w-0 flex-1 truncate font-medium">{item.label}</span>
              <span className="sc-muted shrink-0 tabular-nums font-semibold">{formatPct(item.pct, 0)}</span>
              <span className="sc-text w-16 shrink-0 text-right tabular-nums font-semibold">
                {formatMoney(item.monto, { compact: true })}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TopContrapartes({ titulo, ranking = [], ticket }) {
  if (!ranking.length) return null;
  return (
    <div className="rounded-xl border border-[color:var(--sc-border)]/40 bg-[color:var(--sc-bg)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="sc-label">{titulo}</p>
        {ticket != null && ticket > 0 ? (
          <p className="sc-muted text-[11px] font-semibold">Ticket prom. {formatMoney(ticket, { compact: true })}</p>
        ) : null}
      </div>
      <ol className="space-y-1.5">
        {ranking.slice(0, 4).map((row, i) => (
          <li key={row.nombre} className="flex items-center gap-2 text-xs">
            <span className="sc-muted w-4 font-bold tabular-nums">{i + 1}</span>
            <span className="sc-text min-w-0 flex-1 truncate font-medium">{row.nombre}</span>
            <span className="sc-muted tabular-nums">{formatPct(row.pct, 0)}</span>
            <span className="sc-text w-16 text-right tabular-nums font-semibold">{formatMoney(row.monto, { compact: true })}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Por qué gana o pierde: conceptos CFDI + top clientes/proveedores. */
export default function IngresosEgresosBreakdown({ snapshot, loading }) {
  const ingresos = snapshot.conceptosIngresos || { items: [], total: 0 };
  const egresos = snapshot.conceptosEgresos || { items: [], total: 0 };

  return (
    <section className="sc-card flex flex-col gap-5 p-5 sm:p-6">
      <header>
        <p className="sc-label">Desglose del periodo</p>
        <h3 className="sc-heading mt-0.5">Qué vendes y qué compras</h3>
        <p className="sc-muted mt-1 text-xs leading-relaxed">
          Agrupado por <code className="sc-code">conceptos[].descripcion</code> de tus CFDI.
        </p>
      </header>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="sc-skeleton h-48 w-full rounded-xl" />
          <div className="sc-skeleton h-48 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Ranking titulo="Ingresos por concepto" grupo={ingresos} empty="Sin CFDI de ingreso en el periodo." />
            <Ranking titulo="Egresos por concepto" grupo={egresos} empty="Sin CFDI de egreso en el periodo." />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <TopContrapartes
              titulo="Clientes principales"
              ranking={snapshot.concentracionClientes?.ranking}
              ticket={snapshot.concentracionClientes?.ticketPromedio}
            />
            <TopContrapartes
              titulo="Proveedores principales"
              ranking={snapshot.concentracionProveedores?.ranking}
            />
          </div>
        </>
      )}
    </section>
  );
}
