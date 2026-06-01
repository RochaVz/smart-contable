import { Fragment, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { Calendar, Download, FileText, Search, Loader2 } from 'lucide-react';
import { downloadCsv } from '../utils/csv';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
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

const GlobalFacturas = () => {
  const hoy = new Date();
  // 1. Estados necesarios que faltaban
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(''); // <--- ESTE FALTABA
  const [mesFiltro, setMesFiltro] = useState(hoy.getMonth() + 1);
  const [anioFiltro, setAnioFiltro] = useState(hoy.getFullYear());

  useEffect(() => {
    const fetchGlobal = async () => {
      try {
        const res = await api.get('/facturas/global');
        setFacturas(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchGlobal();
  },[]);

  const aniosDisponibles = useMemo(() => {
    const anios = new Set([hoy.getFullYear()]);
    facturas.forEach((f) => {
      const periodo = getPeriodoFactura(f);
      if (periodo) anios.add(periodo.anio);
    });
    return [...anios].sort((a, b) => b - a);
  }, [facturas, hoy]);

  const facturasFiltradas = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return facturas.filter((f) => {
      const periodo = getPeriodoFactura(f);
      return periodo?.mes === mesFiltro && periodo?.anio === anioFiltro;
    }).filter(f => 
      (typeof f.empresa === 'string' ? f.empresa : f.empresa?.razon_social || '').toLowerCase().includes(term) ||
      (f.emisor || f.nombre_emisor || '').toLowerCase().includes(term)
    ).sort((a, b) => getFechaFactura(b).localeCompare(getFechaFactura(a)));
  }, [facturas, searchTerm, mesFiltro, anioFiltro]);

  const facturasPorFecha = useMemo(() => facturasFiltradas.reduce((acc, factura) => {
    const fecha = getFechaFactura(factura) || 'Sin fecha';
    if (!acc[fecha]) acc[fecha] = [];
    acc[fecha].push(factura);
    return acc;
  }, {}), [facturasFiltradas]);

  const handleExportCsv = () => {
    const rows = facturasFiltradas.map((f) => ({
      Empresa: typeof f.empresa === 'string' ? f.empresa : f.empresa?.razon_social || '',
      Emisor: f.emisor || f.nombre_emisor || '',
      RFCEmisor: f.rfc_emisor || '',
      Receptor: f.nombre_receptor || '',
      RFCReceptor: f.rfc_receptor || '',
      Tipo: f.tipo_operacion || f.tipo_comprobante || '',
      Fecha: f.fecha || f.fecha_emision || '',
      Subtotal: f.subtotal || '',
      IVA: f.iva || f.iva_trasladado || '',
      Total: f.total,
      UUID: f.uuid,
    }));

    downloadCsv('facturas_globales.csv', rows);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-8">
      
      {/* CABECERA CON BUSCADOR E ICONOS */}
      <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900/50">
        <h3 className="font-bold flex items-center gap-2 text-lg text-white">
          <FileText className="text-blue-500 w-5 h-5" /> Listado Global
        </h3>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5">
            <Calendar className="w-4 h-4 text-slate-600" />
            <select
              value={mesFiltro}
              onChange={(e) => setMesFiltro(Number(e.target.value))}
              className="bg-transparent text-white text-sm outline-none"
            >
              {MESES.map((nombre, i) => (
                <option key={nombre} value={i + 1}>{nombre}</option>
              ))}
            </select>
            <select
              value={anioFiltro}
              onChange={(e) => setAnioFiltro(Number(e.target.value))}
              className="bg-transparent text-white text-sm outline-none"
            >
              {aniosDisponibles.map((anio) => (
                <option key={anio} value={anio}>{anio}</option>
              ))}
            </select>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-3 text-slate-600 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Filtrar por empresa o emisor..." 
              className="bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 w-full text-white outline-none" 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)} 
            />
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading || facturasFiltradas.length === 0}
            className="bg-emerald-600 px-4 py-2.5 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* TABLA */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-slate-500 text-[10px] uppercase font-black tracking-widest bg-slate-800/50">
            <tr>
              <th className="p-6">Fecha</th>
              <th className="p-6">Empresa</th>
              <th className="p-6">Emisor</th>
              <th className="p-6 text-center">Tipo</th>
              <th className="p-6 text-right">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr><td colSpan="5" className="text-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
              </td></tr>
            ) : facturas.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-20 text-slate-500">No hay facturas globales registradas.</td></tr>
            ) : facturasFiltradas.length === 0 ? (
              <tr><td colSpan="5" className="text-center py-20 text-slate-500">No hay facturas en {MESES[mesFiltro - 1]} {anioFiltro}.</td></tr>
            ) : (
              Object.entries(facturasPorFecha).map(([fecha, lista]) => (
                <Fragment key={fecha}>
                  <tr className="bg-slate-950/70">
                    <td colSpan="5" className="px-6 py-3 text-[10px] font-black uppercase tracking-widest text-blue-400">
                      {formatFecha(fecha)}
                    </td>
                  </tr>
                  {lista.map(f => (
                    <tr key={f.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="p-6 text-sm text-slate-400">{getFechaFactura(f)}</td>
                      <td className="p-6 text-blue-400 font-bold">{typeof f.empresa === 'string' ? f.empresa : f.empresa?.razon_social}</td>
                      <td className="p-6">{f.emisor || f.nombre_emisor}</td>
                      <td className="p-6 text-center">
                        <span className={`px-2 py-1 rounded text-[10px] font-black ${f.tipo_operacion === 'VENTA' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                          {f.tipo_operacion}
                        </span>
                      </td>
                      <td className="p-6 text-right font-black">${f.total.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default GlobalFacturas;
