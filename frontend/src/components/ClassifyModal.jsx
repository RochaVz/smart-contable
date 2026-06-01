import { useState } from 'react';
import { X, Save, BrainCircuit } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const ClassifyModal = ({ isOpen, onClose, rfc, empresaId, onClassificationSuccess }) => {
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!nombreCuenta) return;
    setLoading(true);

    try {
      await api.post('/configuracion/mapeos', {
        rfc_emisor: rfc,
        nombre_cuenta: nombreCuenta.toUpperCase(),
        empresa_id: empresaId
      });
      
      toast.success("Regla contable guardada con éxito!"); // Feedback positivo
      onClassificationSuccess(); // Esto refresca la tabla automáticamente
      onClose();
    } catch (error) {
      console.error("Error al clasificar:", error);
      if (error.response?.status === 401) {
        toast.error("Tu sesión expiró. Inicia sesión nuevamente.");
      } else {
        toast.error("Error al guardar la regla, revisa el RFC"); // Feedback de error
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2 text-blue-400">
            <BrainCircuit className="w-5 h-5" />
            <h3 className="text-xl font-bold text-white">Clasificar Proveedor</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X /></button>
        </div>

        <div className="p-8">
          <p className="text-slate-400 text-sm mb-6">
            Asigna una cuenta contable para el RFC: <br />
            <span className="text-white font-mono font-bold text-lg">{rfc}</span>
          </p>

          <div className="space-y-4">
            <label className="text-xs font-black uppercase tracking-widest text-slate-500">Nombre de la Cuenta</label>
            <input 
              type="text" 
              placeholder="Ej: HONORARIOS, COMBUSTIBLES..." 
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-4 px-6 text-white focus:ring-2 focus:ring-blue-500 outline-none"
              value={nombreCuenta}
              onChange={(e) => setNombreCuenta(e.target.value)}
            />
          </div>

          <button
            onClick={handleSave}
            disabled={loading || !nombreCuenta}
            className="w-full mt-10 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            {loading ? "Guardando..." : <><Save className="w-5 h-5" /> Guardar Regla Contable</>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClassifyModal;
