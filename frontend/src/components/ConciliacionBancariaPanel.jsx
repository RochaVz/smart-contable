import { memo, useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, CheckCircle2, FileUp, Landmark, Loader2, RefreshCw, UploadCloud,
} from 'lucide-react';
import api from '../services/api';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const fmt = (value) => `$${(Number(value) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const ConciliacionBancariaPanel = ({ empresaId }) => {
  const hoy = new Date();
  const fileRef = useRef(null);
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [bancoId, setBancoId] = useState('');
  const [bancos, setBancos] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchConciliacion = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(
        `/conciliacion/resumen?empresa_id=${empresaId}&mes=${mes}&anio=${anio}`
      );
      setData(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(', ')
          : 'No se pudo cargar la conciliación';
      toast.error(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresaId, mes, anio]);

  useEffect(() => {
    api.get(`/configuracion/comisiones-banco/${empresaId}`)
      .then((res) => {
        setBancos(res.data);
        const def = res.data.find((b) => b.es_default);
        if (def) setBancoId(String(def.id));
      })
      .catch(() => {});
  }, [empresaId]);

  useEffect(() => {
    fetchConciliacion();
  }, [fetchConciliacion]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xml')) {
      toast.error('Selecciona un XML de estado de cuenta');
      return;
    }

    const formData = new FormData();
    formData.append('archivo', file);
    setUploading(true);
    try {
      const params = new URLSearchParams({
        empresa_id: String(empresaId),
        mes: String(mes),
        anio: String(anio),
      });
      if (bancoId) params.set('banco_id', bancoId);
      const res = await api.post(
        `/conciliacion/estado-cuenta?${params}`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      toast.success(`${res.data.movimientos_nuevos} movimiento(s) bancario(s) cargado(s)`);
      await fetchConciliacion();
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'No se pudo cargar el estado de cuenta');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const resumen = data?.resumen || {};

  return (
    <section className="mb-10 bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
      <div className="flex flex-col lg:flex-row justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <Landmark className="w-6 h-6 text-cyan-400 mt-1" />
          <div>
            <h2 className="text-lg font-black text-white">Conciliación bancaria</h2>
            <p className="text-slate-500 text-xs">
              Sube el XML del banco (no CFDI de facturas). Se concilia con pólizas del mes seleccionado.
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5">
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="bg-transparent text-white text-sm outline-none"
            >
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i + 1}>{nombre}</option>
              ))}
            </select>
            <input
              type="number"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className="w-20 bg-transparent text-white text-sm outline-none"
            />
          </div>
          <button
            type="button"
            onClick={fetchConciliacion}
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Actualizar
          </button>
          {bancos.length > 0 && (
            <select
              value={bancoId}
              onChange={(e) => setBancoId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white"
              title="Banco del estado de cuenta"
            >
              {bancos.map((b) => (
                <option key={b.id} value={b.id}>{b.nombre_banco}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
            Cargar XML banco
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".xml,text/xml"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center text-slate-500">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <Stat label="Banco" value={resumen.movimientos_banco || 0} />
            <Stat label="Pólizas" value={resumen.polizas || 0} />
            <Stat label="Conciliados" value={resumen.conciliados || 0} tone="emerald" />
            <Stat label="Banco sin póliza" value={resumen.banco_sin_poliza || 0} tone="amber" />
            <Stat label="Pólizas sin banco" value={resumen.polizas_sin_banco || 0} tone="rose" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <Amount label="Total banco" value={resumen.total_banco} />
            <Amount label="Total pólizas" value={resumen.total_polizas} />
            <Amount label="Total conciliado" value={resumen.total_conciliado} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <List
              title="Conciliados"
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              items={data?.conciliados || []}
              render={(item) => (
                <>
                  <p className="text-white font-bold">{fmt(item.movimiento_banco.monto)}</p>
                  <p className="text-xs text-slate-500">{item.movimiento_banco.fecha} · Póliza {item.poliza.tipo} #{item.poliza.numero}</p>
                  <p className="text-xs text-slate-400 truncate">{item.movimiento_banco.descripcion}</p>
                </>
              )}
            />
            <List
              title="Banco sin póliza"
              icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
              items={data?.banco_sin_poliza || []}
              render={(item) => (
                <>
                  <p className="text-white font-bold">{fmt(item.monto)}</p>
                  <p className="text-xs text-slate-500">{item.fecha} · {item.tipo}</p>
                  <p className="text-xs text-slate-400 truncate">{item.descripcion}</p>
                </>
              )}
            />
            <List
              title="Pólizas sin banco"
              icon={<FileUp className="w-4 h-4 text-rose-400" />}
              items={data?.polizas_sin_banco || []}
              render={(item) => (
                <>
                  <p className="text-white font-bold">{fmt(item.monto)}</p>
                  <p className="text-xs text-slate-500">{item.fecha} · {item.tipo} #{item.numero}</p>
                  <p className="text-xs text-slate-400 truncate">{item.concepto}</p>
                  {!item.usa_cuenta_bancos && item.tipo === 'egreso' && (
                    <p className="text-[10px] text-amber-400 mt-1">Egreso sin movimiento directo a Bancos</p>
                  )}
                </>
              )}
            />
          </div>
        </>
      )}
    </section>
  );
};

const Stat = ({ label, value, tone = 'slate' }) => {
  const colors = {
    slate: 'text-white',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
    rose: 'text-rose-400',
  };
  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
      <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
      <p className={`text-2xl font-black mt-1 ${colors[tone]}`}>{value}</p>
    </div>
  );
};

const Amount = ({ label, value }) => (
  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
    <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
    <p className="text-lg font-black text-white mt-1">{fmt(value)}</p>
  </div>
);

const List = ({ title, icon, items, render }) => (
  <div className="bg-slate-950/60 border border-slate-800 rounded-2xl overflow-hidden">
    <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
      {icon}
      <h3 className="font-bold text-white text-sm">{title}</h3>
      <span className="text-xs text-slate-500">({items.length})</span>
    </div>
    <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
      {items.length === 0 ? (
        <p className="p-5 text-center text-slate-500 text-sm">Sin registros</p>
      ) : items.map((item, index) => (
        <div key={item.id || item.poliza_id || index} className="p-4">
          {render(item)}
        </div>
      ))}
    </div>
  </div>
);

export default memo(ConciliacionBancariaPanel);
