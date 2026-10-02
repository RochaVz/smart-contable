import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Link2, Loader2, RefreshCw, Wallet } from 'lucide-react';
import api from '../services/api';

const money = (value) =>
  Number(value || 0).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });

const CfdiComplementosPanel = ({ empresa }) => {
  const empresaId = empresa?.id;
  const now = useMemo(() => new Date(), []);
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pagos, setPagos] = useState([]);
  const [nominas, setNominas] = useState([]);
  const [retenciones, setRetenciones] = useState(null);

  const load = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    setError('');
    try {
      const params = { empresa_id: empresaId, anio, mes };
      const [p, n, r] = await Promise.all([
        api.get('/cfdi-complementos/pagos', { params }),
        api.get('/cfdi-complementos/nominas', { params }),
        api.get('/cfdi-complementos/retenciones-terceros', { params }),
      ]);
      setPagos(p.data?.items || []);
      setNominas(n.data?.items || []);
      setRetenciones(r.data || null);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'No se pudieron cargar complementos CFDI');
    } finally {
      setLoading(false);
    }
  }, [empresaId, anio, mes]);

  useEffect(() => {
    load();
  }, [load]);

  if (!empresaId) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Complementos CFDI</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Pagos, nomina (percepciones/deducciones/subsidio) y retenciones a terceros
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={mes}
            onChange={(e) => setMes(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="w-24 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            value={anio}
            onChange={(e) => setAnio(Number(e.target.value) || now.getFullYear())}
          />
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white dark:bg-slate-100 dark:text-slate-900"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Actualizar
          </button>
        </div>
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Wallet className="h-4 w-4" /> Pagos</div>
          <div className="mt-1 text-xl font-semibold">{pagos.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex items-center gap-2 text-sm text-slate-500"><FileText className="h-4 w-4" /> Nominas</div>
          <div className="mt-1 text-xl font-semibold">{nominas.length}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <div className="flex items-center gap-2 text-sm text-slate-500"><Link2 className="h-4 w-4" /> Retenciones</div>
          <div className="mt-1 text-sm">ISR {money(retenciones?.total_isr_retenido)}</div>
          <div className="text-sm">IVA {money(retenciones?.total_iva_retenido)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Complementos de pago</h4>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {pagos.length === 0 ? (
              <p className="text-sm text-slate-500">Sin pagos en el periodo.</p>
            ) : (
              pagos.map((p) => (
                <div key={p.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                  <div className="font-medium">{p.uuid}</div>
                  <div className="text-slate-500">{p.fecha_emision || 'Sin fecha'} · Docs: {p.num_documentos}</div>
                  <div>Total pagos: {money(p.total_pagos)}</div>
                  {(p.documentos || []).slice(0, 3).map((d) => (
                    <div key={d.id} className="mt-1 text-xs text-slate-500">
                      Relacionado: {d.uuid_cfdi_relacionado || '—'}
                      {d.factura_id ? ` → factura #${d.factura_id}` : ' (sin factura local)'} · pagado {money(d.importe_pagado)}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Nominas</h4>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {nominas.length === 0 ? (
              <p className="text-sm text-slate-500">Sin nominas en el periodo.</p>
            ) : (
              nominas.map((n) => (
                <div key={n.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
                  <div className="font-medium">Factura #{n.factura_id} · {n.fecha_pago || 'Sin fecha pago'}</div>
                  <div className="text-slate-500">
                    Percepciones {money(n.total_percepciones)} · Deducciones {money(n.total_deducciones)}
                  </div>
                  <div>ISR retenido {money(n.isr_retenido)} · Subsidio {money(n.subsidio_entregado)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Lineas: {(n.lineas || []).filter((l) => l.tipo_linea === 'percepcion').length} perc /{' '}
                    {(n.lineas || []).filter((l) => l.tipo_linea === 'deduccion').length} ded /{' '}
                    {(n.lineas || []).filter((l) => l.es_subsidio).length} subsidio
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CfdiComplementosPanel;

