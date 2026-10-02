import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, FileSpreadsheet, Loader2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { downloadBlob, filenameFromContentDisposition } from '../utils/download';

const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const FORMATOS = [
  ['sat', 'Layout SAT (.txt)'],
  ['csv', 'CSV'],
  ['xlsx', 'Excel'],
  ['pdf', 'PDF'],
];

const DiotPanel = ({
  empresa,
  mes: mesProp,
  anio: anioProp,
  onPeriodoChange,
  filtroProveedor = '',
  filtroTipo = '',
  hidePeriodControls = false,
}) => {
  const now = new Date();
  const controlled = mesProp != null && anioProp != null;
  const [mesLocal, setMesLocal] = useState(mesProp ?? now.getMonth() + 1);
  const [anioLocal, setAnioLocal] = useState(anioProp ?? now.getFullYear());
  const mes = controlled ? mesProp : mesLocal;
  const anio = controlled ? anioProp : anioLocal;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(null);

  const setMes = (value) => {
    if (controlled) onPeriodoChange?.({ mes: value, anio });
    else setMesLocal(value);
  };
  const setAnio = (value) => {
    if (controlled) onPeriodoChange?.({ mes, anio: value });
    else setAnioLocal(value);
  };

  const cargar = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      const res = await api.get('/fiscal/diot', {
        params: { empresa_id: empresa.id, mes, anio },
      });
      setData(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo cargar la DIOT');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, mes, anio]);

  useEffect(() => {
    if (empresa?.id) queueMicrotask(cargar);
  }, [cargar, empresa?.id]);

  const exportar = async (formato) => {
    if (!empresa?.id) return;
    setExporting(formato);
    try {
      const res = await api.get('/fiscal/diot/export', {
        params: {
          empresa_id: empresa.id,
          mes,
          anio,
          formato,
          forzar: formato === 'sat' && data?.bloqueado_por_incompletos ? true : false,
        },
        responseType: 'blob',
      });
      const name =
        filenameFromContentDisposition(res.headers['content-disposition']) ||
        `diot_${anio}_${String(mes).padStart(2, '0')}.${formato === 'sat' ? 'txt' : formato === 'excel' ? 'xlsx' : formato}`;
      downloadBlob(res.data, name);
      toast.success(`DIOT exportada (${formato.toUpperCase()}) · registrada en bitácora`);
    } catch (error) {
      let message = 'No se pudo exportar la DIOT';
      const payload = error.response?.data;
      if (payload instanceof Blob) {
        try {
          const text = await payload.text();
          const json = JSON.parse(text);
          message = json.detail?.message || json.detail || message;
        } catch {
          /* ignore */
        }
      } else if (payload?.detail) {
        message = payload.detail?.message || payload.detail;
      }
      toast.error(typeof message === 'string' ? message : 'No se pudo exportar la DIOT');
    } finally {
      setExporting(null);
    }
  };

  const proveedores = useMemo(() => {
    const list = data?.proveedores || [];
    const q = filtroProveedor.trim().toLowerCase();
    const tipo = filtroTipo.trim().toLowerCase();
    return list.filter((p) => {
      if (tipo && String(p.tipo_operacion_diot || '').toLowerCase() !== tipo) return false;
      if (!q) return true;
      const hay = `${p.rfc || ''} ${p.nombre || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, filtroProveedor, filtroTipo]);

  if (loading) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }

  const tot = data?.totales || {};

  return (
    <section className="space-y-5">
      {!hidePeriodControls && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-sky-400" />
            <div>
              <h3 className="text-base font-black text-white">DIOT</h3>
              <p className="text-xs text-slate-500">Operaciones con terceros · layout SAT y exportaciones</p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Mes
              <input type="number" min={1} max={12} value={mes} onChange={(e) => setMes(Number(e.target.value))} className="ml-2 w-16 border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white" />
            </label>
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Año
              <input type="number" value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="ml-2 w-20 border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white" />
            </label>
          </div>
        </div>
      )}
      {hidePeriodControls && (
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-sky-400" />
          <div>
            <h3 className="text-base font-black text-white">DIOT</h3>
            <p className="text-xs text-slate-500">
              {proveedores.length} de {(data?.proveedores || []).length} proveedor(es) visibles con filtros actuales
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Proveedores" value={tot.proveedores ?? 0} />
        <Metric label="Completos" value={tot.proveedores_completos ?? 0} tone="emerald" />
        <Metric label="Incompletos" value={tot.proveedores_incompletos ?? 0} tone="rose" />
        <Metric label="Base gravable" value={money(tot.base_gravable)} />
        <Metric label="IVA acreditable" value={money(tot.iva_acreditable)} />
        <Metric label="IVA retenido" value={money(tot.iva_retenido)} />
        <Metric label="CFDI egreso" value={tot.cfdi_egreso_incluidos ?? 0} />
        <Metric label="Exportable SAT" value={data?.exportable ? 'Sí' : 'No'} tone={data?.exportable ? 'emerald' : 'rose'} />
      </div>

      {data?.bloqueado_por_incompletos && (
        <div className="flex gap-3 border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-bold">Datos incompletos detectados</p>
            <p className="mt-1 text-xs text-amber-100/80">Corrige RFC o tipo DIOT antes de presentar el layout SAT. CSV/Excel/PDF permiten revision interna.</p>
            <ul className="mt-2 space-y-1 text-xs">
              {(data.datos_incompletos || []).slice(0, 8).map((item, idx) => (
                <li key={`${item.rfc || 'x'}-${idx}`}>
                  {item.rfc || 'Sin RFC'} — falta: {(item.faltantes || []).join(', ')}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FORMATOS.map(([fmt, label]) => (
          <button
            key={fmt}
            type="button"
            disabled={!!exporting || proveedores.length === 0}
            onClick={() => exportar(fmt)}
            className="inline-flex min-h-10 items-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 hover:border-sky-500 hover:text-white disabled:opacity-40"
          >
            {exporting === fmt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : fmt === 'xlsx' ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-3 py-2">RFC</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right">Base</th>
              <th className="px-3 py-2 text-right">IVA acr.</th>
              <th className="px-3 py-2 text-right">IVA ret.</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {proveedores.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">Sin operaciones DIOT en el periodo.</td>
              </tr>
            )}
            {proveedores.map((p) => (
              <tr key={`${p.rfc}-${p.tipo_operacion_diot}`} className="border-t border-slate-800 bg-slate-950/40">
                <td className="px-3 py-2 font-mono text-xs text-slate-300">{p.rfc || '—'}</td>
                <td className="px-3 py-2 text-slate-200">{p.nombre || '—'}</td>
                <td className="px-3 py-2 capitalize text-slate-300">{p.tipo_operacion_diot || '—'}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-white">{money(p.base_gravable)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-white">{money(p.iva_acreditable)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-white">{money(p.iva_retenido)}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs font-bold ${p.listo_para_exportar ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {p.listo_para_exportar ? 'Listo' : `Falta: ${(p.datos_incompletos || []).join(', ')}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data?.criterio && <p className="text-xs leading-5 text-slate-500">{data.criterio}</p>}
    </section>
  );
};

const Metric = ({ label, value, tone }) => (
  <div className="border border-slate-800 bg-slate-900 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    <p className={`mt-2 text-sm font-bold ${tone === 'rose' ? 'text-rose-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
  </div>
);

export default DiotPanel;
