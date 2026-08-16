import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Building2, PlusCircle, Briefcase, LogOut, Search, ArrowRight, ShieldCheck } from 'lucide-react';
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
        <header className="mb-8 overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 p-6 sm:p-8">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-300">
              <ShieldCheck className="h-4 w-4" /> Revisión clara de tu negocio
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Tus negocios, en un solo lugar</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
              Revisa ingresos, gastos y documentos importantes para saber qué está pasando antes de hablar con tu contador.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 text-slate-600 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Buscar por nombre o RFC..."
                className="bg-slate-900 border border-slate-700 rounded-2xl pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 w-full sm:w-64 outline-none text-white"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button 
              onClick={() => setIsNewCompanyOpen(true)} 
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl font-bold transition-all shadow-xl shadow-blue-900/20 active:scale-95 flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-5 h-5" /> Agregar negocio
            </button>
          </div>
          </div>
        </header>

        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="border-l-2 border-blue-500 bg-slate-900/70 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Negocios registrados</p>
            <p className="mt-1 text-xl font-black text-white">{empresas.length}</p>
          </div>
          <div className="border-l-2 border-emerald-500 bg-slate-900/70 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Qué puedes revisar</p>
            <p className="mt-1 text-sm font-bold text-slate-200">Ingresos y gastos reales</p>
          </div>
          <div className="border-l-2 border-amber-500 bg-slate-900/70 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tu siguiente paso</p>
            <p className="mt-1 text-sm font-bold text-slate-200">Elige un negocio para comenzar</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-500">Cargando empresas...</div>
        ) : (
          empresasFiltradas.length === 0 ? (
            <div className="border border-dashed border-slate-700 bg-slate-900/60 px-6 py-14 text-center">
              <Building2 className="mx-auto mb-4 h-10 w-10 text-slate-600" />
              <h2 className="text-xl font-black text-white">
                {searchTerm ? 'No encontramos ese negocio' : 'Aún no tienes negocios registrados'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                {searchTerm ? 'Prueba con otro nombre o RFC.' : 'Agrega tu primer negocio para empezar a revisar sus movimientos.'}
              </p>
              {!searchTerm && (
                <button
                  type="button"
                  onClick={() => setIsNewCompanyOpen(true)}
                  className="mt-6 inline-flex items-center gap-2 bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500"
                >
                  Agregar mi primer negocio <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-6">
                   <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Lista para revisar</span>
                   <span className="flex items-center gap-1 text-sm font-bold text-blue-400">Abrir <ArrowRight className="h-4 w-4" /></span>
                </div>
              </div>
            ))}
          </div>
          )
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