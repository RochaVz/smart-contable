import { useEffect, useState } from 'react';
import { X, FileText, Loader2, Trash2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';

const FacturaDetailModal = ({ isOpen, onClose, factura, onPolizaGenerada, onEliminada }) => {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen || !factura?.id) return;
    setLoading(true);
    api.get(`/facturas/${factura.id}/detalle`)
      .then((res) => setDetalle(res.data))
      .catch(() => toast.error('No se pudo cargar el detalle'))
      .finally(() => setLoading(false));
  }, [isOpen, factura?.id]);

  if (!isOpen || !factura) return null;

  const handleEliminar = async () => {
    const uuid = factura.uuid || detalle?.uuid;
    const ok = window.confirm(
      `¿Eliminar esta factura?\n\nUUID: ${uuid}\n\nSe borrarán también las pólizas vinculadas.`,
    );
    if (!ok) return;

    setDeleting(true);
    try {
      await api.delete(`/facturas/${factura.id}`);
      toast.success('Factura eliminada');
      onEliminada?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerar = async () => {
    setGenerating(true);
    try {
      await api.post(`/facturas/${factura.id}/generar-poliza`);
      toast.success('Póliza(s) generada(s)');
      const res = await api.get(`/facturas/${factura.id}/detalle`);
      setDetalle(res.data);
      onPolizaGenerada?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al generar');
    } finally {
      setGenerating(false);
    }
  };

  const d = detalle || factura;
  const impuestos = d.desglose_impuestos || [];
  const conceptos = d.conceptos || d.conceptos_vendidos || [];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="text-blue-500" /> Detalles del CFDI
          </h2>
          <button type="button" onClick={onClose}><X className="text-slate-500 hover:text-white" /></button>
        </div>

        {loading ? (
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-slate-500" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 text-sm mb-6">
              <div>
                <p className="text-slate-500 text-[10px] font-black uppercase">Emisor / Cliente</p>
                <p className="text-white font-bold">{d.emisor || d.receptor}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[10px] font-black uppercase">Forma de pago</p>
                <p className="text-white">{d.forma_pago?.etiqueta || d.forma_pago_label || '—'}</p>
                <p className="text-slate-500 text-xs">{d.forma_pago?.metodo_pago || d.metodo_pago}</p>
              </div>
            </div>

            {conceptos.length > 0 && (
              <div className="mb-6 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Qué se vendió / compró</p>
                {conceptos.map((c, i) => (
                  <p key={i} className="text-sm text-slate-300 py-1 border-b border-slate-800 last:border-0">
                    {c.descripcion} — ${Number(c.importe || 0).toLocaleString()}
                  </p>
                ))}
              </div>
            )}

            <div className="mb-6 p-4 bg-slate-950 rounded-2xl border border-slate-800">
              <p className="text-[10px] font-black uppercase text-slate-500 mb-2">Desglose de impuestos</p>
              {impuestos.map((imp, i) => (
                <div key={i} className="flex justify-between text-sm py-1">
                  <span className="text-slate-400">{imp.concepto}</span>
                  <span className="text-white font-bold">${Math.abs(imp.importe).toLocaleString()}</span>
                </div>
              ))}
            </div>

            {!d.tiene_poliza && (
              <button
                type="button"
                disabled={generating}
                onClick={handleGenerar}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-2xl"
              >
                {generating ? 'Generando...' : 'Generar póliza(s)'}
              </button>
            )}
            {d.tiene_poliza && (
              <p className="text-center text-emerald-400 text-sm font-bold">✓ Póliza(s) ya generada(s)</p>
            )}

            <button
              type="button"
              disabled={deleting || generating}
              onClick={handleEliminar}
              className="w-full mt-4 border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50 font-bold py-3 rounded-2xl flex items-center justify-center gap-2"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Eliminar factura
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default FacturaDetailModal;
