import { Fragment, useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import {
  FileText, UploadCloud,
  Loader2, BrainCircuit, ChevronUp, ChevronDown, Download, Calendar,
  BookOpen, Settings2, Trash2, MoreHorizontal, FileBarChart,
} from 'lucide-react';
import toast from 'react-hot-toast';
import FileUploadModal from '../components/FileUploadModal';
import ClassifyModal from '../components/ClassifyModal';
import FacturaDetailModal from '../components/FacturaDetailModal';
import ExportPreviewModal from '../components/ExportPreviewModal';
import CompanyShell from '../components/executive/CompanyShell';
import ExecutiveDashboard from '../components/executive/ExecutiveDashboard';
import InteligenciaView from '../components/executive/InteligenciaView';
import InformesView from '../components/executive/InformesView';
import ConfiguracionView from '../components/executive/ConfiguracionView';
import BalancePanel from '../components/executive/BalancePanel';
import useExecutiveSnapshot from '../hooks/useExecutiveSnapshot';
import PolizasPanel from '../components/PolizasPanel';
import ComisionesBancoPanel from '../components/ComisionesBancoPanel';
import ConciliacionBancariaPanel from '../components/ConciliacionBancariaPanel';
import InformesPanel from '../components/InformesPanel';
import LocalConciliacionPanel from '../components/LocalConciliacionPanel';
import FiscalConsolidadosPanel from '../components/FiscalConsolidadosPanel';
import { getHubItem, hubHomePath, legacyQueryToHubPath } from '../navigation/companyHub';
import { INTELIGENCIA_CATEGORIAS } from '../navigation/executive';
import {
  esIngreso,
  getContraparteFactura,
  getFechaFactura,
  getPeriodoFactura,
  parseFechaFactura,
  toNumber,
} from '../utils/facturas';
import { downloadCsv } from '../utils/csv';
import { downloadBlob, filenameFromContentDisposition } from '../utils/download';
import { deleteLocalInvoice, getLocalCompany, getLocalInvoices } from '../services/localBackup';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const formatFecha = (fecha) => {
  if (!fecha) return 'Sin fecha';
  const match = String(fecha).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(fecha);
  if (Number.isNaN(date.getTime())) return fecha;
  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const formatMoney = (value) =>
  `$${toNumber(value).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;

const getConceptoFactura = (factura) => {
  if (factura?.concepto) return String(factura.concepto).trim();
  const conceptos = factura?.conceptos || factura?.conceptos_vendidos || [];
  const descripciones = conceptos
    .map((item) => (item?.descripcion || '').trim())
    .filter(Boolean);
  if (descripciones.length === 0) return 'Sin concepto';
  if (descripciones.length === 1) return descripciones[0];
  return `${descripciones[0]} (+${descripciones.length - 1} más)`;
};

const agruparPorFecha = (lista) => lista.reduce((acc, factura) => {
  const fecha = getFechaFactura(factura) || 'Sin fecha';
  if (!acc[fecha]) acc[fecha] = [];
  acc[fecha].push(factura);
  return acc;
}, {});

const PANELES_MOVIMIENTO = [
  { id: 'ingresos', label: 'Ingresos', descripcion: 'Facturas emitidas' },
  { id: 'egresos', label: 'Egresos', descripcion: 'Facturas recibidas' },
  { id: 'iva', label: 'IVA del periodo', descripcion: 'Causado y acreditable' },
];

const CompanyDetail = ({ vista = null }) => {
  const { id, moduloId, reporteId, categoria, informe } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hoy = useMemo(() => new Date(), []);

  const hubKind = moduloId ? 'modulos' : reporteId ? 'reportes' : null;
  const hubSlug = moduloId || reporteId || null;
  const vistaActiva = useMemo(
    () => (hubKind && hubSlug ? getHubItem(hubKind, hubSlug) : null),
    [hubKind, hubSlug],
  );
  const vistaActual = vistaActiva ? 'modulo' : (vista || 'dashboard');
  const seccion = vistaActiva?.seccion || 'historial';
  const tabActual = vistaActiva?.tab || (seccion === 'informes' ? 'resumen' : null);

  const [refreshTick, setRefreshTick] = useState(0);
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClassifyOpen, setIsClassifyOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedFactura, setSelectedFactura] = useState(null);
  const [selectedRfc, setSelectedRfc] = useState('');
  const [selectedClasificacion, setSelectedClasificacion] = useState('');
  const [classificationRefresh, setClassificationRefresh] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'fecha', direction: 'desc' });
  const [mesFiltro, setMesFiltro] = useState(hoy.getMonth() + 1);
  const [anioFiltro, setAnioFiltro] = useState(hoy.getFullYear());
  const [empresa, setEmpresa] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [filtroMovimiento, setFiltroMovimiento] = useState('ninguno');
  const [exportandoEmpresa, setExportandoEmpresa] = useState(false);
  const [tipoExportacion, setTipoExportacion] = useState('todo');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  // Compatibilidad con URLs antiguas ?seccion=&tab=
  useEffect(() => {
    if (moduloId || reporteId) return;
    const legacySeccion = searchParams.get('seccion');
    const legacyTab = searchParams.get('tab');
    if (!legacySeccion && !legacyTab) return;
    navigate(legacyQueryToHubPath(id, legacySeccion || 'historial', legacyTab), { replace: true });
  }, [id, moduloId, reporteId, navigate, searchParams]);

  // Ruta desconocida de módulo/reporte → hub
  useEffect(() => {
    if ((moduloId || reporteId) && !vistaActiva) {
      navigate(hubHomePath(id), { replace: true });
    }
  }, [id, moduloId, reporteId, vistaActiva, navigate]);

  const irADestino = useCallback((destino) => {
    if (destino === 'bancos') navigate(`/empresa/${id}/modulos/conciliacion`);
    else if (destino === 'sat') navigate(`/empresa/${id}/modulos/fiscal`);
    else navigate(`/empresa/${id}/inteligencia/${destino}`);
  }, [id, navigate]);
  const isLocalCompany = String(id).startsWith('local-');

  const abrirClasificacionProveedor = (proveedor) => {
    setSelectedRfc(proveedor.rfc);
    setSelectedClasificacion(proveedor.clasificacion === 'Por clasificar' ? '' : proveedor.clasificacion);
    setIsClassifyOpen(true);
  };

  const handleClassificationSuccess = () => {
    handleRefresh();
    setClassificationRefresh((value) => value + 1);
  };

  const handlePeriodoChange = useCallback((mes, anio) => {
    setMesFiltro(mes);
    setAnioFiltro(anio);
  }, []);

  const fetchDatos = useCallback(async () => {
    try {
      if (String(id).startsWith('local-')) {
        const [localEmpresa, localFacturas] = await Promise.all([
          getLocalCompany(id),
          getLocalInvoices(id),
        ]);
        setEmpresa(localEmpresa || { id, razon_social: `Negocio local`, rfc: '' });
        setFacturas(Array.isArray(localFacturas) ? localFacturas : []);
        return;
      }

      const [facturasRes, empresaRes] = await Promise.all([
        api.get(`/facturas/?empresa_id=${id}`),
        api.get(`/empresas/${id}`),
      ]);
      setFacturas(Array.isArray(facturasRes.data) ? facturasRes.data : []);
      setEmpresa(empresaRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    queueMicrotask(fetchDatos);
  }, [fetchDatos]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    setRefreshTick((value) => value + 1);
    fetchDatos();
  }, [fetchDatos]);

  const lectura = useExecutiveSnapshot({
    empresaId: id,
    esLocal: isLocalCompany,
    facturas,
    mes: mesFiltro,
    anio: anioFiltro,
    refreshToken: refreshTick,
    enabled: ['dashboard', 'inteligencia', 'informes'].includes(vistaActual),
  });

  const downloadExport = async () => {
    if (isLocalCompany) {
      handleExportCsv();
      setIsPreviewOpen(false);
      return;
    }

    setExportandoEmpresa(true);
    try {
      const res = await api.get(`/empresas/${id}/exportar-csv`, {
        params: { tipo: tipoExportacion, mes: mesFiltro, anio: anioFiltro },
        responseType: 'blob',
      });
      const nombre = filenameFromContentDisposition(res.headers['content-disposition'])
        || `SmartContable_${empresa?.rfc || id}_${anioFiltro}-${String(mesFiltro).padStart(2, '0')}.csv`;
      downloadBlob(res.data, nombre);
      toast.success('CSV descargado - Listo para Google Sheets');
      setIsPreviewOpen(false);
    } catch (err) {
      let mensaje = 'No se pudo exportar la empresa';
      const data = err.response?.data;
      if (data instanceof Blob) {
        try {
          const parsed = JSON.parse(await data.text());
          mensaje = parsed.detail || mensaje;
        } catch {
          /* respuesta no JSON */
        }
      } else if (data?.detail) {
        mensaje = typeof data.detail === 'string' ? data.detail : mensaje;
      }
      toast.error(mensaje);
    } finally {
      setExportandoEmpresa(false);
    }
  };

  const handlePreviewExport = async () => {
    setPreviewLoading(true);
    setPreviewContent('');
    setIsPreviewOpen(true);
    if (isLocalCompany) {
      setPreviewContent(JSON.stringify({ empresa, facturas: facturasVisibles }, null, 2));
      setPreviewLoading(false);
      return;
    }

    try {
      const res = await api.get(`/empresas/${id}/exportar-csv`, {
        params: { tipo: tipoExportacion, mes: mesFiltro, anio: anioFiltro },
        responseType: 'blob',
      });
      const text = await res.data.text();
      setPreviewContent(text || 'No hay contenido para mostrar.');
    } catch (err) {
      const mensaje = err.response?.data?.detail || 'No se pudo generar la vista previa';
      setPreviewContent(`Error: ${mensaje}`);
      toast.error(mensaje);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleEliminarFactura = async (factura, e) => {
    e.stopPropagation();
    const etiqueta = factura.emisor || factura.uuid;
    const ok = window.confirm(
      `¿Eliminar esta factura?\n\n${etiqueta}\nUUID: ${factura.uuid}\n\n`
      + 'También se eliminarán las pólizas contables vinculadas.',
    );
    if (!ok) return;

    setDeletingId(factura.id);
    try {
      if (factura.local_only) {
        await deleteLocalInvoice(factura.id);
      } else {
        await api.delete(`/facturas/${factura.id}`);
      }
      toast.success('Factura eliminada');
      if (selectedFactura?.id === factura.id) {
        setIsDetailOpen(false);
        setSelectedFactura(null);
      }
      handleRefresh();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo eliminar la factura');
    } finally {
      setDeletingId(null);
    }
  };

  const requestSort = (key) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') direction = 'asc';
    setSortConfig({ key, direction });
  };

  const aniosDisponibles = useMemo(() => {
    const anios = new Set([hoy.getFullYear()]);
    facturas.forEach((f) => {
      const periodo = getPeriodoFactura(f);
      if (periodo) anios.add(periodo.anio);
    });
    return [...anios].sort((a, b) => b - a);
  }, [facturas, hoy]);

  const facturasPeriodo = useMemo(() => facturas.filter((f) => {
    const periodo = getPeriodoFactura(f);
    return periodo?.mes === mesFiltro && periodo?.anio === anioFiltro;
  }), [facturas, mesFiltro, anioFiltro]);

  const facturasProcesadas = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return [...facturasPeriodo].filter((f) =>
          (getContraparteFactura(f) || '').toLowerCase().includes(term)
          || (f.nombre_emisor || f.emisor || '').toLowerCase().includes(term)
          || (f.nombre_receptor || f.receptor || '').toLowerCase().includes(term)
          || (f.uuid || '').toLowerCase().includes(term)
          || getConceptoFactura(f).toLowerCase().includes(term)
        ).sort((a, b) => {
      if (sortConfig.key === 'fecha') {
        const dateA = parseFechaFactura(a)?.getTime() || 0;
        const dateB = parseFechaFactura(b)?.getTime() || 0;
        return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
      }
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [facturasPeriodo, searchTerm, sortConfig]);

  const facturasIngresos = useMemo(
    () => facturasProcesadas.filter(esIngreso),
    [facturasProcesadas],
  );
  const facturasEgresos = useMemo(
    () => facturasProcesadas.filter((f) => !esIngreso(f)),
    [facturasProcesadas],
  );

  const facturasVisibles = filtroMovimiento === 'ingresos'
    ? facturasIngresos
    : filtroMovimiento === 'egresos'
      ? facturasEgresos
      : [];

  const seccionesFacturas = useMemo(() => {
    if (filtroMovimiento === 'ingresos') {
      return [{ id: 'ingresos', titulo: 'Ingresos', lista: facturasIngresos, acento: 'emerald' }];
    }
    if (filtroMovimiento === 'egresos') {
      return [{ id: 'egresos', titulo: 'Egresos', lista: facturasEgresos, acento: 'rose' }];
    }
    return [];
  }, [filtroMovimiento, facturasIngresos, facturasEgresos]);

  const ivaComparativo = useMemo(() => facturasPeriodo.reduce((acc, factura) => {
    const iva = toNumber(factura.iva ?? factura.iva_trasladado);
    if (esIngreso(factura)) acc.causado += iva;
    else acc.acreditable += iva;
    return acc;
  }, { causado: 0, acreditable: 0 }), [facturasPeriodo]);

  const totalesMovimiento = useMemo(() => {
    const sumar = (lista) => lista.reduce((acc, f) => {
      acc.total += esIngreso(f) ? toNumber(f.subtotal) : toNumber(f.total);
      acc.conteo += 1;
      return acc;
    }, { total: 0, conteo: 0 });

    const ing = sumar(facturasPeriodo.filter(esIngreso));
    const egr = sumar(facturasPeriodo.filter((f) => !esIngreso(f)));
    return {
      ingresos: ing.total,
      egresos: egr.total,
      neto: ing.total - egr.total,
      conteoIngresos: ing.conteo,
      conteoEgresos: egr.conteo,
    };
  }, [facturasPeriodo]);

  const activarPanelMovimiento = useCallback((panelId) => {
    setFiltroMovimiento((current) => (current === panelId ? 'ninguno' : panelId));
  }, []);

  const handleExportCsv = () => {
    const rows = facturasVisibles.map((f) => ({
      Fecha: f.fecha,
      Tipo: esIngreso(f) ? 'Ingreso' : 'Egreso',
          Emisor: f.nombre_emisor || f.emisor,
          Receptor: f.nombre_receptor || f.receptor,
          Contraparte: getContraparteFactura(f),
          Concepto: getConceptoFactura(f),
          RFC: f.rfc_emisor,
          Cliente: f.nombre_cliente || f.nombre_receptor || '',
          FormaPago: f.forma_pago_label || f.forma_pago || '',
          MetodoPago: f.metodo_pago || '',
          Subtotal: f.subtotal,
          IVA: f.iva,
          IVARetenido: f.iva_retenido,
          ISRRetenido: f.isr_retenido,
          Total: f.total,
          CuentaContable: f.cuenta_contable,
          TienePoliza: f.tiene_poliza ? 'Si' : 'No',
          UUID: f.uuid,
        }));
        downloadCsv(`facturas_empresa_${id}.csv`, rows);
      };

      const handlePurgarPeriodo = async () => {
        if (!id || String(id).startsWith('local-')) {
          toast.error('La purga de periodo solo está disponible en el servidor');
          return;
        }
        const ok = window.confirm(
          `¿Eliminar todos los datos de ${String(mesFiltro).padStart(2, '0')}/${anioFiltro}?\n\n`
          + 'Se borrarán facturas, pólizas y movimientos bancarios del mes para poder volver a cargar XMLs o PDFs.',
        );
        if (!ok) return;
        try {
          const res = await api.delete(
            `/empresas/${id}/periodo?mes=${mesFiltro}&anio=${anioFiltro}`,
          );
          toast.success(res.data?.mensaje || 'Periodo limpiado');
          await handleRefresh?.();
          // recargar datos del negocio
          const [facturasRes, empresaRes] = await Promise.all([
            api.get(`/facturas/?empresa_id=${id}`),
            api.get(`/empresas/${id}`),
          ]);
          setFacturas(facturasRes.data || []);
          setEmpresa(empresaRes.data);
        } catch (err) {
          toast.error(err.response?.data?.detail || 'No se pudo limpiar el periodo');
        }
      };

  const statsIva = useMemo(() => facturasPeriodo.reduce((acc, f) => {
    const total = toNumber(f.total);
    const iva = toNumber(f.iva ?? f.iva_trasladado);
    acc.ivaEstimado += iva || total * 0.16;
    return acc;
  }, { ivaEstimado: 0 }), [facturasPeriodo]);

  const chartData = useMemo(() => {
    const meses = MESES.map((nombre, index) => ({
      name: nombre.slice(0, 3).toUpperCase(),
      fullName: nombre,
      mes: index + 1,
      ingresos: 0,
      egresos: 0,
    }));

    facturas.forEach((f) => {
      const periodo = getPeriodoFactura(f);
      if (!periodo || periodo.anio !== anioFiltro) return;
      const item = meses[periodo.mes - 1];
      const venta = f.tipo_operacion === 'VENTA';
      const total = venta ? toNumber(f.subtotal) : toNumber(f.total);
      if (venta) item.ingresos += total;
      else item.egresos += total;
    });

    return meses;
  }, [facturas, anioFiltro]);

  const chartMax = useMemo(
    () => Math.max(...chartData.map((item) => Math.max(item.ingresos, item.egresos)), 0),
    [chartData],
  );

  const chartDataVisible = useMemo(
    () => chartData.filter((item) => item.ingresos > 0 || item.egresos > 0 || item.mes === mesFiltro),
    [chartData, mesFiltro],
  );

  const renderFilaFactura = (f) => (
    <tr
      key={f.id}
      onClick={() => { setSelectedFactura(f); setIsDetailOpen(true); }}
      className="hover:bg-slate-800/50 cursor-pointer transition-colors"
    >
      <td className="p-4 text-sm text-slate-400">{getFechaFactura(f)}</td>
      <td className="p-4">
        <span
          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
            esIngreso(f)
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-rose-500/15 text-rose-400'
          }`}
        >
          {esIngreso(f) ? 'Ingreso' : 'Egreso'}
        </span>
      </td>
      <td className="p-4">
              <p className="font-medium text-white">{getContraparteFactura(f)}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {esIngreso(f)
                  ? `Emisor: ${f.nombre_emisor || f.emisor || '—'} · Receptor: ${f.nombre_receptor || f.receptor || '—'}`
                  : `Emisor: ${f.nombre_emisor || f.emisor || '—'} · Receptor: ${f.nombre_receptor || f.receptor || '—'}`}
              </p>
              <p className="cfdi-concepto mt-1 line-clamp-2 text-sm font-bold text-slate-300">
                {getConceptoFactura(f)}
              </p>
            </td>
      <td className={`p-4 text-right font-black ${esIngreso(f) ? 'text-emerald-400' : 'text-rose-400'}`}>
        {esIngreso(f) ? '+' : '−'}${f.total.toLocaleString()}
      </td>
      <td className="p-4">
        {(f.cuenta_contable || '').includes('CLASIFICAR') ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSelectedRfc(f.rfc_emisor); setIsClassifyOpen(true); }}
            className="text-amber-500 text-xs font-bold hover:underline"
          >
            <BrainCircuit className="inline w-3 h-3" /> Clasificar
          </button>
        ) : (
          <span className="text-emerald-400 text-xs font-bold">{f.cuenta_contable}</span>
        )}
      </td>
      <td className="p-4 text-center text-[10px] font-mono text-slate-500">
        {f.uuid.substring(0, 10)}…
      </td>
      <td className="p-4 text-center">
        <button
          type="button"
          title="Eliminar factura"
          disabled={deletingId === f.id}
          onClick={(e) => handleEliminarFactura(f, e)}
          className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
        >
          {deletingId === f.id ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
        </button>
      </td>
    </tr>
  );

  const renderFacturaCard = (f) => (
    <button
      key={f.id}
      type="button"
      onClick={() => { setSelectedFactura(f); setIsDetailOpen(true); }}
      className="w-full rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-left transition-colors active:border-blue-500"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500">{formatFecha(getFechaFactura(f))}</p>
          <h4 className="mt-1 line-clamp-2 break-words text-sm font-black text-white">{getContraparteFactura(f)}</h4>
                    <p className="mt-0.5 text-[10px] text-slate-500">
                      Emisor: {f.nombre_emisor || f.emisor || '—'} · Receptor: {f.nombre_receptor || f.receptor || '—'}
          </p>
                    <p className="cfdi-concepto mt-1 line-clamp-2 text-sm font-bold text-slate-300">
                      {getConceptoFactura(f)}
                    </p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-black uppercase ${
            esIngreso(f)
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'bg-rose-500/15 text-rose-400'
          }`}
        >
          {esIngreso(f) ? 'Ingreso' : 'Egreso'}
        </span>
      </div>
      <div className="flex items-end justify-between gap-3 border-t border-slate-800 pt-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-[10px] uppercase tracking-widest text-slate-600">{f.uuid}</p>
          {(f.cuenta_contable || '').includes('CLASIFICAR') ? (
            <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-400">
              <BrainCircuit className="h-3 w-3" /> Por clasificar
            </span>
          ) : (
            <p className="mt-2 truncate text-xs font-bold text-emerald-400">{f.cuenta_contable}</p>
          )}
        </div>
        <p className={`shrink-0 text-right text-lg font-black ${esIngreso(f) ? 'text-emerald-400' : 'text-rose-400'}`}>
          {esIngreso(f) ? '+' : '-'}${f.total.toLocaleString()}
        </p>
      </div>
    </button>
  );

  const renderBloqueFacturas = (seccionFactura) => {
    const { titulo, lista, acento } = seccionFactura;
    const totalSeccion = lista.reduce((s, f) => s + toNumber(f.total), 0);
    const porFecha = agruparPorFecha(lista);
    const colorTitulo = acento === 'emerald' ? 'text-emerald-400' : 'text-rose-400';
    const colorBorde = acento === 'emerald' ? 'border-emerald-500/30' : 'border-rose-500/30';

    if (lista.length === 0) {
      return (
        <tr key={`empty-${seccionFactura.id}`}>
          <td colSpan="7" className="p-6 text-center text-slate-500 text-sm">
            Sin {titulo.toLowerCase()} en este periodo
          </td>
        </tr>
      );
    }

    return (
      <Fragment key={seccionFactura.id}>
        <tr className={`bg-slate-950/90 border-y ${colorBorde}`}>
          <td colSpan="7" className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-xs font-black uppercase tracking-widest ${colorTitulo}`}>
                {titulo} · {lista.length} factura(s)
              </span>
              <span className={`text-sm font-black ${colorTitulo}`}>
                ${totalSeccion.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </td>
        </tr>
        {Object.entries(porFecha).map(([fecha, items]) => (
          <Fragment key={`${seccionFactura.id}-${fecha}`}>
            <tr className="bg-slate-950/50">
              <td colSpan="7" className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-blue-400/80">
                {formatFecha(fecha)}
              </td>
            </tr>
            {items.map((f) => renderFilaFactura(f))}
          </Fragment>
        ))}
      </Fragment>
    );
  };

  const renderRelacionIva = () => {
    const saldo = ivaComparativo.causado - ivaComparativo.acreditable;
    return (
      <div className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">IVA acreditable</p>
            <p className="mt-2 text-2xl font-black text-emerald-400">
              {formatMoney(ivaComparativo.acreditable)}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">Compras y gastos del periodo</p>
          </article>
          <article className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">IVA causado</p>
            <p className="mt-2 text-2xl font-black text-blue-400">
              {formatMoney(ivaComparativo.causado)}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">Ventas e ingresos del periodo</p>
          </article>
          <article className={`rounded-xl border p-4 shadow-sm ${saldo >= 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Saldo estimado</p>
            <p className={`mt-2 text-2xl font-black ${saldo >= 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formatMoney(Math.abs(saldo))}
            </p>
            <p className="mt-1 text-xs font-bold text-slate-500">{saldo >= 0 ? 'IVA por pagar' : 'Saldo a favor'}</p>
          </article>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[480px] text-left text-sm">
            <caption className="sr-only">Relación de IVA acreditable contra IVA causado</caption>
            <thead className="bg-slate-800/50 text-[10px] font-black uppercase tracking-widest text-slate-500">
              <tr>
                <th className="p-4">Concepto</th>
                <th className="p-4 text-right">Importe</th>
                <th className="p-4 text-right">CFDI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              <tr>
                <td className="p-4 font-bold text-emerald-400">IVA acreditable</td>
                <td className="p-4 text-right font-black text-emerald-400">{formatMoney(ivaComparativo.acreditable)}</td>
                <td className="p-4 text-right text-slate-400">{facturasEgresos.length}</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-blue-400">IVA causado</td>
                <td className="p-4 text-right font-black text-blue-400">{formatMoney(ivaComparativo.causado)}</td>
                <td className="p-4 text-right text-slate-400">{facturasIngresos.length}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderHistorial = () => (
    <>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <button
          type="button"
          aria-expanded={filtroMovimiento === 'ingresos'}
          onClick={() => activarPanelMovimiento('ingresos')}
          className={`kpi-resumen-card rounded-2xl border bg-slate-900 p-6 text-left transition-all duration-200 ${
            filtroMovimiento === 'ingresos'
              ? 'border-emerald-400 ring-2 ring-emerald-500/30'
              : 'border-emerald-500/20 hover:border-emerald-400/60'
          }`}
        >
          <p className="text-[10px] font-black uppercase text-slate-500">Ingresos</p>
          <h2 className="mt-1 text-2xl font-black text-emerald-400">
            ${totalesMovimiento.ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{totalesMovimiento.conteoIngresos} factura(s) · toca para ver listado</p>
        </button>
        <button
          type="button"
          aria-expanded={filtroMovimiento === 'egresos'}
          onClick={() => activarPanelMovimiento('egresos')}
          className={`kpi-resumen-card rounded-2xl border bg-slate-900 p-6 text-left transition-all duration-200 ${
            filtroMovimiento === 'egresos'
              ? 'border-rose-400 ring-2 ring-rose-500/30'
              : 'border-rose-500/20 hover:border-rose-400/60'
          }`}
        >
          <p className="text-[10px] font-black uppercase text-slate-500">Egresos</p>
          <h2 className="mt-1 text-2xl font-black text-rose-400">
            ${totalesMovimiento.egresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
          <p className="mt-1 text-xs text-slate-500">{totalesMovimiento.conteoEgresos} factura(s) · toca para ver listado</p>
        </button>
        <div className="kpi-resumen-card rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-[10px] font-black uppercase text-slate-500">Resultado neto</p>
          <h2 className={`mt-1 text-2xl font-black ${totalesMovimiento.neto >= 0 ? 'text-white' : 'text-amber-400'}`}>
            ${totalesMovimiento.neto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
          <p className="mt-1 text-xs text-slate-500">Ingresos − egresos</p>
        </div>
        <button
          type="button"
          aria-expanded={filtroMovimiento === 'iva'}
          onClick={() => activarPanelMovimiento('iva')}
          className={`kpi-resumen-card rounded-2xl border bg-slate-900 p-6 text-left transition-all duration-200 ${
            filtroMovimiento === 'iva'
              ? 'border-blue-400 ring-2 ring-blue-500/30'
              : 'border-slate-800 hover:border-blue-400/60'
          }`}
        >
          <p className="text-[10px] font-black uppercase text-slate-500">IVA del periodo</p>
          <h2 className="mt-1 text-2xl font-black text-blue-400">
            ${statsIva.ivaEstimado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
          <p className="mt-1 text-xs text-slate-500">Toca para ver acreditable vs causado</p>
        </button>
      </div>

      {!loading && (
        <div className="mb-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-1 text-lg font-bold text-white">Tendencia {anioFiltro}</h3>
          <p className="mb-4 text-sm text-slate-500">Ingresos vs egresos por mes</p>
          {chartMax === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
              Sin movimientos para graficar en {anioFiltro}.
            </div>
          ) : (
            <>
              <div className="space-y-4 sm:hidden">
                {chartDataVisible.map((item) => (
                  <div key={item.mes} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">{item.fullName}</p>
                      <p className="text-xs font-bold text-slate-400">
                        Neto ${(item.ingresos - item.egresos).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] font-bold text-emerald-400">
                          <span>Ingresos</span>
                          <span>${item.ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max((item.ingresos / chartMax) * 100, item.ingresos > 0 ? 4 : 0)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex justify-between text-[11px] font-bold text-rose-400">
                          <span>Egresos</span>
                          <span>${item.egresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-rose-500" style={{ width: `${Math.max((item.egresos / chartMax) * 100, item.egresos > 0 ? 4 : 0)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden h-[280px] min-h-[280px] w-full sm:block">
                <ResponsiveContainer width="100%" height={280} initialDimension={{ width: 800, height: 280 }}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid #1e293b' }}
                      formatter={(value) => `$${toNumber(value).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                    />
                    <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                    <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[6, 6, 0, 0]} barSize={28} />
                    <Bar dataKey="egresos" name="Egresos" fill="#f43f5e" radius={[6, 6, 0, 0]} barSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}

      <div className="report-surface overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-800 p-4 sm:flex-row sm:p-5">
          <h3 className="flex items-center gap-2 font-bold text-white">
            <FileText className="h-5 w-5 text-blue-500" />
            Facturas · {MESES[mesFiltro - 1]} {anioFiltro}
          </h3>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div
              className="grid grid-cols-1 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1 sm:flex"
              role="tablist"
              aria-label="Resúmenes fiscales del periodo"
            >
              {PANELES_MOVIMIENTO.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={filtroMovimiento === opt.id}
                  aria-expanded={filtroMovimiento === opt.id}
                  onClick={() => activarPanelMovimiento(opt.id)}
                  className={`min-h-10 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors sm:min-h-0 sm:px-3 ${
                    filtroMovimiento === opt.id
                      ? opt.id === 'ingresos'
                        ? 'bg-emerald-600 text-white'
                        : opt.id === 'egresos'
                          ? 'bg-rose-600 text-white'
                          : 'bg-blue-600 text-white'
                      : 'text-slate-500 hover:bg-slate-200 hover:text-blue-600'
                  }`}
                >
                  {opt.label}
                  {opt.id === 'ingresos' && ` (${facturasIngresos.length})`}
                  {opt.id === 'egresos' && ` (${facturasEgresos.length})`}
                </button>
              ))}
            </div>
            <input
              className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-base text-white sm:min-w-[200px] sm:text-sm"
              placeholder="Buscar emisor, concepto o UUID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || facturasVisibles.length === 0}
              className="btn-ui btn-ui--success btn-ui--sm font-display"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>
        {filtroMovimiento === 'ninguno' ? (
          <div className="px-4 py-10 text-center sm:px-6">
            <p className="text-sm font-bold text-slate-300">Selecciona un resumen para ver su detalle.</p>
            <p className="mt-1 text-xs text-slate-500">
              Los listados permanecen ocultos hasta que actives Ingresos, Egresos o IVA del periodo.
            </p>
          </div>
        ) : (
          <div key={filtroMovimiento} className="cfdi-panel-enter" role="tabpanel">
            {filtroMovimiento === 'iva' ? renderRelacionIva() : (
              <>
                <div className="space-y-3 p-3 sm:hidden">
                  {loading ? (
                    <div className="py-12 text-center"><Loader2 className="mx-auto animate-spin text-blue-500" /></div>
                  ) : facturasVisibles.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
                      {filtroMovimiento === 'ingresos' && 'No hay ingresos en este periodo.'}
                      {filtroMovimiento === 'egresos' && 'No hay egresos en este periodo.'}
                    </div>
                  ) : facturasVisibles.map((f) => renderFacturaCard(f))}
                </div>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[720px] text-left">
                    <thead className="bg-slate-800/50 text-[10px] font-black uppercase text-slate-500">
                      <tr>
                        <th className="cursor-pointer p-4" onClick={() => requestSort('fecha')}>
                          Fecha {sortConfig.key === 'fecha' ? (sortConfig.direction === 'asc' ? <ChevronUp className="inline w-3" /> : <ChevronDown className="inline w-3" />) : ''}
                        </th>
                        <th className="p-4">Tipo</th>
                        <th className="p-4">Emisor / Proveedor y concepto</th>
                        <th className="cursor-pointer p-4" onClick={() => requestSort('total')}>
                          Monto {sortConfig.key === 'total' ? (sortConfig.direction === 'asc' ? <ChevronUp className="inline w-3" /> : <ChevronDown className="inline w-3" />) : ''}
                        </th>
                        <th className="p-4">Clasificación</th>
                        <th className="p-4 text-center">UUID</th>
                        <th className="w-16 p-4 text-center"> </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {loading ? (
                        <tr><td colSpan="7" className="py-16 text-center"><Loader2 className="mx-auto animate-spin text-blue-500" /></td></tr>
                      ) : facturasVisibles.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="py-16 text-center text-slate-500">
                            {filtroMovimiento === 'ingresos' && 'No hay ingresos en este periodo.'}
                            {filtroMovimiento === 'egresos' && 'No hay egresos en este periodo.'}
                          </td>
                        </tr>
                      ) : seccionesFacturas.map((sec) => renderBloqueFacturas(sec))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );

  const renderRegistroLocal = () => {
    const facturasLocales = facturasPeriodo;

    if (facturasLocales.length === 0) {
      return (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 text-center">
          <BookOpen className="mx-auto mb-3 h-9 w-9 text-slate-500" />
          <h2 className="text-lg font-black text-white">Sin registros contables locales</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
            Carga tus CFDI para generar una vista contable provisional dentro de este dispositivo.
          </p>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="btn-ui btn-ui--primary btn-ui--md mt-5 font-display"
          >
            <UploadCloud className="h-4 w-4" /> Cargar CFDI
          </button>
        </section>
      );
    }

    const totalCargos = facturasLocales.reduce((sum, factura) => sum + toNumber(factura.total), 0);

    return (
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
              <BookOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-white">Registro contable local</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Asientos provisionales generados desde los CFDI guardados en este dispositivo.
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">CFDI del periodo</p>
              <p className="mt-1 text-2xl font-black text-white">{facturasLocales.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total registrado</p>
              <p className="mt-1 text-lg font-black text-blue-400">
                ${totalCargos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {facturasLocales.map((factura) => {
          const ingreso = esIngreso(factura);
          const subtotal = toNumber(factura.subtotal);
          const iva = toNumber(factura.iva);
          const total = toNumber(factura.total);
          const cuentaResultado = ingreso ? 'Ventas generales' : factura.cuenta_contable || 'Gastos por clasificar';
          const contraparte = ingreso ? 'Clientes / Bancos' : 'Proveedores / Bancos';

          return (
            <article key={factura.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/10 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-500">{formatFecha(getFechaFactura(factura))}</p>
                  <h3 className="mt-1 break-words text-base font-black text-white">{factura.emisor}</h3>
                  <p className="mt-1 truncate font-mono text-[10px] uppercase tracking-widest text-slate-600">{factura.uuid}</p>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-black uppercase ${ingreso ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                  {ingreso ? 'Ingreso' : 'Egreso'}
                </span>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-800">
                <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-slate-950/70 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <span>Cuenta</span>
                  <span>Debe</span>
                  <span>Haber</span>
                </div>
                <div className="divide-y divide-slate-800 text-sm">
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-3">
                    <span className="min-w-0 text-slate-300">{contraparte}</span>
                    <span className="font-mono font-bold text-white">{ingreso ? `$${total.toLocaleString('es-MX')}` : '-'}</span>
                    <span className="font-mono font-bold text-white">{ingreso ? '-' : `$${total.toLocaleString('es-MX')}`}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-3">
                    <span className="min-w-0 text-slate-300">{cuentaResultado}</span>
                    <span className="font-mono font-bold text-white">{ingreso ? '-' : `$${subtotal.toLocaleString('es-MX')}`}</span>
                    <span className="font-mono font-bold text-white">{ingreso ? `$${subtotal.toLocaleString('es-MX')}` : '-'}</span>
                  </div>
                  {iva > 0 && (
                    <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-3">
                      <span className="min-w-0 text-slate-300">{ingreso ? 'IVA trasladado' : 'IVA acreditable'}</span>
                      <span className="font-mono font-bold text-white">{ingreso ? '-' : `$${iva.toLocaleString('es-MX')}`}</span>
                      <span className="font-mono font-bold text-white">{ingreso ? `$${iva.toLocaleString('es-MX')}` : '-'}</span>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    );
  };

  const renderInformesLocal = () => {
    const proveedores = facturasPeriodo
      .filter((factura) => !esIngreso(factura))
      .reduce((acc, factura) => {
        const rfc = factura.rfc_emisor || 'SIN RFC';
        if (!acc[rfc]) {
          acc[rfc] = {
            rfc,
            nombre: getContraparteFactura(factura) || factura.nombre_emisor || factura.emisor || 'Proveedor sin nombre',
            facturas: 0,
            subtotal: 0,
            iva: 0,
            total: 0,
          };
        }
        acc[rfc].facturas += 1;
        acc[rfc].subtotal += toNumber(factura.subtotal);
        acc[rfc].iva += toNumber(factura.iva);
        acc[rfc].total += toNumber(factura.total);
        return acc;
      }, {});

    const clientes = facturasPeriodo
      .filter(esIngreso)
      .reduce((acc, factura) => {
        const nombre = getContraparteFactura(factura) || factura.nombre_cliente || factura.nombre_receptor || 'Cliente sin nombre';
        if (!acc[nombre]) acc[nombre] = { nombre, facturas: 0, total: 0 };
        acc[nombre].facturas += 1;
        acc[nombre].total += toNumber(factura.total);
        return acc;
      }, {});

    const proveedoresLista = Object.values(proveedores).sort((a, b) => b.total - a.total);
    const clientesLista = Object.values(clientes).sort((a, b) => b.total - a.total).slice(0, 5);
    const totalIngresos = facturasPeriodo.filter(esIngreso).reduce((sum, factura) => sum + toNumber(factura.subtotal), 0);
    const totalGastos = proveedoresLista.reduce((sum, proveedor) => sum + proveedor.total, 0);
    const ivaTrasladado = facturasPeriodo.filter(esIngreso).reduce((sum, factura) => sum + toNumber(factura.iva), 0);
    const ivaAcreditable = proveedoresLista.reduce((sum, proveedor) => sum + proveedor.iva, 0);

    return (
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400">
              <FileBarChart className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-white">Resumen local del negocio</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Informes calculados solo con los CFDI guardados en este dispositivo.
              </p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-emerald-500/20 bg-slate-950/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ingresos</p>
              <p className="mt-1 text-lg font-black text-emerald-400">${totalIngresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl border border-rose-500/20 bg-slate-950/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Gastos</p>
              <p className="mt-1 text-lg font-black text-rose-400">${totalGastos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">IVA trasladado</p>
              <p className="mt-1 text-lg font-black text-blue-400">${ivaTrasladado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">IVA acreditable</p>
              <p className="mt-1 text-lg font-black text-amber-400">${ivaAcreditable.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-black/10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-white">Padrón de proveedores</h3>
              <p className="mt-1 text-xs text-slate-500">Proveedores detectados desde CFDI de gastos del periodo.</p>
            </div>
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-slate-400">
              {proveedoresLista.length}
            </span>
          </div>

          {proveedoresLista.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm leading-6 text-slate-500">
              Aún no hay proveedores en este periodo. Importa XML donde tu RFC sea el receptor para agregarlos automáticamente.
            </div>
          ) : (
            <div className="space-y-3">
              {proveedoresLista.map((proveedor) => (
                <article key={proveedor.rfc} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-black text-white">{proveedor.nombre}</h4>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-600">{proveedor.rfc}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-rose-500/10 px-2 py-1 text-[10px] font-black uppercase text-rose-400">
                      {proveedor.facturas} CFDI
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-right">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-500">Subtotal</p>
                      <p className="text-xs font-bold text-slate-300">${proveedor.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-500">IVA</p>
                      <p className="text-xs font-bold text-slate-300">${proveedor.iva.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-500">Total</p>
                      <p className="text-xs font-black text-rose-400">${proveedor.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl shadow-black/10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-white">Clientes detectados</h3>
              <p className="mt-1 text-xs text-slate-500">Principales clientes por CFDI de ingresos.</p>
            </div>
            <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-slate-400">
              {clientesLista.length}
            </span>
          </div>
          {clientesLista.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-8 text-center text-sm leading-6 text-slate-500">
              Aún no hay clientes en este periodo.
            </div>
          ) : (
            <div className="space-y-2">
              {clientesLista.map((cliente) => (
                <div key={cliente.nombre} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-white">{cliente.nombre}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{cliente.facturas} CFDI</p>
                  </div>
                  <p className="shrink-0 text-sm font-black text-emerald-400">${cliente.total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderSeccion = (seccionActual = seccion, tabSolicitado = tabActual) => {
    switch (seccionActual) {
      case 'polizas':
        if (isLocalCompany) {
          return renderRegistroLocal();
        }
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Settings2 className="w-4 h-4" />
              Configura comisiones por banco antes de generar pólizas con tarjeta.
            </div>
            <ComisionesBancoPanel empresaId={id} />
            <PolizasPanel
              empresaId={id}
              mes={mesFiltro}
              anio={anioFiltro}
              onPeriodoChange={handlePeriodoChange}
              onRefreshFacturas={handleRefresh}
            />
          </div>
        );
      case 'informes':
        if (isLocalCompany) return renderInformesLocal();
        return (
          <InformesPanel
            key={`informes-${tabSolicitado || 'resumen'}`}
            empresaId={id}
            mes={mesFiltro}
            anio={anioFiltro}
            initialTab={tabSolicitado || 'resumen'}
            onPeriodoChange={handlePeriodoChange}
            refreshToken={classificationRefresh}
            onClassifyProveedor={abrirClasificacionProveedor}
          />
        );
      case 'conciliacion':
        if (isLocalCompany) {
          return (
            <LocalConciliacionPanel
              empresa={empresa}
              facturas={facturas}
              mes={mesFiltro}
              anio={anioFiltro}
            />
          );
        }
        return (
          <ConciliacionBancariaPanel
            empresaId={id}
            mes={mesFiltro}
            anio={anioFiltro}
            onPeriodoChange={handlePeriodoChange}
          />
        );
      case 'fiscal':
        if (isLocalCompany) {
          return <p className="py-12 text-center text-sm text-slate-500">Configura un negocio sincronizado para usar el motor fiscal.</p>;
        }
        return (
          <FiscalConsolidadosPanel
            key={`fiscal-${tabSolicitado || 'resumen'}`}
            empresa={empresa}
            onUpdated={handleRefresh}
            initialTab={tabSolicitado || 'resumen'}
          />
        );
      default:
        return renderHistorial();
    }
  };

  /** Resuelve el panel existente que alimenta una vista de Inteligencia, Informes o Configuración. */
  const renderFuente = (fuente) => {
    switch (fuente.tipo) {
      case 'informes':
        return renderSeccion('informes', fuente.tab);
      case 'fiscal':
        return renderSeccion('fiscal', fuente.tab);
      case 'bancos':
        return renderSeccion('conciliacion');
      case 'polizas':
        return renderSeccion('polizas');
      case 'balance':
        return isLocalCompany ? (
          <p className="sc-muted py-12 text-center text-sm font-semibold">
            Este informe requiere un negocio sincronizado con el servidor.
          </p>
        ) : (
          <BalancePanel empresaId={id} mes={mesFiltro} anio={anioFiltro} modo={fuente.modo} />
        );
      default:
        return null;
    }
  };

  const titulosVista = {
    dashboard: ['Dashboard', 'El estado de tu negocio en menos de 30 segundos'],
    inteligencia: ['Inteligencia Financiera', 'Indicadores, tendencias y alertas de tu negocio'],
    informes: ['Informes Fiscales y Contables', 'Estados financieros, impuestos y cumplimiento'],
    configuracion: ['Configuración', 'Datos del negocio, régimen fiscal y bancos'],
    modulo: [vistaActiva?.label, vistaActiva?.desc],
  };
  const [tituloVista, subtituloVista] = titulosVista[vistaActual];

  const accionesTopbar = (
    <>
      <div className="sc-field flex items-center gap-1.5 !py-1.5">
        <Calendar className="sc-primary h-4 w-4 shrink-0" />
        <select
          aria-label="Mes a revisar"
          value={mesFiltro}
          onChange={(e) => setMesFiltro(Number(e.target.value))}
          className="cursor-pointer bg-transparent outline-none"
        >
          {MESES.map((nombre, i) => (
            <option key={nombre} value={i + 1}>{nombre}</option>
          ))}
        </select>
        <span className="sc-muted">/</span>
        <select
          aria-label="Año a revisar"
          value={anioFiltro}
          onChange={(e) => setAnioFiltro(Number(e.target.value))}
          className="cursor-pointer bg-transparent outline-none"
        >
          {aniosDisponibles.map((anio) => (
            <option key={anio} value={anio}>{anio}</option>
          ))}
        </select>
      </div>

      <details className="relative">
        <summary
          className="sc-field flex cursor-pointer list-none items-center gap-1.5 !py-2"
          aria-label="Más acciones"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Más</span>
        </summary>
        <div className="sc-card absolute right-0 z-30 mt-2 flex w-72 flex-col gap-3 p-3">
          <label className="flex flex-col gap-1 text-xs font-bold sc-muted">
            Exportar
            <select
              id="export-type"
              aria-label="Tipo de datos a exportar"
              value={tipoExportacion}
              onChange={(e) => setTipoExportacion(e.target.value)}
              className="sc-field"
            >
              <option value="todo">Todo el negocio</option>
              <option value="resumen">Resumen</option>
              <option value="empresa">Datos del negocio</option>
              <option value="facturas">Facturas</option>
              <option value="ingresos">Ingresos</option>
              <option value="egresos">Gastos</option>
              <option value="polizas">Registro contable</option>
              <option value="movimientos">Movimientos</option>
              <option value="mapeos">Clasificaciones</option>
              <option value="comisiones">Comisiones</option>
              <option value="contable">Formato contable</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePreviewExport}
              disabled={exportandoEmpresa || loading}
              title="Ver vista previa en pantalla"
              className="btn-ui btn-ui--secondary btn-ui--sm flex-1"
            >
              <FileText className="h-3.5 w-3.5" /> Ver
            </button>
            <button
              type="button"
              onClick={downloadExport}
              disabled={exportandoEmpresa || loading}
              title="Descargar archivo CSV"
              className="btn-ui btn-ui--success btn-ui--sm flex-1"
            >
              {exportandoEmpresa ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              CSV
            </button>
          </div>
          <button
            type="button"
            onClick={handlePurgarPeriodo}
            title="Eliminar datos del mes para reimportar XMLs/PDFs"
            className="btn-ui btn-ui--danger btn-ui--sm"
          >
            <Trash2 className="h-3.5 w-3.5" /> Limpiar mes
          </button>
        </div>
      </details>

      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="btn-ui btn-ui--primary btn-ui--sm font-display"
      >
        <UploadCloud className="h-4 w-4" />
        <span>Cargar CFDI</span>
      </button>
    </>
  );

  const renderVista = () => {
    switch (vistaActual) {
      case 'inteligencia':
        return (
          <InteligenciaView
            lectura={lectura}
            categoriaId={INTELIGENCIA_CATEGORIAS.some((c) => c.id === categoria) ? categoria : null}
            onSelect={(destino) => navigate(`/empresa/${id}/inteligencia${destino ? `/${destino}` : ''}`)}
            onNavigate={irADestino}
            renderFuente={renderFuente}
          />
        );
      case 'informes':
        return (
          <InformesView
            lectura={lectura}
            informeId={informe || null}
            onSelect={(destino) => navigate(`/empresa/${id}/informes${destino ? `/${destino}` : ''}`)}
            renderFuente={renderFuente}
            mes={mesFiltro}
            anio={anioFiltro}
          />
        );
      case 'configuracion':
        return (
          <ConfiguracionView
            empresa={empresa}
            empresaId={id}
            esLocal={isLocalCompany}
            renderFuente={renderFuente}
          />
        );
      case 'modulo':
        return <div className="sc-card min-w-0 p-4 sm:p-6">{renderSeccion()}</div>;
      default:
        return <ExecutiveDashboard lectura={lectura} mes={mesFiltro} anio={anioFiltro} onNavigate={irADestino} />;
    }
  };

  return (
    <>
      <CompanyShell
        empresaId={id}
        empresa={empresa}
        titulo={tituloVista}
        subtitulo={vistaActual === 'dashboard' ? (empresa?.razon_social ? `${empresa.razon_social}${empresa.rfc ? ` · ${empresa.rfc}` : ''}` : subtituloVista) : subtituloVista}
        actions={accionesTopbar}
      >
        {renderVista()}
      </CompanyShell>
      <FileUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        empresaId={id}
        empresaRfc={empresa?.rfc}
        empresaNombre={empresa?.razon_social}
        empresa={empresa}
        onUploadSuccess={handleRefresh}
      />
      <ClassifyModal
        key={`${selectedRfc}-${selectedClasificacion}`}
        isOpen={isClassifyOpen}
        onClose={() => setIsClassifyOpen(false)}
        rfc={selectedRfc}
        empresaId={id}
        initialNombreCuenta={selectedClasificacion}
        onClassificationSuccess={handleClassificationSuccess}
      />
      <FacturaDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        factura={selectedFactura}
        onPolizaGenerada={handleRefresh}
        onEliminada={handleRefresh}
      />
      <ExportPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={`Vista previa · ${tipoExportacion}`}
        content={previewContent}
        loading={previewLoading}
        onDownload={downloadExport}
      />
    </>
  );
};

export default CompanyDetail;


