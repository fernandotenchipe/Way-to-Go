import type { CartaPorteLocationInput } from './logistics-api';

export type CartaPorteLocationDraft = CartaPorteLocationInput & { key: string };

export function assignLocationOrder(rows: CartaPorteLocationDraft[]) {
  const counters = { Origen: 0, Destino: 0 };
  return rows.map((row, index) => {
    counters[row.tipo] += 1;
    const prefix = row.tipo === 'Origen' ? 'OR' : 'DE';
    return { ...row, posicion: index + 1, identificador_sat: `${prefix}${String(counters[row.tipo]).padStart(6, '0')}` };
  });
}

export function moveLocation<T>(rows: T[], index: number, offset: -1 | 1) {
  const target = index + offset;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function locationRouteIsValid(rows: Array<Pick<CartaPorteLocationInput, 'tipo' | 'fecha_hora'>>) {
  if (!rows.some(row => row.tipo === 'Origen') || !rows.some(row => row.tipo === 'Destino')) return false;
  let previous: number | null = null;
  for (const row of rows) {
    if (!row.fecha_hora) continue;
    const current = Date.parse(row.fecha_hora);
    if (!Number.isFinite(current) || (previous !== null && current < previous)) return false;
    previous = current;
  }
  return true;
}

export function repeatedLocationKeys(rows: Array<Pick<CartaPorteLocationInput, 'tipo' | 'direccion_id'> & { key: string }>) {
  const counts = new Map<string, number>();
  rows.forEach(row => {
    if (!row.direccion_id) return;
    const signature = `${row.tipo}:${row.direccion_id}`;
    counts.set(signature, (counts.get(signature) || 0) + 1);
  });
  return rows.filter(row => row.direccion_id && (counts.get(`${row.tipo}:${row.direccion_id}`) || 0) > 1).map(row => row.key);
}
