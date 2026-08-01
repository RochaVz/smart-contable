import { useState } from 'react';
import { X, Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import api from '../services/api';

const formatErrorDetail = (detail) => {
  if (!detail) return 'Error al procesar el archivo';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || JSON.stringify(d)).join('; ');
  }
  return String(detail);
};

const BankUploadModal = ({
  isOpen,
  onClose,
  empresaId,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState(null);
  const [uploading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [bancoResumen, setBancoResumen] = useState(null);

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStatus(null);
    setErrorMsg('');
    setBancoResumen(null);

    const formData = new FormData();
    formData.append('archivo', file);

    try {
      // Apunta directamente a tu endpoint de FastAPI para estados de cuenta
      const endpoint = `/conciliacion/estado-cuenta?empresa_id=${empresaId}`;

      const { data } = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setBancoResumen({
        banco: data.banco_detectado,
        movimientosNuevos: data.movimientos_nuevos,
        duplicados: data.duplicados,
      });
      setStatus('success');

      if (onUploadSuccess) onUploadSuccess(data);

      setTimeout(() => {
        onClose();
        setFile(null);
        setStatus(null);
        setBancoResumen(null);
      }, 2500);

    } catch (error) {
      const detail = error.response?.data?.detail;
      setErrorMsg(formatErrorDetail(detail) || error.message);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-xl font-bold text-white">Subir Estado de Cuenta Bancario</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X /></button>
        </div>

        <div className="p-8">
          <p className="text-slate-400 text-sm mb-4 leading-relaxed">
            Sube el estado de cuenta en formato digital. El motor inteligente detectará automáticamente si corresponde a <span className="text-blue-400">BBVA</span> u otro banco compatible.
          </p>

          <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all ${file ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 hover:border-slate-700'}`}>
            <Upload className={`w-12 h-12 mb-4 ${file ? 'text-blue-400' : 'text-slate-600'}`} />
            
            <input 
              type="file" 
              accept=".pdf,.csv,.xml" 
              className="hidden" 
              id="bankFileInput" 
              onChange={(e) => setFile(e.target.files[0])}
            />
            
            <label htmlFor="bankFileInput" className="cursor-pointer text-center">
              <span className="text-blue-500 font-semibold hover:underline">Selecciona un archivo</span>
              <p className="text-slate-500 text-sm mt-1">Formatos soportados: PDF, CSV, XML</p>
            </label>

            {file && (
              <div className="mt-4 bg-slate-800 px-4 py-2 rounded-lg text-sm text-slate-300 font-mono">
                {file.name}
              </div>
            )}
          </div>

          {status === 'success' && bancoResumen && (
            <div className="mt-4 text-green-400 bg-green-400/10 p-3 rounded-xl text-sm space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> ¡Procesado con éxito!
              </p>
              <p className="text-xs text-green-300">Banco: {bancoResumen.banco}</p>
              <p className="text-xs text-green-300">Nuevos: {bancoResumen.movimientosNuevos} | Duplicados: {bancoResumen.duplicados}</p>
            </div>
          )}

          {status === 'error' && (
            <div className="mt-4 flex gap-2 text-red-400 bg-red-400/10 p-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="animate-spin" /> : 'Procesar Estado de Cuenta'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BankUploadModal;