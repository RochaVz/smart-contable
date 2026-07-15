import { memo, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  BookOpen, TrendingUp, TrendingDown, Loader2, FilePlus, ChevronRight, Zap, Calendar,
} from 'lucide-react';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
import PolizaDetailModal from './PolizaDetailModal';

const TABS = [
  { id: 'diario', label: 'Diario', icon: BookOpen, desc: 'Ventas: nombre, forma de pago, productos e impuestos' },
  { id: 'ingresos', label: 'Ingresos', icon: TrendingUp, desc: 'Cobros y comisiones bancarias (tarjeta)' },
  { id: 'egresos', label: 'Egresos', icon: TrendingDown, desc: 'Gastos clasificados y desglose fiscal' },
];

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

  const fetchPolizas = useCallback(async () => {
    try {
      const res = await api.get(
        `/polizas/organizadas?empresa_id=${empresaId}&mes=${mes}&anio=${anio}`
      );
      setData(res.data);
    } catch (err) {
      console.error(err);
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
      if (por_mes?.length) {
        por_mes.forEach((p) => {
          if (p.polizas_generadas > 0) {
            toast(`${MESES[p.mes - 1]} ${p.anio}: ${p.polizas_generadas} póliza(s)`, { icon: '📅' });
          }
        });
      }
      if (errores?.length) {
        toast.error(`${errores.length} factura(s) con error al contabilizar`);
      }
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

  const items = data[tab] || [];
  const pendientesCount = data.pendientes_count ?? 0;
  const pendientesTab = data.pendientes?.filter((p) => {
    if (tab === 'diario') return p.categoria === 'diario';
    if (tab === 'egresos') return p.categoria === 'egreso';
    if (tab === 'ingresos') return p.ingreso;
    return false;
  }) || [];

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

  const renderDiarioCard = (item) => (
    <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
      <div className="flex justify-between items-start gap-4">
        <div>
          <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest">
            {item.poliza_id ? `Póliza #${item.numero}` : 'Sin póliza'}
            {item.periodo && (
              <span className="ml-2 text-slate-500">{item.periodo}</span>
            )}
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
            {item.poliza_id ? `Ingreso #${item.numero}` : 'Cobro pendiente'}
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
            {item.poliza_id ? `Egreso #${item.numero}` : 'Gasto sin póliza'}
          </p>
          <h4 className="text-white font-bold mt-1">
            {item.egreso?.proveedor || item.egreso?.clasificacion_gasto || 'Proveedor'}
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
          {generating === item.factura_id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FilePlus className="w-4 h-4" />
          )}
          Generar póliza
        </button>
      )}
    </div>
  );

  const renderCard = (item) => {
    if (tab === 'diario') return renderDiarioCard(item);
    if (tab === 'ingresos') return renderIngresoCard(item);
    return renderEgresoCard(item);
  };

  const seenFacturas = new Set(items.map((i) => i.factura_id).filter(Boolean));
  const allItems = [
    ...items,
    ...pendientesTab.filter((p) => p.factura_id && !seenFacturas.has(p.factura_id)),
  ];

  return (
    <section className="mb-10">
      <div className="mb-6 flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-2xl font-black text-white">Pólizas contables</h2>
          <p className="text-slate-500 text-sm mt-1">
            Numeración y fecha según mes del CFDI · {pendientesCount} pendiente(s)
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
              {autoGenerando ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Zap className="w-4 h-4" />
              )}
              Generar del mes
            </button>
          ) : (
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
              Sin pendientes en este mes
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
              tab === id
                ? 'bg-blue-600 text-white'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            <span className="opacity-60 text-xs">
              ({id === 'diario' ? data.diario?.length : id === 'ingresos' ? data.ingresos?.length : data.egresos?.length})
            </span>
          </button>
        ))}
      </div>

      <p className="text-slate-600 text-xs mb-4">{TABS.find((t) => t.id === tab)?.desc}</p>

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

      {loading ? (
        <div className="py-16 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto" />
        </div>
      ) : allItems.length === 0 ? (
        <div className="py-12 text-center text-slate-500 bg-slate-900/50 rounded-2xl border border-slate-800">
          No hay registros en esta categoría. Sube CFDI y genera pólizas.
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
