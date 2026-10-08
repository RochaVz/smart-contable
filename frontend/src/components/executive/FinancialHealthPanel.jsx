import { CheckCircle2, Lightbulb, Target } from 'lucide-react';
import ScoreGauge from './ScoreGauge';
import { toneColor, toneFromScore } from './format';

/** Salud Financiera: score 0-100, componentes, fortalezas, oportunidades y recomendaciones. */
export default function FinancialHealthPanel({ score, recomendaciones, loading }) {
  const tone = score.nivel.tone;

  return (
    <section className="sc-card flex flex-col gap-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="sc-text text-base font-black">Salud Financiera</h3>
          <p className="sc-muted text-xs font-semibold">
            Basada en {score.cobertura} de {score.componentes.length} indicadores con datos disponibles
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
          {loading ? <div className="sc-skeleton h-36 w-36 rounded-full" /> : <ScoreGauge score={score.score} label="de 100" />}
        </div>

        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {score.componentes.map((componente) => (
            <li key={componente.id} className="min-w-0">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="sc-text">{componente.label}</span>
                <span className="sc-muted tabular-nums">{componente.score ?? 'Sin datos'}</span>
              </div>
              <div className="sc-progress mt-1">
                <span
                  style={{
                    width: `${componente.score ?? 0}%`,
                    background: toneColor(toneFromScore(componente.score)),
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ListaInsight
          titulo="Fortalezas"
          icono={CheckCircle2}
          color="var(--sc-success)"
          vacio="Aún sin fortalezas destacadas."
          items={score.fortalezas.map((c) => `${c.label} (${c.score})`)}
        />
        <ListaInsight
          titulo="Oportunidades"
          icono={Target}
          color="var(--sc-warning)"
          vacio="Sin áreas débiles detectadas."
          items={score.oportunidades.map((c) => `${c.label} (${c.score})`)}
        />
        <ListaInsight
          titulo="Recomendaciones"
          icono={Lightbulb}
          color="var(--sc-primary)"
          vacio="Carga CFDI para recibir recomendaciones."
          items={recomendaciones}
        />
      </div>
    </section>
  );
}

function ListaInsight({ titulo, icono: Icon, color, items, vacio }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--sc-bg)' }}>
      <h4 className="sc-text mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wide">
        <Icon className="h-4 w-4" style={{ color }} />
        {titulo}
      </h4>
      {items.length === 0 ? (
        <p className="sc-muted text-xs font-semibold">{vacio}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item} className="sc-text text-xs font-semibold leading-5">• {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
