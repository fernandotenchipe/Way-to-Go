import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node executes this TypeScript test directly.
import { assignLocationOrder, locationRouteIsValid, moveLocation, repeatedLocationKeys } from '../../../app/services/carta-porte-locations.ts';

const loc = (tipo: 'Origen' | 'Destino', fecha_hora: string | null = null) => ({ tipo, fecha_hora });

test('acepta un origen y un destino', () => assert.equal(locationRouteIsValid([loc('Origen'), loc('Destino')]), true));
test('acepta un origen y múltiples destinos', () => assert.equal(locationRouteIsValid([loc('Origen'), loc('Destino'), loc('Destino')]), true));
test('acepta múltiples orígenes y un destino', () => assert.equal(locationRouteIsValid([loc('Origen'), loc('Origen'), loc('Destino')]), true));
test('acepta múltiples orígenes y destinos, incluso paradas repetidas legítimas', () => assert.equal(locationRouteIsValid([loc('Origen'), loc('Destino'), loc('Origen'), loc('Destino')]), true));
test('el orden y los identificadores se actualizan sin sustituir los IDs existentes', () => {
  const rows = assignLocationOrder([
    { key: 'a', id: 'persisted-a', tipo: 'Origen', posicion: 9, identificador_sat: 'OR000009' },
    { key: 'b', tipo: 'Destino', posicion: 10, identificador_sat: 'DE000010' },
  ] as never[]);
  assert.deepEqual(rows.map(row => [row.key, row.id, row.posicion, row.identificador_sat]), [
    ['a', 'persisted-a', 1, 'OR000001'], ['b', undefined, 2, 'DE000001'],
  ]);
  assert.deepEqual(moveLocation(rows, 0, 1).map(row => row.key), ['b', 'a']);
});
test('rechaza fechas en orden inverso o con formato inválido', () => {
  assert.equal(locationRouteIsValid([loc('Origen', '2026-02-02T00:00:00Z'), loc('Destino', '2026-02-01T00:00:00Z')]), false);
  assert.equal(locationRouteIsValid([loc('Origen', 'fecha'), loc('Destino')]), false);
});
test('detecta domicilios repetidos para confirmación sin bloquear operaciones legítimas', () => {
  const rows = [
    { key: 'pickup-1', tipo: 'Origen' as const, direccion_id: 'same-address' },
    { key: 'pickup-2', tipo: 'Origen' as const, direccion_id: 'same-address' },
    { key: 'delivery', tipo: 'Destino' as const, direccion_id: 'other-address' },
  ];
  assert.deepEqual(repeatedLocationKeys(rows), ['pickup-1', 'pickup-2']);
  assert.equal(locationRouteIsValid(rows), true);
});
