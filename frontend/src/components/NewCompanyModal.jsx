import { useState } from 'react';
import { X, Building2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { saveLocalCompany } from '../services/localBackup';

const DEFAULT_FORM_DATA = {
  rfc: '',
  razon_social: '',
  regimen_fiscal: '601',
  tipo_persona: 'moral',
  opcion_deduccion: '',
  codigo_postal: '00000',
};

const NewCompanyModal = ({ isOpen, onClose, onSaveSuccess, initialData = {} }) => {
  const [formData, setFormData] = useState({
    ...DEFAULT_FORM_DATA,
    ...initialData,
  });
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Nota: El Backend asignará el usuario_id automáticamente por el Token
      await api.post('/empresas/', formData);
      toast.success('Negocio guardado');
      onSaveSuccess(); // Refresca el Dashboard
      onClose();
    } catch (err) {
      if (err.response?.status === 409) {
        setError("Ya existe una empresa registrada con ese RFC. Por favor verifica el RFC ingresado.");
      } else if (err.response?.data?.error?.message) {
        setError(err.response.data.error.message);
      } else if (err?.code === 'ERR_NETWORK' || !err?.response || err.response?.status >= 500 || err.response?.status === 401) {
        await saveLocalCompany(formData);
        toast.success('Negocio guardado en este dispositivo');
        await onSaveSuccess();
        onClose();
      } else {
        console.error(err);
        setError("Error al crear la empresa. Revisa los datos e inténtalo nuevamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:rounded-3xl sm:p-8">
        
        {/* Aquí es donde usamos el Building2 para que el aviso desaparezca */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/20 p-2 rounded-xl text-blue-500">
               <Building2 className="w-6 h-6" /> {/* <--- ¡AQUÍ ESTÁ! */}
            </div>
            <h2 className="text-xl font-black text-white sm:text-2xl">Agregar negocio</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
             <X />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-400">
            Si el servidor no está disponible, el negocio se guardará en este dispositivo y podrás respaldarlo desde el panel principal.
          </p>
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-300">RFC del negocio</label>
            <input className="w-full bg-slate-950 p-4 rounded-xl border border-slate-700 text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Ej. ABC010203AB1" value={formData.rfc} onChange={(e) => setFormData({...formData, rfc: e.target.value.toUpperCase()})} required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-300">Nombre del negocio o empresa</label>
            <input className="w-full bg-slate-950 p-4 rounded-xl border border-slate-700 text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Cómo lo reconoces en tu día a día" value={formData.razon_social} onChange={(e) => setFormData({...formData, razon_social: e.target.value})} required />
          </div>
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-300">Código postal fiscal</label>
            <input className="w-full bg-slate-950 p-4 rounded-xl border border-slate-700 text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Código postal registrado ante el SAT" value={formData.codigo_postal} onChange={(e) => setFormData({...formData, codigo_postal: e.target.value})} required />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">Tipo de persona</label>
              <select value={formData.tipo_persona} onChange={(e) => setFormData({ ...formData, tipo_persona: e.target.value })} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:ring-2 focus:ring-blue-500">
                <option value="fisica">Persona física</option>
                <option value="moral">Persona moral</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">Régimen fiscal</label>
              <select value={formData.regimen_fiscal} onChange={(e) => setFormData({ ...formData, regimen_fiscal: e.target.value, opcion_deduccion: e.target.value === '606' ? formData.opcion_deduccion : '' })} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:ring-2 focus:ring-blue-500">
                <option value="601">General de Ley Personas Morales</option>
                <option value="612">Actividades empresariales y profesionales</option>
                <option value="606">Arrendamiento</option>
                <option value="605">Sueldos y salarios</option>
                <option value="626_PF">RESICO persona física</option>
                <option value="626_PM">RESICO persona moral</option>
              </select>
            </div>
          </div>
          {formData.regimen_fiscal === '606' && (
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-300">Deducción ISR</label>
              <select value={formData.opcion_deduccion} onChange={(e) => setFormData({ ...formData, opcion_deduccion: e.target.value })} required className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-white outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Selecciona una opción</option>
                <option value="CIEGA">Deducción ciega (35% + predial)</option>
                <option value="REAL">Gastos reales</option>
              </select>
            </div>
          )}
          
          <button className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-white mt-4 transition-all active:scale-95 flex justify-center" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : "Guardar negocio"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewCompanyModal;