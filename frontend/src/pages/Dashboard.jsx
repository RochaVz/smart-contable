import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Building2, PlusCircle, Briefcase, LogOut, Search } from 'lucide-react';
import NewCompanyModal from '../components/NewCompanyModal';

const Dashboard = ({ onLogout }) => {
  const navigate = useNavigate();
  const[empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const[isNewCompanyOpen, setIsNewCompanyOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const hasLoaded = useRef(false);

  const fetchEmpresas = useCallback(async () => {
    try {
      const response = await api.get('/empresas/');
      setEmpresas(response.data);
    } catch (err) {
      console.error("Error cargando empresas:", err);
    } finally {
      setLoading(false);
    }
  },[]);

  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      fetchEmpresas();
    }
  }, [fetchEmpresas]);

  const empresasFiltradas = empresas.filter(e => 
    e.razon_social.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.rfc.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* NAVBAR SUPERIOR PROFESIONAL */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3 text-blue-500">
            <Briefcase className="w-8 h-8" />
            <span className="text-xl font-black text-white tracking-tight">SmartContable</span>
          </div>
          <button 
            onClick={onLogout} 
            className="flex items-center gap-2 text-slate-400 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" /> <span>Salir</span>
          </button>
        </div>
      </nav>

      {/* CONTENIDO */}
      <main className="max-w-7xl mx-auto p-8">
        <header className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6">
          <div>
            <h1 className="text-4xl font-black text-white">Mis Empresas</h1>
            <p className="text-slate-400 mt-2">Selecciona una entidad para gestionar su contabilidad.</p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 text-slate-600 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Buscar empresa..." 
                className="bg-slate-900 border border-slate-700 rounded-2xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 w-full sm:w-64 outline-none text-white"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setIsNewCompanyOpen(true)} 
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-xl shadow-blue-900/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-5 h-5" /> Nueva Empresa
            </button>
          </div>
        </header>

        {loading ? (
          <div className="text-center py-20 text-slate-500">Cargando empresas...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {empresasFiltradas.map(e => (
              <div 
                key={e.id} 
                onClick={() => navigate(`/empresa/${e.id}`)} 
                className="bg-slate-900 p-8 rounded-3xl cursor-pointer border border-slate-800 hover:border-blue-500 transition-all shadow-xl hover:-translate-y-2 hover:shadow-2xl hover:shadow-blue-900/10 group"
              >
                <div className="bg-blue-500/10 w-14 h-14 rounded-2xl flex items-center justify-center mb-6 text-blue-500 group-hover:scale-110 transition-transform">
                  <Building2 className="w-7 h-7" />
                </div>
                <h3 className="text-xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{e.razon_social}</h3>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">{e.rfc}</p>
                <div className="mt-6 pt-6 border-t border-slate-800 flex justify-between items-center">
                   <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-green-500/10 text-green-500 rounded-full border border-green-500/20">Activa</span>
                   <span className="text-blue-500 font-bold text-sm">Entrar →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <NewCompanyModal 
        isOpen={isNewCompanyOpen} 
        onClose={() => setIsNewCompanyOpen(false)} 
        onSaveSuccess={fetchEmpresas} 
      />
    </div>
  );
};

export default Dashboard;