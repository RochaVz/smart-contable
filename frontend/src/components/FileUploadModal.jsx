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

const FileUploadModal = ({
  isOpen,
  onClose,
  empresaId,
  empresaRfc,
  empresaNombre,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState(null);
  const [uploading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error' | 'partial'
  const [errorMsg, setErrorMsg] = useState('');
  const [zipResumen, setZipResumen] = useState(null);

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setStatus(null);
    setErrorMsg('');
    setZipResumen(null);

    const formData = new FormData();
    formData.append('archivo', file);

    try {
      // Determinamos si es XML o ZIP para usar el endpoint correcto
      const esZip = file.name.toLowerCase().endsWith('.zip');
      const endpoint = esZip ? '/facturas/subir-zip' : '/facturas/subir-xml';

      const { data } = await api.post(`${endpoint}?empresa_id=${empresaId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      let delayCierre = 2000;
      if (esZip) {
        const exitos = data.exitos ?? 0;
        const duplicados = data.duplicados ?? 0;
        setZipResumen({ exitos, duplicados, mensaje: data.mensaje, detalles: data.detalles ?? [] });

        if (exitos === 0) {
          setErrorMsg(data.mensaje || 'No se importó ningún XML nuevo.');
          setStatus('error');
          return;
        }

        setStatus(duplicados > 0 ? 'partial' : 'success');
        if (duplicados > 0) delayCierre = 3500;
      } else {
        setStatus('success');
      }

      onUploadSuccess();
      setTimeout(() => {
        onClose();
        setFile(null);
        setStatus(null);
        setZipResumen(null);
      }, delayCierre);
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
          <h3 className="text-xl font-bold text-white">Subir Comprobantes</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X /></button>
        </div>

        <div className="p-8">
          {empresaRfc && (
            <p className="text-slate-400 text-sm mb-4 leading-relaxed">
              Solo se aceptan CFDI donde el RFC{' '}
              <span className="font-mono text-blue-400">{empresaRfc}</span>
              {empresaNombre ? ` (${empresaNombre})` : ''} aparezca como emisor (ventas) o receptor (gastos).
              Los CFDI ya cargados (mismo UUID) se omiten.
            </p>
          )}

          <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all ${file ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 hover:border-slate-700'}`}>
            <Upload className={`w-12 h-12 mb-4 ${file ? 'text-blue-400' : 'text-slate-600'}`} />
            
            <input 
              type="file" 
              accept=".xml,.zip" 
              className="hidden" 
              id="fileInput" 
              onChange={(e) => setFile(e.target.files[0])}
            />
            
            <label htmlFor="fileInput" className="cursor-pointer text-center">
              <span className="text-blue-500 font-semibold hover:underline">Selecciona un archivo</span>
              <p className="text-slate-500 text-sm mt-1">Formatos soportados: XML o ZIP</p>
            </label>

            {file && (
              <div className="mt-4 bg-slate-800 px-4 py-2 rounded-lg text-sm text-slate-300 font-mono">
                {file.name}
              </div>
            )}
          </div>

          {status === 'success' && (
            <div className="mt-4 flex items-center gap-2 text-green-400 bg-green-400/10 p-3 rounded-xl text-sm">
              <CheckCircle2 className="w-4 h-4" /> Procesado con éxito
            </div>
          )}

          {status === 'partial' && zipResumen && (
            <div className="mt-4 text-amber-300 bg-amber-400/10 p-3 rounded-xl text-sm space-y-2">
              <p>
                <CheckCircle2 className="w-4 h-4 inline mr-1" />
                {zipResumen.exitos} factura(s) nueva(s). {zipResumen.duplicados} duplicada(s) omitida(s).
              </p>
              {zipResumen.detalles
                .filter((d) => d.status === 'duplicado')
                .slice(0, 5)
                .map((d) => (
                  <p key={d.archivo} className="text-xs text-amber-200/80 font-mono truncate">
                    {d.archivo}
                  </p>
                ))}
            </div>
          )}

          {status === 'error' && (
            <div className="mt-4 flex gap-2 text-red-400 bg-red-400/10 p-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg || 'Error al procesar el archivo'}</span>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="animate-spin" /> : 'Procesar ahora'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;