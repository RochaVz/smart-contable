import { X, Download, Loader2 } from 'lucide-react';

const ExportPreviewModal = ({ isOpen, onClose, title, content, loading, onDownload }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4">
      <div className="w-full max-w-4xl max-h-[80vh] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="text-sm text-slate-500">Revisa el contenido antes de descargarlo.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-auto bg-slate-950/70 p-4" style={{ maxHeight: '60vh' }}>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generando vista previa...
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words text-sm text-slate-300">{content}</pre>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800 sm:w-auto"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.75 text-sm font-bold text-white shadow-lg shadow-emerald-900/30 transition-all hover:bg-emerald-500 hover:shadow-emerald-800/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <Download className="h-4 w-4" />
            Descargar CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportPreviewModal;
