import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '../../services/api';
import { downloadCsv } from '../../utils/csv';
import KpiCard from './KpiCard';
import { etiquetaPeriodo, formatMoney } from './format';

const ORDEN = ['Activo', 'Pasivo', 'Capital', 'Ingresos', 'Gastos', 'Otros'];

const redondear = (valor) => Math.round(valor * 100) / 100;

/**
 * Balance General y Balanza de Comprobación del periodo.
 * Presenta los cargos y abonos por familia de cuenta que ya entrega /reportes/financiero.
 */
export default function BalancePanel({ empresaId, mes, anio, modo = 'balance' }) {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelado = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(false);
    api.get('/reportes/financiero', { params: { empresa_id: empresaId, mes, anio } })
      .then((res) => {
        if (!cancelado) setCategorias(res.data?.detalle_por_categoria || []);
      })
      .catch(() => {
        if (!cancelado) {
          setCategorias([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [empresaId, mes, anio]);

  const filas = useMemo(() => {
    const porNombre = new Map(categorias.map((c) => [c.categoria, c]));
    return ORDEN.filter((n) => porNombre.has(n)).map((n) => ({
      categoria: n,
      cargos: Number(porNombre.get(n).cargos) || 0,
      abonos: Number(porNombre.get(n).abonos) || 0,
    }));
  }, [categorias]);

  const saldo = (nombre, naturaleza) => {
    const fila = filas.find((f) => f.categoria === nombre);
    if (!fila) return 0;
    return redondear(naturaleza === 'deudora' ? fila.cargos - fila.abonos : fila.abonos - fila.cargos);
  };

  const activo = saldo('Activo', 'deudora');
  const pasivo = saldo('Pasivo', 'acreedora');
  const capital = saldo('Capital', 'acreedora');
  const resultado = redondear(saldo('Ingresos', 'acreedora') - saldo('Gastos', 'deudora'));
  const totalCargos = redondear(filas.reduce((a, f) => a + f.cargos, 0));
  const totalAbonos = redondear(filas.reduce((a, f) => a + f.abonos, 0));
  const cuadra = Math.abs(totalCargos - totalAbonos) < 0.01;
  const ecuacion = redondear(pasivo + capital + resultado);

  const exportar = () => {
    const nombre = modo === 'balanza' ? 'balanza_comprobacion' : 'balance_general';
    downloadCsv(
      `${nombre}_${anio}-${String(mes).padStart(2, '0')}.csv`,
      filas.map((f) => ({ Familia: f.categoria, Cargos: f.cargos, Abonos: f.abonos, Saldo: redondear(f.cargos - f.abonos) })),
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16">
        <Loader2 className="sc-primary h-5 w-5 animate-spin" />
        <span className="sc-muted text-sm font-semibold">Cargando información contable…</span>
      </div>
    );
  }

  if (error || filas.length === 0) {
    return (
      <p className="sc-muted py-12 text-center text-sm font-semibold">
        {error
          ? 'No se pudo cargar la información contable del periodo.'
          : `No hay pólizas en ${etiquetaPeriodo(mes, anio)}. Genera pólizas desde Contabilidad para ver este informe.`}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="sc-text text-base font-black">
            {modo === 'balanza' ? 'Balanza de Comprobación' : 'Balance General'}
          </h3>
          <p className="sc-muted text-xs font-semibold">
            Movimientos de pólizas de {etiquetaPeriodo(mes, anio)}
          </p>
        </div>
        <button type="button" onClick={exportar} className="btn-ui btn-ui--secondary btn-ui--sm sc-no-print">
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Activo" value={formatMoney(activo, { compact: true })} tone="primary" />
        <KpiCard label="Pasivo" value={formatMoney(pasivo, { compact: true })} tone="warning" />
        <KpiCard label="Capital" value={formatMoney(capital, { compact: true })} tone="success" />
        <KpiCard label="Resultado" value={formatMoney(resultado, { compact: true })} tone={resultado >= 0 ? 'success' : 'danger'} hint="Ingresos − gastos" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="sc-card overflow-x-auto p-2">
          <table className="sc-table">
            <thead>
              <tr>
                <th>Familia de cuenta</th>
                <th className="num">Cargos</th>
                <th className="num">Abonos</th>
                <th className="num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.categoria}>
                  <td className="font-bold">{f.categoria}</td>
                  <td className="num">{formatMoney(f.cargos)}</td>
                  <td className="num">{formatMoney(f.abonos)}</td>
                  <td className="num">{formatMoney(f.cargos - f.abonos)}</td>
                </tr>
              ))}
              <tr>
                <td className="font-black">Totales</td>
                <td className="num font-black">{formatMoney(totalCargos)}</td>
                <td className="num font-black">{formatMoney(totalAbonos)}</td>
                <td className="num">
                  <span className={`sc-badge ${cuadra ? 'sc-badge--success' : 'sc-badge--danger'}`}>
                    {cuadra ? 'Cuadra' : 'Descuadre'}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {modo === 'balance' ? (
          <div className="sc-card p-4">
            <h4 className="sc-text mb-2 text-xs font-black uppercase tracking-wide">Activo vs Pasivo + Capital + Resultado</h4>
            <div className="h-56 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[{ nombre: 'Activo', valor: activo }, { nombre: 'Pasivo + Capital + Resultado', valor: ecuacion }]}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--sc-divider)" vertical={false} />
                  <XAxis dataKey="nombre" tick={{ fill: 'var(--sc-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => formatMoney(v, { compact: true })} tick={{ fill: 'var(--sc-muted)', fontSize: 11 }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip formatter={(v) => formatMoney(v)} contentStyle={{ background: 'var(--sc-card)', border: '1px solid var(--sc-divider)', borderRadius: 12 }} />
                  <Bar dataKey="valor" fill="#2563EB" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="sc-muted mt-2 text-xs font-semibold">
              {Math.abs(activo - ecuacion) < 0.01
                ? 'La ecuación contable cuadra en el periodo.'
                : `Diferencia de ${formatMoney(activo - ecuacion)} entre ambos lados del periodo.`}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
