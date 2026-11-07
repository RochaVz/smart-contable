const money = (value) => {
  if (value == null) return 'Sin registro';
  return Number(value).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  });
};

const formatMethod = (value) => (value ? String(value).replaceAll('_', ' ') : null);

const normalizar = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const coincideImpuesto = (tipo, impuesto) => {
  const normalizado = normalizar(tipo);
  if (impuesto === 'isr') return normalizado.includes('isr');
  if (impuesto === 'iva') return normalizado.includes('iva');
  if (impuesto === 'retenciones') return normalizado.includes('retencion');
  return normalizado.includes('ish') || normalizado.includes('hospedaje');
};

const agregarDeclaraciones = (rows, impuesto, declaraciones, registradas) => {
  const relacionadas = declaraciones.filter((item) => coincideImpuesto(item.tipo, impuesto));
  relacionadas.forEach((item, index) => {
    const detalle = [
      item.tipo,
      item.periodicidad,
      item.periodo_corresponde,
      item.descripcion,
      item.base_legal,
      item.mes_presentacion,
    ].filter(Boolean).join(' · ');
    rows.push([
      `Declaración ${index + 1}`,
      detalle || 'Sin detalle',
    ]);
  });

  const registros = registradas.filter((item) => coincideImpuesto(item.tipo, impuesto));
  registros.forEach((item, index) => {
    rows.push([
      `Estatus declarado ${index + 1}`,
      `${item.estado || 'Sin estatus'} · Versión ${item.version ?? '—'} · Cargo: ${money(item.monto_a_cargo)} · Favor: ${money(item.monto_a_favor)}`,
    ]);
  });
};

const SourceCard = ({ title, badge, rows }) => (
  <article className="rounded-xl border border-[color:var(--sc-border)] bg-[color:var(--sc-soft)] p-4">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">{title}</h3>
      {badge && (
        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400">
          {badge}
        </span>
      )}
    </div>
    <dl className="mt-3 space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-3 text-xs">
          <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className="max-w-[65%] text-right font-mono font-bold text-slate-900 dark:text-white">{value}</dd>
        </div>
      ))}
    </dl>
  </article>
);

export default function ImpuestosSatCards({
  impuestos,
  obligaciones,
  totales,
  detalleFiscal,
  declaraciones = [],
  declaracionesRegistradas = [],
  periodo,
  regimenClave,
  regimenNombre,
  tipoPersona,
}) {
  const imp = impuestos || {};
  const tot = totales || {};
  const isr = detalleFiscal?.isr?.totales_periodo || {};
  const iva = detalleFiscal?.iva?.totales_periodo || {};
  const retenciones = detalleFiscal?.retenciones?.totales || {};
  const ish = detalleFiscal?.ish?.totales || {};
  const metodo = formatMethod(obligaciones?.calculo_isr_tipo);
  const regimen = String(regimenClave || '');
  const esResico = regimen.startsWith('626');
  const esArrendamiento = regimen === '606';
  const esPersonaMoral = normalizar(tipoPersona) === 'moral' || regimen === '601' || regimen === '603' || regimen === '626_PM';
  const isrRows = [
    ['Régimen fiscal', regimenNombre || 'Sin registro'],
    ['Ejercicio', periodo?.anio ?? 'Sin registro'],
    ['Periodo', periodo?.etiqueta || 'Sin registro'],
    ['Tipo de contribuyente', esPersonaMoral ? 'Persona moral' : tipoPersona === 'fisica' ? 'Persona física' : 'Sin registro'],
    ['Estatus de determinación', imp.isr?.origen === 'declaracion' ? 'Declaración registrada' : imp.isr?.origen === 'estimado' ? 'Estimado' : 'Sin registro'],
    ['Fuente', imp.isr?.resumen || 'Sin registro'],
  ];

  if (isr.ingresos_acumulados != null) {
    isrRows.push([esPersonaMoral && !esResico ? 'Ingresos CFDI acumulados' : 'Ingresos registrados en CFDI', money(isr.ingresos_acumulados)]);
  }
  if (!esResico && isr.deducciones_acumuladas != null) {
    isrRows.push([esArrendamiento ? 'Deducciones registradas' : 'Deducciones CFDI acumuladas', money(isr.deducciones_acumuladas)]);
  }
  if (!esResico && isr.base_gravable != null) {
    isrRows.push(['Base gravable informativa', money(isr.base_gravable)]);
  }
  if (!esResico && isr.retenciones_isr != null) {
    isrRows.push(['Retenciones ISR en CFDI', money(isr.retenciones_isr)]);
  }
  isrRows.push([esResico ? 'ISR determinado / a cargo' : 'ISR a cargo', money(tot.isr_a_cargo)]);
  agregarDeclaraciones(isrRows, 'isr', declaraciones, declaracionesRegistradas);

  const ivaRows = [
    ['IVA trasladado', money(iva.iva_trasladado)],
    ['IVA acreditable', money(iva.iva_acreditable)],
    ['IVA retenido', money(iva.iva_retenido)],
    ['IVA neto informativo CFDI', money(iva.iva_a_cargo)],
    ['IVA a cargo', money(tot.iva_a_cargo)],
    ['IVA a favor', money(tot.iva_a_favor)],
    ['Fuente', imp.iva?.resumen || 'Sin registro'],
  ];
  agregarDeclaraciones(ivaRows, 'iva', declaraciones, declaracionesRegistradas);

  const retencionesRows = [
    ['ISR retenido', money(retenciones.isr_retenido ?? imp.retenciones?.isr)],
    ['IVA retenido', money(retenciones.iva_retenido ?? imp.retenciones?.iva)],
    ['Total retenido', money(retenciones.total_retenciones ?? tot.retenciones)],
    ['Fuente', imp.retenciones?.resumen || 'Sin registro'],
  ];
  agregarDeclaraciones(retencionesRows, 'retenciones', declaraciones, declaracionesRegistradas);

  const ishRows = [
    ['ISH determinado', money(ish.ish ?? tot.ish)],
    ['Fuente', imp.ish?.resumen || 'Sin registro'],
  ];
  if (ish.cfdi_con_ish != null) {
    ishRows.push(['CFDI con impuesto local', String(ish.cfdi_con_ish)]);
  }
  agregarDeclaraciones(ishRows, 'ish', declaraciones, declaracionesRegistradas);

  const obligacionesSinAgrupar = declaraciones.filter((item) => (
    !['isr', 'iva', 'retenciones', 'ish'].some((impuesto) => coincideImpuesto(item.tipo, impuesto))
  ));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SourceCard title="ISR provisional" badge={metodo} rows={isrRows} />
        <SourceCard title="IVA" rows={ivaRows} />
        <SourceCard title="Retenciones" rows={retencionesRows} />
        <SourceCard title="ISH (hospedaje)" rows={ishRows} />
      </div>

      {obligacionesSinAgrupar.length > 0 && (
        <div className="rounded-xl border border-[color:var(--sc-border)] bg-[color:var(--sc-soft)] p-4">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Otras obligaciones</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {obligacionesSinAgrupar.map((item) => (
              <span
                key={`${item.tipo}-${item.periodicidad}`}
                title={item.descripcion}
                className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300"
              >
                {item.tipo} · {item.periodicidad}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
