import { memo, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Landmark, Plus, Star, Trash2, Pencil, Loader2 } from 'lucide-react';

const EMPTY = {
  nombre_banco: '',
  porcentaje_credito: 3.5,
  porcentaje_debito: 1.8,
  porcentaje_servicios: 2.0,
  comision_fija: 0,
  es_default: false,
};

const ComisionesBancoPanel = ({ empresaId }) => {
  const [bancos, setBancos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchBancos = useCallback(async () => {
    try {
      const res = await api.get(`/configuracion/comisiones-banco/${empresaId}`);
      setBancos(res.data);
    } catch {
      toast.error('No se pudieron cargar los bancos');
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    fetchBancos();
  }, [fetchBancos]);

  const openNew = () => {
    setEditId(null);
    setForm({ ...EMPTY, es_default: bancos.length === 0 });
    setShowForm(true);
  };

  const openEdit = (b) => {
    setEditId(b.id);
    setForm({
      nombre_banco: b.nombre_banco,
      porcentaje_credito: b.porcentaje_credito,
      porcentaje_debito: b.porcentaje_debito,
      porcentaje_servicios: b.porcentaje_servicios,
      comision_fija: b.comision_fija,
      es_default: b.es_default,
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.nombre_banco.trim()) {
      toast.error('Indica el nombre del banco');
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/configuracion/comisiones-banco/${editId}`, form);
        toast.success('Banco actualizado');
      } else {
        await api.post('/configuracion/comisiones-banco', { ...form, empresa_id: Number(empresaId) });
        toast.success('Banco agregado');
      }
      setShowForm(false);
      await fetchBancos();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este banco?')) return;
    try {
      await api.delete(`/configuracion/comisiones-banco/${id}`);
      toast.success('Banco eliminado');
      fetchBancos();
    } catch {
      toast.error('No se pudo eliminar');
    }
  };

  const setDefault = async (b) => {
    try {
      await api.put(`/configuracion/comisiones-banco/${b.id}`, { es_default: true });
      toast.success(`${b.nombre_banco} es ahora el banco por defecto`);
      fetchBancos();
    } catch {
      toast.error('Error al marcar predeterminado');
    }
  };

  return (
    <section className="mb-10 bg-slate-900/80 border border-slate-800 rounded-3xl p-6">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <div className="flex items-center gap-3">
          <Landmark className="w-6 h-6 text-amber-400" />
          <div>
            <h2 className="text-lg font-black text-white">Comisiones por banco</h2>
            <p className="text-slate-500 text-xs">
              Define el % de comisión para crédito, débito y tarjeta de servicios
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold px-4 py-2 rounded-xl"
        >
          <Plus className="w-4 h-4" /> Agregar banco
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="mb-6 p-5 bg-slate-950 rounded-2xl border border-slate-800 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="md:col-span-2 lg:col-span-3">
            <label className="text-[10px] font-black uppercase text-slate-500">Nombre del banco</label>
            <input
              className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white"
              value={form.nombre_banco}
              onChange={(e) => setForm({ ...form, nombre_banco: e.target.value })}
              placeholder="Ej. BBVA, Banorte, Santander..."
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500">% Crédito (04)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white"
              value={form.porcentaje_credito}
              onChange={(e) => setForm({ ...form, porcentaje_credito: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500">% Débito (28)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white"
              value={form.porcentaje_debito}
              onChange={(e) => setForm({ ...form, porcentaje_debito: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500">% Servicios (29)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white"
              value={form.porcentaje_servicios}
              onChange={(e) => setForm({ ...form, porcentaje_servicios: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase text-slate-500">Comisión fija (MXN)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white"
              value={form.comision_fija}
              onChange={(e) => setForm({ ...form, comision_fija: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="flex items-end gap-3 md:col-span-2">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.es_default}
                onChange={(e) => setForm({ ...form, es_default: e.target.checked })}
                className="rounded"
              />
              Banco predeterminado para cobros con tarjeta
            </label>
          </div>
          <div className="flex gap-2 md:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold px-6 py-2 rounded-xl"
            >
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Guardar'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-slate-400 hover:text-white px-4 py-2"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" />
      ) : bancos.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-6">
          Sin bancos configurados. Se usará 2.5% genérico hasta que agregues uno.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bancos.map((b) => (
            <div
              key={b.id}
              className={`p-4 rounded-2xl border ${
                b.es_default ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800 bg-slate-950/60'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-white flex items-center gap-2">
                    {b.nombre_banco}
                    {b.es_default && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full uppercase font-black">
                        Default
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 mt-2">
                    Crédito {b.porcentaje_credito}% · Débito {b.porcentaje_debito}% · Serv. {b.porcentaje_servicios}%
                  </p>
                  {b.comision_fija > 0 && (
                    <p className="text-xs text-slate-400 mt-1">+ ${b.comision_fija} fija por operación</p>
                  )}
                </div>
                <div className="flex gap-1">
                  {!b.es_default && (
                    <button
                      type="button"
                      title="Marcar predeterminado"
                      onClick={() => setDefault(b)}
                      className="p-2 text-slate-500 hover:text-amber-400"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <button type="button" onClick={() => openEdit(b)} className="p-2 text-slate-500 hover:text-blue-400">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => handleDelete(b.id)} className="p-2 text-slate-500 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default memo(ComisionesBancoPanel);
