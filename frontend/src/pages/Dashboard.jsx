import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  Building2, PlusCircle, LogOut, Search, ArrowRight, ShieldCheck,
  Trash2, Loader2, ChevronRight, Upload,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import NewCompanyModal from '../components/NewCompanyModal';
import SmartContableMark from '../components/SmartContableMark';
import DeviceBackupPanel from '../components/DeviceBackupPanel';
import { deleteLocalCompany, getLocalCompanies, importDeviceBackup } from '../services/localBackup';
import { getNavigationCache, setNavigationCache } from '../services/navigationCache';

const Dashboard = ({ onLogout }) => {
  const navigate = useNavigate();
  const fileImportRef = useRef(null);
  const empresasCacheKey = 'dashboard:empresas';
  const [empresas, setEmpresas] = useState(() => getNavigationCache(empresasCacheKey) || []);
  const [loading, setLoading] = useState(() => !getNavigationCache(empresasCacheKey));
  const [importingBackup, setImportingBackup] = useState(false);
  const [isNewCompanyOpen, setIsNewCompanyOpen] = useState(false);
  const [newCompanyDraft, setNewCompanyDraft] = useState({});
  const [newCompanyModalKey, setNewCompanyModalKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
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
      const empresasActualizadas = [
        ...remoteCompanies,
        ...localCompanies.filter((empresa) => !remoteRfcs.has(empresa.rfc)),
      ];
      setNavigationCache(empresasCacheKey, empresasActualizadas);
      setEmpresas(empresasActualizadas);
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

  const handleGlobalImportBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingBackup(true);
    try {
      const result = await importDeviceBackup(file);
      const total = result.totalRecords
        ?? ((result.snapshots || 0) + (result.companies || 0) + (result.invoices || 0)
          + (result.bankMovements || 0) + (result.polizas || 0) + (result.accountMappings || 0));
      toast.success(`Respaldo restaurado: ${total} registro(s)`);
      await fetchEmpresas();
    } catch (error) {
      toast.error(error.message || 'No se pudo restaurar el respaldo');
    } finally {
      setImportingBackup(false);
      event.target.value = '';
    }
  };

  const empresasFiltradas = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return empresas;
    return empresas.filter((e) =>
      e.razon_social.toLowerCase().includes(term) ||
      e.rfc.toLowerCase().includes(term)
    );
  }, [empresas, searchTerm]);

  const handleNavigateEmpresa = (empresaId, customSeccion, customTab) => {
    // Preferir rutas dedicadas; el CompanyDetail aún acepta ?seccion=&tab= y redirige.
    if (!customSeccion) {
      navigate(`/empresa/${empresaId}`);
      return;
    }
    const map = {
      historial: '/modulos/documentos',
      polizas: '/modulos/polizas',
      conciliacion: '/modulos/conciliacion',
      fiscal: '/modulos/fiscal',
      informes: customTab === 'estado'
        ? '/reportes/ingresos'
        : customTab === 'padron'
          ? '/reportes/proveedores'
          : customTab === 'trasladados'
            ? '/reportes/impuestos'
            : customTab === 'resumen'
              ? '/reportes/utilidades'
              : '/reportes/utilidades',
    };
    const suffix = map[customSeccion] || '';
    navigate(`/empresa/${empresaId}${suffix}`);
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

  const fetchRemoteCompanyBackupSlice = async (empresa) => {
    const rfc = String(empresa.rfc || '').toUpperCase();
    const [facturasRes, polizasRes, mapeosRes, movimientosRes] = await Promise.all([
      api.get(`/facturas/?empresa_id=${empresa.id}`).catch(() => ({ data: [] })),
      api.get(`/polizas/?empresa_id=${empresa.id}`).catch(() => ({ data: [] })),
      api.get(`/configuracion/mapeos/${empresa.id}`).catch(() => ({ data: [] })),
      api.get(`/conciliacion/movimientos?empresa_id=${empresa.id}`).catch(() => ({ data: [] })),
    ]);

    const invoices = (facturasRes.data || []).map((invoice) => ({
      ...invoice,
      empresa_id: empresa.id,
      empresa_rfc: rfc,
    }));
    const polizas = (polizasRes.data || []).map((poliza) => ({
      ...poliza,
      empresa_id: empresa.id,
      empresa_rfc: rfc,
      factura_uuid: poliza.cfdi?.uuid || poliza.factura_uuid || null,
    }));
    const accountMappings = (mapeosRes.data || []).map((mapping) => ({
      ...mapping,
      empresa_id: empresa.id,
      empresa_rfc: rfc,
    }));
    const bankMovements = (movimientosRes.data || []).map((movement) => ({
      ...movement,
      empresa_id: empresa.id,
      empresa_rfc: rfc,
      fingerprint: movement.fingerprint || movement.hash_movimiento,
    }));

    return {
      company: { ...empresa, empresa_rfc: rfc },
      invoices,
      polizas,
      accountMappings,
      bankMovements,
    };
  };

  const prepareCompanyBackup = async (empresa) => {
    if (empresa.local_only) return {};
    const slice = await fetchRemoteCompanyBackupSlice(empresa);
    return {
      companies: [slice.company],
      invoices: slice.invoices,
      polizas: slice.polizas,
      accountMappings: slice.accountMappings,
      bankMovements: slice.bankMovements,
    };
  };

  const prepareDeviceBackup = async () => {
    const remoteResponse = await api.get('/empresas/');
    const remoteCompanies = remoteResponse.data || [];
    const remoteData = await Promise.all(remoteCompanies.map((empresa) => fetchRemoteCompanyBackupSlice(empresa)));
    return {
      companies: remoteData.map((item) => item.company),
      invoices: remoteData.flatMap((item) => item.invoices),
      polizas: remoteData.flatMap((item) => item.polizas),
      accountMappings: remoteData.flatMap((item) => item.accountMappings),
      bankMovements: remoteData.flatMap((item) => item.bankMovements),
    };
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

  // Renderizar tarjeta de empresa
  const renderCompanyCard = (e) => (
    <div 
      key={e.id} 
      onClick={() => handleNavigateEmpresa(e.id)} 
      className="sc-card sc-card--interactive group relative flex flex-col justify-between p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl cursor-pointer"
    >
      <div>
        <div className="mb-3.5 flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-0.5 transition-transform">
            Abrir <ChevronRight className="h-4 w-4" />
          </span>
        </div>

        <h3 className="mb-1 text-lg font-black tracking-tight text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors break-words">
          {e.razon_social}
        </h3>
        <p className="font-mono text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
          {e.rfc}
        </p>

        {e.local_only && (
          <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Guardado en este dispositivo
          </span>
        )}

        {/* ACCESOS DIRECTOS DE REPORTES DENTRO DE LA TARJETA */}
        <div className="mt-4 border-t border-slate-200/80 dark:border-slate-800 pt-3" onClick={(ev) => ev.stopPropagation()}>
          <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Reportes rápidos
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleNavigateEmpresa(e.id, 'informes', 'estado')}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20 transition-colors"
            >
              📈 Ingresos / Gastos
            </button>
            <button
              type="button"
              onClick={() => handleNavigateEmpresa(e.id, 'informes', 'resumen')}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-800 dark:text-blue-300 hover:bg-blue-500/20 transition-colors"
            >
              📊 Utilidad
            </button>
            <button
              type="button"
              onClick={() => handleNavigateEmpresa(e.id, 'informes', 'padron')}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-800 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors"
            >
              👥 Proveedores
            </button>
            <button
              type="button"
              onClick={() => handleNavigateEmpresa(e.id, 'informes', 'trasladados')}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-500/20 transition-colors"
            >
              💰 IVA / Impuestos
            </button>
            <button
              type="button"
              onClick={() => handleNavigateEmpresa(e.id, 'conciliacion')}
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-800 dark:text-cyan-300 hover:bg-cyan-500/20 transition-colors"
            >
              🏦 Conciliación
            </button>
            <button
              type="button"
              onClick={() => handleNavigateEmpresa(e.id, 'fiscal')}
              className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-800 dark:text-purple-300 hover:bg-purple-500/20 transition-colors"
            >
              ⚖️ Motor SAT
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200/80 dark:border-slate-800 pt-3" onClick={(ev) => ev.stopPropagation()}>
        <DeviceBackupPanel compact company={e} prepareCompanyBackup={prepareCompanyBackup} />

        <button
          type="button"
          onClick={(event) => handleDeleteCompany(e, event)}
          disabled={deletingCompanyId === e.id}
          className="mt-3 flex min-h-9 w-full items-center justify-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-700 dark:text-rose-400 transition-colors hover:bg-rose-500/20 disabled:cursor-wait disabled:opacity-60"
          title={`Eliminar ${e.razon_social}`}
        >
          {deletingCompanyId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          {deletingCompanyId === e.id ? 'Eliminando...' : 'Eliminar negocio'}
        </button>
      </div>
    </div>
  );

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
        <header className="sc-gradient mb-6 overflow-hidden rounded-2xl p-5 shadow-lg shadow-blue-950/20 sm:rounded-3xl sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-100">
                <ShieldCheck className="h-4 w-4" /> Centro de Control Fiscal y Financiero
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Tus empresas</h1>
              <p className="mt-1 text-xs font-medium text-blue-100/90">Selecciona un negocio para ver su información.</p>
            </div>
            <label className="relative block w-full sm:max-w-xs">
              <Search className="absolute left-3 top-3 text-white/70 h-4 w-4" />
              <input
                type="text"
                value={searchTerm}
                placeholder="Buscar negocio o RFC..."
                aria-label="Buscar negocio o RFC"
                className="min-h-10 w-full rounded-xl border border-white/25 bg-black/20 py-2 pl-9 pr-3 text-sm text-white placeholder:text-white/70 outline-none focus:ring-2 focus:ring-white/60 backdrop-blur-sm"
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
          </div>
        </header>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black tracking-tight text-slate-900 dark:text-white">Empresas registradas</h2>
            <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:text-blue-300 border border-blue-500/20">
              {empresas.length}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="sc-card py-14 text-center text-sm text-slate-500 dark:text-slate-400">Cargando empresas...</div>
        ) : (
          empresasFiltradas.length === 0 ? (
            <div className="sc-card border-dashed p-8 text-center sm:py-14">
              <Building2 className="mx-auto mb-4 h-10 w-10 text-slate-400 dark:text-slate-500" />
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                {searchTerm ? 'No encontramos coincidencias para esa búsqueda' : 'Aún no tienes negocios registrados'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600 dark:text-slate-400">
                {searchTerm ? 'Prueba con el nombre o RFC del negocio.' : 'Agrega tu primer negocio o restaura un respaldo previo (.json) para continuar donde te quedaste.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => openNewCompany(getDraftFromSearch())}
                  className="btn-ui btn-ui--primary btn-ui--md font-display"
                >
                  {searchTerm ? 'Agregar este negocio' : 'Agregar mi primer negocio'} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {empresasFiltradas.map((empresa) => renderCompanyCard(empresa))}
            </div>
          )
        )}

        <section className="sc-card mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Administración y respaldos</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Carga o descarga copias de seguridad de tus empresas</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => fileImportRef.current?.click()}
              disabled={importingBackup}
              title="Cargar y restaurar un archivo de respaldo (.json)"
              className="btn-ui btn-ui--success btn-ui--md font-display"
            >
              {importingBackup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span>Cargar respaldo</span>
            </button>
            <button
              type="button"
              onClick={() => openNewCompany(getDraftFromSearch())}
              className="btn-ui btn-ui--primary btn-ui--md font-display"
            >
              <PlusCircle className="h-4 w-4" /> Agregar negocio
            </button>
          </div>
          <input
            ref={fileImportRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleGlobalImportBackup}
          />
        </section>

        <div className="mt-4">
          <DeviceBackupPanel prepareDeviceBackup={prepareDeviceBackup} />
        </div>
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
