import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, Loader2, Receipt, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import ImpuestosSatCards from './ImpuestosSatCards';
import { downloadCsv } from '../utils/csv';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const money = (v) => {
  if (v == null) return 'Sin registro';
  return Number(v).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
};

const FiscalConsolidadosPanel = ({ empresa, mes: mesProp, anio: anioProp, onPeriodoChange }) => {
  const now = useMemo(() => new Date(), []);
  // Periodo controlado por el padre (CompanyDetail) con respaldo local si no llega.
  // Patrón equivalente al de DiotPanel: evita el efecto de sincronización prop -> state.
  const controlled = mesProp != null && anioProp != null && typeof onPeriodoChange === 'function';
  const [mesLocal, setMesLocal] = useState(mesProp ?? now.getMonth() + 1);
  const [anioLocal, setAnioLocal] = useState(anioProp ?? now.getFullYear());
  const mes = controlled ? mesProp : mesLocal;
  const anio = controlled ? anioProp : anioLocal;
  const [resumenSat, setResumenSat] = useState(null);
  const [detalleFiscal, setDetalleFiscal] = useState(null);
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [bloquesAbiertos, setBloquesAbiertos] = useState({
    impuestos: true,
    parseados: false,
  });

  const toggleBloque = (id) => {
    setBloquesAbiertos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const cargarResumenSat = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingResumen(true);
    try {
      const params = { empresa_id: empresa.id, mes, anio };
      const [resumen, isr, iva, retenciones, ish] = await Promise.all([
        api.get('/fiscal/resumen-sat', { params }),
        api.get('/fiscal/isr/detalle', { params }),
        api.get('/fiscal/iva/detalle', { params }),
        api.get('/fiscal/retenciones/detalle', { params }),
        api.get('/fiscal/ish/detalle', { params }),
      ]);
      setResumenSat(resumen.data);
      setDetalleFiscal({
        isr: isr.data,
        iva: iva.data,
        retenciones: retenciones.data,
        ish: ish.data,
      });
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo cargar el resumen fiscal SAT');
      setResumenSat(null);
      setDetalleFiscal(null);
    } finally {
      setLoadingResumen(false);
    }
  }, [empresa, mes, anio]);

  useEffect(() => {
    if (!empresa?.id) return;
    queueMicrotask(cargarResumenSat);
  }, [cargarResumenSat, empresa?.id]);

  // El motor SAT analiza el mismo periodo que el dashboard ejecutivo.
  // El periodo es controlado por el padre, por lo que no hace falta sincronizarlo aquí.
  const cambiarMes = useCallback((valor) => {
    if (controlled) onPeriodoChange?.(valor, anio);
    else setMesLocal(valor);
  }, [anio, controlled, onPeriodoChange]);

  const cambiarAnio = useCallback((valor) => {
    if (controlled) onPeriodoChange?.(mes, valor);
    else setAnioLocal(valor);
  }, [mes, controlled, onPeriodoChange]);

  const regimenClave = resumenSat?.regimen?.clave
    || resumenSat?.empresa?.regimen_fiscal
    || empresa?.regimen_fiscal
    || null;
  const regimenNombre = resumenSat?.regimen?.descripcion
    || resumenSat?.obligaciones_regimen?.regimen
    || (regimenClave ? `Régimen ${regimenClave}` : null);

  return (
    <section className="space-y-5">
      {/* Barra de periodo del Motor Fiscal SAT (Centro fiscal oculto) */}
      <div className="sc-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Receipt className="h-4 w-4" />
            </span>
            <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">
              Motor Fiscal SAT
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Consulta de importes registrados para {MESES[mes - 1]} {anio}
          </p>
          {regimenNombre && (
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 dark:text-blue-300">
                Régimen: {regimenClave ? `${regimenClave} · ` : ''}{regimenNombre}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Mes:
            </label>
            <select
              value={mes}
              onChange={(e) => cambiarMes(Number(e.target.value))}
              className="rounded-lg border border-[color:var(--sc-border)] bg-[color:var(--sc-card)] px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
            >
              {MESES.map((nombre, idx) => (
                <option key={nombre} value={idx + 1}>{nombre}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Año:
            </label>
            <input
              type="number"
              value={anio}
              onChange={(e) => cambiarAnio(Number(e.target.value) || now.getFullYear())}
              className="w-20 rounded-lg border border-[color:var(--sc-border)] bg-[color:var(--sc-card)] px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
            />
          </div>

          <button
            type="button"
            onClick={cargarResumenSat}
            disabled={loadingResumen}
            className="btn-ui btn-ui--primary btn-ui--sm inline-flex items-center gap-1.5 text-xs font-bold"
          >
            {loadingResumen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Actualizar resultados
          </button>
        </div>
      </div>

      {/* Contenedores exclusivos del Motor Fiscal SAT:
          1. Importes consultados
          2. Declaraciones registradas
          3. Obligaciones del régimen */}
      <ResumenSatPanel
        data={resumenSat}
        detalleFiscal={detalleFiscal}
        loading={loadingResumen}
        abiertos={bloquesAbiertos}
        onToggleBloque={toggleBloque}
      />
    </section>
  );
};

const ResultadosParseados = ({ data, open, onToggle }) => {
  const cfdis = [
    ...(data.iva?.cfdi_ingresos || []),
    ...(data.iva?.cfdi_egresos || []),
  ];
  const periodo = data.isr?.periodo || data.iva?.periodo || {};
  const filas = cfdis.map((cfdi) => ({
    UUID: cfdi.uuid || '',
    Tipo: cfdi.emitido_por_empresa ? 'Emitido' : 'Recibido',
    Emisor: cfdi.nombre_emisor || cfdi.rfc_emisor || '',
    Receptor: cfdi.nombre_receptor || cfdi.rfc_receptor || '',
    Fecha: cfdi.fecha_emision ? String(cfdi.fecha_emision).slice(0, 10) : '',
    Subtotal: cfdi.subtotal ?? '',
    'IVA trasladado': cfdi.iva_trasladado ?? '',
    'IVA retenido': cfdi.iva_retenido ?? '',
    'ISR retenido': cfdi.isr_retenido ?? '',
    'ISH / local': cfdi.impuestos_locales ?? '',
    Total: cfdi.total ?? '',
  }));

  const descargar = () => {
    const anio = periodo.anio || 'periodo';
    const mes = periodo.mes ? `_${String(periodo.mes).padStart(2, '0')}` : '';
    downloadCsv(`cfdi_${anio}${mes}.csv`, filas);
  };

  return (
    <section className="sc-card overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
          <span>
            <span className="block text-sm font-bold text-slate-900 dark:text-white">
              CFDI incluidos ({cfdis.length})
            </span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              {open ? 'Ocultar CFDI' : 'Mostrar CFDI'} · solo lectura
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={descargar}
          disabled={cfdis.length === 0}
          title="Descargar CFDI en formato CSV"
          className="btn-ui btn-ui--secondary btn-ui--sm inline-flex shrink-0 items-center gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Descargar CFDI
        </button>
      </div>
      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <div className="space-y-3 border-t border-[color:var(--sc-divider)] p-4 sm:p-5">
            {cfdis.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No hay CFDI parseados para el periodo seleccionado.
              </p>
            ) : cfdis.map((cfdi, index) => (
              <article
                key={cfdi.uuid || cfdi.id || index}
                className="rounded-xl border border-[color:var(--sc-border)] bg-[color:var(--sc-soft)] p-3.5"
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="break-all text-xs font-bold text-slate-900 dark:text-white">{cfdi.uuid || 'CFDI sin UUID'}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {cfdi.emitido_por_empresa ? 'Emitido' : 'Recibido'} · {cfdi.nombre_emisor || cfdi.rfc_emisor || 'Emisor sin nombre'}
                      {' → '}
                      {cfdi.nombre_receptor || cfdi.rfc_receptor || 'Receptor sin nombre'}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {cfdi.fecha_emision ? String(cfdi.fecha_emision).slice(0, 10) : 'Sin fecha'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  <ParsedAmount label="Subtotal" value={cfdi.subtotal} />
                  <ParsedAmount label="IVA trasladado" value={cfdi.iva_trasladado} />
                  <ParsedAmount label="IVA retenido" value={cfdi.iva_retenido} />
                  <ParsedAmount label="ISR retenido" value={cfdi.isr_retenido} />
                  <ParsedAmount label="ISH / local" value={cfdi.impuestos_locales} />
                  <ParsedAmount label="Total CFDI" value={cfdi.total} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

const ParsedAmount = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
    <p className="break-words text-xs font-semibold text-slate-900 dark:text-white">{money(value)}</p>
  </div>
);

const ExpandBlock = ({ title, subtitle, open, onToggle, children }) => (
  <div className="sc-card overflow-hidden transition-all duration-300">
    <button
      type="button"
      onClick={onToggle}
      className={`btn-press flex w-full items-center justify-between gap-3 p-4 sm:p-5 text-left transition-colors ${
        open ? 'bg-[color:var(--sc-soft)]/70' : 'hover:bg-[color:var(--sc-soft)]/40'
      }`}
    >
      <div>
        <p className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">{title}</p>
        {subtitle && <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      <span className={`text-slate-400 dark:text-slate-500 transition-transform duration-200 text-lg ${open ? 'rotate-180' : ''}`}>▾</span>
    </button>
    <div
      className={`grid transition-all duration-300 ease-out ${
        open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      <div className="overflow-hidden">
        <div className="border-t border-[color:var(--sc-divider)] p-4 sm:p-5">{children}</div>
      </div>
    </div>
  </div>
);

const ResumenSatPanel = ({ data, detalleFiscal, loading, abiertos, onToggleBloque }) => {
  if (loading && !data) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="sc-card p-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Sin resumen fiscal para el periodo seleccionado.
      </div>
    );
  }

  const impuestos = data.impuestos || {};
  const declaraciones = data.declaraciones || [];
  const declaracionesRegistradas = data.declaraciones_registradas || [];
  const obligaciones = data.obligaciones_regimen || {};
  const totales = data.totales || {};
  const regimenClave = data.regimen?.clave || data.empresa?.regimen_fiscal || '';
  const regimenNombre = data.regimen?.descripcion || (regimenClave ? `Régimen ${regimenClave}` : 'Sin régimen registrado');

  return (
    <div className="space-y-4">
      {/* Importes existentes consultados de declaraciones, CFDI y pólizas */}
      <ExpandBlock
        id="impuestos"
        title="Importes fiscales consultados"
        subtitle={`ISR ${money(totales.isr_a_cargo)} · IVA ${money(totales.iva_a_cargo)} · Retenciones ${money(totales.retenciones)} · ISH ${money(totales.ish)}`}
        open={abiertos?.impuestos ?? true}
        onToggle={() => onToggleBloque('impuestos')}
      >
        <ImpuestosSatCards
          impuestos={impuestos}
          obligaciones={obligaciones}
          totales={totales}
          detalleFiscal={detalleFiscal}
          declaraciones={declaraciones}
          declaracionesRegistradas={declaracionesRegistradas}
          periodo={data.periodo}
          regimenClave={regimenClave}
          regimenNombre={regimenNombre}
          tipoPersona={data.empresa?.tipo_persona}
        />
      </ExpandBlock>

      {detalleFiscal && (
        <ResultadosParseados
          data={detalleFiscal}
          open={abiertos?.parseados ?? false}
          onToggle={() => onToggleBloque('parseados')}
        />
      )}

    </div>
  );
};

export default FiscalConsolidadosPanel;
