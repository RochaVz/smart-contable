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

const Dashboard = ({ onLogout }) => {
  const navigate = useNavigate();
  const fileImportRef = useRef(null);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
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
      className="btn-physical hub-accent-fuchsia font-display group cursor-pointer rounded-2xl border p-5 sm:rounded-3xl sm:p-7"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="hub-card__icon flex h-12 w-12 items-center justify-center">
          <span className="hub-card__emoji" aria-hidden="true">🏢</span>
          <Building2 className="hub-card__glyph h-6 w-6" />
        </div>
        <span className="flex items-center gap-1 text-xs font-bold text-white/90">
          Abrir <ChevronRight className="h-4 w-4" />
        </span>
      </div>

      <h3 className="mb-1 break-words text-lg font-black text-white sm:text-xl">{e.razon_social}</h3>
      <p className="font-mono text-xs uppercase tracking-widest text-white/75">{e.rfc}</p>
      {e.local_only && (
        <span className="mt-3 inline-flex rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">
          Guardado en este dispositivo
        </span>
      )}

      {/* ACCESOS DIRECTOS DE REPORTES DENTRO DE LA TARJETA */}
      <div className="mt-5 border-t border-white/20 pt-4" onClick={(ev) => ev.stopPropagation()}>
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-white/70">Reportes rápidos</p>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => handleNavigateEmpresa(e.id, 'informes', 'estado')}
            className="btn-physical hub-accent-emerald rounded-lg border px-2.5 py-1 text-[11px] font-bold text-white"
          >
            📈 Ingresos / Gastos
          </button>
          <button
            type="button"
            onClick={() => handleNavigateEmpresa(e.id, 'informes', 'resumen')}
            className="btn-physical hub-accent-blue rounded-lg border px-2.5 py-1 text-[11px] font-bold text-white"
          >
            📊 Utilidad
          </button>
          <button
            type="button"
            onClick={() => handleNavigateEmpresa(e.id, 'informes', 'padron')}
            className="btn-physical hub-accent-indigo rounded-lg border px-2.5 py-1 text-[11px] font-bold text-white"
          >
            👥 Proveedores
          </button>
          <button
            type="button"
            onClick={() => handleNavigateEmpresa(e.id, 'informes', 'trasladados')}
            className="btn-physical hub-accent-orange rounded-lg border px-2.5 py-1 text-[11px] font-bold text-white"
          >
            💰 IVA / Impuestos
          </button>
          <button
            type="button"
            onClick={() => handleNavigateEmpresa(e.id, 'conciliacion')}
            className="btn-physical hub-accent-cyan rounded-lg border px-2.5 py-1 text-[11px] font-bold text-white"
          >
            🏦 Conciliación
          </button>
          <button
            type="button"
            onClick={() => handleNavigateEmpresa(e.id, 'fiscal')}
            className="btn-physical hub-accent-amber rounded-lg border px-2.5 py-1 text-[11px] font-bold text-white"
          >
            ⚖️ Motor SAT
          </button>
        </div>
      </div>

      <div className="mt-4 border-t border-white/20 pt-4">
        <DeviceBackupPanel compact company={e} prepareCompanyBackup={prepareCompanyBackup} />
      </div>

      <button
        type="button"
        onClick={(event) => handleDeleteCompany(e, event)}
        disabled={deletingCompanyId === e.id}
        className="btn-press mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/30 bg-black/20 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-red-500/30 disabled:cursor-wait disabled:opacity-60"
        title={`Eliminar ${e.razon_social}`}
      >
        {deletingCompanyId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        {deletingCompanyId === e.id ? 'Eliminando...' : 'Eliminar negocio'}
      </button>
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
        <header className="mb-5 overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 p-5 shadow-xl shadow-black/10 sm:mb-8 sm:rounded-3xl sm:p-7">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-blue-300">
                <ShieldCheck className="h-4 w-4" /> Centro de Control Fiscal y Financiero
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Tus negocios, en un solo lugar</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                Administra tus empresas, carga comprobantes fiscales (CFDI) y accede al detalle contable de cada una.
              </p>
            </div>
            
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <div className="relative min-w-0 flex-1 lg:flex-none">
                <Search className="absolute left-3 top-3.5 text-slate-500 w-5 h-5" />
                <input 
                  type="text" 
                  value={searchTerm}
                  placeholder="Buscar negocio o RFC..."
                  className="min-h-12 w-full rounded-2xl border border-slate-700 bg-slate-900 py-3 pl-10 pr-4 text-base text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-blue-500/50"
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button 
                type="button"
                onClick={() => fileImportRef.current?.click()}
                disabled={importingBackup}
                title="Cargar y restaurar un archivo de respaldo (.json)"
                className="btn-ui btn-ui--success btn-ui--lg font-display"
              >
                {importingBackup ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                <span>Cargar respaldo</span>
              </button>
              <input 
                ref={fileImportRef} 
                type="file" 
                accept="application/json,.json" 
                className="hidden" 
                onChange={handleGlobalImportBackup} 
              />
              <button 
                type="button"
                onClick={() => openNewCompany(getDraftFromSearch())} 
                className="btn-ui btn-ui--primary btn-ui--lg font-display"
              >
                <PlusCircle className="w-5 h-5" /> Agregar negocio
              </button>
            </div>
          </div>
        </header>

        <div className="mb-8 grid grid-cols-1 gap-3 sm:max-w-xs">
          <div className="border-l-2 border-blue-500 bg-slate-900/70 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Negocios registrados</p>
            <p className="mt-1 text-xl font-black text-white">{empresas.length}</p>
          </div>
        </div>

        {/* PANEL DE RESPALDO GLOBAL - ÚNICO, AL PRINCIPIO */}
        <DeviceBackupPanel prepareDeviceBackup={prepareDeviceBackup} />

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
                {searchTerm ? 'Prueba con el nombre o RFC del negocio.' : 'Agrega tu primer negocio o restaura un respaldo previo (.json) para continuar donde te quedaste.'}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => openNewCompany(getDraftFromSearch())}
                    className="btn-ui btn-ui--primary btn-ui--md font-display"
                  >
                    Agregar este negocio <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openNewCompany()}
                      className="btn-ui btn-ui--primary btn-ui--md font-display"
                    >
                      Agregar mi primer negocio <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => fileImportRef.current?.click()}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 text-sm font-bold text-slate-200 transition-colors hover:border-blue-500 hover:text-white"
                    >
                      <Upload className="h-4 w-4 text-emerald-400" /> Cargar respaldo (.json)
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {empresasFiltradas.map((e) => renderCompanyCard(e))}
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
