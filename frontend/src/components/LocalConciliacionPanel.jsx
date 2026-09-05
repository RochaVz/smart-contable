import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, FileText, Landmark, Loader2, Search, UploadCloud } from 'lucide-react';
import { getLocalBankMovements, saveLocalBankMovements } from '../services/localBackup';

const fmt = (value) => `$${(Number(value) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const toNumber = (value) => Number(value) || 0;

const parseDate = (value) => {
  const text = String(value || '').trim();
  const iso = text.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;

  const mx = text.match(/(\d{1,2})[-/](\d{1,2})[-/](20\d{2})/);
  if (mx) return `${mx[3]}-${mx[2].padStart(2, '0')}-${mx[1].padStart(2, '0')}`;

  const monthMap = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
  };
  const named = text.toLowerCase().match(/(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\s+(20\d{2})/);
  if (named) return `${named[3]}-${monthMap[named[2]]}-${named[1].padStart(2, '0')}`;

  return '';
};

const parseMoney = (value) => {
  const normalized = String(value || '')
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .replace(/^\((.*)\)$/, '-$1');
  return Math.abs(Number(normalized) || 0);
};

const splitCsvLine = (line) => {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

const parseCsvMovements = (text) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((header) => header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const indexOf = (...names) => headers.findIndex((header) => names.some((name) => header.includes(name)));
  const fechaIndex = indexOf('fecha');
  const descripcionIndex = indexOf('descripcion', 'concepto', 'detalle');
  const referenciaIndex = indexOf('referencia', 'folio');
  const cargoIndex = indexOf('cargo', 'retiro', 'debito');
  const abonoIndex = indexOf('abono', 'deposito', 'credito');
  const montoIndex = indexOf('monto', 'importe');
  const tipoIndex = indexOf('tipo');

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const cargo = cargoIndex >= 0 ? parseMoney(cells[cargoIndex]) : 0;
    const abono = abonoIndex >= 0 ? parseMoney(cells[abonoIndex]) : 0;
    const tipoTexto = tipoIndex >= 0 ? String(cells[tipoIndex] || '').toLowerCase() : '';
    const monto = montoIndex >= 0 ? parseMoney(cells[montoIndex]) : Math.max(cargo, abono);
    const tipo = abono > 0 || tipoTexto.includes('abono') || tipoTexto.includes('credito') ? 'abono' : 'cargo';

    return {
      fecha: parseDate(cells[fechaIndex]),
      descripcion: cells[descripcionIndex] || 'Movimiento bancario',
      referencia: cells[referenciaIndex] || '',
      tipo,
      monto,
    };
  }).filter((movement) => movement.fecha && movement.monto > 0);
};

const extractPdfText = async (file) => {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pageTexts = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => item.str).join(' '));
  }

  return pageTexts.join('\n');
};

const inferType = (line) => {
  const normalized = line.toLowerCase();
  if (/deposito|dep[oó]sito|abono|spei recibido|transferencia recibida|pago recibido|cobro/.test(normalized)) return 'abono';
  if (/cargo|retiro|compra|comisi[oó]n|pago|spei enviado|transferencia enviada|domiciliaci[oó]n/.test(normalized)) return 'cargo';
  return 'cargo';
};

const parsePdfMovements = async (file) => {
  const text = await extractPdfText(file);
  const amountPattern = /\(?-?\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})\)?|\(?-?\$?\s*\d+\.\d{2}\)?/g;

  return text.split(/\n|(?=\d{1,2}[/-]\d{1,2}[/-]20\d{2})/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .map((line) => {
      const fecha = parseDate(line);
      const amounts = line.match(amountPattern) || [];
      if (!fecha || amounts.length === 0) return null;
      const movementAmount = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[amounts.length - 1];
      const monto = parseMoney(movementAmount);
      if (monto <= 0) return null;
      return {
        fecha,
        descripcion: line.replace(amountPattern, '').replace(/\d{1,2}[/-]\d{1,2}[/-]20\d{2}|20\d{2}[/-]\d{1,2}[/-]\d{1,2}/, '').trim() || 'Movimiento bancario',
        referencia: '',
        tipo: inferType(line),
        monto,
      };
    })
    .filter(Boolean);
};

const daysBetween = (dateA, dateB) => {
  const first = new Date(dateA).getTime();
  const second = new Date(dateB).getTime();
  if (Number.isNaN(first) || Number.isNaN(second)) return 999;
  return Math.abs(first - second) / 86400000;
};

const reconcile = (movements, invoices) => {
  const usedInvoices = new Set();
  return movements.map((movement) => {
    const expectedOperation = movement.tipo === 'abono' ? 'VENTA' : 'GASTO';
    const match = invoices.find((invoice) => {
      if (usedInvoices.has(invoice.id)) return false;
      if (invoice.tipo_operacion !== expectedOperation) return false;
      const amountDiff = Math.abs(toNumber(invoice.total) - toNumber(movement.monto));
      return amountDiff <= 1 && daysBetween(invoice.fecha || invoice.fecha_emision, movement.fecha) <= 7;
    });

    if (match) {
      usedInvoices.add(match.id);
      return { ...movement, estado: 'conciliado', factura: match };
    }

    return { ...movement, estado: 'sin_poliza' };
  });
};

const LocalConciliacionPanel = ({ empresa, facturas, mes, anio }) => {
  const [movements, setMovements] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const empresaId = empresa?.id;

  useEffect(() => {
    let cancelled = false;

    Promise.resolve().then(async () => {
      if (!empresaId) return;
      const saved = await getLocalBankMovements(empresaId);
      if (!cancelled) setMovements(saved);
    });

    return () => {
      cancelled = true;
    };
  }, [empresaId]);

  useEffect(() => {
    const handleUpdate = () => {
      Promise.resolve().then(async () => {
        if (!empresaId) return;
        setMovements(await getLocalBankMovements(empresaId));
      });
    };
    window.addEventListener('smartcontable:local-bank-movements-updated', handleUpdate);
    return () => window.removeEventListener('smartcontable:local-bank-movements-updated', handleUpdate);
  }, [empresaId]);

  const facturasPeriodo = useMemo(() => facturas.filter((invoice) => {
    const date = new Date(invoice.fecha || invoice.fecha_emision || '');
    return date.getMonth() + 1 === mes && date.getFullYear() === anio;
  }), [facturas, mes, anio]);

  const movimientosPeriodo = useMemo(() => movements.filter((movement) => {
    const date = new Date(movement.fecha || '');
    return date.getMonth() + 1 === mes && date.getFullYear() === anio;
  }), [movements, mes, anio]);

  const conciliados = useMemo(
    () => reconcile(movimientosPeriodo, facturasPeriodo),
    [movimientosPeriodo, facturasPeriodo],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return conciliados;
    return conciliados.filter((movement) => `${movement.descripcion} ${movement.referencia} ${movement.factura?.emisor || ''}`.toLowerCase().includes(normalized));
  }, [conciliados, query]);

  const resumen = useMemo(() => ({
    movimientos: conciliados.length,
    conciliados: conciliados.filter((movement) => movement.estado === 'conciliado').length,
    sinPoliza: conciliados.filter((movement) => movement.estado === 'sin_poliza').length,
    cargos: conciliados.reduce((sum, movement) => sum + (movement.tipo === 'cargo' ? movement.monto : 0), 0),
    abonos: conciliados.reduce((sum, movement) => sum + (movement.tipo === 'abono' ? movement.monto : 0), 0),
  }), [conciliados]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !empresa) return;

    setUploading(true);
    try {
      const name = file.name.toLowerCase();
      const parsed = name.endsWith('.pdf')
        ? await parsePdfMovements(file)
        : parseCsvMovements(await file.text());
      if (parsed.length === 0) {
        toast.error('No se encontraron movimientos bancarios en el archivo');
        return;
      }
      const result = await saveLocalBankMovements({ company: empresa, movements: parsed, sourceName: file.name });
      toast.success(`${result.nuevos} movimiento(s) cargado(s), ${result.duplicados} duplicado(s)`);
      setMovements(await getLocalBankMovements(empresa.id));
    } catch (error) {
      toast.error(error.message || 'No se pudo parsear el estado de cuenta');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  return (
    <section className="mb-10 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:rounded-3xl sm:p-6">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row">
        <div className="flex items-start gap-3">
          <Landmark className="mt-1 h-6 w-6 shrink-0 text-cyan-400" />
          <div>
            <h2 className="text-lg font-black text-white">Revisión bancaria local</h2>
            <p className="text-xs leading-5 text-slate-500">
              Parsea PDF o CSV del estado de cuenta en este dispositivo y compara contra tus CFDI registrados.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            PDF
            <input type="file" accept=".pdf,application/pdf" onChange={handleUpload} className="hidden" />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-600">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            CSV
            <input type="file" accept=".csv,text/csv" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Movimientos" value={resumen.movimientos} />
        <Metric label="Con póliza" value={resumen.conciliados} tone="emerald" />
        <Metric label="Sin relación" value={resumen.sinPoliza} tone="rose" />
        <Metric label="Banco" value={`${fmt(resumen.abonos)} / ${fmt(resumen.cargos)}`} compact />
      </div>

      <div className="mb-4 flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-slate-500" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar movimiento..."
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-12 text-center text-sm leading-6 text-slate-500">
          Carga un PDF o CSV de estado de cuenta para ver movimientos bancarios y detectar los que no tienen póliza relacionada.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((movement) => (
            <article key={movement.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-500">{movement.fecha}</p>
                  <h3 className="mt-1 break-words text-sm font-black text-white">{movement.descripcion}</h3>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-black uppercase ${movement.tipo === 'abono' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                  {movement.tipo === 'abono' ? 'Abono' : 'Cargo'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
                <div className="min-w-0">
                  {movement.estado === 'conciliado' ? (
                    <p className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" /> Relacionado con {movement.factura?.emisor || 'CFDI'}
                    </p>
                  ) : (
                    <p className="text-xs font-bold text-rose-400">Movimiento sin relación de póliza</p>
                  )}
                  {movement.sourceName && <p className="mt-1 truncate text-[10px] text-slate-600">Origen: {movement.sourceName}</p>}
                </div>
                <p className={`shrink-0 text-base font-black ${movement.tipo === 'abono' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {movement.tipo === 'abono' ? '+' : '-'}{fmt(movement.monto)}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

const Metric = ({ label, value, tone = 'blue', compact = false }) => {
  const colors = {
    blue: 'text-blue-400',
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
  };
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className={`mt-1 font-black ${compact ? 'text-xs' : 'text-2xl'} ${colors[tone] || colors.blue}`}>{value}</p>
    </div>
  );
};

export default LocalConciliacionPanel;