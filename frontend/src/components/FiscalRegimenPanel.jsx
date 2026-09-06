import { useEffect, useState } from 'react';
import { BadgeCheck, Calculator, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const REGIMENES = [
  ['601', 'General de Ley Personas Morales'],
  ['612', 'Actividades empresariales y profesionales'],
  ['606', 'Arrendamiento'],
  ['605', 'Sueldos y salarios'],
  ['626_PF', 'RESICO persona física'],
  ['626_PM', 'RESICO persona moral'],
];

const etiquetaCalculo = {
  FLUJO_EFECTIVO_RESICO: 'Flujo de efectivo RESICO',
  COEFICIENTE_UTILIDAD: 'Coeficiente de utilidad',
  TARIFA_PROGRESIVA: 'Tarifa progresiva',
  DEDUCCION_CIEGA: 'Deducción ciega',
  RETENCIONES_NOMINA: 'Retenciones de nómina',
};

const FiscalRegimenPanel = ({ empresa, onUpdated }) => {
  const [resumen, setResumen] = useState(null);
  const [form, setForm] = useState({ tipo_persona: '', regimen_fiscal: '', opcion_deduccion: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/empresas/${empresa.id}/fiscal`);
      setResumen(response.data);
      setForm({
        tipo_persona: response.data.empresa.tipo_persona || '',
        regimen_fiscal: response.data.empresa.regimen_fiscal || '',
        opcion_deduccion: response.data.empresa.opcion_deduccion || '',
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo cargar el resumen fiscal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [empresa.id]);

  const guardar = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.put(`/empresas/${empresa.id}`, {
        ...form,
        opcion_deduccion: form.regimen_fiscal === '606' ? form.opcion_deduccion : null,
      });
      toast.success('Configuración fiscal actualizada');
      await cargar();
      onUpdated?.();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo guardar la configuración fiscal');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-blue-400" /></div>;

  const obligaciones = resumen?.obligaciones || {};
  const retenciones = resumen?.retenciones_sugeridas || [];
  return (
    <section className="space-y-5">
      <div className="flex items-start gap-3 border-l-2 border-amber-400 bg-amber-500/5 px-4 py-3">
        <Calculator className="h-5 w-5 shrink-0 text-amber-400" />
        <p className="text-sm leading-6 text-slate-300">Las retenciones se calculan sobre tus CFDIs emitidos y sirven para revisión antes de declarar. No modifica CFDIs ya timbrados.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Cálculo ISR" value={etiquetaCalculo[obligaciones.calculo_isr_tipo] || 'No configurado'} />
        <Metric label="DIOT" value={obligaciones.exige_diot ? 'Requerida' : 'No requerida'} />
        <Metric label="Contabilidad electrónica" value={obligaciones.exige_contabilidad_electronica ? 'Requerida' : 'No requerida'} />
        <Metric label="Deducciones ISR" value={obligaciones.permite_deducciones_isr ? 'Permitidas' : 'No permitidas'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <form onSubmit={guardar} className="border border-slate-800 bg-slate-900 p-5">
          <h3 className="text-base font-black text-white">Configuración fiscal</h3>
          <div className="mt-4 space-y-4">
            <Select label="Tipo de persona" value={form.tipo_persona} onChange={(value) => setForm({ ...form, tipo_persona: value })} options={[['fisica', 'Persona física'], ['moral', 'Persona moral']]} />
            <Select label="Régimen fiscal" value={form.regimen_fiscal} onChange={(value) => setForm({ ...form, regimen_fiscal: value, opcion_deduccion: value === '606' ? form.opcion_deduccion : '' })} options={REGIMENES} />
            {form.regimen_fiscal === '606' && <Select label="Deducción ISR" value={form.opcion_deduccion} onChange={(value) => setForm({ ...form, opcion_deduccion: value })} options={[['CIEGA', 'Ciega (35% + predial)'], ['REAL', 'Gastos reales']]} required />}
          </div>
          <button type="submit" disabled={saving} className="mt-5 flex min-h-11 items-center gap-2 bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar configuración
          </button>
        </form>

        <div className="border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h3 className="text-base font-black text-white">Retenciones sugeridas</h3><p className="mt-1 text-xs text-slate-500">CFDIs emitidos a personas morales.</p></div>
            <BadgeCheck className="h-5 w-5 text-emerald-400" />
          </div>
          {retenciones.length === 0 ? <p className="mt-6 text-sm text-slate-500">No hay retenciones fiscales sugeridas en los CFDIs emitidos registrados.</p> : <div className="mt-4 space-y-3">{retenciones.map((item) => <div key={item.factura_id} className="border border-slate-800 bg-slate-950/70 p-3"><p className="text-sm font-bold text-white">{item.receptor || 'Receptor sin nombre'}</p><p className="mt-1 font-mono text-[10px] text-slate-500">{item.uuid}</p><div className="mt-2 flex flex-wrap gap-2">{item.retenciones_sugeridas.map((retencion) => <span key={retencion.impuesto} className="bg-amber-400/10 px-2 py-1 text-xs font-bold text-amber-300">{retencion.impuesto} ${retencion.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>)}</div></div>)}</div>}
        </div>
      </div>
    </section>
  );
};

const Metric = ({ label, value }) => <div className="border border-slate-800 bg-slate-900 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p><p className="mt-2 text-sm font-bold text-white">{value}</p></div>;
const Select = ({ label, value, onChange, options, required = false }) => <label className="block text-sm font-bold text-slate-300">{label}<select value={value} required={required} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full border border-slate-700 bg-slate-950 p-3 text-sm text-white outline-none focus:border-blue-500">{!required && <option value="">Selecciona una opción</option>}{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;

export default FiscalRegimenPanel;