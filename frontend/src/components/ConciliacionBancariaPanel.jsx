import { memo, useCallback, useMemo, useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, CheckCircle2, FileUp, Landmark, Loader2,
  RefreshCw, Search, UploadCloud, X,
} from 'lucide-react';
import api from '../services/api';
import CrearPolizaMovimientoModal from './CrearPolizaMovimientoModal';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const fmt = (v) => `$${(Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

// ─── Construye filas planas a partir de la respuesta de conciliación ───────────
function buildFilas(data) {
  if (!data) return [];
  const filas = [];

  for (const item of data.conciliados || []) {
    const m = item.movimiento_banco;
    filas.push({
      id: m.id, fecha: m.fecha, descripcion: m.descripcion || '—',
      referencia: m.referencia || '',
      cargo: m.tipo === 'cargo' ? m.monto : null,
      abono: m.tipo === 'abono' ? m.monto : null,
      tipo: m.tipo, estado: 'conciliado',
      poliza_tipo: item.poliza.tipo, poliza_numero: item.poliza.numero,
      poliza_concepto: item.poliza.concepto || '',
      diferencia_dias: item.diferencia_dias,
    });
  }

  for (const m of data.banco_sin_poliza || []) {
    filas.push({
      id: m.id, fecha: m.fecha, descripcion: m.descripcion || '—',
      referencia: m.referencia || '',
      cargo: m.tipo === 'cargo' ? m.monto : null,
      abono: m.tipo === 'abono' ? m.monto : null,
      tipo: m.tipo, estado: 'sin_poliza',
      poliza_tipo: null, poliza_numero: null, poliza_concepto: '', diferencia_dias: null,
    });
  }

  for (const m of data.comisiones_en_poliza || []) {
    filas.push({
      id: m.id, fecha: m.fecha, descripcion: m.descripcion || '—',
      referencia: m.referencia || '',
      cargo: m.tipo === 'cargo' ? m.monto : null,
      abono: m.tipo === 'abono' ? m.monto : null,
      tipo: m.tipo, estado: 'comision',
      poliza_tipo: null, poliza_numero: null, poliza_concepto: '', diferencia_dias: null,
    });
  }

  filas.sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
  return filas;
}

// ─── Componente principal ──────────────────────────────────────────────────────
const ConciliacionBancariaPanel = ({ empresaId, mes, anio, onPeriodoChange }) => {
  const [bancoId, setBancoId] = useState('');
  const [bancos, setBancos] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('todos');   // todos | conciliado | sin_poliza
  const [filtroTipo, setFiltroTipo] = useState('todos');       // todos | cargo | abono
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [movimientoParaPoliza, setMovimientoParaPoliza] = useState(null);

  const cargarDatos = useCallback(async (targetMes, targetAnio) => {
    setLoading(true);
    try {
      const [resBancos, resConciliacion] = await Promise.all([
        api.get(`/configuracion/comisiones-banco/${empresaId}`).catch(() => ({ data: [] })),
        api.get(`/conciliacion/resumen?empresa_id=${empresaId}&mes=${targetMes}&anio=${targetAnio}`),
      ]);
      const listaBancos = resBancos.data || [];
      setBancos(listaBancos);
      setBancoId((prev) => {
        if (!prev && listaBancos.length > 0) {
          const def = listaBancos.find((b) => b.es_default) || listaBancos[0];
          return String(def.id);
        }
        return prev;
      });
      setData(resConciliacion.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudieron sincronizar los datos');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  const [inicializado, setInicializado] = useState(false);
  if (!inicializado && !loading) {
    setInicializado(true);
    cargarDatos(mes, anio);
  }

  const handleCambioMes = (v) => { onPeriodoChange(v, anio); startTransition(() => cargarDatos(v, anio)); };
  const handleCambioAnio = (v) => { onPeriodoChange(mes, v); startTransition(() => cargarDatos(mes, v)); };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith('.xml') && !name.endsWith('.csv') && !name.endsWith('.pdf')) {
      toast.error('Selecciona un XML, CSV o PDF de estado de cuenta');
      return;
    }
    const formData = new FormData();
    formData.append('archivo', file);
    setUploading(true);
    try {
      const params = new URLSearchParams({ empresa_id: String(empresaId), mes: String(mes), anio: String(anio) });
      if (bancoId) params.set('banco_id', bancoId);
      const res = await api.post(`/conciliacion/estado-cuenta?${params}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`${res.data.movimientos_nuevos} movimiento(s) cargado(s)`);
      await cargarDatos(mes, anio);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo cargar el estado de cuenta');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const resumen = data?.resumen || {};
  const estaCargando = loading || isPending;

  // Filas planas + filtros aplicados
  const todasFilas = useMemo(() => buildFilas(data), [data]);

  const filasFiltradas = useMemo(() => {
    let result = todasFilas;
    if (filtroEstado !== 'todos') result = result.filter((f) => f.estado === filtroEstado);
    if (filtroTipo !== 'todos') result = result.filter((f) => f.tipo === filtroTipo);
    if (filtroBusqueda.trim()) {
      const q = filtroBusqueda.trim().toLowerCase();
      result = result.filter(
        (f) =>
          f.descripcion.toLowerCase().includes(q) ||
          f.referencia.toLowerCase().includes(q) ||
          (f.poliza_concepto || '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [todasFilas, filtroEstado, filtroTipo, filtroBusqueda]);

  const totalCargos = useMemo(() => filasFiltradas.reduce((s, f) => s + (f.cargo || 0), 0), [filasFiltradas]);
  const totalAbonos = useMemo(() => filasFiltradas.reduce((s, f) => s + (f.abono || 0), 0), [filasFiltradas]);
  const countSinPoliza = useMemo(() => todasFilas.filter((f) => f.estado === 'sin_poliza').length, [todasFilas]);
  const countComision  = useMemo(() => todasFilas.filter((f) => f.estado === 'comision').length, [todasFilas]);
  const countConciliado = useMemo(() => todasFilas.filter((f) => f.estado === 'conciliado').length, [todasFilas]);

  return (
    <section className="mb-10 bg-slate-900/80 border border-slate-800 rounded-3xl p-6">

      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <Landmark className="w-6 h-6 text-cyan-400 mt-1 shrink-0" />
          <div>
            <h2 className="text-lg font-black text-white">Conciliación bancaria</h2>
            <p className="text-slate-500 text-xs">
              Estado de cuenta oficial · base para conciliar con pólizas del período
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Selector mes/año */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
            <select
              value={mes}
              onChange={(e) => handleCambioMes(Number(e.target.value))}
              className="bg-transparent text-white text-sm outline-none"
            >
              {MESES.map((nombre, i) => <option key={nombre} value={i + 1}>{nombre}</option>)}
            </select>
            <input
              type="number"
              value={anio}
              onChange={(e) => handleCambioAnio(Number(e.target.value))}
              className="w-20 bg-transparent text-white text-sm outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => cargarDatos(mes, anio)}
            disabled={estaCargando}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl"
          >
            {estaCargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </button>

          {bancos.length > 0 && (
            <select
              value={bancoId}
              onChange={(e) => setBancoId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white"
            >
              {bancos.map((b) => <option key={b.id} value={b.id}>{b.nombre_banco}</option>)}
            </select>
          )}

          <UploadBtn label="XML" accept=".xml,text/xml" uploading={uploading} onChange={handleUpload} color="cyan" />
          <UploadBtn label="PDF" accept=".pdf,application/pdf" uploading={uploading} onChange={handleUpload} color="amber" />
          <UploadBtn label="CSV" accept=".csv,text/csv" uploading={uploading} onChange={handleUpload} color="slate" />
        </div>
      </div>

      {estaCargando && !data ? (
        <div className="py-16 flex justify-center text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Totales ── */}
          {resumen.total_banco > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              <Amount
                label="Total banco"
                value={resumen.total_banco}
                sub={`Cargos ${fmt(resumen.total_cargos_banco)} · Abonos ${fmt(resumen.total_abonos_banco)}`}
              />
              <Amount
                label="Total pólizas"
                value={resumen.total_polizas}
                sub={`Cargos ${fmt(resumen.total_cargos_polizas)} · Abonos ${fmt(resumen.total_abonos_polizas)}`}
              />
              <Amount
                label="Total conciliado"
                value={resumen.total_conciliado}
                sub={`${resumen.conciliados || 0} movimiento(s) emparejado(s)`}
              />
            </div>
          )}

          {/* ── Diferencias ── */}
          {(resumen.diferencia_cargos !== 0 || resumen.diferencia_abonos !== 0) && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              {resumen.diferencia_cargos !== 0 && (
                <DiffBadge
                  label="Diferencia cargos"
                  sub={`Banco ${fmt(resumen.total_cargos_banco)} vs Pólizas ${fmt(resumen.total_cargos_polizas)}`}
                  value={resumen.diferencia_cargos}
                />
              )}
              {resumen.diferencia_abonos !== 0 && (
                <DiffBadge
                  label="Diferencia abonos"
                  sub={`Banco ${fmt(resumen.total_abonos_banco)} vs Pólizas ${fmt(resumen.total_abonos_polizas)}`}
                  value={resumen.diferencia_abonos}
                />
              )}
            </div>
          )}

          {resumen.cuadre_cargos && resumen.cuadre_abonos && resumen.total_banco > 0 && (
            <div className="mb-4 bg-emerald-950/40 border border-emerald-800 rounded-2xl px-4 py-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-xs font-bold text-emerald-400">Cuadre perfecto — banco y pólizas coinciden en cargos y abonos</p>
            </div>
          )}

          {/* ── Resumen compacto ── */}
          {todasFilas.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 px-1">
              <span className="text-xs text-slate-400">
                <span className="font-bold text-white">{todasFilas.length}</span> movimientos
              </span>
              <span className="text-xs text-emerald-400">
                🟢 <span className="font-bold">{countConciliado}</span> con póliza
              </span>
              <span className="text-xs text-rose-400">
                🔴 <span className="font-bold">{countSinPoliza}</span> sin póliza
              </span>
              <span className="text-xs text-blue-400">
                🔵 <span className="font-bold">{countComision}</span> comisiones en póliza
              </span>
              <span className="text-xs text-slate-500">
                Cargos <span className="text-white font-bold">{fmt(resumen.total_cargos_banco)}</span>
                {' · '}
                Abonos <span className="text-white font-bold">{fmt(resumen.total_abonos_banco)}</span>
              </span>
            </div>
          )}

          {/* ── Filtros ── */}
          {todasFilas.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {/* Búsqueda */}
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex-1 min-w-48">
                <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <input
                  type="text"
                  placeholder="Buscar descripción, referencia, concepto..."
                  value={filtroBusqueda}
                  onChange={(e) => setFiltroBusqueda(e.target.value)}
                  className="bg-transparent text-white text-xs outline-none w-full placeholder:text-slate-600"
                />
                {filtroBusqueda && (
                  <button onClick={() => setFiltroBusqueda('')} className="text-slate-500 hover:text-white">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filtro estado */}
              <div className="flex rounded-xl overflow-hidden border border-slate-800 text-xs font-bold">
                {[
                  { key: 'todos',      label: 'Todos' },
                  { key: 'conciliado', label: '🟢 Con póliza' },
                  { key: 'sin_poliza', label: '🔴 Sin póliza' },
                  { key: 'comision',   label: '🔵 Comisiones' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFiltroEstado(key)}
                    className={`px-3 py-2 transition-colors ${
                      filtroEstado === key
                        ? 'bg-cyan-700 text-white'
                        : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Filtro tipo */}
              <div className="flex rounded-xl overflow-hidden border border-slate-800 text-xs font-bold">
                {[
                  { key: 'todos', label: 'Cargos y abonos' },
                  { key: 'cargo', label: '↑ Cargos' },
                  { key: 'abono', label: '↓ Abonos' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFiltroTipo(key)}
                    className={`px-3 py-2 transition-colors ${
                      filtroTipo === key
                        ? 'bg-cyan-700 text-white'
                        : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Tabla estado de cuenta ── */}
          {todasFilas.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-2xl">
              <Landmark className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No hay movimientos bancarios para este período.</p>
              <p className="text-xs mt-1">Carga el estado de cuenta del banco (XML, CSV o PDF).</p>
            </div>
          ) : filasFiltradas.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-2xl">
              Sin resultados para los filtros aplicados.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800">
                      <th className="text-left px-4 py-3 text-slate-500 font-black uppercase tracking-wide whitespace-nowrap">Fecha</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-black uppercase tracking-wide">Descripción</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-black uppercase tracking-wide whitespace-nowrap">Referencia</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-black uppercase tracking-wide whitespace-nowrap">Cargo</th>
                      <th className="text-right px-4 py-3 text-slate-500 font-black uppercase tracking-wide whitespace-nowrap">Abono</th>
                      <th className="text-center px-4 py-3 text-slate-500 font-black uppercase tracking-wide whitespace-nowrap">Estado</th>
                      <th className="text-left px-4 py-3 text-slate-500 font-black uppercase tracking-wide whitespace-nowrap">Póliza</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filasFiltradas.map((fila) => (
                      <FilaMovimiento key={fila.id} fila={fila} onCrearPoliza={setMovimientoParaPoliza} />
                    ))}
                  </tbody>
                  {/* Totales de la vista filtrada */}
                  <tfoot>
                    <tr className="bg-slate-950 border-t border-slate-700">
                      <td colSpan={3} className="px-4 py-3 text-slate-400 font-black text-xs uppercase">
                        {filasFiltradas.length} movimiento(s)
                      </td>
                      <td className="px-4 py-3 text-right font-black text-rose-300 whitespace-nowrap">
                        {totalCargos > 0 ? fmt(totalCargos) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-emerald-300 whitespace-nowrap">
                        {totalAbonos > 0 ? fmt(totalAbonos) : '—'}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <CrearPolizaMovimientoModal
        key={movimientoParaPoliza?.id || 'sin-movimiento'}
        isOpen={Boolean(movimientoParaPoliza)}
        onClose={() => setMovimientoParaPoliza(null)}
        empresaId={empresaId}
        fila={movimientoParaPoliza}
        onSuccess={() => cargarDatos(mes, anio)}
      />
    </section>
  );
};

// ─── Fila individual de la tabla ───────────────────────────────────────────────
const FilaMovimiento = memo(({ fila, onCrearPoliza }) => {
  const conciliado = fila.estado === 'conciliado';
  const comision   = fila.estado === 'comision';
  return (
    <tr className={`transition-colors hover:bg-slate-800/40 ${
      conciliado ? '' : comision ? 'bg-blue-950/10' : 'bg-rose-950/10'
    }`}>
      <td className="px-4 py-3 text-slate-300 whitespace-nowrap font-mono">{fila.fecha}</td>
      <td className="px-4 py-3 text-white max-w-xs">
        <p className="truncate">{fila.descripcion}</p>
      </td>
      <td className="px-4 py-3 text-slate-400 whitespace-nowrap font-mono">{fila.referencia || '—'}</td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {fila.cargo != null
          ? <span className="text-rose-300 font-bold">{fmt(fila.cargo)}</span>
          : <span className="text-slate-700">—</span>}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        {fila.abono != null
          ? <span className="text-emerald-300 font-bold">{fmt(fila.abono)}</span>
          : <span className="text-slate-700">—</span>}
      </td>
      <td className="px-4 py-3 text-center whitespace-nowrap">
        {conciliado && <span className="text-emerald-400 font-bold">🟢 OK</span>}
        {comision   && <span className="text-blue-400 font-bold">🔵 En póliza</span>}
        {!conciliado && !comision && <span className="text-rose-400 font-bold">🔴 Sin póliza</span>}
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        {conciliado ? (
          <span className="inline-block bg-slate-800 text-slate-200 rounded-lg px-2 py-0.5 text-[10px] font-bold capitalize">
            {fila.poliza_tipo} #{fila.poliza_numero}
            {fila.diferencia_dias > 0 && (
              <span className="ml-1 text-amber-400">·{fila.diferencia_dias}d</span>
            )}
          </span>
        ) : comision ? (
          <span className="text-blue-400 text-[10px]">Incluida en ingreso</span>
        ) : (
          <button
            type="button"
            onClick={() => onCrearPoliza(fila)}
            className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2 py-1 text-[10px] font-black text-rose-300 transition-colors hover:bg-rose-500/20 hover:text-rose-200"
          >
            Crear póliza
          </button>
        )}
      </td>
    </tr>
  );
});
FilaMovimiento.displayName = 'FilaMovimiento';

// ─── Sub-componentes ───────────────────────────────────────────────────────────
const UploadBtn = ({ label, accept, uploading, onChange, color }) => {
  const colors = {
    cyan: 'bg-cyan-600 hover:bg-cyan-500',
    amber: 'bg-amber-600 hover:bg-amber-500',
    slate: 'bg-slate-700 hover:bg-slate-600',
  };
  return (
    <label className={`flex items-center gap-2 ${colors[color]} text-white text-sm font-bold px-4 py-2 rounded-xl cursor-pointer`}>
      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
      {label}
      <input type="file" accept={accept} onChange={onChange} className="hidden" />
    </label>
  );
};

const Amount = ({ label, value, sub }) => {
  const num = Number(value) || 0;
  if (num === 0) return null;
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
      <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
      <p className="text-lg font-black text-white mt-1">{fmt(num)}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-1.5">{sub}</p>}
    </div>
  );
};

const DiffBadge = ({ label, sub, value }) => (
  <div className="flex-1 bg-rose-950/40 border border-rose-800 rounded-2xl px-4 py-3 flex items-center justify-between">
    <div>
      <p className="text-[10px] font-black uppercase text-rose-400">{label}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>
    </div>
    <p className="text-sm font-black text-rose-300 ml-4">
      {value > 0 ? '+' : ''}{fmt(Math.abs(value))}
    </p>
  </div>
);

export default memo(ConciliacionBancariaPanel);
