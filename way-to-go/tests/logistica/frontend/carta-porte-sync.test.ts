import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node executes this TypeScript test directly.
import { findUnmatchedTripCargo } from '../../../app/services/carta-porte-sync.ts';

const cargo = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, posicion: 1, descripcion: 'Caja de piezas', mercancia: 'Caja de piezas', cantidad: '2.000000',
  bienes_transp_sat: '11121600', clave_unidad_sat: 'H87', unidad: 'Pieza', peso_kg: '10.000',
  hazmat: false, clave_material_peligroso_sat: null, embalaje_sat: null, embalaje: null, ...overrides,
});

test('la sincronización ignora una mercancía que ya coincide en Carta Porte', () => {
  assert.deepEqual(findUnmatchedTripCargo([cargo('trip-1')], [{ ...cargo('cp-1'), id: 'cp-1' }]), []);
});

test('la sincronización compara repetidos como conjunto y agrega solo la ocurrencia faltante', () => {
  const missing = findUnmatchedTripCargo([cargo('trip-1'), cargo('trip-2')], [{ ...cargo('cp-1'), id: 'cp-1' }]);
  assert.deepEqual(missing.map(row => row.id), ['trip-2']);
});

test('un cambio de cantidad o clave SAT se presenta como mercancía distinta', () => {
  const missing = findUnmatchedTripCargo([cargo('trip-1', { cantidad: '3.000000' })], [{ ...cargo('cp-1'), id: 'cp-1' }]);
  assert.deepEqual(missing.map(row => row.id), ['trip-1']);
});
