import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node executes this TypeScript test directly.
import { loadTripViewTrip } from '../../../app/services/trip-view.ts';
import type { LogisticsTrip } from '../../../app/services/logistics-api.js';

test('el expediente muestra el viaje aunque el registro, la sesión y otros datos queden pendientes', async () => {
  const trip = { data: { folio: '4' } as LogisticsTrip };
  let secondaryCalls = 0;
  const pending = () => { secondaryCalls++; return new Promise(() => {}); };
  const api = {
    getTrip: async () => trip,
    getTripRecord: pending,
    getTripSession: pending,
    getTripEvidence: pending,
    getCatalogs: pending,
  };

  const loadedTrip = await loadTripViewTrip('4', api);

  assert.equal(loadedTrip.folio, '4');
  assert.equal(secondaryCalls, 0);
});
