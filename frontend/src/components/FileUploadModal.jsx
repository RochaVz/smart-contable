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

const isDuplicateError = (error) => {
  const detail = error?.response?.data?.detail;
  const message = typeof detail === 'string' ? detail : error?.message || '';
  return error?.response?.status === 409 || message.toLowerCase().includes('ya est');
};

const isSkippedPaymentComplement = (data) => data?.omitido && data?.motivo === 'complemento_pago';

const normalizeUploadDetail = (detail) => ({
  archivo: detail?.archivo || 'Sin nombre',
  status: detail?.status || 'error',
  uuid: detail?.uuid || null,
  detalle: detail?.detalle || null,
  tipoOperacion: detail?.tipoOperacion || detail?.tipo_operacion || null,
  polizasGeneradas: detail?.polizasGeneradas ?? detail?.polizas_generadas ?? null,
});

const getStatusBadgeClasses = (status) => {
  switch (status) {
    case 'ok':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
    case 'duplicado':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
    case 'omitido_complemento_pago':
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20';
    default:
      return 'bg-rose-500/15 text-rose-300 border-rose-500/20';
  }
};

const getStatusLabel = (status) => {
  switch (status) {
    case 'ok':
      return 'Cargado';
    case 'duplicado':
      return 'Duplicado';
    case 'omitido_complemento_pago':
      return 'Complemento omitido';
    default:
      return 'Error';
  }
};

const DETAIL_FILTERS = [
  { id: 'todos', label: 'Todos' },
  { id: 'ok', label: 'Cargados' },
  { id: 'duplicado', label: 'Duplicados' },
  { id: 'omitido_complemento_pago', label: 'Complementos' },
  { id: 'error', label: 'Errores' },
];

const getUploadConfig = (filename, empresaId) => {
  const lowerName = String(filename || '').toLowerCase();
  if (lowerName.endsWith('.xml')) {
    return {
      endpoint: `/facturas/subir-xml?empresa_id=${empresaId}`,
      successLabel: 'CFDI cargado correctamente',
    };
  }
  if (lowerName.endsWith('.zip')) {
    return {
      endpoint: `/facturas/subir-zip?empresa_id=${empresaId}`,
      successLabel: 'Lote CFDI procesado correctamente',
    };
  }
  return null;
};

const FileUploadModal = ({
  isOpen,
  onClose,
  empresaId,
  empresaRfc,
  empresaNombre,
  onUploadSuccess,
}) => {
  const [files, setFiles] = useState([]);
  const [uploading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadSummary, setUploadSummary] = useState(null);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, fileName: '' });
  const [uploadStats, setUploadStats] = useState({ exitos: 0, duplicados: 0, omitidosComplementoPago: 0, errores: 0 });
  const [uploadDetails, setUploadDetails] = useState([]);
  const [detailFilter, setDetailFilter] = useState('todos');

  const getFilterCount = (filterId) => {
    switch (filterId) {
      case 'ok':
        return uploadDetails.filter((detail) => detail.status === 'ok').length;
      case 'duplicado':
        return uploadDetails.filter((detail) => detail.status === 'duplicado').length;
      case 'omitido_complemento_pago':
        return uploadDetails.filter((detail) => detail.status === 'omitido_complemento_pago').length;
      case 'error':
        return uploadDetails.filter((detail) => detail.status === 'error').length;
      default:
        return uploadDetails.length;
    }
  };

  const filteredUploadDetails = detailFilter === 'todos'
    ? uploadDetails
    : uploadDetails.filter((detail) => detail.status === detailFilter);

  const resetState = () => {
    setFiles([]);
    setStatus(null);
    setErrorMsg('');
    setUploadSummary(null);
    setUploadProgress({ current: 0, total: 0, fileName: '' });
    setUploadStats({ exitos: 0, duplicados: 0, omitidosComplementoPago: 0, errores: 0 });
    setUploadDetails([]);
    setDetailFilter('todos');
  };

  const handleClose = () => {
    if (uploading) return;
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  const handleUpload = async () => {
    if (files.length === 0) return;

    const zipFiles = files.filter((file) => file.name.toLowerCase().endsWith('.zip'));
    const xmlFiles = files.filter((file) => file.name.toLowerCase().endsWith('.xml'));
    const invalidFiles = files.filter(
      (file) => !file.name.toLowerCase().endsWith('.xml') && !file.name.toLowerCase().endsWith('.zip'),
    );

    if (invalidFiles.length > 0) {
      setStatus('error');
      setErrorMsg('Selecciona un archivo XML o ZIP con CFDI');
      return;
    }
    if (zipFiles.length > 1) {
      setStatus('error');
      setErrorMsg('Solo puedes cargar un archivo ZIP a la vez');
      return;
    }
    if (zipFiles.length === 1 && xmlFiles.length > 0) {
      setStatus('error');
      setErrorMsg('Carga un ZIP o varios XML, pero no mezcles ambos tipos');
      return;
    }

    setLoading(true);
    setStatus(null);
    setErrorMsg('');
    setUploadSummary(null);
    setUploadProgress({ current: 0, total: files.length, fileName: '' });
    setUploadStats({ exitos: 0, duplicados: 0, omitidosComplementoPago: 0, errores: 0 });
    setUploadDetails([]);
    setDetailFilter('todos');

    try {
      let shouldRefresh = false;
      if (zipFiles.length === 1) {
        const zipFile = zipFiles[0];
        const config = getUploadConfig(zipFile.name, empresaId);
        const formData = new FormData();
        formData.append('archivo', zipFile);
        setUploadProgress({ current: 1, total: 1, fileName: zipFile.name });

        const { data } = await api.post(config.endpoint, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        setUploadStats({
          exitos: data.exitos ?? 0,
          duplicados: data.duplicados ?? 0,
          omitidosComplementoPago: data.omitidos_complemento_pago ?? 0,
          errores: data.errores ?? 0,
        });
        shouldRefresh = (data.exitos ?? 0) > 0;

        setUploadSummary({
          label: isSkippedPaymentComplement(data) ? 'Complemento de pago omitido' : config.successLabel,
          uuid: data.uuid,
          detalle: data.detalle,
          tipoOperacion: data.tipo_operacion,
          polizasGeneradas: data.polizas_generadas,
          exitos: data.exitos,
          duplicados: data.duplicados,
          omitidosComplementoPago: data.omitidos_complemento_pago,
          errores: data.errores,
        });
        setUploadDetails(
          (data.detalles || []).map((detail) => normalizeUploadDetail(detail)).length > 0
            ? (data.detalles || []).map((detail) => normalizeUploadDetail(detail))
            : [
                normalizeUploadDetail({
                  archivo: zipFile.name,
                  status: isSkippedPaymentComplement(data) ? 'omitido_complemento_pago' : 'ok',
                  uuid: data.uuid,
                  detalle: data.detalle,
                  tipoOperacion: data.tipo_operacion,
                  polizasGeneradas: data.polizas_generadas,
                }),
              ],
        );
      } else {
        const results = {
          exitos: 0,
          duplicados: 0,
          omitidosComplementoPago: 0,
          errores: 0,
          polizasGeneradas: 0,
          ultimoUuid: null,
          ultimoTipoOperacion: null,
        };
        const detailRows = [];

        for (const file of xmlFiles) {
          const config = getUploadConfig(file.name, empresaId);
          const formData = new FormData();
          formData.append('archivo', file);
          setUploadProgress({ current: results.exitos + results.duplicados + results.errores + 1, total: xmlFiles.length, fileName: file.name });

          try {
            const { data } = await api.post(config.endpoint, formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (isSkippedPaymentComplement(data)) {
              results.omitidosComplementoPago += 1;
              detailRows.push(normalizeUploadDetail({
                archivo: file.name,
                status: 'omitido_complemento_pago',
                uuid: data.uuid,
                detalle: data.detalle,
              }));
            } else {
              results.exitos += 1;
              results.polizasGeneradas += data.polizas_generadas ?? 0;
              results.ultimoUuid = data.uuid;
              results.ultimoTipoOperacion = data.tipo_operacion;
              detailRows.push(normalizeUploadDetail({
                archivo: file.name,
                status: 'ok',
                uuid: data.uuid,
                tipoOperacion: data.tipo_operacion,
                polizasGeneradas: data.polizas_generadas,
              }));
            }
          } catch (error) {
            if (isDuplicateError(error)) {
              results.duplicados += 1;
              detailRows.push(normalizeUploadDetail({
                archivo: file.name,
                status: 'duplicado',
                detalle: formatErrorDetail(error.response?.data?.detail) || error.message,
              }));
            } else {
              results.errores += 1;
              detailRows.push(normalizeUploadDetail({
                archivo: file.name,
                status: 'error',
                detalle: formatErrorDetail(error.response?.data?.detail) || error.message,
              }));
            }
          }
          setUploadStats({
            exitos: results.exitos,
            duplicados: results.duplicados,
            omitidosComplementoPago: results.omitidosComplementoPago,
            errores: results.errores,
          });
        }

        if (results.exitos === 0 && results.duplicados === 0 && results.omitidosComplementoPago === 0) {
          throw new Error('No se pudo cargar ningún CFDI del lote seleccionado');
        }

        setUploadSummary({
          label: results.exitos === 0 && results.omitidosComplementoPago > 0 && results.duplicados === 0 && results.errores === 0
            ? 'Complementos de pago omitidos'
            : results.exitos === 1 && xmlFiles.length === 1
              ? 'CFDI cargado correctamente'
            : 'Lote CFDI procesado correctamente',
          uuid: results.exitos === 1 && xmlFiles.length === 1 ? results.ultimoUuid : null,
          detalle: results.exitos === 0 && results.omitidosComplementoPago > 0 && results.duplicados === 0 && results.errores === 0
            ? 'Los archivos seleccionados corresponden a complementos de pago y fueron omitidos.'
            : null,
          tipoOperacion: results.exitos === 1 && xmlFiles.length === 1 ? results.ultimoTipoOperacion : null,
          polizasGeneradas: results.polizasGeneradas,
          exitos: results.exitos,
          duplicados: results.duplicados,
          omitidosComplementoPago: results.omitidosComplementoPago,
          errores: results.errores,
        });
        setUploadDetails(detailRows);
        shouldRefresh = results.exitos > 0;
      }

      setStatus('success');

      if (shouldRefresh && onUploadSuccess) onUploadSuccess();

      setTimeout(() => {
        resetState();
        onClose();
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
          <h3 className="text-xl font-bold text-white">Cargar CFDI</h3>
          <button onClick={handleClose} disabled={uploading} className="text-slate-500 hover:text-white disabled:opacity-50">
            <X />
          </button>
        </div>

        <div className="p-8">
          <p className="text-slate-400 text-sm mb-4 leading-relaxed">
            Sube uno o varios CFDI en formato <span className="text-blue-400">XML</span> o un archivo <span className="text-blue-400">ZIP</span> con varios XML.
            {empresaNombre || empresaRfc ? ' El sistema validará que pertenezcan a la empresa activa.' : ''}
          </p>

          <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all ${files.length > 0 ? 'border-blue-500 bg-blue-500/5' : 'border-slate-800 hover:border-slate-700'}`}>
            <Upload className={`w-12 h-12 mb-4 ${files.length > 0 ? 'text-blue-400' : 'text-slate-600'}`} />
            
            <input 
              type="file" 
              accept=".xml,.zip" 
              multiple
              className="hidden" 
              id="cfdiFileInput" 
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            
            <label htmlFor="cfdiFileInput" className="cursor-pointer text-center">
              <span className="text-blue-500 font-semibold hover:underline">Selecciona un archivo</span>
              <p className="text-slate-500 text-sm mt-1">Formatos soportados: XML, ZIP · Puedes elegir varios XML</p>
            </label>

            {files.length > 0 && (
              <div className="mt-4 w-full space-y-2">
                <div className="bg-slate-800 px-4 py-2 rounded-lg text-sm text-slate-300">
                  {files.length} archivo(s) seleccionado(s)
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {files.slice(0, 6).map((selectedFile) => (
                    <div
                      key={`${selectedFile.name}-${selectedFile.size}-${selectedFile.lastModified}`}
                      className="bg-slate-950 px-3 py-2 rounded-lg text-xs text-slate-400 font-mono"
                    >
                      {selectedFile.name}
                    </div>
                  ))}
                  {files.length > 6 && (
                    <div className="text-xs text-slate-500 text-center">
                      +{files.length - 6} archivo(s) más
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {status === 'success' && uploadSummary && (
            <div className="mt-4 text-green-400 bg-green-400/10 p-3 rounded-xl text-sm space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {uploadSummary.label}
              </p>
              {uploadSummary.exitos === 0 && (uploadSummary.omitidosComplementoPago ?? 0) > 0 ? (
                <>
                  {uploadSummary.detalle && (
                    <p className="text-xs text-green-300">{uploadSummary.detalle}</p>
                  )}
                  <p className="text-xs text-green-300">
                    Exitosos: {uploadSummary.exitos ?? 0} | Duplicados: {uploadSummary.duplicados ?? 0} | Complementos omitidos: {uploadSummary.omitidosComplementoPago ?? 0} | Errores: {uploadSummary.errores ?? 0}
                  </p>
                </>
              ) : uploadSummary.uuid ? (
                <>
                  <p className="text-xs text-green-300">UUID: {uploadSummary.uuid}</p>
                  <p className="text-xs text-green-300">
                    Tipo: {uploadSummary.tipoOperacion || 'N/D'} | Pólizas generadas: {uploadSummary.polizasGeneradas ?? 0}
                  </p>
                </>
              ) : (
                <p className="text-xs text-green-300">
                  Exitosos: {uploadSummary.exitos ?? 0} | Duplicados: {uploadSummary.duplicados ?? 0} | Complementos omitidos: {uploadSummary.omitidosComplementoPago ?? 0} | Errores: {uploadSummary.errores ?? 0}
                </p>
              )}
            </div>
          )}

          {status === 'success' && uploadDetails.length > 0 && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">Resultado por archivo</p>
                <span className="text-xs text-slate-500">{uploadDetails.length} registro(s)</span>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {DETAIL_FILTERS.map((filter) => {
                  const active = detailFilter === filter.id;
                  return (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setDetailFilter(filter.id)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-blue-500 bg-blue-500/20 text-blue-200'
                          : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                      }`}
                    >
                      {filter.label} ({getFilterCount(filter.id)})
                    </button>
                  );
                })}
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {filteredUploadDetails.map((detail, index) => (
                  <div
                    key={`${detail.archivo}-${detail.uuid || detail.status}-${index}`}
                    className="rounded-xl border border-slate-800 bg-slate-900/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-200">{detail.archivo}</p>
                        {detail.uuid && (
                          <p className="mt-1 truncate text-xs text-slate-500">UUID: {detail.uuid}</p>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${getStatusBadgeClasses(detail.status)}`}>
                        {getStatusLabel(detail.status)}
                      </span>
                    </div>
                    {(detail.detalle || detail.tipoOperacion || detail.polizasGeneradas !== null) && (
                      <div className="mt-2 space-y-1 text-xs text-slate-400">
                        {detail.detalle && <p>{detail.detalle}</p>}
                        {(detail.tipoOperacion || detail.polizasGeneradas !== null) && (
                          <p>
                            {detail.tipoOperacion ? `Tipo: ${detail.tipoOperacion}` : 'Tipo: N/D'}
                            {detail.polizasGeneradas !== null ? ` | Pólizas: ${detail.polizasGeneradas}` : ''}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {filteredUploadDetails.length === 0 && (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-center text-xs text-slate-500">
                    No hay archivos en esta categoría.
                  </div>
                )}
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="mt-4 flex gap-2 text-red-400 bg-red-400/10 p-3 rounded-xl text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {uploading && uploadProgress.total > 0 && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/80 p-3">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Procesando {Math.min(uploadProgress.current, uploadProgress.total)} de {uploadProgress.total}
                </span>
                <span>
                  {Math.round((Math.min(uploadProgress.current, uploadProgress.total) / uploadProgress.total) * 100)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${(Math.min(uploadProgress.current, uploadProgress.total) / uploadProgress.total) * 100}%` }}
                />
              </div>
              {uploadProgress.fileName && (
                <p className="mt-2 truncate text-xs text-slate-500">
                  Archivo actual: {uploadProgress.fileName}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Exitosos: {uploadStats.exitos} | Duplicados: {uploadStats.duplicados} | Complementos omitidos: {uploadStats.omitidosComplementoPago} | Errores: {uploadStats.errores}
              </p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className="w-full mt-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 className="animate-spin" /> : 'Procesar CFDI'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FileUploadModal;