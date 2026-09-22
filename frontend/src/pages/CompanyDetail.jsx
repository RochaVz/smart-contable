import { Fragment, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import {
  ArrowLeft, FileText, UploadCloud,
  Loader2, BrainCircuit, ChevronUp, ChevronDown, Download, Calendar,
  BookOpen, FileBarChart, Landmark, Settings2, Trash2,
  Calculator, Search, Sparkles, TrendingUp, TrendingDown,
  DollarSign, Receipt, Users, Scale, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import FileUploadModal from '../components/FileUploadModal';
import ClassifyModal from '../components/ClassifyModal';
import FacturaDetailModal from '../components/FacturaDetailModal';
import ExportPreviewModal from '../components/ExportPreviewModal';
import PolizasPanel from '../components/PolizasPanel';
import ComisionesBancoPanel from '../components/ComisionesBancoPanel';
import ConciliacionBancariaPanel from '../components/ConciliacionBancariaPanel';
import InformesPanel from '../components/InformesPanel';
import LocalConciliacionPanel from '../components/LocalConciliacionPanel';
import FiscalRegimenPanel from '../components/FiscalRegimenPanel';
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

const SECCIONES = [
  {
    id: 'historial',
    label: 'Documentos',
    icon: FileText,
    descripcion: 'Facturas, ingresos y gastos del periodo',
  },
  {
    id: 'polizas',
    label: 'Registro contable',
    icon: BookOpen,
    descripcion: 'Cómo se registraron tus movimientos',
  },
  {
    id: 'informes',
    label: 'Resumen del negocio',
    icon: FileBarChart,
    descripcion: 'Resultado, impuestos y proveedores',
  },
  {
    id: 'conciliacion',
    label: 'Revisión bancaria',
    icon: Landmark,
    descripcion: 'Compara banco contra tus registros',
  },
  {
    id: 'fiscal',
    label: 'Fiscal',
    icon: Calculator,
    descripcion: 'Régimen, obligaciones y retenciones',
  },
];

const CATEGORIAS_RAPIDAS_EMPRESA = [
  { id: 'documentos', label: 'Documentos', desc: 'Facturas de ingresos y gastos del periodo', seccion: 'historial', tab: null, icon: FileText },
  { id: 'ingresos', label: 'Ingresos & Ventas', desc: 'Estado de resultados y detalle de ventas', seccion: 'informes', tab: 'estado', icon: TrendingUp },
  { id: 'egresos', label: 'Gastos & Egresos', desc: 'Gastos clasificados por proveedor y cuenta', seccion: 'informes', tab: 'estado', icon: TrendingDown },
  { id: 'utilidades', label: 'Utilidades', desc: 'Resumen financiero, margen y balance', seccion: 'informes', tab: 'resumen', icon: DollarSign },
  { id: 'impuestos', label: 'Pago de Impuestos', desc: 'IVA trasladado y desglose impositivo', seccion: 'informes', tab: 'trasladados', icon: Receipt },
  { id: 'proveedores', label: 'Padrón Proveedores', desc: 'Directorio y acumulados por RFC', seccion: 'informes', tab: 'padron', icon: Users },
  { id: 'polizas', label: 'Registro Contable', desc: 'Pólizas de diario, ingresos y egresos', seccion: 'polizas', tab: null, icon: BookOpen },
  { id: 'conciliacion', label: 'Conciliación Bancaria', desc: 'Cruce bancario con pólizas y comisiones', seccion: 'conciliacion', tab: null, icon: Landmark },
  { id: 'fiscal', label: 'Motor Fiscal SAT', desc: 'Validaciones de régimen y obligaciones', seccion: 'fiscal', tab: null, icon: Scale },
];

const TOPICOS_BUSQUEDA = [
  {
    id: 'documentos',
    label: 'Documentos y Facturas (CFDI)',
    desc: 'Facturas de ingresos y gastos del periodo',
    seccion: 'historial',
    tab: null,
    icon: FileText,
    keywords: ['documentos', 'facturas', 'cfdi', 'xml', 'historial', 'ingreso', 'gasto', 'egreso'],
  },
  {
    id: 'ingresos',
    label: 'Ingresos & Ventas',
    desc: 'Estado de resultados y detalle de ventas',
    seccion: 'informes',
    tab: 'estado',
    icon: TrendingUp,
    keywords: ['ingresos', 'ventas', 'clientes', 'facturas emitidas', 'ingreso', 'venta'],
  },
  {
    id: 'egresos',
    label: 'Gastos & Egresos',
    desc: 'Gastos clasificados por proveedor y cuenta contable',
    seccion: 'informes',
    tab: 'estado',
    icon: TrendingDown,
    keywords: ['gastos', 'egresos', 'compras', 'costos', 'gasto', 'egreso', 'compra', 'deducciones'],
  },
  {
    id: 'utilidades',
    label: 'Utilidades & Rentabilidad',
    desc: 'Resumen financiero, margen y utilidad neta',
    seccion: 'informes',
    tab: 'resumen',
    icon: DollarSign,
    keywords: ['utilidad', 'utilidades', 'rentabilidad', 'ganancia', 'margen', 'kpi', 'resumen'],
  },
  {
    id: 'trasladados',
    label: 'IVA Trasladado & Impuestos Emitidos',
    desc: 'Impuesto trasladado en facturas emitidas',
    seccion: 'informes',
    tab: 'trasladados',
    icon: Receipt,
    keywords: ['iva trasladado', 'impuestos', 'iva cobrado', 'impuesto', 'trasladado', 'pago de impuestos'],
  },
  {
    id: 'acreditables',
    label: 'IVA Acreditable & Compras',
    desc: 'IVA acreditable en gastos y proveedores',
    seccion: 'informes',
    tab: 'acreditables',
    icon: Receipt,
    keywords: ['iva acreditable', 'iva deducible', 'iva compras', 'acreditable', 'deducible'],
  },
  {
    id: 'retenidos',
    label: 'Retenciones de Impuestos (ISR / IVA)',
    desc: 'Retenciones del periodo por proveedores y clientes',
    seccion: 'informes',
    tab: 'retenidos',
    icon: Receipt,
    keywords: ['retenciones', 'isr retenido', 'iva retenido', 'retencion', 'impuestos retenidos'],
  },
  {
    id: 'padron',
    label: 'Padrón de Proveedores',
    desc: 'Directorio de proveedores, RFCs y montos acumulados',
    seccion: 'informes',
    tab: 'padron',
    icon: Users,
    keywords: ['padron', 'proveedores', 'proveedor', 'suppliers', 'rfc proveedores', 'directorio'],
  },
  {
    id: 'polizas',
    label: 'Registro Contable & Pólizas',
    desc: 'Pólizas automáticas de diario, ingresos y egresos',
    seccion: 'polizas',
    tab: null,
    icon: BookOpen,
    keywords: ['polizas', 'registro contable', 'asientos', 'cuentas contables', 'libro diario', 'contabilidad'],
  },
  {
    id: 'conciliacion',
    label: 'Conciliación Bancaria',
    desc: 'Cruce de estado de cuenta bancario con registros y comisiones',
    seccion: 'conciliacion',
    tab: null,
    icon: Landmark,
    keywords: ['conciliacion', 'banco', 'estado de cuenta', 'movimientos bancarios', 'saldo', 'comisiones'],
  },
  {
    id: 'fiscal',
    label: 'Motor Fiscal & SAT',
    desc: 'Validaciones de régimen fiscal, obligaciones y alertas SAT',
    seccion: 'fiscal',
    tab: null,
    icon: Scale,
    keywords: ['fiscal', 'sat', 'regimen', 'obligaciones', 'motor fiscal', 'cumplimiento', 'auditoria'],
  },
];

const getFechaFactura = (factura) => factura.fecha || factura.fecha_emision || '';

const parseFechaFactura = (factura) => {
  const fecha = String(getFechaFactura(factura) || '');
  if (!fecha) return null;

  const match = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, anio, mes, dia] = match;
    return new Date(Number(anio), Number(mes) - 1, Number(dia));
  }

  const date = new Date(fecha);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getPeriodoFactura = (factura) => {
  const date = parseFechaFactura(factura);
  if (!date) return null;
  return {
    mes: date.getMonth() + 1,
    anio: date.getFullYear(),
    fecha: date,
  };
};

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

const toNumber = (value) => Number.parseFloat(value) || 0;

const esIngreso = (factura) => factura.tipo_operacion === 'VENTA';

const agruparPorFecha = (lista) => lista.reduce((acc, factura) => {
  const fecha = getFechaFactura(factura) || 'Sin fecha';
  if (!acc[fecha]) acc[fecha] = [];
  acc[fecha].push(factura);
  return acc;
}, {});

const FILTROS_MOVIMIENTO = [
  { id: 'todos', label: 'Todos' },
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'egresos', label: 'Egresos' },
];

const CompanyDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const hoy = useMemo(() => new Date(), []);

  const seccion = searchParams.get('seccion') || 'historial';
  const tabActual = searchParams.get('tab') || (seccion === 'informes' ? 'resumen' : null);

  const [busquedaGlobal, setBusquedaGlobal] = useState('');
  const [menuAccesosAbierto, setMenuAccesosAbierto] = useState(false);
  const accesosMenuRef = useRef(null);
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
  const [filtroMovimiento, setFiltroMovimiento] = useState('todos');
  const [exportandoEmpresa, setExportandoEmpresa] = useState(false);
  const [tipoExportacion, setTipoExportacion] = useState('todo');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (accesosMenuRef.current && !accesosMenuRef.current.contains(event.target)) {
        setMenuAccesosAbierto(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMenuAccesosAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSelectSeccion = useCallback((nuevaSeccion, nuevoTab = null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!nuevaSeccion || nuevaSeccion === 'historial') {
        next.delete('seccion');
      } else {
        next.set('seccion', nuevaSeccion);
      }
      if (nuevoTab) {
        next.set('tab', nuevoTab);
      } else if (nuevaSeccion !== 'informes') {
        next.delete('tab');
      }
      return next;
    });
  }, [setSearchParams]);

  const isCatActiva = useCallback((cat) => {
    if (cat.seccion !== seccion) return false;
    if (cat.tab) {
      return tabActual === cat.tab;
    }
    return !tabActual || seccion !== 'informes';
  }, [seccion, tabActual]);

  const categoriaActivaInfo = useMemo(() => {
    return CATEGORIAS_RAPIDAS_EMPRESA.find((cat) => isCatActiva(cat));
  }, [isCatActiva]);

  const seccionActiva = SECCIONES.find((s) => s.id === seccion) || SECCIONES[0];
  const seccionLabelActual = categoriaActivaInfo?.label || seccionActiva.label;
  const seccionDescActual = categoriaActivaInfo?.desc || seccionActiva.descripcion;
  const SeccionIconActual = categoriaActivaInfo?.icon || seccionActiva.icon;

  const topicosFiltrados = useMemo(() => {
    const term = busquedaGlobal.trim().toLowerCase();
    if (!term) return [];
    return TOPICOS_BUSQUEDA.filter((t) =>
      t.label.toLowerCase().includes(term) ||
      t.desc.toLowerCase().includes(term) ||
      t.keywords.some((kw) => kw.toLowerCase().includes(term))
    );
  }, [busquedaGlobal]);

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
        setFacturas(localFacturas);
        return;
      }

      const [facturasRes, empresaRes] = await Promise.all([
        api.get(`/facturas/?empresa_id=${id}`),
        api.get(`/empresas/${id}`),
      ]);
      setFacturas(facturasRes.data);
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
    fetchDatos();
  }, [fetchDatos]);

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
      (f.emisor || '').toLowerCase().includes(term)
      || (f.uuid || '').toLowerCase().includes(term)
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
      : facturasProcesadas;

  const seccionesFacturas = useMemo(() => {
    if (filtroMovimiento === 'ingresos') {
      return [{ id: 'ingresos', titulo: 'Ingresos', lista: facturasIngresos, acento: 'emerald' }];
    }
    if (filtroMovimiento === 'egresos') {
      return [{ id: 'egresos', titulo: 'Egresos', lista: facturasEgresos, acento: 'rose' }];
    }
    return [
      { id: 'ingresos', titulo: 'Ingresos', lista: facturasIngresos, acento: 'emerald' },
      { id: 'egresos', titulo: 'Egresos', lista: facturasEgresos, acento: 'rose' },
    ];
  }, [filtroMovimiento, facturasIngresos, facturasEgresos]);

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

  const handleExportCsv = () => {
    const rows = facturasVisibles.map((f) => ({
      Fecha: f.fecha,
      Tipo: esIngreso(f) ? 'Ingreso' : 'Egreso',
      Emisor: f.emisor,
      RFC: f.rfc_emisor,
      Cliente: f.nombre_cliente || '',
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
      <td className="p-4 font-medium text-white">{f.emisor}</td>
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
          <h4 className="mt-1 line-clamp-2 break-words text-sm font-black text-white">{f.emisor}</h4>
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

  const renderHistorial = () => (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900 p-6 rounded-2xl border border-emerald-500/20">
          <p className="text-slate-500 text-[10px] font-black uppercase">Ingresos</p>
          <h2 className="text-2xl font-black text-emerald-400 mt-1">
            ${totalesMovimiento.ingresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
          <p className="text-slate-500 text-xs mt-1">{totalesMovimiento.conteoIngresos} factura(s)</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl border border-rose-500/20">
          <p className="text-slate-500 text-[10px] font-black uppercase">Egresos</p>
          <h2 className="text-2xl font-black text-rose-400 mt-1">
            ${totalesMovimiento.egresos.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
          <p className="text-slate-500 text-xs mt-1">{totalesMovimiento.conteoEgresos} factura(s)</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <p className="text-slate-500 text-[10px] font-black uppercase">Resultado neto</p>
          <h2 className={`text-2xl font-black mt-1 ${totalesMovimiento.neto >= 0 ? 'text-white' : 'text-amber-400'}`}>
            ${totalesMovimiento.neto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
          <p className="text-slate-500 text-xs mt-1">Ingresos − egresos</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
          <p className="text-slate-500 text-[10px] font-black uppercase">IVA del periodo</p>
          <h2 className="text-2xl font-black text-blue-400 mt-1">
            ${statsIva.ivaEstimado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </h2>
        </div>
      </div>

      {!loading && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl mb-8">
          <h3 className="text-lg font-bold text-white mb-1">Tendencia {anioFiltro}</h3>
          <p className="text-slate-500 text-sm mb-4">Ingresos vs egresos por mes</p>
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
          <div className="hidden h-[280px] w-full min-h-[280px] sm:block">
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

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
        <div className="flex flex-col justify-between gap-4 border-b border-slate-800 p-4 sm:flex-row sm:p-5">
          <h3 className="font-bold text-white flex items-center gap-2">
            <FileText className="text-blue-500 w-5 h-5" />
            Facturas · {MESES[mesFiltro - 1]} {anioFiltro}
          </h3>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1 sm:flex">
              {FILTROS_MOVIMIENTO.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFiltroMovimiento(opt.id)}
                  className={`min-h-10 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors sm:min-h-0 sm:px-3 ${
                    filtroMovimiento === opt.id
                      ? opt.id === 'ingresos'
                        ? 'bg-emerald-600 text-white'
                        : opt.id === 'egresos'
                          ? 'bg-rose-600 text-white'
                          : 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                  {opt.id === 'ingresos' && ` (${facturasIngresos.length})`}
                  {opt.id === 'egresos' && ` (${facturasEgresos.length})`}
                  {opt.id === 'todos' && ` (${facturasProcesadas.length})`}
                </button>
              ))}
            </div>
            <input
              className="min-h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-base text-white sm:min-w-[200px] sm:text-sm"
              placeholder="Buscar emisor o UUID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || facturasVisibles.length === 0}
              className="bg-emerald-600 px-4 py-2 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 hover:bg-emerald-500 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
          </div>
        </div>
        <div className="space-y-3 p-3 sm:hidden">
          {loading ? (
            <div className="py-12 text-center"><Loader2 className="mx-auto animate-spin text-blue-500" /></div>
          ) : facturasVisibles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 px-4 py-10 text-center text-sm text-slate-500">
              {filtroMovimiento === 'ingresos' && 'No hay ingresos en este periodo.'}
              {filtroMovimiento === 'egresos' && 'No hay egresos en este periodo.'}
              {filtroMovimiento === 'todos' && 'No hay facturas en este periodo. Usa "Cargar CFDI" para agregar.'}
            </div>
          ) : facturasVisibles.map((f) => renderFacturaCard(f))}
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-left min-w-[720px]">
            <thead className="text-slate-500 text-[10px] uppercase font-black bg-slate-800/50">
              <tr>
                <th className="p-4 cursor-pointer" onClick={() => requestSort('fecha')}>
                  Fecha {sortConfig.key === 'fecha' ? (sortConfig.direction === 'asc' ? <ChevronUp className="inline w-3" /> : <ChevronDown className="inline w-3" />) : ''}
                </th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Emisor / Proveedor</th>
                <th className="p-4 cursor-pointer" onClick={() => requestSort('total')}>
                  Monto {sortConfig.key === 'total' ? (sortConfig.direction === 'asc' ? <ChevronUp className="inline w-3" /> : <ChevronDown className="inline w-3" />) : ''}
                </th>
                <th className="p-4">Clasificación</th>
                <th className="p-4 text-center">UUID</th>
                <th className="p-4 text-center w-16"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr><td colSpan="7" className="text-center py-16"><Loader2 className="animate-spin mx-auto text-blue-500" /></td></tr>
              ) : facturasVisibles.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-16 text-slate-500">
                    {filtroMovimiento === 'ingresos' && 'No hay ingresos en este periodo.'}
                    {filtroMovimiento === 'egresos' && 'No hay egresos en este periodo.'}
                    {filtroMovimiento === 'todos' && 'No hay facturas en este periodo. Usa "Cargar CFDI" para agregar.'}
                  </td>
                </tr>
              ) : seccionesFacturas.map((sec) => renderBloqueFacturas(sec))}
            </tbody>
          </table>
        </div>
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
            className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500"
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
            nombre: factura.emisor || 'Proveedor sin nombre',
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
        const nombre = factura.nombre_cliente || factura.emisor || 'Cliente sin nombre';
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

  const renderSeccion = () => {
    switch (seccion) {
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
            empresaId={id}
            mes={mesFiltro}
            anio={anioFiltro}
            initialTab={searchParams.get('tab') || 'resumen'}
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
        return <FiscalRegimenPanel empresa={empresa} onUpdated={handleRefresh} />;
      default:
        return renderHistorial();
    }
  };

  return (
    <div className="app-page min-h-screen bg-slate-950 text-slate-200">
      <div className="app-container max-w-7xl py-5 sm:px-6 lg:px-8 lg:py-8">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="mb-5 flex min-h-11 items-center gap-2 rounded-xl pr-3 text-sm text-slate-500 hover:text-blue-400 sm:mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Mis empresas
        </button>

        {/* Cabecera Principal */}
        <header className="mb-6 space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-black text-white sm:text-3xl">
                {empresa?.razon_social || `Negocio #${id}`}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Revisa la información de tu negocio y detecta diferencias a tiempo.
                {empresa?.rfc && (
                  <span className="mt-1 block font-mono text-xs text-slate-500 sm:ml-2 sm:inline">
                    {empresa.rfc}
                  </span>
                )}
              </p>
            </div>

            {/* Barra de Acciones y Controles Superiores */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Selector de periodo minimalista */}
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs">
                <Calendar className="h-4 w-4 text-blue-400 shrink-0" />
                <div className="relative">
                  <select
                    aria-label="Mes a revisar"
                    value={mesFiltro}
                    onChange={(e) => setMesFiltro(Number(e.target.value))}
                    className="appearance-none bg-transparent pr-4 font-bold text-white outline-none cursor-pointer hover:text-blue-400 transition-colors"
                  >
                    {MESES.map((nombre, i) => (
                      <option key={nombre} value={i + 1} className="bg-slate-900 text-white">
                        {nombre}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                </div>
                <span className="text-slate-700">/</span>
                <div className="relative">
                  <select
                    aria-label="Año a revisar"
                    value={anioFiltro}
                    onChange={(e) => setAnioFiltro(Number(e.target.value))}
                    className="appearance-none bg-transparent pr-4 font-bold text-white outline-none cursor-pointer hover:text-blue-400 transition-colors"
                  >
                    {aniosDisponibles.map((anio) => (
                      <option key={anio} value={anio} className="bg-slate-900 text-white">
                        {anio}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                </div>
              </div>

              {/* Grupo de Exportación Integrado */}
              <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/90 p-1">
                <div className="relative flex items-center pl-2 pr-1">
                  <Download className="h-3.5 w-3.5 text-emerald-400 shrink-0 mr-1.5" />
                  <select
                    id="export-type"
                    aria-label="Tipo de datos a exportar"
                    value={tipoExportacion}
                    onChange={(e) => setTipoExportacion(e.target.value)}
                    className="appearance-none bg-transparent pr-4 text-xs font-bold text-white outline-none cursor-pointer hover:text-emerald-400 transition-colors"
                  >
                    <option value="todo" className="bg-slate-900 text-white">Todo el negocio</option>
                    <option value="resumen" className="bg-slate-900 text-white">Resumen</option>
                    <option value="empresa" className="bg-slate-900 text-white">Datos del negocio</option>
                    <option value="facturas" className="bg-slate-900 text-white">Facturas</option>
                    <option value="ingresos" className="bg-slate-900 text-white">Ingresos</option>
                    <option value="egresos" className="bg-slate-900 text-white">Gastos</option>
                    <option value="polizas" className="bg-slate-900 text-white">Registro contable</option>
                    <option value="movimientos" className="bg-slate-900 text-white">Movimientos</option>
                    <option value="mapeos" className="bg-slate-900 text-white">Clasificaciones</option>
                    <option value="comisiones" className="bg-slate-900 text-white">Comisiones</option>
                    <option value="contable" className="bg-slate-900 text-white">Formato contable</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
                </div>

                <div className="h-4 w-px bg-slate-800" />

                <button
                  type="button"
                  onClick={handlePreviewExport}
                  disabled={exportandoEmpresa || loading}
                  title="Ver vista previa en pantalla"
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Ver</span>
                </button>

                <button
                  type="button"
                  onClick={downloadExport}
                  disabled={exportandoEmpresa || loading}
                  title="Descargar archivo CSV"
                  className="flex items-center gap-1 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600 hover:text-white px-2.5 py-1.5 text-xs font-bold disabled:opacity-50 transition-colors"
                >
                  {exportandoEmpresa ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  <span>CSV</span>
                </button>
              </div>

              {/* Botón Cargar CFDI */}
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500 active:scale-[0.99] transition-all"
              >
                <UploadCloud className="h-4 w-4" />
                <span>Cargar CFDI</span>
              </button>
            </div>
          </div>

          {/* Barra de Búsqueda y Accesos Rápidos en Cascada */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            {/* Buscador global dentro de la empresa */}
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={busquedaGlobal}
                onChange={(e) => setBusquedaGlobal(e.target.value)}
                placeholder="Buscar en este negocio (ingresos, gastos, utilidades, IVA, retenciones, proveedores, conciliación, SAT, pólizas)..."
                className="w-full rounded-2xl border border-slate-800 bg-slate-900/90 py-3 pl-10 pr-10 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-blue-500 focus:bg-slate-900 focus:ring-1 focus:ring-blue-500"
              />
              {busquedaGlobal && (
                <button
                  type="button"
                  onClick={() => setBusquedaGlobal('')}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-white"
                  title="Limpiar búsqueda"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Botón único en cascada de Accesos Rápidos */}
            <div className="relative shrink-0" ref={accesosMenuRef}>
              <button
                type="button"
                onClick={() => setMenuAccesosAbierto((prev) => !prev)}
                className={`flex min-h-11 w-full items-center justify-between gap-2.5 rounded-2xl border px-4 py-2.5 text-sm font-bold transition-all sm:w-auto ${
                  menuAccesosAbierto
                    ? 'border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                    : 'border-slate-800 bg-slate-900/90 text-slate-200 hover:border-slate-700 hover:bg-slate-800 hover:text-white'
                }`}
                aria-expanded={menuAccesosAbierto}
                aria-haspopup="true"
              >
                <div className="flex items-center gap-2">
                  <SeccionIconActual className={`h-4 w-4 shrink-0 ${menuAccesosAbierto ? 'text-white' : 'text-blue-400'}`} />
                  <span>{seccionLabelActual}</span>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${menuAccesosAbierto ? 'rotate-180 text-white' : 'text-slate-400'}`} />
              </button>

              {/* Menú desplegable en cascada */}
              {menuAccesosAbierto && (
                <div className="absolute right-0 top-full z-30 mt-2 w-full min-w-[290px] rounded-2xl border border-slate-800 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl sm:w-84">
                  <div className="mb-1 flex items-center justify-between border-b border-slate-800/80 px-3 py-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Módulos y Reportes del Negocio
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {CATEGORIAS_RAPIDAS_EMPRESA.length} opciones
                    </span>
                  </div>
                  <div className="max-h-96 space-y-1 overflow-y-auto">
                    {CATEGORIAS_RAPIDAS_EMPRESA.map((cat) => {
                      const Icon = cat.icon;
                      const activa = isCatActiva(cat);
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            handleSelectSeccion(cat.seccion, cat.tab);
                            setMenuAccesosAbierto(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left text-xs transition-all ${
                            activa
                              ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-900/20'
                              : 'text-slate-300 hover:bg-slate-800/90 hover:text-white'
                          }`}
                        >
                          <div className={`rounded-lg p-2 shrink-0 ${activa ? 'bg-white/20 text-white' : 'bg-slate-800/90 text-blue-400'}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold">{cat.label}</p>
                            {cat.desc && (
                              <p className={`truncate text-[11px] ${activa ? 'text-blue-100' : 'text-slate-500'}`}>
                                {cat.desc}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Coincidencias del buscador dentro de la empresa */}
          {busquedaGlobal.trim() && (
            topicosFiltrados.length > 0 ? (
              <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-4 shadow-lg">
                <div className="mb-3 flex items-center justify-between text-xs font-black uppercase tracking-wider text-blue-300">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-blue-400" /> Secciones y reportes encontrados
                  </span>
                  <button
                    type="button"
                    onClick={() => setBusquedaGlobal('')}
                    className="text-[11px] font-bold text-slate-400 hover:text-white"
                  >
                    Cerrar
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {topicosFiltrados.map((topico) => {
                    const Icon = topico.icon;
                    return (
                      <button
                        key={topico.id}
                        type="button"
                        onClick={() => {
                          handleSelectSeccion(topico.seccion, topico.tab);
                          setBusquedaGlobal('');
                        }}
                        className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/95 p-3 text-left transition-all hover:border-blue-500 hover:bg-slate-800"
                      >
                        <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400 shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-white">{topico.label}</p>
                          <p className="truncate text-[11px] text-slate-400">{topico.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-center text-xs text-slate-400">
                No se encontraron secciones para “{busquedaGlobal}”. Prueba con “ingresos”, “gastos”, “iva”, “proveedores”, “polizas”, “banco” o “sat”.
              </div>
            )
          )}

          {/* Indicador de sección activa */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-400">
                <SeccionIconActual className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Vista actual:</span>
                  <span className="truncate text-sm font-black text-white">{seccionLabelActual}</span>
                </div>
                <p className="truncate text-xs text-slate-400">{seccionDescActual}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMenuAccesosAbierto((prev) => !prev)}
              className="shrink-0 rounded-xl bg-slate-800 px-3 py-1.5 text-xs font-bold text-blue-400 transition-colors hover:bg-slate-700 hover:text-white"
            >
              Cambiar vista
            </button>
          </div>
        </header>

        {/* Contenido de la sección */}
        <main className="min-w-0">{renderSeccion()}</main>
      </div>

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
    </div>
  );
};

export default CompanyDetail;

