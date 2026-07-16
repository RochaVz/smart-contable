import { memo, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  BookOpen, TrendingUp, TrendingDown, Loader2, FilePlus, ChevronRight, Zap, Calendar, Download,
} from 'lucide-react';
import PolizaDetailModal from './PolizaDetailModal';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const TABS = [
  {
    id: 'diario',
    label: 'Diario',
    icon: BookOpen,
    desc: 'Registro de ventas: nombre, forma de pago, productos e impuestos',
    acento: 'blue',
  },
  {
    id: 'ingresos',
    label: 'Ingresos',
    icon: TrendingUp,
    desc: 'Cobros y comisiones bancarias por pago con tarjeta',
    acento: 'emerald',
  },
  {
    id: 'egresos',
    label: 'Egresos',
    icon: TrendingDown,
    desc: 'Gastos clasificados con desglose fiscal por proveedor',
    acento: 'rose',
  },
];

const ACENTO = {
  blue:    { badge: 'text-blue-400',    border: 'border-blue-500/20',    total: 'text-blue-400'    },
  emerald: { badge: 'text-emerald-400', border: 'border-emerald-500/20', total: 'text-emerald-400' },
  rose:    { badge: 'text-rose-400',    border: 'border-rose-500/20',    total: 'text-rose-400'    },
};

const itemKey = (item, tab) =>
  item.poliza_id
    ? `poliza-${item.poliza_id}-${tab}`
    : `factura-${item.factura_id}-${tab}`;

const PolizasPanel = ({ empresaId, onRefreshFacturas }) => {
  const hoy = new Date();
  const [tab, setTab] = useState('diario');
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [data, setData] = useState({ diario: [], ingresos: [], egresos: [], pendientes: [] });
  const [bancos, setBancos] = useState([]);
  const [bancoSeleccionado, setBancoSeleccionado] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [autoGenerando, setAutoGenerando] = useState(false);
  const [descargando, setDescargando] = useState(false);

  const fetchPolizas = useCallback(async () => {
    try {
      const res = await api.get(
        `/polizas/organizadas?empresa_id=${empresaId}&mes=${mes}&anio=${anio}`
      );
      setData(res.data);
    } catch {
      toast.error('No se pudieron cargar las pólizas');
    } finally {
      setLoading(false);
    }
  }, [empresaId, mes, anio]);

  useEffect(() => {
    setLoading(true);
    fetchPolizas();
    api.get(`/configuracion/comisiones-banco/${empresaId}`)
      .then((res) => {
        setBancos(res.data);
        const def = res.data.find((b) => b.es_default);
        if (def) setBancoSeleccionado(String(def.id));
      })
      .catch(() => {});
  }, [fetchPolizas, empresaId]);

  const handleDescargarCsv = async () => {
    setDescargando(true);
    try {
      const params = new URLSearchParams({ empresa_id: empresaId, tipo: tab });
      if (mes) params.set('mes', mes);
      if (anio) params.set('anio', anio);
      const res = await api.get(`/polizas/descargar-csv?${params}`, { responseType: 'blob' });
      const cd = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const nombre = match?.[1] || `polizas_${tab}.csv`;
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`CSV de ${tabInfo?.label} descargado`);
    } catch {
      toast.error('No se pudo descargar el CSV');
    } finally {
      setDescargando(false);
    }
  };

  const handleGenerarAutomatico = async () => {
    setAutoGenerando(true);
    try {
      const params = new URLSearchParams({
        empresa_id: empresaId,
        mes: String(mes),
        anio: String(anio),
      });
      if (bancoSeleccionado) params.set('banco_id', bancoSeleccionado);
      const res = await api.post(`/polizas/generar-automatico?${params}`);
      const { por_mes, total_polizas, errores } = res.data;
      toast.success(res.data.mensaje || `${total_polizas} póliza(s) generadas`);
      por_mes?.forEach((p) => {
        if (p.polizas_generadas > 0)
          toast(`${MESES[p.mes - 1]} ${p.anio}: ${p.polizas_generadas} póliza(s)`, { icon: '📅' });
      });
      if (errores?.length) toast.error(`${errores.length} factura(s) con error`);
      await fetchPolizas();
      onRefreshFacturas?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error en generación automática');
    } finally {
      setAutoGenerando(false);
    }
  };

  const handleGenerar = async (facturaId) => {
    setGenerating(facturaId);
    try {
      const params = bancoSeleccionado ? `?banco_id=${bancoSeleccionado}` : '';
      await api.post(`/polizas/generar-desde-factura/${facturaId}${params}`);
      toast.success('Póliza(s) generada(s)');
      await fetchPolizas();
      onRefreshFacturas?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al generar póliza');
    } finally {
      setGenerating(null);
    }
  };

  // ── Pendientes filtrados por tab ──────────────────────────────────────────
  const pendientesTab = (data.pendientes || []).filter((p) => {
    if (tab === 'diario')   return p.categoria === 'diario';
    if (tab === 'egresos')  return p.categoria === 'egreso';
    if (tab === 'ingresos') return !!p.ingreso;
    return false;
  });

  const items = data[tab] || [];
  const seenFacturas = new Set(items.map((i) => i.factura_id).filter(Boolean));
  const allItems = [
    ...items,
    ...pendientesTab.filter((p) => p.factura_id && !seenFacturas.has(p.factura_id)),
  ];

  const totalPeriodo = items.reduce((s, i) => s + (i.total || 0), 0);
  const pendientesCount = data.pendientes_count ?? 0;
  const tabInfo = TABS.find((t) => t.id === tab);
  const col = ACENTO[tabInfo.acento];

  // ── Renders de impuestos ──────────────────────────────────────────────────
  const renderImpuestos = (lista) => (
    <ul className="text-xs text-slate-400 space-y-0.5 mt-2">
      {(lista || []).slice(0, 4).map((imp, i) => (
        <li key={i} className="flex justify-between gap-4">
          <span>{imp.concepto}</span>
          <span className={imp.importe < 0 ? 'text-red-400' : 'text-slate-300'}>
            ${Math.abs(imp.importe).toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );

  // ── Botones de acción ─────────────────────────────────────────────────────
  const renderActions = (item) => (
    <div className="flex gap-2 mt-4 pt-3 border-t border-slate-800">
      {item.poliza_id ? (
        <button
          type="button"
          onClick={() => setSelected(item)}
          className="flex items-center gap-1 text-blue-400 text-sm font-bold hover:underline"
        >
          Ver partida <ChevronRight className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          disabled={generating === item.factura_id}
          onClick={() => handleGenerar(item.factura_id)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-xl"
        >
          {generating === item.factura_id
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <FilePlus className="w-4 h-4" />}
          Generar póliza
        </button>
      )}
    </div>
  );

  // ── Cards por tipo ────────────────────────────────────────────────────────
  const renderDiarioCard = (item) => (
    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest">
            {item.poliza_id ? `Póliza Diario #${item.numero}` : 'Sin póliza'}
            {item.periodo && <span className="ml-2 text-slate-500">{item.periodo}</span>}
          </p>
          <h4 className="text-white font-bold mt-1">
            {item.diario?.nombre || item.nombre_cliente || '—'}
          </h4>
          <p className="text-slate-500 text-sm mt-1">
            {item.diario?.forma_pago || item.forma_pago?.etiqueta}
          </p>
        </div>
        <p className="text-xl font-black text-white">${(item.total || 0).toLocaleString()}</p>
      </div>
      {(item.diario?.que_se_vendio || item.conceptos_vendidos)?.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <p className="text-[10px] font-black uppercase text-slate-500">Qué se vendió</p>
          {(item.diario?.que_se_vendio || item.conceptos_vendidos).slice(0, 2).map((c, i) => (
            <p key={i} className="text-sm text-slate-300 mt-1 truncate">{c.descripcion}</p>
          ))}
        </div>
      )}
      {renderImpuestos(item.diario?.desglose_impuestos || item.desglose_impuestos)}
      {renderActions(item)}
    </div>
  );

  const renderIngresoCard = (item) => (
    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
      <div className="flex justify-between">
        <div>
          <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">
            {item.poliza_id ? `Póliza Ingreso #${item.numero}` : 'Cobro pendiente'}
          </p>
          <h4 className="text-white font-bold mt-1">
            {item.ingreso?.forma_pago || item.forma_pago?.etiqueta}
          </h4>
        </div>
        <p className="text-xl font-black text-emerald-400">${(item.total || 0).toLocaleString()}</p>
      </div>
      {item.ingreso && (
        <div className="mt-3 space-y-2">
          {item.ingreso.nombre_banco && (
            <p className="text-xs text-slate-400">
              Banco: <span className="text-amber-400 font-bold">{item.ingreso.nombre_banco}</span>
              {item.ingreso.porcentaje_comision != null && (
                <span> · {item.ingreso.porcentaje_comision}%</span>
              )}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-slate-900 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase font-black">Comisión bancaria</p>
              <p className="text-amber-400 font-bold">${(item.ingreso.comision_bancaria || 0).toLocaleString()}</p>
            </div>
            <div className="bg-slate-900 rounded-xl p-3">
              <p className="text-[10px] text-slate-500 uppercase font-black">Depósito neto</p>
              <p className="text-white font-bold">${(item.ingreso.deposito_neto || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
      {renderActions(item)}
    </div>
  );

  const renderEgresoCard = (item) => (
    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
      <div className="flex justify-between">
        <div>
          <p className="text-[10px] font-black uppercase text-rose-400 tracking-widest">
            {item.poliza_id ? `Póliza Egreso #${item.numero}` : 'Gasto sin póliza'}
          </p>
          <h4 className="text-white font-bold mt-1">
            {item.egreso?.proveedor || '—'}
          </h4>
          <p className="text-emerald-400 text-xs font-bold mt-1">
            {item.egreso?.clasificacion_gasto || 'Por clasificar'}
          </p>
        </div>
        <p className="text-xl font-black text-white">${(item.total || 0).toLocaleString()}</p>
      </div>
      {renderImpuestos(item.egreso?.desglose_impuestos || item.desglose_impuestos)}
      {renderActions(item)}
    </div>
  );

  const renderCard = (item) => {
    if (tab === 'diario')   return renderDiarioCard(item);
    if (tab === 'ingresos') return renderIngresoCard(item);
    return renderEgresoCard(item);
  };

  return (
    <section className="mb-10">
      {/* ── Cabecera ── */}
      <div className="mb-6 flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Pólizas contables</h2>
          <p className="text-slate-500 text-sm mt-1">
            Numeración por mes del CFDI · {pendientesCount} pendiente(s)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
            <Calendar className="w-4 h-4 text-slate-500" />
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="bg-transparent text-white text-sm outline-none"
            >
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i + 1}>{nombre}</option>
              ))}
            </select>
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="bg-transparent text-white text-sm outline-none"
            >
              {[anio - 1, anio, anio + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {pendientesCount > 0 ? (
            <button
              type="button"
              disabled={autoGenerando}
              onClick={handleGenerarAutomatico}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold px-4 py-2.5 rounded-xl text-sm"
            >
              {autoGenerando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Generar del mes
            </button>
          ) : (
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
              Sin pendientes
            </span>
          )}
          <button
            type="button"
            disabled={descargando || loading || items.length === 0}
            onClick={handleDescargarCsv}
            title={`Descargar pólizas de ${tabInfo?.label} (${MESES[mes - 1]} ${anio})`}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 text-white font-bold px-4 py-2.5 rounded-xl text-sm"
          >
            {descargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            CSV {tabInfo?.label}
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="grid grid-cols-3 gap-2 mb-6 p-1.5 bg-slate-900/80 border border-slate-800 rounded-2xl">
        {TABS.map(({ id, label, icon: Icon, acento }) => {
          const count = data[id]?.length ?? 0;
          const c = ACENTO[acento];
          const activo = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl text-left transition-all ${
                activo ? 'bg-slate-800 shadow-inner' : 'hover:bg-slate-800/50'
              }`}
            >
              <span className={`flex items-center gap-2 font-bold text-sm ${activo ? c.badge : 'text-slate-400'}`}>
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </span>
              <span className={`text-xs font-black ${activo ? c.total : 'text-slate-600'}`}>
                {count} póliza{count !== 1 ? 's' : ''}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Descripción + total del tab activo ── */}
      <div className={`flex items-center justify-between mb-4 px-4 py-3 rounded-xl border ${col.border} bg-slate-900/40`}>
        <p className="text-slate-400 text-xs">{tabInfo.desc}</p>
        {items.length > 0 && (
          <p className={`text-sm font-black ${col.total}`}>
            Total: ${totalPeriodo.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </p>
        )}
      </div>

      {/* ── Selector banco (solo ingresos) ── */}
      {tab === 'ingresos' && bancos.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="text-xs text-slate-500 font-bold uppercase">Banco para comisión:</label>
          <select
            value={bancoSeleccionado}
            onChange={(e) => setBancoSeleccionado(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
          >
            {bancos.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre_banco} (Créd. {b.porcentaje_credito}% / Déb. {b.porcentaje_debito}%)
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ── Contenido ── */}
      {loading ? (
        <div className="py-16 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        </div>
      ) : allItems.length === 0 ? (
        <div className="py-12 text-center text-slate-500 bg-slate-900/50 rounded-2xl border border-slate-800">
          No hay pólizas de {tabInfo.label.toLowerCase()} en {MESES[mes - 1]} {anio}.
          {pendientesCount > 0 && (
            <p className="mt-2 text-xs">Hay {pendientesCount} factura(s) pendiente(s) — usa "Generar del mes".</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {allItems.map((item) => (
            <div key={itemKey(item, tab)}>{renderCard(item)}</div>
          ))}
        </div>
      )}

      <PolizaDetailModal isOpen={!!selected} onClose={() => setSelected(null)} poliza={selected} />
    </section>
  );
};

export default memo(PolizasPanel);
