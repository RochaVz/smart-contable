import { X, Scale } from 'lucide-react';

const PolizaDetailModal = ({ isOpen, onClose, poliza }) => {
  if (!isOpen || !poliza) return null;

  const movimientos = poliza.movimientos || [];
  const totalDebe = movimientos.reduce((s, m) => s + (m.debe || 0), 0);
  const totalHaber = movimientos.reduce((s, m) => s + (m.haber || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-8 shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Scale className="text-blue-500" />
            Póliza de {poliza.tipo} #{poliza.numero}
          </h2>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X className="text-slate-500 hover:text-white" />
          </button>
        </div>

        <p className="text-slate-400 text-sm mb-6">{poliza.concepto}</p>

        {poliza.diario && (
          <div className="mb-6 p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <p className="text-[10px] font-black uppercase text-blue-400 mb-2">Diario — venta</p>
            <p className="text-white"><span className="text-slate-500">Cliente:</span> {poliza.diario.nombre}</p>
            <p className="text-white mt-1"><span className="text-slate-500">Pago:</span> {poliza.diario.forma_pago}</p>
          </div>
        )}

        {poliza.ingreso && (
          <div className="mb-6 p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <p className="text-[10px] font-black uppercase text-emerald-400 mb-2">Ingreso — cobro</p>
            <p className="text-white">Forma de pago: {poliza.ingreso.forma_pago}</p>
            {poliza.ingreso.nombre_banco && (
              <p className="text-white mt-1">
                Banco: {poliza.ingreso.nombre_banco} ({poliza.ingreso.porcentaje_comision}%)
              </p>
            )}
            <p className="text-amber-400 mt-1">
              Comisión bancaria: ${poliza.ingreso.comision_bancaria?.toLocaleString()}
            </p>
            <p className="text-white mt-1">
              Depósito neto: ${poliza.ingreso.deposito_neto?.toLocaleString()}
            </p>
          </div>
        )}

        {poliza.egreso && (
          <div className="mb-6 p-4 bg-slate-950 rounded-2xl border border-slate-800">
            <p className="text-[10px] font-black uppercase text-rose-400 mb-2">Egreso — gasto</p>
            <p className="text-white">Proveedor: {poliza.egreso.proveedor}</p>
            <p className="text-emerald-400 mt-1">Clasificación: {poliza.egreso.clasificacion_gasto}</p>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-500 text-[10px] uppercase">
              <th className="text-left py-2">Cuenta</th>
              <th className="text-left py-2">Nombre</th>
              <th className="text-right py-2">Debe</th>
              <th className="text-right py-2">Haber</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {movimientos.map((m, i) => (
              <tr key={i}>
                <td className="py-3 font-mono text-blue-400">{m.cuenta}</td>
                <td className="py-3 text-slate-300">{m.nombre_cuenta}</td>
                <td className="py-3 text-right text-white">
                  {m.debe > 0 ? `$${m.debe.toLocaleString()}` : '—'}
                </td>
                <td className="py-3 text-right text-white">
                  {m.haber > 0 ? `$${m.haber.toLocaleString()}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-black text-white border-t border-slate-700">
              <td colSpan={2} className="py-3">Totales</td>
              <td className="text-right py-3">${totalDebe.toLocaleString()}</td>
              <td className="text-right py-3">${totalHaber.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default PolizaDetailModal;
