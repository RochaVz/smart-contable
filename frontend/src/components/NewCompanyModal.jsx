import { useState } from 'react';
import { X, Building2, Loader2 } from 'lucide-react';
import api from '../services/api';

const NewCompanyModal = ({ isOpen, onClose, onSaveSuccess }) => {
  const[formData, setFormData] = useState({ 
    rfc: '', razon_social: '', regimen_fiscal: '601', tipo_persona: 'moral', codigo_postal: '00000' 
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Nota: El Backend asignará el usuario_id automáticamente por el Token
      await api.post('/empresas/', formData);
      onSaveSuccess(); // Refresca el Dashboard
      onClose();
    } catch (err) {
      console.error(err);
      alert("Error al crear la empresa. Verifica el RFC.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl p-8 shadow-2xl">
        
        {/* Aquí es donde usamos el Building2 para que el aviso desaparezca */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/20 p-2 rounded-xl text-blue-500">
               <Building2 className="w-6 h-6" /> {/* <--- ¡AQUÍ ESTÁ! */}
            </div>
            <h2 className="text-2xl font-black text-white">Nueva Empresa</h2>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">
             <X />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input className="w-full bg-slate-950 p-4 rounded-xl border border-slate-700 text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500" placeholder="RFC" onChange={(e) => setFormData({...formData, rfc: e.target.value})} required />
          <input className="w-full bg-slate-950 p-4 rounded-xl border border-slate-700 text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Razón Social" onChange={(e) => setFormData({...formData, razon_social: e.target.value})} required />
          <input className="w-full bg-slate-950 p-4 rounded-xl border border-slate-700 text-white placeholder-slate-600 outline-none focus:ring-2 focus:ring-blue-500" placeholder="Código Postal" onChange={(e) => setFormData({...formData, codigo_postal: e.target.value})} required />
          
          <button className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl font-bold text-white mt-4 transition-all active:scale-95 flex justify-center" disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : "Guardar Empresa"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewCompanyModal;