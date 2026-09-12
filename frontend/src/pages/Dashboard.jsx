import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  Building2, PlusCircle, LogOut, Search, ArrowRight, ShieldCheck,
  Trash2, Loader2, FileBarChart, TrendingUp, DollarSign, Users,
  Receipt, Landmark, Scale, ChevronRight, Sparkles,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import NewCompanyModal from '../components/NewCompanyModal';
import SmartContableMark from '../components/SmartContableMark';
import DeviceBackupPanel from '../components/DeviceBackupPanel';
import { deleteLocalCompany, getLocalCompanies } from '../services/localBackup';

const REPORT_TOPICS = [
  {
    id: 'resumen',
    label: 'Resumen & KPIs',
    description: 'Ventas, compras y margen neto mensual',
    icon: FileBarChart,
    seccion: 'informes',
    tab: 'resumen',
    keywords: ['resumen', 'kpi', 'dashboard', 'ventas', 'margen', 'general'],
  },
  {
    id: 'estado',
    label: 'Ingresos & Gastos',
    description: 'Desglose de estado de resultados',
    icon: TrendingUp,
    seccion: 'informes',
    tab: 'estado',
    keywords: ['ingresos', 'egresos', 'gastos', 'ventas', 'costos', 'estado de resultados', 'perdidas', 'ganancias'],
  },
  {
    id: 'utilidad',
    label: 'Utilidades & Rentabilidad',
    description: 'Cálculo de utilidad neta y balance',
    icon: DollarSign,
    seccion: 'informes',
    tab: 'resumen',
    keywords: ['utilidad', 'utilidades', 'rentabilidad', 'ganancia', 'margen'],
  },
  {
    id: 'trasladados',
    label: 'Pago de Impuestos & IVA Trasladado',
    description: 'IVA cobrado en facturas emitidas',
    icon: Receipt,
    seccion: 'informes',
    tab: 'trasladados',
    keywords: ['impuestos', 'iva trasladado', 'pago de impuestos', 'iva ventas', 'ish', 'impuesto'],
  },
  {
    id: 'acreditables',
    label: 'IVA Acreditable & Compras',
    description: 'IVA pagado en compras a proveedores',
    icon: Receipt,
    seccion: 'informes',
    tab: 'acreditables',
    keywords: ['iva acreditable', 'deducible', 'compras', 'facturas recibidas'],
  },
  {
    id: 'retenidos',
    label: 'Retenciones (ISR / IVA)',
    description: 'Retenciones del periodo',
    icon: Receipt,
    seccion: 'informes',
    tab: 'retenidos',
    keywords: ['retenciones', 'isr retenido', 'iva retenido', 'impuestos retenidos', 'retencion'],
  },
  {
    id: 'padron',
    label: 'Padrón de Proveedores',
    description: 'Directorio de proveedores y montos',
    icon: Users,
    seccion: 'informes',
    tab: 'padron',
    keywords: ['padron de proveedores', 'proveedores', 'proveedor', 'compras', 'clasificacion'],
  },
  {
    id: 'conciliacion',
    label: 'Conciliación Bancaria',
    description: 'Cruce entre banco y facturas',
    icon: Landmark,
    seccion: 'conciliacion',
    keywords: ['conciliacion', 'banco', 'estado de cuenta', 'movimientos bancarios', 'saldo'],
  },
  {
    id: 'fiscal',
    label: 'Motor Fiscal & SAT',
    description: 'Validaciones de régimen fiscal y alertas',
    icon: Scale,
    seccion: 'fiscal',
    keywords: ['fiscal', 'sat', 'regimen', 'obligaciones', 'motor fiscal', 'auditoria'],
  },
];

const CATEGORIAS_RAPIDAS = [
  { id: 'todos', label: 'Todos los negocios' },
  { id: 'ingresos', label: 'Ingresos & Ventas', seccion: 'informes', tab: 'estado' },
  { id: 'egresos', label: 'Gastos & Egresos', seccion: 'informes', tab: 'estado' },
  { id: 'utilidades', label: 'Utilidades', seccion: 'informes', tab: 'resumen' },
  { id: 'impuestos', label: 'Pago de Impuestos', seccion: 'informes', tab: 'trasladados' },
  { id: 'proveedores', label: 'Padrón Proveedores', seccion: 'informes', tab: 'padron' },
  { id: 'conciliacion', label: 'Conciliación', seccion: 'conciliacion' },
  { id: 'fiscal', label: 'Motor Fiscal SAT', seccion: 'fiscal' },
];

const Dashboard = ({ onLogout }) => {
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isNewCompanyOpen, setIsNewCompanyOpen] = useState(false);
  const [newCompanyDraft, setNewCompanyDraft] = useState({});
  const [newCompanyModalKey, setNewCompanyModalKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('todos');
  const [deletingCompanyId, setDeletingCompanyId] = useState(null);
  const hasLoaded = useRef(false);

  const fetchEmpresas = useCallback(async () => {
    try {
      const [remoteResponse, localCompanies] = await Promise.all([
        api.get('/empresas/').catch(() => ({ data: [] })),
        getLocalCompanies().catch(() => []),
      ]);
      const remoteCompanies = remoteResponse.data || [];
      const remoteRfcs = new Set(remoteCompanies.map((empresa) => empresa.rfc));
      setEmpresas([
        ...remoteCompanies,
        ...localCompanies.filter((empresa) => !remoteRfcs.has(empresa.rfc)),
      ]);
    } catch (err) {
      console.error("Error cargando empresas:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) {
      hasLoaded.current = true;
      fetchEmpresas();
    }

    window.addEventListener('smartcontable:local-companies-updated', fetchEmpresas);
    return () => window.removeEventListener('smartcontable:local-companies-updated', fetchEmpresas);
  }, [fetchEmpresas]);

  const reportesSugeridos = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return REPORT_TOPICS.filter((topic) =>
      topic.label.toLowerCase().includes(term) ||
      topic.description.toLowerCase().includes(term) ||
      topic.keywords.some((kw) => kw.toLowerCase().includes(term))
    );
  }, [searchTerm]);

  const empresasFiltradas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return empresas;
    return empresas.filter((e) =>
      e.razon_social.toLowerCase().includes(term) ||
      e.rfc.toLowerCase().includes(term)
    );
  }, [empresas, searchTerm]);

  const handleNavigateEmpresa = (empresaId, customSeccion, customTab) => {
    const targetSeccion = customSeccion || (categoriaActiva !== 'todos' ? CATEGORIAS_RAPIDAS.find((c) => c.id === categoriaActiva)?.seccion : null);
    const targetTab = customTab || (categoriaActiva !== 'todos' ? CATEGORIAS_RAPIDAS.find((c) => c.id === categoriaActiva)?.tab : null);

    const queryParams = new URLSearchParams();
    if (targetSeccion) queryParams.set('seccion', targetSeccion);
    if (targetTab) queryParams.set('tab', targetTab);

    const qs = queryParams.toString();
    navigate(`/empresa/${empresaId}${qs ? `?${qs}` : ''}`);
  };

  const getDraftFromSearch = () => {
    const value = searchTerm.trim();
    if (!value) return {};
    const normalized = value.toUpperCase().replace(/\s+/g, '');
    const looksLikeRfc = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(normalized);
    return looksLikeRfc ? { rfc: normalized } : { razon_social: value };
  };

  const openNewCompany = (draft = {}) => {
    setNewCompanyDraft(draft);
    setNewCompanyModalKey((value) => value + 1);
    setIsNewCompanyOpen(true);
  };

  const handleCompanySaved = async () => {
    setSearchTerm('');
    await fetchEmpresas();
  };

  const prepareCompanyBackup = async (empresa) => {
    if (empresa.local_only) return {};
    const response = await api.get(`/facturas/?empresa_id=${empresa.id}`);
    return { invoices: response.data || [] };
  };

  const handleDeleteCompany = async (empresa, event) => {
    event.stopPropagation();
    const confirmacion = window.confirm(
      `¿Eliminar el negocio "${empresa.razon_social}"?\n\nSe quitará de tu lista${empresa.local_only ? ' y se borrarán sus datos guardados en este dispositivo' : ''}.`,
    );
    if (!confirmacion) return;

    setDeletingCompanyId(empresa.id);
    try {
      if (empresa.local_only) {
        await deleteLocalCompany(empresa);
      } else {
        await api.delete(`/empresas/${empresa.id}`);
      }
      setEmpresas((current) => current.filter((item) => item.id !== empresa.id));
      toast.success('Negocio eliminado correctamente');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo eliminar el negocio');
    } finally {
      setDeletingCompanyId(null);
    }
  };

  return (
    <div className="app-page min-h-screen bg-slate-950 text-slate-200">
      {/* NAVBAR SUPERIOR PROFESIONAL */}
      <nav className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
          <div className="flex min-w-0 items-center gap-2 text-blue-500 sm:gap-3">
            <SmartContableMark size="sm" className="rounded-xl" />
            <span className="truncate text-lg font-black tracking-tight text-white sm:text-xl">SmartContable</span>
          </div>
          <button 
            onClick={onLogout} 
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm text-slate-400 transition-colors hover:bg-slate-800/70 hover:text-red-400 sm:text-base"
          >
            <LogOut className="w-5 h-5" /> <span>Salir</span>
          </button>
        </div>
      </nav>

      {/* CONTENIDO */}
      <main className="app-container max-w-7xl py-5 sm:px-6 lg:px-8 lg:py-8">
        <header className="mb-5 overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 p-5 shadow-xl shadow-black/10 sm:mb-8 sm:rounded-3xl sm:p-8">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-300">
                <ShieldCheck className="h-4 w-4" /> Centro de Control Fiscal y Financiero
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Tus negocios y reportes, en un solo lugar</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                Encuentra fácilmente reportes de ingresos, egresos, utilidades, pago de impuestos, padrón de proveedores o la situación contable de cualquier negocio.
              </p>
            </div>
            
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <div className="relative min-w-0 flex-1 lg:flex-none">
                <Search className="absolute left-3 top-3.5 text-slate-500 w-5 h-5" />
                <input 
                  type="text" 
                  value={searchTerm}
                  placeholder="Buscar negocio, RFC, IVA, utilidades, proveedores..."
                  className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-4 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500 sm:w-80 sm:text-sm"
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                onClick={() => openNewCompany(getDraftFromSearch())} 
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-xl shadow-blue-900/20 transition-all hover:bg-blue-500 active:scale-[0.99]"
              >
                <PlusCircle className="w-5 h-5" /> Agregar negocio
              </button>
            </div>
          </div>

          {/* ACCESOS DIRECTOS POR CATEGORÍA DE REPORTE */}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-800/80 pt-6">
            {CATEGORIAS_RAPIDAS.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoriaActiva(cat.id)}
                className={`rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                  categoriaActiva === cat.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-900/30'
                    : 'bg-slate-950/80 text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </header>

        {/* COINCIDENCIAS DE REPORTES / SUGERENCIAS GLOBALES */}
        {reportesSugeridos.length > 0 && (
          <section className="mb-8 rounded-2xl border border-blue-500/30 bg-blue-950/20 p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-300">
              <Sparkles className="h-4 w-4" /> Reportes y secciones encontradas
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {reportesSugeridos.map((topic) => {
                const Icon = topic.icon;
                return (
                  <div key={topic.id} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{topic.label}</p>
                        <p className="truncate text-xs text-slate-400">{topic.description}</p>
                      </div>
                    </div>
                    {empresas.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-800/80 pt-2.5">
                        <span className="text-[10px] font-bold uppercase text-slate-500">Abrir en:</span>
                        {empresas.slice(0, 3).map((emp) => (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => handleNavigateEmpresa(emp.id, topic.seccion, topic.tab)}
                            className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-blue-300 hover:bg-blue-600 hover:text-white"
                          >
                            {emp.razon_social.split(' ')[0]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="mb-8 grid grid-cols-1 gap-3 sm:max-w-xs">
          <div className="border-l-2 border-blue-500 bg-slate-900/70 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Negocios registrados</p>
            <p className="mt-1 text-xl font-black text-white">{empresas.length}</p>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-slate-500">Cargando empresas...</div>
        ) : (
          empresasFiltradas.length === 0 ? (
            <div className="border border-dashed border-slate-700 bg-slate-900/60 px-6 py-14 text-center rounded-2xl">
              <Building2 className="mx-auto mb-4 h-10 w-10 text-slate-600" />
              <h2 className="text-xl font-black text-white">
                {searchTerm ? 'No encontramos coincidencias para esa búsqueda' : 'Aún no tienes negocios registrados'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                {searchTerm ? 'Prueba con el nombre del negocio, RFC o términos como “ingreso”, “iva”, “utilidad”.' : 'Agrega tu primer negocio para empezar a revisar sus movimientos.'}
              </p>
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => openNewCompany(getDraftFromSearch())}
                  className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500"
                >
                  Agregar este negocio <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => openNewCompany()}
                  className="mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500"
                >
                  Agregar mi primer negocio <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {empresasFiltradas.map((e) => (
              <div 
                key={e.id} 
                onClick={() => handleNavigateEmpresa(e.id)} 
                className="group cursor-pointer rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl transition-all hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-900/10 active:scale-[0.99] sm:rounded-3xl sm:p-7 lg:hover:-translate-y-1.5"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="bg-blue-500/10 w-12 h-12 rounded-2xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <span className="flex items-center gap-1 text-xs font-bold text-blue-400 group-hover:text-blue-300">
                    Abrir <ChevronRight className="h-4 w-4" />
                  </span>
                </div>

                <h3 className="mb-1 break-words text-lg font-bold text-white transition-colors group-hover:text-blue-400 sm:text-xl">{e.razon_social}</h3>
                <p className="text-slate-500 font-mono text-xs uppercase tracking-widest">{e.rfc}</p>
                {e.local_only && (
                  <span className="mt-3 inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                    Guardado en este dispositivo
                  </span>
                )}

                {/* ACCESOS DIRECTOS DE REPORTES DENTRO DE LA TARJETA */}
                <div className="mt-5 border-t border-slate-800/80 pt-4" onClick={(ev) => ev.stopPropagation()}>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Reportes rápidos</p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleNavigateEmpresa(e.id, 'informes', 'estado')}
                      className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-emerald-600 hover:text-white transition-colors"
                    >
                      Ingresos / Gastos
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateEmpresa(e.id, 'informes', 'resumen')}
                      className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-blue-600 hover:text-white transition-colors"
                    >
                      Utilidad
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateEmpresa(e.id, 'informes', 'padron')}
                      className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-violet-600 hover:text-white transition-colors"
                    >
                      Proveedores
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateEmpresa(e.id, 'informes', 'trasladados')}
                      className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-amber-600 hover:text-white transition-colors"
                    >
                      IVA / Impuestos
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateEmpresa(e.id, 'conciliacion')}
                      className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-cyan-600 hover:text-white transition-colors"
                    >
                      Conciliación
                    </button>
                    <button
                      type="button"
                      onClick={() => handleNavigateEmpresa(e.id, 'fiscal')}
                      className="rounded-lg bg-slate-950 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-rose-600 hover:text-white transition-colors"
                    >
                      Motor SAT
                    </button>
                  </div>
                </div>

                <div className="mt-4 border-t border-slate-800 pt-4">
                  <DeviceBackupPanel compact company={e} prepareCompanyBackup={prepareCompanyBackup} />
                </div>

                <button
                  type="button"
                  onClick={(event) => handleDeleteCompany(e, event)}
                  disabled={deletingCompanyId === e.id}
                  className="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 px-3 py-2 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-60"
                  title={`Eliminar ${e.razon_social}`}
                >
                  {deletingCompanyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {deletingCompanyId === e.id ? 'Eliminando...' : 'Eliminar negocio'}
                </button>
              </div>
            ))}
          </div>
          )
        )}
      </main>

      <NewCompanyModal 
        key={newCompanyModalKey}
        isOpen={isNewCompanyOpen} 
        onClose={() => setIsNewCompanyOpen(false)} 
        onSaveSuccess={handleCompanySaved}
        initialData={newCompanyDraft}
      />
    </div>
  );
};

export default Dashboard;