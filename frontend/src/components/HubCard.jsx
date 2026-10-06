import { memo } from 'react';

/**
 * Paletas vivas reutilizables para módulos y reportes.
 * Cada acento define gradiente base y emoji de apoyo.
 */
export const HUB_ACCENTS = {
  sky: {
    surface: 'hub-accent-sky',
    emoji: '🧾',
  },
  violet: {
    surface: 'hub-accent-violet',
    emoji: '📚',
  },
  cyan: {
    surface: 'hub-accent-cyan',
    emoji: '🏦',
  },
  amber: {
    surface: 'hub-accent-amber',
    emoji: '⚖️',
  },
  emerald: {
    surface: 'hub-accent-emerald',
    emoji: '📈',
  },
  rose: {
    surface: 'hub-accent-rose',
    emoji: '📉',
  },
  blue: {
    surface: 'hub-accent-blue',
    emoji: '📊',
  },
  orange: {
    surface: 'hub-accent-orange',
    emoji: '🧾',
  },
  indigo: {
    surface: 'hub-accent-indigo',
    emoji: '👥',
  },
  fuchsia: {
    surface: 'hub-accent-fuchsia',
    emoji: '🏢',
  },
};

/**
 * Botón físico reutilizable del hub de módulos/reportes.
 * Gradientes vivos + raised/pressed + icono Lucide y emoji de apoyo.
 */
const HubCard = memo(function HubCard({
  icon: Icon,
  label,
  description,
  badge,
  accent = 'emerald',
  emoji,
  active = false,
  onClick,
  className = '',
}) {
  const tones = HUB_ACCENTS[accent] || HUB_ACCENTS.emerald;
  const emojiMark = emoji || tones.emoji;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active || undefined}
      className={[
        'hub-card btn-physical font-display group flex w-full items-start gap-3 rounded-2xl border p-4 text-left',
        tones.surface,
        active ? 'is-active' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <div className="hub-card__icon shrink-0">
        <span className="hub-card__emoji" aria-hidden="true">{emojiMark}</span>
        {Icon ? <Icon className="hub-card__glyph h-5 w-5" aria-hidden="true" /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="hub-card__title text-sm font-black leading-tight tracking-tight">
            {label}
          </p>
          {badge ? (
            <span className="hub-card__badge shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider">
              {badge}
            </span>
          ) : null}
        </div>
        {description ? (
          <p className="hub-card__desc mt-1 text-xs leading-5">
            {description}
          </p>
        ) : null}
      </div>
    </button>
  );
});

export default HubCard;
