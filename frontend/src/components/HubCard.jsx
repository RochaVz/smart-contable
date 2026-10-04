import { memo } from 'react';

const ACCENT = {
  sky: {
    icon: 'bg-sky-500/15 text-sky-300',
    active: 'border-sky-400/50 from-sky-500 to-sky-600 shadow-sky-900/40',
  },
  violet: {
    icon: 'bg-violet-500/15 text-violet-300',
    active: 'border-violet-400/50 from-violet-500 to-violet-600 shadow-violet-900/40',
  },
  cyan: {
    icon: 'bg-cyan-500/15 text-cyan-300',
    active: 'border-cyan-400/50 from-cyan-500 to-cyan-600 shadow-cyan-900/40',
  },
  amber: {
    icon: 'bg-amber-500/15 text-amber-300',
    active: 'border-amber-400/50 from-amber-500 to-amber-600 shadow-amber-900/40',
  },
  emerald: {
    icon: 'bg-emerald-500/15 text-emerald-300',
    active: 'border-emerald-400/50 from-emerald-500 to-emerald-600 shadow-emerald-900/40',
  },
  rose: {
    icon: 'bg-rose-500/15 text-rose-300',
    active: 'border-rose-400/50 from-rose-500 to-rose-600 shadow-rose-900/40',
  },
  blue: {
    icon: 'bg-blue-500/15 text-blue-300',
    active: 'border-blue-400/50 from-blue-500 to-blue-600 shadow-blue-900/40',
  },
  orange: {
    icon: 'bg-orange-500/15 text-orange-300',
    active: 'border-orange-400/50 from-orange-500 to-orange-600 shadow-orange-900/40',
  },
  indigo: {
    icon: 'bg-indigo-500/15 text-indigo-300',
    active: 'border-indigo-400/50 from-indigo-500 to-indigo-600 shadow-indigo-900/40',
  },
};

/**
 * Botón flotante reutilizable del hub de módulos/reportes.
 */
const HubCard = memo(function HubCard({
  icon: Icon,
  label,
  description,
  badge,
  accent = 'emerald',
  active = false,
  onClick,
  className = '',
}) {
  const tones = ACCENT[accent] || ACCENT.emerald;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`hub-card btn-press group flex w-full items-start gap-3 rounded-2xl border p-4 text-left shadow-lg transition-all duration-200 ease-out ${
        active
          ? `bg-gradient-to-b text-white font-bold shadow-xl ${tones.active}`
          : 'border-slate-700/80 bg-gradient-to-b from-slate-800/95 to-slate-900 text-slate-200 hover:border-slate-500 hover:from-slate-700 hover:to-slate-800 hover:text-white'
      } ${className}`}
    >
      <div
        className={`rounded-xl p-2.5 shrink-0 shadow-sm transition-colors duration-150 ${
          active ? 'bg-white/20 text-white' : tones.icon
        }`}
      >
        {Icon ? <Icon className="h-5 w-5" /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-black leading-tight tracking-tight">{label}</p>
          {badge ? (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                active ? 'bg-white/20 text-white' : 'bg-slate-950/80 text-slate-400'
              }`}
            >
              {badge}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className={`mt-1 text-xs leading-5 ${active ? 'text-white/85' : 'text-slate-500'}`}>
            {description}
          </p>
        ) : null}
      </div>
    </button>
  );
});

export default HubCard;
