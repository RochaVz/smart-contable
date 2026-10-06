import { useEffect, useState } from 'react';
import { X, FileText, Loader2, Trash2 } from 'lucide-react';
import api from '../services/api';
import toast from 'react-hot-toast';
import { deleteLocalInvoice } from '../services/localBackup';

const FacturaDetailModal = ({ isOpen, onClose, factura, onPolizaGenerada, onEliminada }) => {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen || !factura?.id) return;
    if (factura.local_only) return;

    let cancelled = false;

    Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      try {
        const res = await api.get(`/facturas/${factura.id}/detalle`);
        if (!cancelled) setDetalle(res.data);
      } catch {
        if (!cancelled) toast.error('No se pudo cargar el detalle');
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, factura?.id, factura?.local_only]);

  if (!isOpen || !factura) return null;

  const handleEliminar = async () => {
    const uuid = factura.uuid || detalle?.uuid;
    const ok = window.confirm(
      `¿Eliminar esta factura?\n\nUUID: ${uuid}\n\nSe borrarán también las pólizas vinculadas.`,
    );
    if (!ok) return;

    setDeleting(true);
    try {
      if (factura.local_only) {
        await deleteLocalInvoice(factura.id);
      } else {
        await api.delete(`/facturas/${factura.id}`);
      }
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

  const d = factura.local_only ? factura : detalle || factura;
  const impuestos = d.desglose_impuestos || [];
  const conceptos = d.conceptos || d.conceptos_vendidos || [];
  const esIngreso = d.tipo_operacion === 'VENTA' || d.tipo_comprobante === 'I';
  const etiquetaConcepto = esIngreso ? 'Concepto de venta' : 'Concepto de compra';
  const etiquetaContraparte = esIngreso ? 'Cliente' : 'Proveedor / Emisor';
  const nombreContraparte = esIngreso
    ? (d.nombre_cliente || d.nombre_receptor || d.receptor || d.emisor)
    : (d.nombre_emisor || d.emisor || d.receptor);
  const conceptoResumen = d.concepto
    || conceptos.map((c) => c.descripcion).filter(Boolean).join(' · ')
    || 'Sin concepto registrado en el CFDI';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl sm:rounded-3xl sm:p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-white sm:text-2xl">
            <FileText className="text-blue-500" /> Detalles del CFDI
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar detalle"><X className="text-slate-500 hover:text-white" /></button>
        </div>

        {loading ? (
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
        ) : (
          <>
            <div className="mb-6 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-500">{etiquetaContraparte}</p>
                <p className="font-bold text-white">{nombreContraparte || '—'}</p>
                {esIngreso && (d.nombre_emisor || d.rfc_emisor) && (
                  <p className="mt-1 text-xs text-slate-500">
                    Emisor: {d.nombre_emisor || d.emisor || '—'}
                    {d.rfc_emisor ? ` (${d.rfc_emisor})` : ''}
                  </p>
                )}
                {!esIngreso && (d.nombre_receptor || d.receptor) && (
                  <p className="mt-1 text-xs text-slate-500">
                    Receptor: {d.nombre_receptor || d.receptor}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-500">Forma de pago</p>
                <p className="text-white">{d.forma_pago?.etiqueta || d.forma_pago_label || '—'}</p>
                <p className="text-xs text-slate-500">{d.forma_pago?.metodo_pago || d.metodo_pago}</p>
              </div>
            </div>

            <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <p className={`mb-2 text-[10px] font-black uppercase ${esIngreso ? 'text-emerald-400' : 'text-rose-400'}`}>
                {etiquetaConcepto}
              </p>
              <p className="cfdi-concepto text-sm font-bold text-slate-300">
                {conceptoResumen}
              </p>
              {conceptos.length > 1 && (
                <ul className="mt-3 space-y-2 border-t border-slate-800 pt-3">
                  {conceptos.map((c, i) => (
                    <li key={`${c.descripcion || 'concepto'}-${i}`} className="flex items-start justify-between gap-3">
                      <span className="cfdi-concepto text-sm font-bold text-slate-300">
                        {c.descripcion || 'Concepto sin descripción'}
                      </span>
                      <span className="shrink-0 text-sm font-black text-white">
                        ${Number(c.importe || 0).toLocaleString('es-MX')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {conceptos.length === 1 && Number(conceptos[0]?.importe || 0) > 0 && (
                <p className="mt-2 text-xs font-bold text-slate-500">
                  Importe del concepto: ${Number(conceptos[0].importe || 0).toLocaleString('es-MX')}
                </p>
              )}
            </div>

            <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <p className="mb-2 text-[10px] font-black uppercase text-slate-500">Desglose de impuestos</p>
              {impuestos.length === 0 ? (
                <p className="text-sm text-slate-500">Sin desglose de impuestos disponible.</p>
              ) : impuestos.map((imp, i) => (
                <div key={`${imp.concepto || 'imp'}-${i}`} className="flex justify-between py-1 text-sm">
                  <span className="text-slate-400">{imp.concepto}</span>
                  <span className="font-bold text-white">${Math.abs(imp.importe).toLocaleString()}</span>
                </div>
              ))}
            </div>

            {!d.tiene_poliza && !d.local_only && (
              <button
                type="button"
                disabled={generating}
                onClick={handleGenerar}
                className="btn-ui btn-ui--primary btn-ui--md btn-ui--block font-display"
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
              className="btn-ui btn-ui--danger btn-ui--md btn-ui--block mt-4 font-display"
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
