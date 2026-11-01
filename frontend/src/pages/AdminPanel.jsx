import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, RefreshCw, ShieldAlert, Trash2, UserCheck, UserX } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../services/api';
import { clearNavigationCache } from '../services/navigationCache';
import { clearApiSnapshots, deleteLocalCompaniesByRfc } from '../services/localBackup';

const errorMessage = (error, fallback) => error.response?.data?.detail
  || error.response?.data?.message
  || fallback;

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('es-MX') : '—');

const AdminPanel = () => {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [rfc, setRfc] = useState('');
  const [rfcBusy, setRfcBusy] = useState(false);

  const hasLoaded = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/usuarios');
      setUsuarios(data);
    } catch (error) {
      if (error.response?.status === 403) setForbidden(true);
      else toast.error(errorMessage(error, 'No se pudo cargar la lista de usuarios'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    cargar();
  }, [cargar]);

  const recargar = () => {
    setLoading(true);
    return cargar();
  };

  const limpiarCacheLocal = async () => {
    await clearApiSnapshots().catch(() => {});
    clearNavigationCache();
  };

  const alternarActivo = async (usuario) => {
    setBusyId(usuario.id);
    try {
      await api.patch(`/admin/usuarios/${usuario.id}/activo`, { activo: !usuario.activo });
      toast.success(usuario.activo ? 'Usuario desactivado' : 'Usuario activado');
      await cargar();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo actualizar el usuario'));
    } finally {
      setBusyId(null);
    }
  };

  const eliminarUsuario = async (usuario) => {
    const escrito = window.prompt(
      `Se eliminará POR COMPLETO a ${usuario.email}: su cuenta, ${usuario.empresas} empresa(s) y ${usuario.facturas} factura(s) con pólizas, banco y datos fiscales. Es irreversible.\n\nEscribe el correo para confirmar:`,
    );
    if (escrito === null) return;
    if (escrito.trim().toLowerCase() !== usuario.email.toLowerCase()) {
      toast.error('El correo no coincide. No se eliminó nada.');
      return;
    }
    setBusyId(usuario.id);
    try {
      await api.delete(`/admin/usuarios/${usuario.id}`);
      await limpiarCacheLocal();
      toast.success('Usuario eliminado por completo');
      await cargar();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar el usuario'));
    } finally {
      setBusyId(null);
    }
  };

  const eliminarRfc = async (event) => {
    event.preventDefault();
    const rfcNormalizado = rfc.trim().toUpperCase();
    if (!rfcNormalizado) return;
    setRfcBusy(true);
    try {
      const { data: empresas } = await api.get(`/admin/rfc/${encodeURIComponent(rfcNormalizado)}`);
      if (empresas.length === 0) {
        toast(`No hay empresas registradas con el RFC ${rfcNormalizado}`);
        return;
      }
      const confirmado = window.confirm(
        `Se eliminará el RFC ${rfcNormalizado} y toda su información en ${empresas.length} empresa(s) de todas las cuentas. Es irreversible. ¿Continuar?`,
      );
      if (!confirmado) return;
      const { data } = await api.delete(`/admin/rfc/${encodeURIComponent(rfcNormalizado)}`);
      await deleteLocalCompaniesByRfc(rfcNormalizado).catch(() => {});
      await limpiarCacheLocal();
      const ajenas = data.facturas_de_otras_empresas_que_lo_mencionan;
      toast.success(
        `RFC eliminado (${data.empresas_eliminadas} empresa(s))`
        + (ajenas ? `. ${ajenas} factura(s) de otras empresas lo mencionan como contraparte y se conservaron.` : ''),
        { duration: 7000 },
      );
      setRfc('');
      await cargar();
    } catch (error) {
      toast.error(errorMessage(error, 'No se pudo eliminar el RFC'));
    } finally {
      setRfcBusy(false);
    }
  };

  if (forbidden) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-center text-slate-300">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-rose-400" />
        <p>Esta sección es solo para el administrador de la aplicación.</p>
        <button type="button" onClick={() => navigate('/dashboard')} className="mt-4 text-blue-400 underline">
          Volver
        </button>
      </div>
    );
  }

  const activos = usuarios.filter((u) => u.activo).length;

  return (
    <div className="app-page min-h-screen bg-slate-950 text-slate-200">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="mb-2 flex items-center gap-1 text-sm text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" /> Volver
            </button>
            <h1 className="text-2xl font-black text-white">Administración de la plataforma</h1>
            <p className="text-sm text-slate-400">
              {loading ? 'Cargando…' : `${usuarios.length} usuario(s) · ${activos} activo(s)`}
            </p>
          </div>
          <button
            type="button"
            onClick={recargar}
            disabled={loading}
            className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
          </button>
        </header>

        <section className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Usuario</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Empresas</th>
                <th className="px-4 py-3 text-right">Facturas</th>
                <th className="px-4 py-3">Alta</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/70 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white">{u.nombre}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">{u.es_admin_app ? 'Administrador' : u.rol}</td>
                  <td className="px-4 py-3">
                    <span className={u.activo ? 'text-emerald-400' : 'text-slate-500'}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.empresas}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.facturas}</td>
                  <td className="px-4 py-3">{formatDate(u.creado_en)}</td>
                  <td className="px-4 py-3">
                    {u.es_admin_app ? (
                      <span className="block text-right text-xs text-slate-500">Protegido</span>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => alternarActivo(u)}
                          disabled={busyId === u.id}
                          className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-700 px-2 text-xs hover:bg-slate-800 disabled:opacity-60"
                        >
                          {u.activo ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarUsuario(u)}
                          disabled={busyId === u.id}
                          className="flex min-h-9 items-center gap-1 rounded-lg border border-rose-500/40 px-2 text-xs font-bold text-rose-400 hover:bg-rose-500/10 disabled:opacity-60"
                        >
                          {busyId === u.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          Eliminar todo
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && usuarios.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Sin usuarios</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5">
          <h2 className="text-lg font-bold text-white">Eliminar un RFC en toda la plataforma</h2>
          <p className="mt-1 text-sm text-slate-400">
            Borra las empresas con ese RFC de todas las cuentas, con facturas, pólizas, banco y datos fiscales.
          </p>
          <form onSubmit={eliminarRfc} className="mt-3 flex flex-wrap gap-2">
            <input
              value={rfc}
              onChange={(event) => setRfc(event.target.value)}
              placeholder="RFC"
              aria-label="RFC a eliminar"
              maxLength={13}
              className="min-h-10 w-56 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm uppercase outline-none focus:ring-2 focus:ring-rose-500/60"
            />
            <button
              type="submit"
              disabled={rfcBusy || !rfc.trim()}
              className="flex min-h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-500 disabled:opacity-60"
            >
              {rfcBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Eliminar RFC
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default AdminPanel;
