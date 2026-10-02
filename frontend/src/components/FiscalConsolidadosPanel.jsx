import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calculator,
  Calendar,
  CheckCircle2,
  FileDiff,
  History,
  Loader2,
  Percent,
  RefreshCw,
  Scale,
  Settings2,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import FiscalRegimenPanel from './FiscalRegimenPanel';
import DiotPanel from './DiotPanel';
import FiscalAnualPanel from './FiscalAnualPanel';
import HistorialDeclaracionesPanel from './HistorialDeclaracionesPanel';
import CfdiComplementosPanel from './CfdiComplementosPanel';

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const TABS = [
  { id: 'indicadores', label: 'Salud', icon: Activity },
  { id: 'isr', label: 'ISR', icon: Percent },
  { id: 'iva', label: 'IVA', icon: Calculator },
  { id: 'diot', label: 'DIOT', icon: Users },
  { id: 'anual', label: 'Anual', icon: Scale },
  { id: 'diferencias', label: 'Diferencias', icon: FileDiff },
  { id: 'config', label: 'Régimen', icon: Settings2 },
  { id: 'bitacora', label: 'Bitácora', icon: History },
  { id: 'complementos', label: 'Complementos', icon: Calendar },
];

const money = (v) =>
  Number(v || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });

const badgeTone = (estado) => {
  if (estado === 'ok' || estado === 'estimado') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (estado === 'desvios' || estado === 'requiere_parametros_del_regimen') {
    return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
  }
  if (estado === 'pendiente') return 'bg-sky-500/15 text-sky-200 border-sky-500/30';
  return 'bg-slate-800 text-slate-300 border-slate-700';
};

const FiscalConsolidadosPanel = ({ empresa, onUpdated }) => {
  const now = useMemo(() => new Date(), []);
  const [tab, setTab] = useState('indicadores');
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [proveedor, setProveedor] = useState('');
  const [tipoOperacion, setTipoOperacion] = useState('');
  const [isr, setIsr] = useState(null);
  const [iva, setIva] = useState(null);
  const [diferencias, setDiferencias] = useState(null);
  const [indicadores, setIndicadores] = useState(null);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [loadingIndicadores, setLoadingIndicadores] = useState(false);
  const [savingRevision, setSavingRevision] = useState(null);

  const cargarCalculos = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingCalc(true);
    try {
      const [isrRes, ivaRes, difRes] = await Promise.all([
        api.get('/fiscal/isr', { params: { empresa_id: empresa.id, mes, anio } }),
        api.get('/fiscal/iva', { params: { empresa_id: empresa.id, mes, anio } }),
        api.get('/fiscal/diferencias', { params: { empresa_id: empresa.id, mes, anio } }),
      ]);
      setIsr(isrRes.data);
      setIva(ivaRes.data);
      setDiferencias(difRes.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudieron cargar los cálculos fiscales');
      setIsr(null);
      setIva(null);
      setDiferencias(null);
    } finally {
      setLoadingCalc(false);
    }
  }, [empresa?.id, mes, anio]);

  const cargarIndicadores = useCallback(async () => {
    if (!empresa?.id) return;
    setLoadingIndicadores(true);
    try {
      const res = await api.get('/fiscal/indicadores', {
        params: { empresa_id: empresa.id, mes, anio },
      });
      setIndicadores(res.data);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudieron cargar los indicadores');
      setIndicadores(null);
    } finally {
      setLoadingIndicadores(false);
    }
  }, [empresa?.id, mes, anio]);

  useEffect(() => {
    if (!empresa?.id) return;
    if (['isr', 'iva', 'diferencias'].includes(tab)) {
      queueMicrotask(cargarCalculos);
    }
    if (tab === 'indicadores') {
      queueMicrotask(cargarIndicadores);
    }
  }, [cargarCalculos, cargarIndicadores, empresa?.id, tab]);

  const aprobarModulo = async (moduloId) => {
    if (!empresa?.id) return;
    setSavingRevision(moduloId);
    try {
      await api.post('/fiscal/indicadores/revision', {
        empresa_id: empresa.id,
        modulo: moduloId,
        mes,
        anio,
      });
      toast.success('Revisión contable registrada en bitácora');
      await cargarIndicadores();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo registrar la revisión');
    } finally {
      setSavingRevision(null);
    }
  };

  const estadoResumen =
    indicadores?.salud?.nivel || diferencias?.estado_general || isr?.estatus || '—';
  const pendientes = useMemo(() => {
    const list = [...(diferencias?.pendientes || [])];
    if (isr?.parametros_faltantes?.length) {
      isr.parametros_faltantes.forEach((p) => {
        const key = `isr:${p}`;
        if (!list.includes(key)) list.push(key);
      });
    }
    return list;
  }, [diferencias, isr]);

  const refreshAll = () => {
    if (tab === 'indicadores') cargarIndicadores();
    else cargarCalculos();
  };

  return (
    <section className="space-y-5">
      {/* Header + filtros compartidos */}
      <div className="border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-white">Centro fiscal</h2>
            <p className="mt-1 text-xs text-slate-500">
              Salud · ISR · IVA · DIOT · Anual · conciliación de fuentes y bitácora
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${badgeTone(estadoResumen)}`}>
                Estado: {String(estadoResumen).replaceAll('_', ' ')}
              </span>
              {indicadores?.salud?.score != null && (
                <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold text-blue-200">
                  Score {indicadores.salud.score}/100
                </span>
              )}
              {pendientes.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-200">
                  <AlertTriangle className="h-3 w-3" />
                  {pendientes.length} pendiente{pendientes.length === 1 ? '' : 's'}
                </span>
              )}
              {(diferencias?.alertas?.length > 0 || indicadores?.diferencias?.desvios > 0) && (
                <span className="inline-flex items-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[10px] font-bold text-rose-200">
                  {(diferencias?.alertas?.length || indicadores?.diferencias?.desvios || 0)} desvío(s)
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={refreshAll}
            disabled={loadingCalc || loadingIndicadores}
            className="inline-flex min-h-10 items-center gap-2 border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 hover:border-blue-500 hover:text-white disabled:opacity-40"
          >
            {(loadingCalc || loadingIndicadores) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Actualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Mes
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
            >
              {MESES.map((nombre, idx) => (
                <option key={nombre} value={idx + 1}>{nombre}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Año
            <input
              type="number"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value) || now.getFullYear())}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
            />
          </label>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Proveedor / RFC
            <input
              type="text"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
              placeholder="Filtrar DIOT..."
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white placeholder:text-slate-600"
            />
          </label>
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Tipo operación
            <select
              value={tipoOperacion}
              onChange={(e) => setTipoOperacion(e.target.value)}
              className="mt-1 w-full border border-slate-700 bg-slate-950 px-2 py-2 text-sm text-white"
            >
              <option value="">Todos</option>
              <option value="nacional">Nacional</option>
              <option value="extranjero">Extranjero</option>
              <option value="global">Global</option>
            </select>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-slate-800 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex min-h-10 items-center gap-2 border-b-2 px-3 py-2 text-xs font-black uppercase tracking-wide transition ${
                active
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-500 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'indicadores' && (
        <IndicadoresPanel
          data={indicadores}
          loading={loadingIndicadores}
          mes={mes}
          anio={anio}
          savingRevision={savingRevision}
          onAprobar={aprobarModulo}
        />
      )}
      {tab === 'isr' && (
        <CalcIsrPanel data={isr} loading={loadingCalc} mes={mes} anio={anio} />
      )}
      {tab === 'iva' && (
        <CalcIvaPanel data={iva} loading={loadingCalc} mes={mes} anio={anio} />
      )}
      {tab === 'diot' && (
        <DiotPanel
          empresa={empresa}
          mes={mes}
          anio={anio}
          onPeriodoChange={({ mes: m, anio: a }) => {
            if (m != null) setMes(m);
            if (a != null) setAnio(a);
          }}
          filtroProveedor={proveedor}
          filtroTipo={tipoOperacion}
          hidePeriodControls
        />
      )}
      {tab === 'anual' && (
        <FiscalAnualPanel empresa={empresa} anio={anio} onAnioChange={setAnio} />
      )}
      {tab === 'diferencias' && (
        <DiferenciasPanel data={diferencias} loading={loadingCalc} />
      )}
      {tab === 'config' && (
        <FiscalRegimenPanel empresa={empresa} onUpdated={onUpdated} />
      )}
      {tab === 'bitacora' && (
        <HistorialDeclaracionesPanel empresa={empresa} />
      )}
      {tab === 'complementos' && (
        <CfdiComplementosPanel empresa={empresa} />
      )}
    </section>
  );
};

const saludTone = (nivel) => {
  if (nivel === 'saludable') return 'text-emerald-300';
  if (nivel === 'aceptable') return 'text-sky-300';
  if (nivel === 'en_riesgo') return 'text-amber-300';
  if (nivel === 'critico') return 'text-rose-300';
  return 'text-white';
};

const IndicadoresPanel = ({ data, loading, mes, anio, savingRevision, onAprobar }) => {
  if (loading && !data) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (!data) {
    return <p className="py-10 text-center text-sm text-slate-500">Sin indicadores para el periodo.</p>;
  }

  const req = data.requisitos_fiscales || {};
  const cov = data.cobertura_pruebas || {};
  const ux = data.tablas_ux || {};
  const dif = data.diferencias || {};
  const diot = data.diot || {};
  const exp = data.exportaciones || {};
  const rev = data.revision_contable || {};
  const salud = data.salud || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-white">
            Indicadores de seguimiento · {MESES[mes - 1]} {anio}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Métricas de avance, calidad y salud del módulo fiscal (no son impuestos a pagar).
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Score de salud</p>
          <p className={`text-3xl font-black ${saludTone(salud.nivel)}`}>
            {salud.score ?? '—'}
            <span className="ml-1 text-sm font-bold text-slate-500">/100</span>
          </p>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {String(salud.nivel || '—').replaceAll('_', ' ')}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="Requisitos fiscales" value={`${req.porcentaje ?? 0}%`} tone="emerald" />
        <Metric label="Score pruebas" value={`${cov.score_combinado ?? 0}%`} tone="sky" />
        <Metric label="Tablas con filtro" value={`${ux.porcentaje_con_filtro ?? 0}%`} />
        <Metric label="Coincidencias fuentes" value={`${dif.porcentaje_coinciden ?? 0}%`} tone={dif.desvios ? 'rose' : 'emerald'} />
        <Metric label="DIOT completos" value={`${diot.porcentaje_completos ?? 0}%`} tone={diot.incompletos ? 'amber' : 'emerald'} />
        <Metric label="Revisión contable" value={`${rev.porcentaje ?? 0}%`} tone={rev.aprobados ? 'emerald' : 'amber'} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Requisitos (etapas 0–6)</p>
          <ul className="mt-3 space-y-2">
            {(req.detalle || []).map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-xs text-slate-300">
                <CheckCircle2 className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${r.cumplido ? 'text-emerald-400' : 'text-slate-600'}`} />
                <span>{r.nombre}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="border border-slate-800 bg-slate-900 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cobertura de pruebas</p>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Suites backend</dt><dd className="font-mono text-slate-200">{cov.backend_archivos_test}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Suites fiscales</dt><dd className="font-mono text-slate-200">{cov.backend_suites_fiscales_count}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Tests frontend</dt><dd className="font-mono text-slate-200">{cov.frontend_archivos_test}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-500">Suites fiscales FE</dt><dd className="font-mono text-amber-300">{cov.frontend_suites_fiscales ?? 0}</dd></div>
          </dl>
          {cov.nota && <p className="mt-3 text-[11px] leading-5 text-slate-500">{cov.nota}</p>}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <SourceCard
          title="Diferencias del periodo"
          rows={[
            ['Estado', String(dif.estado_general || '—')],
            ['Comparaciones', dif.comparaciones ?? 0],
            ['Coinciden', dif.coinciden ?? 0],
            ['Desvíos', dif.desvios ?? 0],
            ['% OK', `${dif.porcentaje_coinciden ?? 0}%`],
          ]}
        />
        <SourceCard
          title="DIOT"
          rows={[
            ['Proveedores', diot.proveedores ?? 0],
            ['Completos', diot.completos ?? 0],
            ['Incompletos', diot.incompletos ?? 0],
            ['Exportable SAT', diot.exportable ? 'Sí' : 'No'],
            ['% Completos', `${diot.porcentaje_completos ?? 0}%`],
          ]}
        />
        <SourceCard
          title="Exportaciones bitácora"
          rows={[
            ['Exitosas (hist.)', exp.total_exitosas_registradas ?? 0],
            ['Exitosas periodo', exp.exitosas_periodo ?? 0],
            ['Forzadas periodo', exp.forzadas_periodo ?? 0],
            ['Errores registrados', exp.errores_registrados ?? 0],
            ['Formatos', Object.keys(exp.por_formato || {}).join(', ') || '—'],
          ]}
        />
      </div>

      {exp.nota_errores && (
        <p className="text-xs leading-5 text-slate-500">{exp.nota_errores}</p>
      )}

      <div className="border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Revisión contable del periodo ({rev.aprobados ?? 0}/{rev.total_modulos ?? 0})
          </p>
          <span className="text-xs font-bold text-slate-400">{rev.porcentaje ?? 0}% aprobados</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(rev.detalle || []).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 border border-slate-800 bg-slate-950/60 px-3 py-2">
              <div>
                <p className="text-xs font-bold text-slate-200">{m.nombre}</p>
                <p className={`text-[10px] font-bold uppercase tracking-wide ${m.aprobado ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {m.aprobado ? 'Aprobado' : 'Pendiente'}
                </p>
              </div>
              {!m.aprobado && (
                <button
                  type="button"
                  disabled={!!savingRevision}
                  onClick={() => onAprobar(m.id)}
                  className="inline-flex min-h-8 items-center gap-1 border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  {savingRevision === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Aprobar
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-3 py-2">Tabla UX</th>
              <th className="px-3 py-2">Filtro</th>
              <th className="px-3 py-2">Orden</th>
              <th className="px-3 py-2">Paginación</th>
            </tr>
          </thead>
          <tbody>
            {(ux.detalle || []).map((t) => (
              <tr key={t.id} className="border-t border-slate-800 bg-slate-950/40">
                <td className="px-3 py-2 text-xs text-slate-300">{t.nombre}</td>
                <td className={`px-3 py-2 text-xs font-bold ${t.filtro ? 'text-emerald-400' : 'text-slate-600'}`}>{t.filtro ? 'Sí' : 'No'}</td>
                <td className={`px-3 py-2 text-xs font-bold ${t.ordenamiento ? 'text-emerald-400' : 'text-slate-600'}`}>{t.ordenamiento ? 'Sí' : 'No'}</td>
                <td className={`px-3 py-2 text-xs font-bold ${t.paginacion ? 'text-emerald-400' : 'text-slate-600'}`}>{t.paginacion ? 'Sí' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.criterio && <p className="text-xs leading-5 text-slate-500">{data.criterio}</p>}
    </div>
  );
};

const CalcIsrPanel = ({ data, loading, mes, anio }) => {
  if (loading && !data) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (!data) {
    return <p className="py-10 text-center text-sm text-slate-500">Sin datos de ISR para el periodo.</p>;
  }

  const faltantes = data.parametros_faltantes || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-black text-white">
          ISR provisional · {MESES[mes - 1]} {anio}
        </h3>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${badgeTone(data.estatus)}`}>
          {String(data.estatus || '—').replaceAll('_', ' ')}
        </span>
      </div>

      {faltantes.length > 0 && (
        <div className="flex gap-3 border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="font-bold">Parámetros pendientes del régimen</p>
            <p className="mt-1 text-xs text-amber-100/80">
              Configúralos en la pestaña Régimen o pásalos al endpoint. Faltan: {faltantes.join(', ')}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ingresos acumulados" value={money(data.ingresos_acumulados)} />
        <Metric label="Deducciones" value={money(data.deducciones_aplicadas ?? data.deducciones_acumuladas)} />
        <Metric label="Base gravable" value={money(data.base_gravable)} />
        <Metric label="ISR estimado" value={money(data.isr_estimado ?? data.saldo?.isr_causado)} tone="sky" />
        <Metric label="ISR retenido" value={money(data.retenciones_isr ?? data.saldo?.retenciones_isr)} />
        <Metric label="Pagos previos" value={money(data.pagos_provisionales_anteriores ?? data.saldo?.pagos_provisionales_anteriores)} />
        <Metric label="Pérdidas aplicadas" value={money(data.total_perdidas_aplicadas ?? data.perdidas_aplicadas)} />
        <Metric label="Saldo a cargo" value={money(data.saldo?.isr_a_cargo ?? data.isr_a_pagar)} tone="rose" />
      </div>

      {(data.tarifa_progresiva || data.tarifa_aplicada) && (
        <div className="border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400">
          <p className="font-black uppercase tracking-widest text-slate-500">Tarifa aplicada</p>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-slate-300">
            {JSON.stringify(data.tarifa_progresiva || data.tarifa_aplicada, null, 2)}
          </pre>
        </div>
      )}

      {data.criterio && <p className="text-xs leading-5 text-slate-500">{data.criterio}</p>}
    </div>
  );
};

const CalcIvaPanel = ({ data, loading, mes, anio }) => {
  if (loading && !data) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (!data) {
    return <p className="py-10 text-center text-sm text-slate-500">Sin datos de IVA para el periodo.</p>;
  }

  const per = data.periodo_actual || {};
  const acum = data.acumulado_anual || {};

  return (
    <div className="space-y-4">
      <h3 className="text-base font-black text-white">
        IVA provisional · {MESES[mes - 1]} {anio}
      </h3>

      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Periodo actual</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="IVA trasladado" value={money(per.iva_trasladado)} />
        <Metric label="IVA acreditable" value={money(per.iva_acreditable)} />
        <Metric label="IVA retenido" value={money(per.iva_retenido)} />
        <Metric
          label="IVA a cargo"
          value={money(Math.max(Number(per.iva_a_cargo) || 0, 0))}
          tone="rose"
        />
        <Metric
          label="Saldo a favor"
          value={money(per.saldo_a_favor ?? Math.max(-(Number(per.iva_a_cargo) || 0), 0))}
          tone="emerald"
        />
      </div>

      <p className="pt-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Acumulado anual</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="IVA trasladado YTD" value={money(acum.iva_trasladado)} />
        <Metric label="IVA acreditable YTD" value={money(acum.iva_acreditable)} />
        <Metric label="IVA retenido YTD" value={money(acum.iva_retenido)} />
        <Metric label="IVA a cargo YTD" value={money(Math.max(Number(acum.iva_a_cargo) || 0, 0))} />
        <Metric label="Favor YTD" value={money(acum.saldo_a_favor)} tone="emerald" />
      </div>

      {data.criterio && <p className="text-xs leading-5 text-slate-500">{data.criterio}</p>}
    </div>
  );
};

const DiferenciasPanel = ({ data, loading }) => {
  if (loading && !data) {
    return (
      <div className="flex justify-center py-14">
        <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }
  if (!data) {
    return <p className="py-10 text-center text-sm text-slate-500">Sin comparación de fuentes.</p>;
  }

  const difs = Object.entries(data.diferencias || {});
  const cfdi = data.cfdi || {};
  const pol = data.polizas || {};
  const calc = data.calculo_fiscal || {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-black text-white">CFDI vs pólizas vs cálculo fiscal</h3>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${badgeTone(data.estado_general)}`}>
          {data.estado_general}
        </span>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <SourceCard
          title="CFDI"
          rows={[
            ['Ingresos (I)', money(cfdi.ingresos_total)],
            ['Egresos (E)', money(cfdi.egresos_total)],
            ['IVA ingresos', money(cfdi.ingresos_iva)],
            ['IVA egresos', money(cfdi.egresos_iva)],
            ['# Ingreso', cfdi.facturas_ingreso],
            ['# Egreso', cfdi.facturas_egreso],
          ]}
        />
        <SourceCard
          title="Pólizas"
          rows={[
            ['Diario', money(pol.total_diario)],
            ['Ingreso', money(pol.total_ingreso)],
            ['Egreso', money(pol.total_egreso)],
            ['IVA 216.01', money(pol.iva_trasladado_cuentas)],
            ['IVA 118.01', money(pol.iva_acreditable_cuentas)],
            ['# Pólizas', pol.count],
          ]}
        />
        <SourceCard
          title="Cálculo fiscal"
          rows={[
            ['IVA trasl. periodo', money(calc.iva?.iva_trasladado)],
            ['IVA acr. periodo', money(calc.iva?.iva_acreditable)],
            ['ISR estatus', String(calc.isr_estatus || '—').replaceAll('_', ' ')],
            ['ISR estimado', money(calc.isr_estimado)],
            ['DIOT exportable', calc.diot_exportable ? 'Sí' : 'No'],
            ['DIOT incompletos', calc.diot_incompletos ?? 0],
          ]}
        />
      </div>

      {(data.alertas || []).length > 0 && (
        <div className="border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <p className="font-bold">Desvíos detectados (tolerancia $0.05)</p>
          <ul className="mt-2 space-y-1 text-xs">
            {data.alertas.map((a) => (
              <li key={a.clave}>
                {a.clave}: {money(a.izquierda)} vs {money(a.derecha)} → Δ {money(a.diferencia)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900 text-[10px] font-black uppercase tracking-widest text-slate-500">
            <tr>
              <th className="px-3 py-2">Comparación</th>
              <th className="px-3 py-2 text-right">Fuente A</th>
              <th className="px-3 py-2 text-right">Fuente B</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {difs.map(([clave, row]) => (
              <tr key={clave} className="border-t border-slate-800 bg-slate-950/40">
                <td className="px-3 py-2 text-xs text-slate-300">{clave.replaceAll('_', ' ')}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-white">{money(row.izquierda)}</td>
                <td className="px-3 py-2 text-right font-mono text-xs text-white">{money(row.derecha)}</td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${row.coincide ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {money(row.diferencia)}
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs font-bold ${row.coincide ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {row.coincide ? 'OK' : 'Revisar'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.criterio && <p className="text-xs leading-5 text-slate-500">{data.criterio}</p>}
    </div>
  );
};

const SourceCard = ({ title, rows }) => (
  <div className="border border-slate-800 bg-slate-900 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
    <dl className="mt-3 space-y-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 text-xs">
          <dt className="text-slate-500">{k}</dt>
          <dd className="font-mono text-slate-200">{v}</dd>
        </div>
      ))}
    </dl>
  </div>
);

const Metric = ({ label, value, tone }) => (
  <div className="border border-slate-800 bg-slate-900 p-4">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
    <p
      className={`mt-2 text-sm font-bold ${
        tone === 'rose'
          ? 'text-rose-300'
          : tone === 'emerald'
            ? 'text-emerald-300'
            : tone === 'sky'
              ? 'text-sky-300'
              : tone === 'amber'
                ? 'text-amber-300'
                : 'text-white'
      }`}
    >
      {value}
    </p>
  </div>
);

export default FiscalConsolidadosPanel;
