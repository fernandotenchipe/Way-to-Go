export function kilogramsToMetricTonnes(value: number): number {
  if (!Number.isFinite(value)) throw new Error('El peso en kilogramos debe ser un número finito.');
  return value / 1000;
}

export function formatMetricTonnes(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Pendiente';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  const formatted = new Intl.NumberFormat('es-MX', { useGrouping: false, maximumFractionDigits: 3 }).format(numeric);
  return `${formatted} t`;
}
