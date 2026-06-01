import { memo, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import {
  Loader2, Calendar, FileBarChart, Users, ArrowDownCircle, ArrowUpCircle,
  Receipt, Lightbulb, TrendingUp, TrendingDown,
} from 'lucide-react';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const fmt = (n) => `$${(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const TablaSimple = ({ cols, rows }) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-800">
    <table className="w-full text-sm text-left">
      <thead className="text-[10px] uppercase font-black text-slate-500 bg-slate-800/50">
        <tr>
          {cols.map((c) => (
            <th key={c} className="p-4">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.length === 0 ? (
          <tr><td colSpan={cols.length} className="p-8 text-center text-slate-500">Sin datos en este periodo</td></tr>
        ) : rows.map((row, i) => (
          <tr key={i} className="hover:bg-slate-800/30">
            {row.map((cell, j) => (
              <td key={j} className={`p-4 ${j > 0 ? 'text-right font-mono text-white' : 'text-slate-300'}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const InformesPanel = ({ empresaId }) => {
  const hoy = new Date();
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [tab, setTab] = useState('resumen');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInformes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(
        `/reportes/paquete-fiscal?empresa_id=${empresaId}&mes=${mes}&anio=${anio}`
      );
      setData(res.data);
    } catch (err) {
      console.error(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresaId, mes, anio]);

  useEffect(() => {
    fetchInformes();
  }, [fetchInformes]);

  const TABS = [
    { id: 'resumen', label: 'Resumen', icon: FileBarChart },
    { id: 'estado', label: 'Estado de resultados', icon: TrendingUp },
    { id: 'padron', label: 'Padrón proveedores', icon: Users },
    { id: 'trasladados', label: 'IVA trasladado', icon: ArrowUpCircle },
    { id: 'acreditables', label: 'IVA acreditable', icon: ArrowDownCircle },
    { id: 'retenidos', label: 'Retenciones', icon: Receipt },
    { id: 'sugerencias', label: 'Más informes', icon: Lightbulb },
  ];

  const renderResumen = () => {
    const r = data.resumen_ingresos_egresos;
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-950 border border-emerald-500/30 rounded-2xl p-6">
            <p className="text-emerald-400 text-[10px] font-black uppercase">Ingresos (ventas)</p>
            <p className="text-2xl font-black text-white mt-2">{fmt(r.ingresos.total)}</p>
            <p className="text-slate-500 text-xs mt-1">{r.ingresos.cantidad} CFDI · IVA {fmt(r.ingresos.iva)}</p>
          </div>
          <div className="bg-slate-950 border border-rose-500/30 rounded-2xl p-6">
            <p className="text-rose-400 text-[10px] font-black uppercase">Egresos (compras)</p>
            <p className="text-2xl font-black text-white mt-2">{fmt(r.egresos.total)}</p>
            <p className="text-slate-500 text-xs mt-1">{r.egresos.cantidad} CFDI · IVA {fmt(r.egresos.iva)}</p>
          </div>
          <div className="bg-blue-600/20 border border-blue-500/40 rounded-2xl p-6">
            <p className="text-blue-300 text-[10px] font-black uppercase">Utilidad del periodo</p>
            <p className="text-2xl font-black text-white mt-2">{fmt(r.utilidad_neta)}</p>
            <p className="text-slate-400 text-xs mt-1">Margen {r.margen_pct}%</p>
          </div>
        </div>
        {data.sugerencias && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5">
            <p className="text-slate-400 text-xs font-black uppercase mb-2">IVA neto del mes</p>
            <p className="text-xl font-black text-amber-400">{fmt(data.sugerencias.iva_neto_periodo)}</p>
            <p className="text-slate-500 text-xs mt-1">Trasladado − acreditable (estimado desde CFDI)</p>
          </div>
        )}
      </div>
    );
  };

  const renderEstado = () => {
    const e = data.estado_resultados;
    return (
      <div className="space-y-8">
        <div>
          <h4 className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Ingresos
          </h4>
          <TablaSimple
            cols={['Concepto de venta', 'Cliente', 'Cuenta contable', 'Monto']}
            rows={e.ingresos.length === 0
              ? [['Sin ventas en el periodo', '—', '—', fmt(0)]]
              : e.ingresos.map((i) => [
                i.concepto,
                i.cliente || '—',
                i.nombre_cuenta ? `${i.nombre_cuenta}${i.cuenta ? ` (${i.cuenta})` : ''}` : (i.cuenta || '—'),
                fmt(i.monto),
              ])}
          />
          <p className="text-right text-emerald-400 font-black mt-2">Total ingresos: {fmt(e.total_ingresos)}</p>
        </div>
        <div>
          <h4 className="text-rose-400 font-bold mb-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4" /> Gastos y costos
          </h4>
          <TablaSimple
            cols={['Concepto', 'Cuenta', 'Monto']}
            rows={e.gastos.map((g) => [g.concepto, g.cuenta, fmt(g.monto)])}
          />
          <p className="text-right text-rose-400 font-black mt-2">Total gastos: {fmt(e.total_gastos)}</p>
        </div>
        <div className="bg-slate-950 border border-slate-700 rounded-2xl p-6 flex justify-between items-center">
          <span className="text-white font-bold">Utilidad neta</span>
          <span className={`text-2xl font-black ${e.utilidad_neta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {fmt(e.utilidad_neta)}
          </span>
        </div>
      </div>
    );
  };

  const renderPadron = () => {
    const p = data.padron_proveedores;
    return (
      <div className="space-y-4">
        <p className="text-slate-400 text-sm">
          {p.total_proveedores} proveedor(es) · Total gastado: <span className="text-white font-bold">{fmt(p.total_gastado)}</span>
        </p>
        <TablaSimple
          cols={['RFC', 'Proveedor', 'Clasificación', 'Facturas', 'Subtotal', 'IVA', 'Total']}
          rows={p.proveedores.map((x) => [
            x.rfc, x.nombre, x.clasificacion, x.num_facturas,
            fmt(x.subtotal), fmt(x.iva), fmt(x.total),
          ])}
        />
      </div>
    );
  };

  const renderTrasladados = () => {
    const t = data.impuestos_trasladados;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">IVA trasladado</p>
            <p className="text-lg font-black text-white">{fmt(t.total_iva_trasladado)}</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">ISH / locales</p>
            <p className="text-lg font-black text-white">{fmt(t.total_impuestos_locales)}</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">Subtotal ventas</p>
            <p className="text-lg font-black text-white">{fmt(t.total_subtotal_ventas)}</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">CFDI emitidos</p>
            <p className="text-lg font-black text-white">{t.num_cfdi_venta}</p>
          </div>
        </div>
        <TablaSimple
          cols={['Receptor', 'Subtotal', 'IVA', 'ISH', 'Total']}
          rows={t.detalle.map((d) => [
            d.receptor, fmt(d.subtotal), fmt(d.iva_trasladado), fmt(d.impuestos_locales), fmt(d.total),
          ])}
        />
      </div>
    );
  };

  const renderAcreditables = () => {
    const a = data.impuestos_acreditables;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">IVA acreditable</p>
            <p className="text-lg font-black text-emerald-400">{fmt(a.total_iva_acreditable)}</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">Subtotal compras</p>
            <p className="text-lg font-black text-white">{fmt(a.total_subtotal_compras)}</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">CFDI recibidos</p>
            <p className="text-lg font-black text-white">{a.num_cfdi_compra}</p>
          </div>
        </div>
        <TablaSimple
          cols={['Proveedor', 'RFC', 'Subtotal', 'IVA', 'Total', 'Deducible']}
          rows={a.detalle.map((d) => [
            d.proveedor, d.rfc, fmt(d.subtotal), fmt(d.iva_acreditable), fmt(d.total),
            d.deducible ? 'Sí' : 'No',
          ])}
        />
      </div>
    );
  };

  const renderRetenidos = () => {
    const r = data.impuestos_retenidos;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">IVA retenido</p>
            <p className="text-lg font-black text-amber-400">{fmt(r.total_iva_retenido)}</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">ISR retenido</p>
            <p className="text-lg font-black text-amber-400">{fmt(r.total_isr_retenido)}</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 uppercase font-black">Total retenciones</p>
            <p className="text-lg font-black text-white">{fmt(r.total_retenciones)}</p>
          </div>
        </div>
        <TablaSimple
          cols={['Tipo', 'Contraparte', 'RFC', 'IVA ret.', 'ISR ret.']}
          rows={r.detalle.map((d) => [
            d.tipo, d.contraparte, d.rfc, fmt(d.iva_retenido), fmt(d.isr_retenido),
          ])}
        />
      </div>
    );
  };

  const renderSugerencias = () => {
    const s = data.sugerencias;
    return (
      <div className="space-y-6">
        {s.alertas?.map((a, i) => (
          <div
            key={i}
            className={`p-4 rounded-2xl border ${
              a.nivel === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-200'
            }`}
          >
            {a.mensaje}
          </div>
        ))}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5">
            <p className="text-slate-500 text-[10px] font-black uppercase">Comisiones bancarias (pólizas)</p>
            <p className="text-xl font-black text-white mt-1">{fmt(s.comisiones_bancarias)}</p>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5">
            <p className="text-slate-500 text-[10px] font-black uppercase">CFDI sin póliza</p>
            <p className="text-xl font-black text-amber-400 mt-1">{s.facturas_sin_poliza}</p>
          </div>
        </div>
        {s.top_clientes?.length > 0 && (
          <div>
            <h4 className="text-white font-bold mb-3">Top clientes del mes</h4>
            <TablaSimple
              cols={['Cliente', 'Total facturado']}
              rows={s.top_clientes.map((c) => [c.nombre, fmt(c.total)])}
            />
          </div>
        )}
        <div>
          <h4 className="text-white font-bold mb-3">Informes que podrías agregar después</h4>
          <ul className="space-y-2 text-slate-400 text-sm">
            {s.recomendaciones?.map((rec, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-blue-500">→</span> {rec}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (!data) return <p className="text-slate-500 text-center py-12">No se pudieron cargar los informes.</p>;
    switch (tab) {
      case 'estado': return renderEstado();
      case 'padron': return renderPadron();
      case 'trasladados': return renderTrasladados();
      case 'acreditables': return renderAcreditables();
      case 'retenidos': return renderRetenidos();
      case 'sugerencias': return renderSugerencias();
      default: return renderResumen();
    }
  };

  return (
    <section className="mb-10 bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <FileBarChart className="text-violet-400 w-7 h-7" />
            Informes fiscales y contables
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {MESES[mes - 1]} {anio} · Basado en CFDI y pólizas del periodo
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2">
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
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-slate-800 pb-4">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === id
                ? 'bg-violet-600 text-white'
                : 'text-slate-500 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-20 flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
        </div>
      ) : (
        renderContent()
      )}
    </section>
  );
};

export default memo(InformesPanel);
