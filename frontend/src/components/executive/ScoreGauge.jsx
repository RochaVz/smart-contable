import { useId } from 'react';

/** Anillo de score 0-100 con el gradiente oficial. */
export default function ScoreGauge({ score, label, size = 148 }) {
  const gradientId = useId();
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const value = score == null ? 0 : Math.min(100, Math.max(0, score));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" role="img" aria-label={`Score ${score ?? 'sin datos'} de 100`}>
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1D4ED8" />
            <stop offset="35%" stopColor="#2563EB" />
            <stop offset="70%" stopColor="#06B6D4" />
            <stop offset="100%" stopColor="#10B981" />
          </linearGradient>
        </defs>
        <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--sc-divider)" strokeWidth="12" />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="sc-text text-4xl font-black tabular-nums">{score ?? '—'}</span>
        {label ? <span className="sc-muted text-[11px] font-bold uppercase tracking-wide">{label}</span> : null}
      </div>
    </div>
  );
}
