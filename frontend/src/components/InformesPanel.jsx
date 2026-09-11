import { memo, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Loader2, Calendar, FileBarChart, Users, ArrowDownCircle, ArrowUpCircle,
  Download, Receipt, Lightbulb, TrendingUp, TrendingDown,
} from 'lucide-react';
import { downloadCsv } from '../utils/csv';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const fmt = (n) => `$${(n ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const TablaSimple = ({ cols, rows }) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-800">
    <table className="w-full min-w-[560px] text-left text-sm">
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

const InformesPanel = ({ empresaId, mes, anio, onPeriodoChange, onClassifyProveedor, refreshToken = 0 }) => {
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
  }, [fetchInformes, refreshToken]);

  const descargarReporte = (nombre, rows) => {
    downloadCsv(`${nombre}_${anio}-${String(mes).padStart(2, '0')}.csv`, rows);
    toast.success('Reporte descargado en CSV');
  };

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
        <div className="flex justify-end">
          <BotonDescargarCsv onClick={() => descargarReporte('resumen_fiscal', [
            { Concepto: 'Ingresos', CFDI: r.ingresos.cantidad, Subtotal: r.ingresos.subtotal, IVA: r.ingresos.iva, Total: r.ingresos.total },
            { Concepto: 'Egresos', CFDI: r.egresos.cantidad, Subtotal: r.egresos.subtotal, IVA: r.egresos.iva, Total: r.egresos.total },
            { Concepto: 'Utilidad neta', CFDI: '', Subtotal: '', IVA: '', Total: r.utilidad_neta },
            { Concepto: 'IVA neto del periodo', CFDI: '', Subtotal: '', IVA: '', Total: data.sugerencias?.iva_neto_periodo ?? 0 },
          ])} />
        </div>
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
          <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h4 className="flex items-center gap-2 font-bold text-emerald-400">
              <TrendingUp className="w-4 h-4" /> Ingresos desglosados
            </h4>
            <button
              type="button"
              onClick={() => descargarReporte('estado_resultados', [
                ...e.ingresos.map((ingreso) => ({
                  Categoria: 'Ingreso', Concepto: ingreso.concepto, Cliente: ingreso.cliente || '',
                  CuentaContable: ingreso.nombre_cuenta
                    ? `${ingreso.nombre_cuenta}${ingreso.cuenta ? ` (${ingreso.cuenta})` : ''}`
                    : (ingreso.cuenta || ''),
                  CFDI: ingreso.num_facturas ?? 1, Monto: ingreso.monto,
                })),
                ...e.gastos.map((gasto) => ({
                  Categoria: 'Gasto o costo', Concepto: gasto.concepto, Cliente: '',
                  CuentaContable: gasto.cuenta || '', CFDI: '', Monto: gasto.monto,
                })),
                { Categoria: 'Total ingresos', Concepto: '', Cliente: '', CuentaContable: '', CFDI: '', Monto: e.total_ingresos },
                { Categoria: 'Total gastos', Concepto: '', Cliente: '', CuentaContable: '', CFDI: '', Monto: e.total_gastos },
                { Categoria: 'Utilidad neta', Concepto: '', Cliente: '', CuentaContable: '', CFDI: '', Monto: e.utilidad_neta },
              ])}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600"
            >
              <Download className="h-4 w-4" /> Descargar CSV
            </button>
          </div>
          <TablaSimple
            cols={['Concepto de venta', 'Cliente', 'Cuenta contable', 'CFDI', 'Monto']}
            rows={e.ingresos.length === 0
              ? [['Sin ventas en el periodo', '—', '—', '—', fmt(0)]]
              : e.ingresos.map((i) => [
                i.concepto,
                i.cliente || '—',
                i.nombre_cuenta ? `${i.nombre_cuenta}${i.cuenta ? ` (${i.cuenta})` : ''}` : (i.cuenta || '—'),
                i.num_facturas ?? 1,
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
        <div className="flex justify-end">
          <BotonDescargarCsv onClick={() => descargarReporte('padron_proveedores', p.proveedores.map((x) => ({
            RFC: x.rfc, Proveedor: x.nombre, Clasificacion: x.clasificacion, Facturas: x.num_facturas,
            Subtotal: x.subtotal, IVA: x.iva, Total: x.total,
          })))} />
        </div>
        <p className="text-slate-400 text-sm">
          {p.total_proveedores} proveedor(es) · Total gastado: <span className="text-white font-bold">{fmt(p.total_gastado)}</span>
        </p>
        <TablaSimple
          cols={['RFC', 'Proveedor', 'Clasificación', 'Facturas', 'Subtotal', 'IVA', 'Total', 'Acción']}
          rows={p.proveedores.map((x) => [
            x.rfc, x.nombre, x.clasificacion, x.num_facturas,
            fmt(x.subtotal), fmt(x.iva), fmt(x.total),
            <button
              key={`${x.rfc}-clasificar`}
              type="button"
              onClick={() => onClassifyProveedor(x)}
              className="text-blue-400 hover:text-blue-300 font-bold whitespace-nowrap"
            >
              {x.clasificacion === 'Por clasificar' ? 'Clasificar' : 'Editar'}
            </button>,
          ])}
        />
      </div>
    );
  };

  const renderTrasladados = () => {
    const t = data.impuestos_trasladados;
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <BotonDescargarCsv onClick={() => descargarReporte('iva_trasladado', [
            ...t.detalle.map((d) => ({ Receptor: d.receptor, Subtotal: d.subtotal, IVA: d.iva_trasladado, ISH: d.impuestos_locales, Total: d.total })),
            { Receptor: 'TOTAL', Subtotal: t.total_subtotal_ventas, IVA: t.total_iva_trasladado, ISH: t.total_impuestos_locales, Total: '' },
          ])} />
        </div>
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
        <div className="flex justify-end">
          <BotonDescargarCsv onClick={() => descargarReporte('iva_acreditable', [
            ...a.detalle.map((d) => ({ Proveedor: d.proveedor, RFC: d.rfc, Subtotal: d.subtotal, IVA: d.iva_acreditable, Total: d.total, Deducible: d.deducible ? 'Sí' : 'No' })),
            { Proveedor: 'TOTAL', RFC: '', Subtotal: a.total_subtotal_compras, IVA: a.total_iva_acreditable, Total: '', Deducible: '' },
          ])} />
        </div>
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
        <div className="flex justify-end">
          <BotonDescargarCsv onClick={() => descargarReporte('retenciones', [
            ...r.detalle.map((d) => ({ Tipo: d.tipo, Contraparte: d.contraparte, RFC: d.rfc, IVARetenido: d.iva_retenido, ISRRetenido: d.isr_retenido })),
            { Tipo: 'TOTAL', Contraparte: '', RFC: '', IVARetenido: r.total_iva_retenido, ISRRetenido: r.total_isr_retenido },
          ])} />
        </div>
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
        <div className="flex justify-end">
          <BotonDescargarCsv onClick={() => descargarReporte('sugerencias_fiscales', [
            ...(s.alertas || []).map((a) => ({ Seccion: 'Alerta', Concepto: a.nivel, Detalle: a.mensaje, Monto: '' })),
            ...(s.top_clientes || []).map((c) => ({ Seccion: 'Top cliente', Concepto: c.nombre, Detalle: `${c.cfdi || 0} CFDI`, Monto: c.total })),
            ...(s.top_gastos || []).map((g) => ({ Seccion: 'Top gasto', Concepto: g.nombre, Detalle: `${g.rfc} · ${g.cfdi || 0} CFDI`, Monto: g.total })),
            ...(s.recomendaciones || []).map((recomendacion) => ({ Seccion: 'Recomendación', Concepto: '', Detalle: recomendacion, Monto: '' })),
            { Seccion: 'Indicador', Concepto: 'Comisiones bancarias', Detalle: '', Monto: s.comisiones_bancarias },
            { Seccion: 'Indicador', Concepto: 'CFDI sin póliza', Detalle: '', Monto: s.facturas_sin_poliza },
          ])} />
        </div>
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
            <h4 className="text-white font-bold mb-3">Top 10 clientes del mes</h4>
            <TablaSimple
              cols={['Cliente', 'CFDI', 'Total facturado']}
              rows={s.top_clientes.map((c) => [c.nombre, c.cfdi || 0, fmt(c.total)])}
            />
          </div>
        )}
        {s.top_gastos?.length > 0 && (
          <div>
            <h4 className="text-white font-bold mb-1">Top 10 gastos y costos del mes</h4>
            <p className="mb-3 text-xs text-slate-500">Proveedores con mayor gasto facturado en el período.</p>
            <TablaSimple
              cols={['Proveedor', 'RFC', 'CFDI', 'Total gastado']}
              rows={s.top_gastos.map((g) => [g.nombre, g.rfc, g.cfdi || 0, fmt(g.total)])}
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
    <section className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/50 p-4 sm:rounded-3xl sm:p-6">
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-xl font-black text-white sm:text-2xl">
            <FileBarChart className="h-6 w-6 shrink-0 text-violet-400 sm:h-7 sm:w-7" />
            Informes fiscales y contables
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {MESES[mes - 1]} {anio} · Basado en CFDI y pólizas del periodo
          </p>
        </div>
        <div className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 sm:w-auto">
          <Calendar className="w-4 h-4 text-slate-500" />
          <select
            value={mes}
            onChange={(e) => onPeriodoChange(Number(e.target.value), anio)}
            className="bg-transparent text-white text-sm outline-none"
          >
            {MESES.map((nombre, i) => (
              <option key={nombre} value={i + 1}>{nombre}</option>
            ))}
          </select>
          <select
            value={anio}
            onChange={(e) => onPeriodoChange(mes, Number(e.target.value))}
            className="bg-transparent text-white text-sm outline-none"
          >
            {[anio - 1, anio, anio + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 border-b border-slate-800 pb-4 sm:flex sm:flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-left text-xs font-bold transition-all ${
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

const BotonDescargarCsv = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-600"
  >
    <Download className="h-4 w-4" /> Descargar CSV
  </button>
);

export default memo(InformesPanel);
