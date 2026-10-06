import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, Download, HardDrive, Loader2, Trash2, Upload } from 'lucide-react';
import {
  clearDeviceBackup,
  deleteLocalCompany,
  exportDeviceBackup,
  exportCompanyBackup,
  formatCoverageSummaryMessage,
  getLocalBackupStats,
  importDeviceBackup,
  previewDeviceBackupCoverage,
  summarizeCoverage,
} from '../services/localBackup';

const EMPTY_STATS = {
  snapshots: 0,
  companies: 0,
  invoices: 0,
  bankMovements: 0,
  polizas: 0,
  accountMappings: 0,
  totalRecords: 0,
  lastSavedAt: '',
};

const formatDate = (value) => {
  if (!value) return 'Aún sin respaldo local';
  return new Date(value).toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const totalFromResult = (result = {}) => result.totalRecords
  ?? ((result.snapshots || 0)
    + (result.companies || 0)
    + (result.invoices || 0)
    + (result.bankMovements || 0)
    + (result.polizas || 0)
    + (result.accountMappings || 0));

const DeviceBackupPanel = ({ compact = false, company = null, prepareCompanyBackup = null, prepareDeviceBackup = null }) => {
  const fileRef = useRef(null);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const refreshStats = async () => {
    setLoading(true);
    try {
      setStats(await getLocalBackupStats());
    } catch {
      setStats(EMPTY_STATS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadStats = async () => {
      try {
        const nextStats = await getLocalBackupStats();
        if (!cancelled) setStats(nextStats);
      } catch {
        if (!cancelled) setStats(EMPTY_STATS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const handleBackupUpdated = () => {
      void loadStats();
    };

    void loadStats();

    window.addEventListener('smartcontable:local-backup-updated', handleBackupUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('smartcontable:local-backup-updated', handleBackupUpdated);
    };
  }, []);

  const handleExport = async () => {
    setWorking(true);
    try {
      const companyData = company && prepareCompanyBackup ? await prepareCompanyBackup(company) : {};
      const deviceData = !company && prepareDeviceBackup ? await prepareDeviceBackup() : {};
      const payload = company ? companyData : deviceData;
      const coverage = company
        ? summarizeCoverage({
          companies: [company],
          invoices: payload.invoices || [],
          bankMovements: payload.bankMovements || [],
          polizas: payload.polizas || [],
          accountMappings: payload.accountMappings || [],
          snapshots: [],
        })
        : await previewDeviceBackupCoverage(payload);

      const confirmed = window.confirm(
        formatCoverageSummaryMessage(coverage, {
          scope: company ? 'company' : 'device',
          label: company?.razon_social || company?.rfc || '',
        }),
      );
      if (!confirmed) return;

      const result = company
        ? await exportCompanyBackup(company, companyData)
        : await exportDeviceBackup(deviceData);
      toast.success(`Respaldo descargado con ${totalFromResult(result)} registro(s)`);
      await refreshStats();
    } catch (error) {
      toast.error(error.message || 'No se pudo generar el respaldo');
    } finally {
      setWorking(false);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setWorking(true);
    try {
      const result = await importDeviceBackup(file);
      toast.success(`Respaldo restaurado: ${totalFromResult(result)} registro(s)`);
      await refreshStats();
    } catch (error) {
      toast.error(error.message || 'No se pudo restaurar el respaldo');
    } finally {
      setWorking(false);
      event.target.value = '';
    }
  };

  const handleClear = async () => {
    const message = company?.local_only
      ? `¿Borrar "${company.razon_social}" de este dispositivo? No borra archivos de respaldo ya descargados.`
      : '¿Borrar el respaldo local guardado en este dispositivo? No borra tu cuenta ni archivos ya descargados.';
    const ok = window.confirm(message);
    if (!ok) return;

    setWorking(true);
    try {
      if (company?.local_only) {
        await deleteLocalCompany(company);
        toast.success('Negocio local borrado de este dispositivo');
      } else {
        await clearDeviceBackup();
        toast.success('Respaldo local borrado de este dispositivo');
      }
      await refreshStats();
    } catch (error) {
      toast.error(error.message || 'No se pudo borrar el respaldo local');
    } finally {
      setWorking(false);
    }
  };

  if (compact) {
    return (
      <div className="relative" onClick={(event) => event.stopPropagation()}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={working}
            className="btn-ui btn-ui--primary btn-ui--md font-display"
          >
            <Upload className="h-4 w-4" /> Agregar respaldo
          </button>
          <button
            type="button"
            onClick={() => setIsOpen((value) => !value)}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm font-bold text-slate-300 transition-colors hover:border-blue-500 hover:text-white"
            aria-label="Opciones de respaldo"
            aria-expanded={isOpen}
          >
            <HardDrive className="h-4 w-4 text-emerald-400" />
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {isOpen && (
          <div className="mt-2 grid grid-cols-1 gap-2 rounded-2xl border border-slate-800 bg-slate-950/80 p-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={working}
              className="btn-ui btn-ui--success btn-ui--sm font-display"
            >
              {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Descargar
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={working}
              className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:border-blue-500 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" /> Restaurar
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={working || (company?.local_only ? false : stats.totalRecords === 0)}
              className="btn-ui btn-ui--danger btn-ui--sm font-display"
            >
              <Trash2 className="h-4 w-4" /> Borrar
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-xl shadow-black/10">
      <div className="border-b border-slate-800 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
            <HardDrive className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white">Respaldo en este dispositivo</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Guarda una copia descargable de la información local. Incluye CFDI, pólizas, mapeos y movimientos bancarios. No incluye contraseña ni token de sesión.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Registros locales</p>
            <p className="mt-1 text-2xl font-black text-white">{loading ? '...' : stats.totalRecords}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">CFDI / Pólizas</p>
            <p className="mt-1 text-sm font-bold text-slate-300">
              {loading ? '...' : `${stats.invoices || 0} / ${stats.polizas || 0}`}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Banco / Mapeos</p>
            <p className="mt-1 text-sm font-bold text-slate-300">
              {loading ? '...' : `${stats.bankMovements || 0} / ${stats.accountMappings || 0}`}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Última copia local</p>
            <p className="mt-1 text-sm font-bold text-slate-300">{loading ? 'Revisando...' : formatDate(stats.lastSavedAt)}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-[420px]">
          <button
            type="button"
            onClick={handleExport}
            disabled={working}
            className="btn-ui btn-ui--success btn-ui--md font-display"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Descargar
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={working}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-bold text-white hover:border-blue-500 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> Restaurar
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={working || stats.totalRecords === 0}
            className="btn-ui btn-ui--danger btn-ui--md font-display"
          >
            <Trash2 className="h-4 w-4" /> Borrar
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImport} />
        </div>
      </div>
    </section>
  );
};

export default DeviceBackupPanel;
