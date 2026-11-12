import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node executes this TypeScript test directly.
import { buildCartaPorteLocationsMutation, buildCartaPorteMerchandiseMutation, findUnmatchedTripCargo } from '../../../app/services/carta-porte-sync.ts';

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

test('la mutación conserva partidas SAT repetidas y expresa eliminaciones por id', () => {
  const repeated = [cargo('cp-1'), cargo('cp-2')];
  assert.deepEqual(buildCartaPorteMerchandiseMutation(repeated, ['cp-3']), {
    upsert: repeated,
    remove: [{ id: 'cp-3' }],
  });
});

test('la mutación de ubicaciones conserva el orden enviado y expresa eliminaciones sin reemplazar ids', () => {
  const route = [{ id: 'origin-id', posicion: 1, tipo: 'Origen' }, { id: 'stop-id', posicion: 2, tipo: 'Destino' }];
  assert.deepEqual(buildCartaPorteLocationsMutation(route, ['removed-stop-id']), {
    upsert: route, remove: [{ id: 'removed-stop-id' }],
  });
});
