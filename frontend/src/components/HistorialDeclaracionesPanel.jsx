import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  History,
  Loader2,
  FilePlus2,
  Send,
  GitBranch,
  Ban,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const TIPOS = [
  ['iva', 'IVA'],
  ['isr', 'ISR'],
  ['diot', 'DIOT'],
  ['anual', 'Anual'],
  ['ieps', 'IEPS'],
];

const ESTADOS = {
  borrador: 'Borrador',
  calculada: 'Calculada',
  presentada: 'Presentada',
  modificada: 'Modificada',
  cancelada: 'Cancelada',
};

const money = (value) =>
  Number(value || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });

const HistorialDeclaracionesPanel = ({ empresa }) => {
  const now = useMemo(() => new Date(), []);
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [tipo, setTipo] = useState('iva');
  const [periodos, setPeriodos] = useState([]);
  const [periodoId, setPeriodoId] = useState(null);
  const [declaraciones, setDeclaraciones] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    monto_a_cargo: '',
    monto_a_favor: '',
    base_gravable: '',
    notas: '',
  });
  const [motivo, setMotivo] = useState('');

  const cargar = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      const [periodosRes, declaracionesRes, historialRes] = await Promise.all([
        api.get(`/fiscal/periodos/${empresa.id}`, { params: { anio } }),
        api.get(`/fiscal/declaraciones/${empresa.id}`),
        api.get(`/fiscal/historial/${empresa.id}`, { params: { limit: 40 } }),
      ]);
      const listaPeriodos = periodosRes.data || [];
      setPeriodos(listaPeriodos);
      const mensual = listaPeriodos.find(
        (p) => p.tipo === 'mensual' && Number(p.mes) === Number(mes) && Number(p.anio) === Number(anio),
      );
      setPeriodoId(mensual?.id || null);
      setDeclaraciones(declaracionesRes.data || []);
      setHistorial(historialRes.data || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo cargar el historial fiscal');
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, anio, mes]);

  useEffect(() => {
    if (empresa?.id) queueMicrotask(cargar);
  }, [cargar, empresa?.id]);

  const vigentesDelPeriodo = useMemo(
    () =>
      declaraciones.filter(
        (d) => d.es_vigente && (!periodoId || d.periodo_id === periodoId),
      ),
    [declaraciones, periodoId],
  );

  const vigenteActual = useMemo(
    () => vigentesDelPeriodo.find((d) => d.tipo === tipo) || null,
    [vigentesDelPeriodo, tipo],
  );

  const asegurarPeriodo = async () => {
    if (periodoId) return periodoId;
    const response = await api.post('/fiscal/periodos', {
      empresa_id: empresa.id,
      tipo: 'mensual',
      anio: Number(anio),
      mes: Number(mes),
    });
    setPeriodoId(response.data.id);
    setPeriodos((prev) => {
      const exists = prev.some((p) => p.id === response.data.id);
      return exists ? prev : [response.data, ...prev];
    });
    return response.data.id;
  };

  const crear = async () => {
    setBusy(true);
    try {
      const pid = await asegurarPeriodo();
      await api.post('/fiscal/declaraciones', {
        empresa_id: empresa.id,
        periodo_id: pid,
        tipo,
        estado: 'calculada',
        base_gravable: Number(form.base_gravable || 0),
        monto_a_cargo: Number(form.monto_a_cargo || 0),
        monto_a_favor: Number(form.monto_a_favor || 0),
        notas: form.notas || null,
        snapshot_calculo: {
          origen: 'ui_historial',
          periodo: { anio, mes },
        },
      });
      toast.success('Declaración registrada');
      setForm({ monto_a_cargo: '', monto_a_favor: '', base_gravable: '', notas: '' });
      await cargar();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo crear la declaración');
    } finally {
      setBusy(false);
    }
  };

  const presentar = async () => {
    if (!vigenteActual) return;
    setBusy(true);
    try {
      await api.post(
        `/fiscal/declaraciones/${vigenteActual.id}/presentar`,
        null,
        { params: { empresa_id: empresa.id } },
      );
      toast.success('Declaración marcada como presentada');
      await cargar();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo presentar');
    } finally {
      setBusy(false);
    }
  };

  const modificar = async () => {
    if (!vigenteActual) return;
    if ((motivo || '').trim().length < 3) {
      toast.error('Indica un motivo de modificación (mín. 3 caracteres)');
      return;
    }
    setBusy(true);
    try {
      await api.post(
        `/fiscal/declaraciones/${vigenteActual.id}/modificar`,
        {
          motivo: motivo.trim(),
          estado: 'calculada',
          base_gravable: form.base_gravable !== '' ? Number(form.base_gravable) : undefined,
          monto_a_cargo: form.monto_a_cargo !== '' ? Number(form.monto_a_cargo) : undefined,
          monto_a_favor: form.monto_a_favor !== '' ? Number(form.monto_a_favor) : undefined,
          notas: form.notas || undefined,
        },
        { params: { empresa_id: empresa.id } },
      );
      toast.success('Nueva versión creada');
      setMotivo('');
      await cargar();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo modificar');
    } finally {
      setBusy(false);
    }
  };

  const cancelar = async () => {
    if (!vigenteActual) return;
    setBusy(true);
    try {
      await api.post(
        `/fiscal/declaraciones/${vigenteActual.id}/cancelar`,
        { motivo: motivo.trim() || 'Cancelación manual' },
        { params: { empresa_id: empresa.id } },
      );
      toast.success('Declaración cancelada');
      setMotivo('');
      await cargar();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo cancelar');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <section className="space-y-5 border border-slate-800 bg-slate-900 p-5 report-surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <History className="mt-0.5 h-5 w-5 shrink-0 text-violet-400" />
          <div>
            <h3 className="text-base font-black text-white">Historial de declaraciones</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Versiones auditables de ISR, IVA, DIOT y anual, con bitácora de altas y modificaciones.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={cargar}
          className="flex min-h-10 items-center gap-2 border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-blue-500 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Actualizar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold text-slate-400">
          Año
          <input
            type="number"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="mt-1 w-full border border-slate-700 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-blue-500"
          />
        </label>
        <label className="text-xs font-bold text-slate-400">
          Mes
          <select
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
            className="mt-1 w-full border border-slate-700 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-blue-500"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-400">
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="mt-1 w-full border border-slate-700 bg-slate-950 p-2.5 text-sm text-white outline-none focus:border-blue-500"
          >
            {TIPOS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="border border-slate-800 bg-slate-950/60 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Periodo</p>
          <p className="mt-1 text-sm font-bold text-white">
            {periodoId ? `#${periodoId}` : 'Se creará al registrar'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{periodos.length} periodo(s) en {anio}</p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-sm font-black text-white">Nueva versión / montos</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['base_gravable', 'Base gravable'],
              ['monto_a_cargo', 'A cargo'],
              ['monto_a_favor', 'A favor'],
            ].map(([key, label]) => (
              <label key={key} className="text-xs font-bold text-slate-400">
                {label}
                <input
                  type="number"
                  step="0.01"
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="mt-1 w-full border border-slate-700 bg-slate-900 p-2.5 text-sm text-white outline-none focus:border-blue-500"
                />
              </label>
            ))}
          </div>
          <label className="block text-xs font-bold text-slate-400">
            Notas
            <input
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              className="mt-1 w-full border border-slate-700 bg-slate-900 p-2.5 text-sm text-white outline-none focus:border-blue-500"
            />
          </label>
          <label className="block text-xs font-bold text-slate-400">
            Motivo de modificación / cancelación
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej. Corrección de IVA acreditable"
              className="mt-1 w-full border border-slate-700 bg-slate-900 p-2.5 text-sm text-white outline-none focus:border-blue-500"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || Boolean(vigenteActual)}
              onClick={crear}
              className="btn-ui btn-ui--primary btn-ui--sm font-display"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5" />}
              Crear v1
            </button>
            <button
              type="button"
              disabled={busy || !vigenteActual}
              onClick={presentar}
              className="btn-ui btn-ui--success btn-ui--sm font-display"
            >
              <Send className="h-3.5 w-3.5" /> Presentar
            </button>
            <button
              type="button"
              disabled={busy || !vigenteActual}
              onClick={modificar}
              className="btn-ui btn-ui--violet btn-ui--sm font-display"
            >
              <GitBranch className="h-3.5 w-3.5" /> Nueva versión
            </button>
            <button
              type="button"
              disabled={busy || !vigenteActual}
              onClick={cancelar}
              className="btn-ui btn-ui--danger btn-ui--sm font-display"
            >
              <Ban className="h-3.5 w-3.5" /> Cancelar
            </button>
          </div>
        </div>

        <div className="border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-sm font-black text-white">Versión vigente ({tipo.toUpperCase()})</p>
          {!vigenteActual ? (
            <p className="mt-4 text-sm text-slate-500">No hay declaración vigente para este tipo/periodo.</p>
          ) : (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-bold text-white">
                #{vigenteActual.id} · v{vigenteActual.version} · {ESTADOS[vigenteActual.estado] || vigenteActual.estado}
              </p>
              <p className="text-slate-400">A cargo: <span className="font-mono text-white">{money(vigenteActual.monto_a_cargo)}</span></p>
              <p className="text-slate-400">A favor: <span className="font-mono text-white">{money(vigenteActual.monto_a_favor)}</span></p>
              <p className="text-slate-400">Base: <span className="font-mono text-white">{money(vigenteActual.base_gravable)}</span></p>
              {vigenteActual.motivo_modificacion && (
                <p className="text-xs text-amber-300">Motivo: {vigenteActual.motivo_modificacion}</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-950 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Ver</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Vigente</th>
              <th className="px-3 py-2">A cargo</th>
              <th className="px-3 py-2">Periodo</th>
            </tr>
          </thead>
          <tbody>
            {declaraciones.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">Sin declaraciones registradas.</td>
              </tr>
            ) : (
              declaraciones.map((d) => (
                <tr key={d.id} className="border-t border-slate-800 text-slate-300">
                  <td className="px-3 py-2 font-mono text-xs">#{d.id}</td>
                  <td className="px-3 py-2 uppercase">{d.tipo}</td>
                  <td className="px-3 py-2">v{d.version}</td>
                  <td className="px-3 py-2">{ESTADOS[d.estado] || d.estado}</td>
                  <td className="px-3 py-2">{d.es_vigente ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{money(d.monto_a_cargo)}</td>
                  <td className="px-3 py-2 font-mono text-xs">#{d.periodo_id}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-2 text-sm font-black text-white">Bitácora de cambios</p>
        <div className="space-y-2">
          {historial.length === 0 ? (
            <p className="text-sm text-slate-500">Aún no hay eventos en el historial fiscal.</p>
          ) : (
            historial.map((h) => (
              <div key={h.id} className="border border-slate-800 bg-slate-950/40 px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-white">{h.resumen}</p>
                  <p className="font-mono text-[10px] text-slate-500">
                    {h.creado_en ? new Date(h.creado_en).toLocaleString('es-MX') : '—'}
                  </p>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                  {h.entidad_tipo} #{h.entidad_id} · {h.accion}
                  {h.motivo ? ` · ${h.motivo}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default HistorialDeclaracionesPanel;
