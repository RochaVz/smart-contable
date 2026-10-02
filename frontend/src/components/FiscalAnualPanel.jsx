import { useCallback, useEffect, useState } from 'react';
import { Calculator, Loader2, Plus, Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const money = (v) => Number(v || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });

const FiscalAnualPanel = ({ empresa, anio: anioProp, onAnioChange }) => {
  const yearNow = new Date().getFullYear();
  const controlled = anioProp != null;
  const [anioLocal, setAnioLocal] = useState(anioProp ?? yearNow);
  const anio = controlled ? anioProp : anioLocal;
  const setAnio = (value) => {
    if (controlled) onAnioChange?.(value);
    else setAnioLocal(value);
  };
  const [anual, setAnual] = useState(null);
  const [ieps, setIeps] = useState(null);
  const [tarifas, setTarifas] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [perdidas, setPerdidas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagoForm, setPagoForm] = useState({ mes: 1, monto: '', notas: '' });
  const [perdidaForm, setPerdidaForm] = useState({ ejercicio_origen: yearNow - 1, monto_original: '', notas: '' });
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    if (!empresa?.id) return;
    setLoading(true);
    try {
      const [a, i, t, p, pe] = await Promise.all([
        api.get('/fiscal/anual', { params: { empresa_id: empresa.id, anio } }),
        api.get('/fiscal/ieps', { params: { empresa_id: empresa.id, mes: 12, anio } }),
        api.get(`/fiscal/tarifas-isr/${anio}`).catch(() => ({ data: null })),
        api.get(`/fiscal/pagos-provisionales/${empresa.id}`, { params: { ejercicio: anio, tipo_impuesto: 'isr' } }),
        api.get(`/fiscal/perdidas-fiscales/${empresa.id}`),
      ]);
      setAnual(a.data);
      setIeps(i.data);
      setTarifas(t.data);
      setPagos(p.data || []);
      setPerdidas(pe.data || []);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo cargar el cálculo anual');
    } finally {
      setLoading(false);
    }
  }, [empresa?.id, anio]);

  useEffect(() => {
    if (empresa?.id) queueMicrotask(cargar);
  }, [cargar, empresa?.id]);

  const registrarPago = async (event) => {
    event.preventDefault();
    if (!empresa?.id) return;
    setSaving(true);
    try {
      await api.post('/fiscal/pagos-provisionales', {
        empresa_id: empresa.id,
        tipo_impuesto: 'isr',
        ejercicio: anio,
        mes: Number(pagoForm.mes),
        monto: Number(pagoForm.monto),
        notas: pagoForm.notas || null,
      });
      toast.success('Pago provisional registrado');
      setPagoForm({ mes: 1, monto: '', notas: '' });
      await cargar();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo registrar el pago');
    } finally {
      setSaving(false);
    }
  };

  const registrarPerdida = async (event) => {
    event.preventDefault();
    if (!empresa?.id) return;
    setSaving(true);
    try {
      await api.post('/fiscal/perdidas-fiscales', {
        empresa_id: empresa.id,
        ejercicio_origen: Number(perdidaForm.ejercicio_origen),
        monto_original: Number(perdidaForm.monto_original),
        notas: perdidaForm.notas || null,
      });
      toast.success('Pérdida fiscal registrada');
      setPerdidaForm({ ejercicio_origen: yearNow - 1, monto_original: '', notas: '' });
      await cargar();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo registrar la pérdida');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }

  const saldo = anual?.saldo || {};

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-3">
          <Scale className="h-5 w-5 text-emerald-400" />
          <div>
            <h3 className="text-base font-black text-white">Cálculo anual e IEPS</h3>
            <p className="text-xs text-slate-500">Tarifa progresiva versionada, pagos previos y pérdidas fiscales.</p>
          </div>
        </div>
        <label className="text-xs font-bold uppercase tracking-widest text-slate-500">
          Ejercicio
          <input
            type="number"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value))}
            className="ml-2 w-24 border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ingresos" value={money(anual?.ingresos_acumulados)} />
        <Metric label="Deducciones" value={money(anual?.deducciones_aplicadas)} />
        <Metric label="Base gravable" value={money(anual?.base_gravable)} />
        <Metric label="Retenciones ISR" value={money(anual?.retenciones_isr)} />
        <Metric label="ISR causado" value={money(saldo.isr_causado)} />
        <Metric label="Pagos provisionales" value={money(saldo.pagos_provisionales_anteriores)} />
        <Metric label="ISR a cargo" value={money(saldo.isr_a_cargo)} tone="rose" />
        <Metric label="Saldo a favor" value={money(saldo.saldo_a_favor)} tone="emerald" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="IEPS acumulado" value={money(ieps?.ieps_acumulado)} />
        <Metric label="IEPS aplica" value={ieps?.aplica ? 'Sí' : 'No'} />
        <Metric label="Tarifa ISR" value={tarifas?.disponible ? `${tarifas.mensual?.length || 0} tramos mensuales` : 'No versionada'} />
      </div>

      {anual?.criterio && (
        <p className="border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">{anual.criterio}</p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={registrarPago} className="border border-slate-800 bg-slate-900 p-5">
          <h4 className="flex items-center gap-2 text-sm font-black text-white">
            <Plus className="h-4 w-4 text-blue-400" /> Pago provisional ISR
          </h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-400">
              Mes
              <input type="number" min={1} max={12} required value={pagoForm.mes} onChange={(e) => setPagoForm({ ...pagoForm, mes: e.target.value })} className="mt-1 w-full border border-slate-700 bg-slate-950 p-2 text-sm text-white" />
            </label>
            <label className="text-xs font-bold text-slate-400">
              Monto
              <input type="number" step="0.01" min={0} required value={pagoForm.monto} onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })} className="mt-1 w-full border border-slate-700 bg-slate-950 p-2 text-sm text-white" />
            </label>
          </div>
          <button type="submit" disabled={saving} className="mt-4 bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
            {saving ? 'Guardando…' : 'Registrar pago'}
          </button>
          <ul className="mt-4 space-y-2 text-xs text-slate-400">
            {pagos.length === 0 && <li>Sin pagos provisionales en el ejercicio.</li>}
            {pagos.map((p) => (
              <li key={p.id} className="flex justify-between border border-slate-800 bg-slate-950/60 px-2 py-1">
                <span>Mes {p.mes}</span>
                <span className="font-mono text-white">{money(p.monto)}</span>
              </li>
            ))}
          </ul>
        </form>

        <form onSubmit={registrarPerdida} className="border border-slate-800 bg-slate-900 p-5">
          <h4 className="flex items-center gap-2 text-sm font-black text-white">
            <Calculator className="h-4 w-4 text-amber-400" /> Pérdida fiscal aplicable
          </h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-400">
              Ejercicio origen
              <input type="number" required value={perdidaForm.ejercicio_origen} onChange={(e) => setPerdidaForm({ ...perdidaForm, ejercicio_origen: e.target.value })} className="mt-1 w-full border border-slate-700 bg-slate-950 p-2 text-sm text-white" />
            </label>
            <label className="text-xs font-bold text-slate-400">
              Monto original
              <input type="number" step="0.01" min={0.01} required value={perdidaForm.monto_original} onChange={(e) => setPerdidaForm({ ...perdidaForm, monto_original: e.target.value })} className="mt-1 w-full border border-slate-700 bg-slate-950 p-2 text-sm text-white" />
            </label>
          </div>
          <button type="submit" disabled={saving} className="mt-4 bg-amber-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
            {saving ? 'Guardando…' : 'Registrar pérdida'}
          </button>
          <ul className="mt-4 space-y-2 text-xs text-slate-400">
            {perdidas.length === 0 && <li>Sin pérdidas fiscales activas.</li>}
            {perdidas.map((p) => (
              <li key={p.id} className="flex justify-between border border-slate-800 bg-slate-950/60 px-2 py-1">
                <span>Origen {p.ejercicio_origen}</span>
                <span className="font-mono text-white">Pend. {money(p.monto_pendiente)}</span>
              </li>
            ))}
          </ul>
        </form>
      </div>
    </section>
  );
};

const Metric = ({ label, value, tone }) => (
  <div className="border border-slate-800 bg-slate-900 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    <p className={`mt-2 text-sm font-bold ${tone === 'rose' ? 'text-rose-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
  </div>
);

export default FiscalAnualPanel;
