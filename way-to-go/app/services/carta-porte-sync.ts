import type { CartaPorteMerchandise, TripCargoItem } from './logistics-api';

const normText = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('es-MX').replace(/\s+/g, ' ');
const normNumber = (value: unknown) => value == null || value === '' ? '' : Number(value).toString();

function signature(item: Partial<CartaPorteMerchandise | TripCargoItem>) {
  const row = item as Partial<CartaPorteMerchandise & TripCargoItem>;
  return [
    normText(row.descripcion ?? row.mercancia),
    normNumber(row.cantidad), normText(row.unidad), normNumber(row.peso_kg),
    normText(row.bienes_transp_sat), normText(row.clave_unidad_sat),
    String(row.material_peligroso ?? row.hazmat ?? 'unknown'),
    normText(row.clave_material_peligroso_sat), normText(row.embalaje_sat),
  ].join('|');
}

/** Multiset comparison: repeated identical trip cargo rows are preserved without re-importing existing CP rows. */
export function findUnmatchedTripCargo(tripCargo: TripCargoItem[], cartaPorteCargo: CartaPorteMerchandise[]) {
  const counts = new Map<string, number>();
  cartaPorteCargo.forEach(row => counts.set(signature(row), (counts.get(signature(row)) || 0) + 1));
  const missing: TripCargoItem[] = [];
  for (const item of tripCargo) {
    const key = signature(item); const count = counts.get(key) || 0;
    if (count) counts.set(key, count - 1); else missing.push(item);
  }
  return missing;
}
