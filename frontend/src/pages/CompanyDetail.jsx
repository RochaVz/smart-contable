import { Fragment, useState, useCallback, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  ArrowLeft, FileText, UploadCloud,
  Loader2, BrainCircuit, ChevronUp, ChevronDown, Download, Calendar,
  BookOpen, FileBarChart, Landmark, Settings2, Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import FileUploadModal from '../components/FileUploadModal';
import ClassifyModal from '../components/ClassifyModal';
import FacturaDetailModal from '../components/FacturaDetailModal';
import PolizasPanel from '../components/PolizasPanel';
import ComisionesBancoPanel from '../components/ComisionesBancoPanel';
import ConciliacionBancariaPanel from '../components/ConciliacionBancariaPanel';
import InformesPanel from '../components/InformesPanel';
import { downloadCsv } from '../utils/csv';
import { downloadBlob, filenameFromContentDisposition } from '../utils/download';
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
    label: 'Historial',
    icon: FileText,
    descripcion: 'CFDI del periodo, tendencia y exportación',
  },
  {
    id: 'polizas',
    label: 'Pólizas',
    icon: BookOpen,
    descripcion: 'Diario, ingresos, egresos y comisiones bancarias',
  },
  {
    id: 'informes',
    label: 'Informes fiscales',
    icon: FileBarChart,
    descripcion: 'Estado de resultados, impuestos y padrón',
  },
  {
    id: 'conciliacion',
    label: 'Conciliación',
    icon: Landmark,
    descripcion: 'Estado de cuenta vs pólizas',
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
  const hoy = new Date();

  const [seccion, setSeccion] = useState('historial');
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClassifyOpen, setIsClassifyOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedFactura, setSelectedFactura] = useState(null);
  const [selectedRfc, setSelectedRfc] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'fecha', direction: 'desc' });
  const [mesFiltro, setMesFiltro] = useState(hoy.getMonth() + 1);
  const [anioFiltro, setAnioFiltro] = useState(hoy.getFullYear());
  const [empresa, setEmpresa] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [filtroMovimiento, setFiltroMovimiento] = useState('todos');
  const [exportandoEmpresa, setExportandoEmpresa] = useState(false);

  const fetchDatos = useCallback(async () => {
    try {
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
    setLoading(true);
    fetchDatos();
  }, [fetchDatos]);

  const handleRefresh = useCallback(() => {
    setLoading(true);
    fetchDatos();
  }, [fetchDatos]);

  const handleExportarEmpresa = async () => {
    setExportandoEmpresa(true);
    try {
      const res = await api.get(`/empresas/${id}/exportar`, { responseType: 'blob' });
      const nombre = filenameFromContentDisposition(res.headers['content-disposition'])
        || `SmartContable_${empresa?.rfc || id}.zip`;
      downloadBlob(res.data, nombre);
      toast.success('ZIP con archivos CSV descargado');
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
      await api.delete(`/facturas/${factura.id}`);
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

  const facturasVisibles = useMemo(() => {
    if (filtroMovimiento === 'ingresos') return facturasIngresos;
    if (filtroMovimiento === 'egresos') return facturasEgresos;
    return facturasProcesadas;
  }, [filtroMovimiento, facturasIngresos, facturasEgresos, facturasProcesadas]);

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
      acc.total += toNumber(f.total);
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

  const handleExportCsv = useCallback(() => {
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
  }, [facturasVisibles, id]);

  const statsIva = useMemo(() => facturasPeriodo.reduce((acc, f) => {
    const total = toNumber(f.total);
    const iva = toNumber(f.iva ?? f.iva_trasladado);
    acc.ivaEstimado += iva || total * 0.16;
    return acc;
  }, { ivaEstimado: 0 }), [facturasPeriodo]);

  const chartData = useMemo(() => {
    const meses = MESES.map((nombre, index) => ({
      name: nombre.slice(0, 3).toUpperCase(),
      mes: index + 1,
      ingresos: 0,
      egresos: 0,
    }));

    facturas.forEach((f) => {
      const periodo = getPeriodoFactura(f);
      if (!periodo || periodo.anio !== anioFiltro) return;
      const item = meses[periodo.mes - 1];
      const total = toNumber(f.total);
      if (f.tipo_operacion === 'VENTA') item.ingresos += total;
      else item.egresos += total;
    });

    return meses;
  }, [facturas, anioFiltro]);

  const seccionActiva = SECCIONES.find((s) => s.id === seccion) || SECCIONES[0];

  const selectorPeriodo = (
    <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5">
      <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
      <select
        value={mesFiltro}
        onChange={(e) => setMesFiltro(Number(e.target.value))}
        className="bg-transparent text-white text-sm outline-none max-w-[110px]"
      >
        {MESES.map((nombre, i) => (
          <option key={nombre} value={i + 1}>{nombre}</option>
        ))}
      </select>
      <select
        value={anioFiltro}
        onChange={(e) => setAnioFiltro(Number(e.target.value))}
        className="bg-transparent text-white text-sm outline-none w-20"
      >
        {aniosDisponibles.map((anio) => (
          <option key={anio} value={anio}>{anio}</option>
        ))}
      </select>
    </div>
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

      {!loading && chartData.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl mb-8">
          <h3 className="text-lg font-bold text-white mb-1">Tendencia {anioFiltro}</h3>
          <p className="text-slate-500 text-sm mb-4">Ingresos vs egresos por mes</p>
          <div className="h-[280px] w-full min-h-[280px]">
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
        </div>
      )}

      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row justify-between gap-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <FileText className="text-blue-500 w-5 h-5" />
            Facturas · {MESES[mesFiltro - 1]} {anioFiltro}
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="flex gap-1 bg-slate-950 border border-slate-800 rounded-xl p-1">
              {FILTROS_MOVIMIENTO.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFiltroMovimiento(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
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
              className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white min-w-[200px]"
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
        <div className="overflow-x-auto">
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

  const renderSeccion = () => {
    switch (seccion) {
      case 'polizas':
        return (
          <div className="space-y-8">
            <div className="flex items-center gap-2 text-slate-500 text-sm">
              <Settings2 className="w-4 h-4" />
              Configura comisiones por banco antes de generar pólizas con tarjeta.
            </div>
            <ComisionesBancoPanel empresaId={id} />
            <PolizasPanel empresaId={id} onRefreshFacturas={handleRefresh} />
          </div>
        );
      case 'informes':
        return <InformesPanel empresaId={id} />;
      case 'conciliacion':
        return <ConciliacionBancariaPanel empresaId={id} />;
      default:
        return renderHistorial();
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-2 text-slate-500 hover:text-blue-400 mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Mis empresas
        </button>

        {/* Cabecera */}
        <header className="mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">Smart Dashboard</h1>
              <p className="text-slate-500 text-sm mt-1">
                {empresa?.razon_social || `Empresa #${id}`}
                {empresa?.rfc && (
                  <span className="font-mono text-slate-600 ml-2">{empresa.rfc}</span>
                )}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {selectorPeriodo}
              <button
                type="button"
                onClick={handleExportarEmpresa}
                disabled={exportandoEmpresa || loading}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 text-sm text-white disabled:opacity-50"
                title="ZIP con CSV: empresa, facturas, pólizas y más"
              >
                {exportandoEmpresa ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
                Descargar todo
              </button>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 text-sm text-white"
              >
                <UploadCloud className="w-5 h-5" /> Cargar CFDI
              </button>
            </div>
          </div>

          {/* Navegación principal */}
          <nav
            className="grid grid-cols-2 lg:grid-cols-4 gap-2 p-1.5 bg-slate-900/80 border border-slate-800 rounded-2xl"
            aria-label="Secciones del dashboard"
          >
            {SECCIONES.map(({ id, label, icon: Icon, descripcion }) => {
              const activo = seccion === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSeccion(id)}
                  className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl text-left transition-all ${
                    activo
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2 font-bold text-sm">
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </span>
                  <span className={`text-[10px] leading-tight ${activo ? 'text-blue-100' : 'text-slate-600'}`}>
                    {descripcion}
                  </span>
                </button>
              );
            })}
          </nav>
        </header>

        {/* Subtítulo de sección activa (móvil) */}
        <p className="text-slate-500 text-xs mb-4 lg:hidden">
          {seccionActiva.descripcion}
        </p>

        {/* Contenido de la sección */}
        <main>{renderSeccion()}</main>
      </div>

      <FileUploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        empresaId={id}
        empresaRfc={empresa?.rfc}
        empresaNombre={empresa?.razon_social}
        onUploadSuccess={handleRefresh}
      />
      <ClassifyModal
        isOpen={isClassifyOpen}
        onClose={() => setIsClassifyOpen(false)}
        rfc={selectedRfc}
        empresaId={id}
        onClassificationSuccess={handleRefresh}
      />
      <FacturaDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        factura={selectedFactura}
        onPolizaGenerada={handleRefresh}
        onEliminada={handleRefresh}
      />
    </div>
  );
};

export default CompanyDetail;
