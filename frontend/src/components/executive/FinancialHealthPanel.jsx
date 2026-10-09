import { useState } from 'react';
import { CheckCircle2, ChevronDown, Lightbulb, Target } from 'lucide-react';
import ScoreGauge from './ScoreGauge';
import { toneColor, toneFromScore } from './format';

/** Salud Financiera transparente: score, fórmulas y recomendaciones cuantificadas. */
export default function FinancialHealthPanel({ score, recomendaciones, loading }) {
  const tone = score.nivel.tone;
  const [abierto, setAbierto] = useState(score.componentes.find((c) => c.detail)?.id || null);

  return (
    <section className="sc-card flex flex-col gap-5 p-5 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="sc-label">Diagnóstico</p>
          <h3 className="sc-heading mt-0.5">Salud financiera</h3>
          <p className="sc-muted mt-1 text-xs leading-relaxed">
            Basada en {score.cobertura} de {score.componentes.length} indicadores con datos · cada score muestra su fórmula
          </p>
        </div>
        <span
          className="sc-badge"
          style={{ background: 'var(--sc-soft)', color: toneColor(tone) }}
        >
          {score.nivel.label}
        </span>
      </header>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <div className="flex justify-center md:items-center">
          {loading ? (
            <div className="sc-skeleton h-36 w-36 rounded-full" />
          ) : (
            <ScoreGauge score={score.score} label="de 100" />
          )}
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {score.componentes.map((componente) => {
            const isOpen = abierto === componente.id;
            const hasDetail = Boolean(componente.detail);
            return (
              <li key={componente.id} className="min-w-0">
                <button
                  type="button"
                  disabled={!hasDetail}
                  onClick={() => setAbierto(isOpen ? null : componente.id)}
                  className={`w-full rounded-xl border border-[color:var(--sc-border)]/40 p-3 text-left transition ${hasDetail ? 'hover:border-[color:var(--sc-primary)]/30 hover:bg-[color:var(--sc-bg)]' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                    <span className="sc-text flex items-center gap-1">
                      {componente.label}
                      {hasDetail ? (
                        <ChevronDown className={`h-3.5 w-3.5 sc-muted transition ${isOpen ? 'rotate-180' : ''}`} />
                      ) : null}
                    </span>
                    <span className="sc-muted tabular-nums">
                      {componente.score == null ? 'Sin datos' : `${componente.score}/100`}
                    </span>
                  </div>
                  <div className="sc-progress mt-2">
                    <span
                      style={{
                        width: `${componente.score ?? 0}%`,
                        background: toneColor(toneFromScore(componente.score)),
                      }}
                    />
                  </div>
                </button>

                {isOpen && componente.detail ? (
                  <div className="mt-2 rounded-xl border border-[color:var(--sc-border)]/50 bg-[color:var(--sc-bg)] p-3">
                    <p className="sc-muted text-[11px] font-semibold uppercase tracking-wide">Fórmula</p>
                    <p className="sc-text mt-1 text-xs leading-relaxed">{componente.detail.formula}</p>
                    <dl className="mt-3 space-y-1.5">
                      {componente.detail.variables.map((v) => (
                        <div key={v.label} className="flex items-start justify-between gap-3 text-xs">
                          <dt className="sc-muted font-medium">{v.label}</dt>
                          <dd className="sc-text shrink-0 font-semibold tabular-nums">{v.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-3 border-t border-[color:var(--sc-divider)] pt-2 text-xs">
                      <span className="sc-text font-semibold">
                        Ratio: <span className="tabular-nums">{componente.detail.ratio}</span>
                      </span>
                      <span className="sc-text font-semibold">
                        Score: <span className="tabular-nums">{componente.detail.score}/100</span>
                      </span>
                      <span className="sc-muted font-semibold">Estado: {componente.detail.interpretacion}</span>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ListaInsight
          titulo="Fortalezas"
          icono={CheckCircle2}
          color="var(--sc-success)"
          vacio="Aún sin fortalezas destacadas."
          items={score.fortalezas.map((c) => ({ id: c.id, texto: `${c.label} (${c.score})` }))}
        />
        <ListaInsight
          titulo="Oportunidades"
          icono={Target}
          color="var(--sc-warning)"
          vacio="Sin áreas débiles detectadas."
          items={score.oportunidades.map((c) => ({ id: c.id, texto: `${c.label} (${c.score})` }))}
        />
        <ListaInsight
          titulo="Recomendaciones"
          icono={Lightbulb}
          color="var(--sc-primary)"
          vacio="Carga CFDI para recibir recomendaciones cuantificadas."
          items={normalizarRecs(recomendaciones)}
          destacadas
        />
      </div>
    </section>
  );
}

function normalizarRecs(recomendaciones = []) {
  return recomendaciones.map((r, i) => {
    if (typeof r === 'string') return { id: `rec-${i}`, texto: r };
    return {
      id: r.id || `rec-${i}`,
      texto: r.texto,
      impacto: r.impacto || null,
    };
  });
}

function ListaInsight({ titulo, icono: Icon, color, items, vacio, destacadas = false }) {
  return (
    <div className="rounded-xl border border-[color:var(--sc-border)]/40 bg-[color:var(--sc-bg)] p-3.5">
      <h4 className="sc-label mb-2 flex items-center gap-2 normal-case tracking-normal">
        <Icon className="h-4 w-4" style={{ color }} />
        <span className="sc-text text-xs font-bold uppercase tracking-wide">{titulo}</span>
      </h4>
      {items.length === 0 ? (
        <p className="sc-muted text-xs leading-relaxed">{vacio}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="sc-text text-xs leading-5">
              <span className="font-medium">{item.texto}</span>
              {destacadas && item.impacto ? (
                <span className="sc-primary mt-0.5 block text-[11px] font-bold tabular-nums">
                  Impacto estimado: {item.impacto}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
