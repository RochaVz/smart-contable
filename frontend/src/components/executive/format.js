export const formatMoney = (value, { compact = false } = {}) => {
  const number = Number(value) || 0;
  if (compact && Math.abs(number) >= 1_000_000) {
    return `${number < 0 ? '-' : ''}$${(Math.abs(number) / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 2 })} M`;
  }
  return number.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
    maximumFractionDigits: compact ? 0 : 2,
  });
};

export const formatPct = (value, digits = 1) => (
  value == null ? '—' : `${Number(value).toLocaleString('es-MX', { maximumFractionDigits: digits })}%`
);

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const etiquetaPeriodo = (mes, anio) => `${MESES[mes - 1]} ${anio}`;

export const toneColor = (tone) => ({
  success: 'var(--sc-success)',
  primary: 'var(--sc-primary)',
  warning: 'var(--sc-warning)',
  danger: 'var(--sc-danger)',
  neutral: 'var(--sc-muted)',
}[tone] || 'var(--sc-muted)');

export const toneFromScore = (score) => {
  if (score == null) return 'neutral';
  if (score >= 80) return 'success';
  if (score >= 65) return 'primary';
  if (score >= 40) return 'warning';
  return 'danger';
};
