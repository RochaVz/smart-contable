import { memo, useCallback, useMemo, useState, useTransition } from 'react';
import toast from 'react-hot-toast';
import {
  CheckCircle2, ChevronDown, Landmark, Loader2, Sparkles, Wand2,
  Download, RefreshCw, Search, UploadCloud, X,
} from 'lucide-react';
import api from '../services/api';
import CrearPolizaMovimientoModal from './CrearPolizaMovimientoModal';
import { downloadCsv } from '../utils/csv';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const TIPOS_POLIZA = [
  { key: 'ingreso', label: 'Ingresos' },
  { key: 'egreso', label: 'Egresos' },
  { key: 'diario', label: 'Diario' },
];

const fmt = (v) => `$${(Number(v) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const etiquetaModo = (modo) => {
  if (modo === 'manual') return 'Conciliado manual';
  if (modo === 'automatico') return 'Conciliado automático';
  return 'Conciliado';
};

// ─── Construye filas planas a partir de la respuesta de conciliación ───────────
function buildFilas(data) {
  if (!data) return [];
  const filas = [];

  for (const item of data.conciliados || []) {
    const m = item.movimiento_banco;
    const modo = item.modo_conciliacion || m.modo_conciliacion || 'automatico';
    filas.push({
      id: m.id, fecha: m.fecha, descripcion: m.descripcion || '—',
      referencia: m.referencia || '',
      cargo: m.tipo === 'cargo' ? m.monto : null,
      abono: m.tipo === 'abono' ? m.monto : null,
      tipo: m.tipo,
      estado: modo === 'manual' ? 'conciliado_manual' : 'conciliado_auto',
      modo_conciliacion: modo,
      poliza_id: item.poliza?.poliza_id || m.poliza_id || null,
      poliza_tipo: item.poliza?.tipo || m.tipo_asignacion || null,
      poliza_numero: item.poliza?.numero || null,
      poliza_concepto: item.poliza?.concepto || '',
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
      modo_conciliacion: null,
      poliza_id: null,
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
      modo_conciliacion: 'automatico',
      poliza_id: null,
      poliza_tipo: null, poliza_numero: null, poliza_concepto: '', diferencia_dias: null,
    });
  }

  filas.sort((a, b) => (a.fecha > b.fecha ? 1 : -1));
  return filas;
}

// ─── Componente principal ──────────────────────────────────────────────────────
const ConciliacionBancariaPanel = ({ empresaId, mes, anio, onPeriodoChange }) => {
  const [bancoId, setBancoId] = useState('');
    const [bancoNombre, setBancoNombre] = useState('');
    const [bancos, setBancos] = useState([]);
    const [catalogoBancos, setCatalogoBancos] = useState([]);
    const [cargas, setCargas] = useState([]);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [eliminandoCargaId, setEliminandoCargaId] = useState(null);
    const [isPending, startTransition] = useTransition();

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [movimientoParaPoliza, setMovimientoParaPoliza] = useState(null);
  const [autoConciliando, setAutoConciliando] = useState(false);
  const [filaExpandida, setFilaExpandida] = useState(null);
  const [editandoId, setEditandoId] = useState(null);

  const cargarDatos = useCallback(async (targetMes, targetAnio) => {
    setLoading(true);
    try {
        const [resBancos, resCatalogo, resConciliacion, resCargas] = await Promise.all([
        api.get(`/configuracion/comisiones-banco/${empresaId}`).catch(() => ({ data: [] })),
          api.get('/conciliacion/bancos-catalogo').catch(() => ({ data: [] })),
          api.get(`/conciliacion/resumen?empresa_id=${empresaId}&mes=${targetMes}&anio=${targetAnio}`),
          api.get(`/conciliacion/estados-cuenta?empresa_id=${empresaId}&mes=${targetMes}&anio=${targetAnio}`).catch(() => ({ data: [] })),
        ]);
        const listaBancos = resBancos.data || [];
        const catalogo = resCatalogo.data || [];
        setBancos(listaBancos);
        setCatalogoBancos(catalogo);
        setCargas(Array.isArray(resCargas.data) ? resCargas.data : []);
        setBancoId((prev) => {
          if (!prev && listaBancos.length > 0) {
            const def = listaBancos.find((b) => b.es_default) || listaBancos[0];
            return String(def.id);
          }
          return prev;
        });
        setBancoNombre((prev) => {
          if (prev) return prev;
          if (catalogo.length > 0) return catalogo[0].nombre;
          return '';
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
        if (bancoNombre) params.set('banco_nombre', bancoNombre);
        const res = await api.post(`/conciliacion/estado-cuenta?${params}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const nuevos = res.data.movimientos_nuevos ?? 0;
        const dups = res.data.duplicados ?? 0;
        toast.success(`${nuevos} movimiento(s) nuevo(s)${dups ? ` · ${dups} duplicado(s) omitido(s)` : ''}`);
        await cargarDatos(mes, anio);
      } catch (err) {
        const detail = err.response?.data?.detail;
        toast.error(typeof detail === 'string' ? detail : 'No se pudo cargar el estado de cuenta');
      } finally {
        setUploading(false);
        event.target.value = '';
      }
    };

    const handleEliminarCarga = async (cargaId) => {
      if (!cargaId) return;
      if (!window.confirm('¿Eliminar este estado de cuenta y sus movimientos? Esta acción no se puede deshacer.')) {
        return;
      }
      setEliminandoCargaId(cargaId);
      try {
        await api.delete(`/conciliacion/estados-cuenta/${cargaId}?empresa_id=${empresaId}`);
        toast.success('Estado de cuenta eliminado');
        await cargarDatos(mes, anio);
      } catch (err) {
        const detail = err.response?.data?.detail;
        toast.error(typeof detail === 'string' ? detail : 'No se pudo eliminar el estado de cuenta');
      } finally {
        setEliminandoCargaId(null);
      }
    };

  const resumen = data?.resumen || {};
  const estaCargando = loading || isPending;

  // Filas planas + filtros aplicados
  const todasFilas = useMemo(() => buildFilas(data), [data]);

  const filasFiltradas = useMemo(() => {
    let result = todasFilas;
    if (filtroEstado === 'conciliado') {
      result = result.filter((f) => f.estado === 'conciliado_auto' || f.estado === 'conciliado_manual');
    } else if (filtroEstado === 'conciliado_auto') {
      result = result.filter((f) => f.estado === 'conciliado_auto');
    } else if (filtroEstado === 'conciliado_manual') {
      result = result.filter((f) => f.estado === 'conciliado_manual');
    } else if (filtroEstado !== 'todos') {
      result = result.filter((f) => f.estado === filtroEstado);
    }
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
  const countConciliado = useMemo(
    () => todasFilas.filter((f) => f.estado === 'conciliado_auto' || f.estado === 'conciliado_manual').length,
    [todasFilas],
  );
  const countAuto = useMemo(() => todasFilas.filter((f) => f.estado === 'conciliado_auto').length, [todasFilas]);
  const countManual = useMemo(() => todasFilas.filter((f) => f.estado === 'conciliado_manual').length, [todasFilas]);

  const handleAutoConciliar = async () => {
    setAutoConciliando(true);
    try {
      const body = { empresa_id: empresaId, mes, anio };
      if (bancoId) body.banco_id = Number(bancoId);
      const res = await api.post('/conciliacion/auto-conciliar', body);
      setData(res.data);
      const creadas = res.data?.auto_conciliacion?.polizas_creadas ?? 0;
      toast.success(
        creadas > 0
          ? `Conciliación automática lista · ${creadas} póliza(s) creada(s)`
          : 'Conciliación automática aplicada (sin pólizas nuevas)',
      );
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo auto-conciliar');
    } finally {
      setAutoConciliando(false);
    }
  };

  const handleAsignarManual = async (fila, tipoPoliza) => {
    setEditandoId(fila.id);
    try {
      await api.patch(`/conciliacion/movimientos/${fila.id}`, {
        empresa_id: empresaId,
        tipo_poliza: tipoPoliza,
        concepto: fila.descripcion,
      });
      toast.success(`Asignado manualmente a póliza de ${tipoPoliza}`);
      setFilaExpandida(null);
      await cargarDatos(mes, anio);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo actualizar la conciliación');
    } finally {
      setEditandoId(null);
    }
  };

  const handleDescargarResultados = () => {
    const rows = filasFiltradas.map((fila) => ({
      Fecha: fila.fecha,
      Descripcion: fila.descripcion,
      Referencia: fila.referencia,
      Tipo: fila.tipo === 'abono' ? 'Abono' : 'Cargo',
      Cargo: fila.cargo ?? '',
      Abono: fila.abono ?? '',
      Estado:
        fila.estado === 'conciliado_auto'
          ? 'Conciliado automático'
          : fila.estado === 'conciliado_manual'
            ? 'Conciliado manual'
            : fila.estado === 'comision'
              ? 'Comisión en póliza'
              : 'Sin póliza',
      TipoPoliza: fila.poliza_tipo || '',
      NumeroPoliza: fila.poliza_numero || '',
      ConceptoPoliza: fila.poliza_concepto || '',
      DiferenciaDias: fila.diferencia_dias ?? '',
    }));
    downloadCsv(`revision_bancaria_${anio}-${String(mes).padStart(2, '0')}.csv`, rows);
    toast.success(`${rows.length} resultado(s) descargado(s) en CSV`);
  };

  return (
    <section className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:rounded-3xl sm:p-6">

      {/* ── Header ── */}
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row">
        <div className="flex items-start gap-3">
          <Landmark className="w-6 h-6 text-cyan-400 mt-1 shrink-0" />
          <div>
            <h2 className="text-lg font-black text-white">Conciliación bancaria</h2>
            <p className="text-slate-500 text-xs">
              Estado de cuenta oficial · base para conciliar con pólizas del período
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          {/* Selector mes/año */}
          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
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
            className="btn-press flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {estaCargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </button>

          <button
            type="button"
            onClick={handleAutoConciliar}
            disabled={autoConciliando || estaCargando || countSinPoliza === 0}
            title="Asigna depósitos a ingresos, pagos a egresos y ajustes a diario"
            className="btn-ui btn-ui--violet btn-ui--md font-display"
          >
            {autoConciliando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            Auto-conciliar
          </button>

          <button
            type="button"
            onClick={handleDescargarResultados}
            disabled={!filasFiltradas.length}
            title="Descargar los resultados visibles con los filtros aplicados"
            className="btn-ui btn-ui--success btn-ui--md font-display"
          >
            <Download className="w-4 h-4" />
            Descargar CSV
          </button>

          <select
                      value={bancoNombre || bancoId}
                      onChange={(e) => {
                        const val = e.target.value;
                        const esCatalogo = catalogoBancos.some((b) => b.nombre === val || b.clave === val);
                        if (esCatalogo) {
                          setBancoNombre(val);
                          const match = bancos.find((b) => (b.nombre_banco || '').toLowerCase() === val.toLowerCase());
                          setBancoId(match ? String(match.id) : '');
                        } else {
                          setBancoId(val);
                          const b = bancos.find((x) => String(x.id) === String(val));
                          setBancoNombre(b?.nombre_banco || '');
                        }
                      }}
                      className="min-h-11 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white"
                      title="Banco del estado de cuenta"
                    >
                      <option value="">Seleccionar banco…</option>
                      {catalogoBancos.map((b) => (
                        <option key={b.clave} value={b.nombre}>{b.nombre}</option>
                      ))}
                      {bancos
                        .filter((b) => !catalogoBancos.some((c) => c.nombre === b.nombre_banco))
                        .map((b) => (
                          <option key={`cfg-${b.id}`} value={String(b.id)}>{b.nombre_banco}</option>
                        ))}
                    </select>

                    <UploadBtn label="XML" accept=".xml,text/xml" uploading={uploading} onChange={handleUpload} color="cyan" />
                    <UploadBtn label="PDF" accept=".pdf,application/pdf" uploading={uploading} onChange={handleUpload} color="amber" />
                    <UploadBtn label="CSV" accept=".csv,text/csv" uploading={uploading} onChange={handleUpload} color="slate" />
                  </div>
                </div>

                {cargas.length > 0 && (
                  <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Estados de cuenta cargados
                    </p>
                    <ul className="space-y-2">
                      {cargas.map((c) => (
                        <li
                          key={c.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-300"
                        >
                          <div>
                            <p className="font-bold text-white">{c.nombre_archivo || `Carga #${c.id}`}</p>
                            <p className="text-[11px] text-slate-500">
                              {c.movimientos_count ?? 0} mov. · {c.creado_en || '—'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleEliminarCarga(c.id)}
                            disabled={eliminandoCargaId === c.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[11px] font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            {eliminandoCargaId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                            Eliminar
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

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
              <span className="text-xs text-cyan-300">
                ⚡ <span className="font-bold">{countAuto}</span> auto
              </span>
              <span className="text-xs text-amber-300">
                ✏️ <span className="font-bold">{countManual}</span> manual
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
            <div className="mb-4 grid grid-cols-1 gap-2">
              {/* Búsqueda */}
              <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
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

              {/* Filtro estado — selección exclusiva con efecto de presión */}
              <div className="flex overflow-x-auto rounded-xl border border-slate-800 text-xs font-bold">
                {[
                  { key: 'todos', label: 'Todos' },
                  { key: 'conciliado', label: '🟢 Con póliza' },
                  { key: 'conciliado_auto', label: '⚡ Auto' },
                  { key: 'conciliado_manual', label: '✏️ Manual' },
                  { key: 'sin_poliza', label: '🔴 Sin póliza' },
                  { key: 'comision', label: '🔵 Comisiones' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFiltroEstado(key)}
                    className={`btn-press min-h-10 shrink-0 px-3 py-2 transition-all duration-200 ${
                      filtroEstado === key
                        ? 'bg-cyan-600 text-white shadow-inner shadow-cyan-950/50 ring-1 ring-cyan-400/40'
                        : 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Filtro tipo */}
              <div className="flex overflow-x-auto rounded-xl border border-slate-800 text-xs font-bold">
                {[
                  { key: 'todos', label: 'Cargos y abonos' },
                  { key: 'cargo', label: '↑ Cargos' },
                  { key: 'abono', label: '↓ Abonos' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFiltroTipo(key)}
                    className={`btn-press min-h-10 shrink-0 px-3 py-2 transition-all duration-200 ${
                      filtroTipo === key
                        ? 'bg-cyan-600 text-white shadow-inner shadow-cyan-950/50 ring-1 ring-cyan-400/40'
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
                      <FilaMovimiento
                        key={fila.id}
                        fila={fila}
                        expandida={filaExpandida === fila.id}
                        editando={editandoId === fila.id}
                        onToggle={() => setFilaExpandida((prev) => (prev === fila.id ? null : fila.id))}
                        onCrearPoliza={setMovimientoParaPoliza}
                        onAsignarManual={handleAsignarManual}
                      />
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
const FilaMovimiento = memo(({ fila, expandida, editando, onToggle, onCrearPoliza, onAsignarManual }) => {
  const conciliado = fila.estado === 'conciliado_auto' || fila.estado === 'conciliado_manual';
  const comision = fila.estado === 'comision';
  const esManual = fila.estado === 'conciliado_manual';

  return (
    <>
      <tr
        className={`cursor-pointer transition-colors hover:bg-slate-800/40 ${
          conciliado ? (esManual ? 'bg-amber-950/10' : '') : comision ? 'bg-blue-950/10' : 'bg-rose-950/10'
        }`}
        onClick={onToggle}
      >
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
          {fila.estado === 'conciliado_auto' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-black text-cyan-300">
              <Sparkles className="h-3 w-3" /> Auto
            </span>
          )}
          {fila.estado === 'conciliado_manual' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-300">
              Manual
            </span>
          )}
          {comision && <span className="text-blue-400 font-bold">🔵 En póliza</span>}
          {fila.estado === 'sin_poliza' && <span className="text-rose-400 font-bold">🔴 Sin póliza</span>}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-2">
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
                onClick={(e) => { e.stopPropagation(); onCrearPoliza(fila); }}
                className="btn-ui btn-ui--danger btn-ui--sm font-display text-[10px]"
              >
                Crear póliza
              </button>
            )}
            <ChevronDown className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-200 ${expandida ? 'rotate-180' : ''}`} />
          </div>
        </td>
      </tr>
      {expandida && (
        <tr className="bg-slate-950/80">
          <td colSpan={7} className="px-4 py-4">
            <div className="animate-in fade-in rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition-all duration-300">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Editar conciliación</p>
                  <p className="mt-1 text-sm font-bold text-white">
                    {conciliado ? etiquetaModo(fila.modo_conciliacion) : 'Sin póliza asignada'}
                    {fila.poliza_concepto ? ` · ${fila.poliza_concepto}` : ''}
                  </p>
                </div>
                <p className="text-xs text-slate-500">Selecciona el tipo de póliza (selección exclusiva)</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {TIPOS_POLIZA.map(({ key, label }) => {
                  const activo = fila.poliza_tipo === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={editando}
                      onClick={(e) => { e.stopPropagation(); onAsignarManual(fila, key); }}
                      className={`btn-press min-h-11 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wide transition-all duration-200 disabled:opacity-50 ${
                        activo
                          ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40 ring-2 ring-cyan-300/50'
                          : 'border border-slate-700 bg-slate-950 text-slate-300 hover:border-cyan-600 hover:text-white'
                      }`}
                    >
                      {editando && !activo ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : null}
                      {label}
                    </button>
                  );
                })}
                {fila.estado === 'sin_poliza' && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onCrearPoliza(fila); }}
                    className="btn-press min-h-11 rounded-xl border border-rose-700/50 bg-rose-950/40 px-4 py-2 text-xs font-black uppercase tracking-wide text-rose-200 hover:bg-rose-900/40"
                  >
                    Detalle de cuenta…
                  </button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
});
FilaMovimiento.displayName = 'FilaMovimiento';

// ─── Sub-componentes ───────────────────────────────────────────────────────────
const UploadBtn = ({ label, accept, uploading, onChange, color }) => {
  const colors = {
    cyan: 'btn-ui btn-ui--cyan btn-ui--sm',
    amber: 'btn-ui btn-ui--warning btn-ui--sm',
    slate: 'btn-ui btn-ui--secondary btn-ui--sm',
  };
  return (
    <label className={`font-display cursor-pointer ${colors[color] || colors.slate}`}>
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
