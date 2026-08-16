import { useState } from 'react';
import { FilePenLine, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const OPCIONES_CARGO = [
  { cuenta: '601.01.01', nombre: 'Gastos generales' },
  { cuenta: '601.02.01', nombre: 'Honorarios profesionales' },
  { cuenta: '601.07.01', nombre: 'Combustibles y lubricantes' },
  { cuenta: '601.15.01', nombre: 'Nóminas' },
  { cuenta: 'custom', nombre: 'Otro concepto...' },
];

const OPCIONES_ABONO = [
  { cuenta: '401.01.01', nombre: 'Ingresos por ventas' },
  { cuenta: '402.01.01', nombre: 'Otros ingresos' },
  { cuenta: 'custom', nombre: 'Otro concepto...' },
];

const CrearPolizaMovimientoModal = ({ isOpen, onClose, empresaId, fila, onSuccess }) => {
  const opciones = fila?.tipo === 'abono' ? OPCIONES_ABONO : OPCIONES_CARGO;
  const [cuenta, setCuenta] = useState(opciones[0].cuenta);
  const [conceptoPersonalizado, setConceptoPersonalizado] = useState('');
  const [concepto, setConcepto] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !fila) return null;

  const cuentaSeleccionada = cuenta === 'custom'
    ? { cuenta: fila?.tipo === 'abono' ? '402.01.01' : '601.01.01', nombre: conceptoPersonalizado.trim() || 'Concepto personalizado' }
    : (opciones.find((opcion) => opcion.cuenta === cuenta) || opciones[0]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await api.post('/polizas/desde-movimiento-banco', {
        empresa_id: empresaId,
        movimiento_banco_id: fila.id,
        cuenta_contrapartida: cuentaSeleccionada.cuenta,
        nombre_contrapartida: cuentaSeleccionada.nombre,
        concepto: concepto.trim() || fila.descripcion,
      });
      toast.success('Póliza creada y lista para conciliar');
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo crear la póliza');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 px-4 py-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-800 px-6 py-5">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-400">
              <FilePenLine className="h-5 w-5" />
              <span className="text-[10px] font-black uppercase tracking-widest">Crear registro</span>
            </div>
            <h2 className="text-xl font-black text-white">Agregar a una póliza</h2>
            <p className="mt-1 text-sm text-slate-400">Revisa el movimiento y elige cómo registrarlo.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-xl p-2 text-slate-500 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-6 py-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Movimiento bancario</p>
                <p className="mt-1 truncate font-bold text-white">{fila.descripcion || 'Sin descripción'}</p>
                <p className="mt-1 text-xs text-slate-500">{fila.fecha} {fila.referencia ? `· ${fila.referencia}` : ''}</p>
              </div>
              <p className={`shrink-0 text-lg font-black ${fila.tipo === 'abono' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fila.tipo === 'abono' ? '+' : '-'}{Number(fila.cargo || fila.abono || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="poliza-cuenta" className="mb-2 block text-sm font-bold text-slate-300">
              {fila.tipo === 'abono' ? '¿De dónde viene este ingreso?' : '¿En qué se utilizó este dinero?'}
            </label>
            <select
              id="poliza-cuenta"
              value={cuenta}
              onChange={(event) => setCuenta(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
            >
              {opciones.map((opcion) => <option key={opcion.cuenta} value={opcion.cuenta}>{opcion.nombre}</option>)}
            </select>
          </div>

          {cuenta === 'custom' && (
            <div>
              <label htmlFor="poliza-concepto-personalizado" className="mb-2 block text-sm font-bold text-slate-300">¿En qué se utilizó este dinero?</label>
              <input
                id="poliza-concepto-personalizado"
                value={conceptoPersonalizado}
                onChange={(event) => setConceptoPersonalizado(event.target.value)}
                placeholder="Ej. Compra de materiales, reparación, publicidad..."
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
          )}

          <div>
            <label htmlFor="poliza-concepto" className="mb-2 block text-sm font-bold text-slate-300">Descripción para tu registro</label>
            <input
              id="poliza-concepto"
              value={concepto}
              onChange={(event) => setConcepto(event.target.value)}
              placeholder={fila.descripcion || 'Ej. Pago de renta'}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800">Volver</button>
            <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-black text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FilePenLine className="h-4 w-4" />}
              {loading ? 'Creando...' : 'Crear póliza'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CrearPolizaMovimientoModal;
