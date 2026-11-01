import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Receipt, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import ImpuestosSatCards from './ImpuestosSatCards';

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
  const [loadingResumen, setLoadingResumen] = useState(false);
  const [bloquesAbiertos, setBloquesAbiertos] = useState({
    impuestos: true,
    declaraciones: true,
    resultados: true,
  });

  const toggleBloque = (id) => {
    setBloquesAbiertos((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const cargarResumenSat = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingResumen(true);
    try {
      const res = await api.get('/fiscal/resumen-sat', {
        params: { empresa_id: empresa.id, mes, anio },
      });
      setResumenSat(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo cargar el resumen fiscal SAT');
      setResumenSat(null);
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
            Actualizar
          </button>
        </div>
      </div>

      {/* Contenedores exclusivos del Motor Fiscal SAT:
          1. Importes consultados
          2. Declaraciones registradas
          3. Obligaciones del régimen */}
      <ResumenSatPanel
        data={resumenSat}
        loading={loadingResumen}
        abiertos={bloquesAbiertos}
        onToggleBloque={toggleBloque}
      />
    </section>
  );
};

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

const ResumenSatPanel = ({ data, loading, abiertos, onToggleBloque }) => {
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
        <ImpuestosSatCards impuestos={impuestos} obligaciones={obligaciones} totales={totales} />
      </ExpandBlock>

      <ExpandBlock
        id="resultados"
        title="Declaraciones registradas"
        subtitle="Importes guardados en el sistema, sin recálculo"
        open={abiertos?.resultados ?? true}
        onToggle={() => onToggleBloque('resultados')}
      >
        {declaracionesRegistradas.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay importes declarados registrados para este periodo.</p>
        ) : (
          <div className="space-y-2">
            {declaracionesRegistradas.map((d) => (
              <div key={d.id} className="flex flex-col gap-2 rounded-xl border border-[color:var(--sc-border)] bg-[color:var(--sc-soft)] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{d.tipo.toUpperCase()}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Estado: {d.estado} · versión {d.version}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">A cargo: {money(d.monto_a_cargo)}</p>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">A favor: {money(d.monto_a_favor)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ExpandBlock>

      {/* 2. Declaraciones y periodicidad */}
      <ExpandBlock
        id="declaraciones"
        title="Declaraciones y periodicidad"
        subtitle="Obligaciones y periodicidad del régimen fiscal"
        open={abiertos?.declaraciones ?? true}
        onToggle={() => onToggleBloque('declaraciones')}
      >
        {declaraciones.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay declaraciones registradas para este régimen.</p>
        ) : (
          <div className="space-y-2">
            {declaraciones.map((d) => (
              <div
                key={`${d.tipo}-${d.periodicidad}`}
                className="flex flex-col gap-2 rounded-xl border border-[color:var(--sc-border)] bg-[color:var(--sc-soft)] p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{d.tipo}</p>
                    <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-300">
                      {d.periodicidad}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{d.descripcion}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{d.base_legal}</p>
                </div>
                <div className="text-left sm:text-right shrink-0">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400">{d.periodo_corresponde || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ExpandBlock>

    </div>
  );
};

export default FiscalConsolidadosPanel;
