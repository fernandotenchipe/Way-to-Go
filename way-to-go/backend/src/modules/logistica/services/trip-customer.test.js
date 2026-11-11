import test from 'node:test';
import assert from 'node:assert/strict';
import { updateTripCustomer } from './trip-customer.js';

const ids = {
  actor: '11111111-1111-4111-8111-111111111111',
  customer: '22222222-2222-4222-8222-222222222222',
  origin: '33333333-3333-4333-8333-333333333333',
  destination: '44444444-4444-4444-8444-444444444444',
  trip1: '55555555-5555-4555-8555-555555555555',
  trip2: '66666666-6666-4666-8666-666666666666',
};
const updatedAt = '2026-11-10T19:39:05.017Z';
const body = {
  cliente_id: ids.customer,
  origen_id: ids.origin,
  destino_id: ids.destination,
  updated_at: updatedAt,
  motivo: 'Sustitución de referencias QA',
};

function makePool({ inactiveCustomer = false, invalidDestinationOwner = false, finalized = false } = {}) {
  const initial = {
    trips: [
      { id: ids.trip1, folio: '4', cliente_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', origen_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', destino_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', estado_operativo: finalized ? 'ENTREGADO' : 'CONFIRMADO', updated_at: updatedAt },
      { id: ids.trip2, folio: '2', cliente_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', origen_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', destino_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', estado_operativo: 'CONFIRMADO', updated_at: updatedAt },
    ],
    customerActive: !inactiveCustomer,
    addresses: [
      { id: ids.origin, cliente_id: ids.customer, activo: true, nombre: 'Origen QA', calle: 'Calle A', ciudad: 'Monterrey', estado: 'Nuevo León' },
      { id: ids.destination, cliente_id: invalidDestinationOwner ? '77777777-7777-4777-8777-777777777777' : ids.customer, activo: true, nombre: 'Destino QA', calle: 'Calle B', ciudad: 'Saltillo', estado: 'Coahuila' },
    ],
    events: [],
    calls: [],
  };
  const state = structuredClone(initial);
  const client = {
    snapshot: null,
    async query(sql, params = []) {
      const normalized = sql.replace(/\s+/g, ' ').trim();
      state.calls.push({ sql: normalized, params });
      if (normalized === 'BEGIN') { this.snapshot = structuredClone(state); return { rows: [] }; }
      if (normalized === 'ROLLBACK') {
        if (this.snapshot) {
          const calls = state.calls;
          for (const key of Object.keys(state)) if (key !== 'calls') state[key] = structuredClone(this.snapshot[key]);
          state.calls = calls;
        }
        return { rows: [] };
      }
      if (normalized === 'COMMIT') { this.snapshot = null; return { rows: [] }; }
      if (normalized.startsWith('SELECT * FROM tms.viajes WHERE folio::text=$1')) {
        return { rows: state.trips.filter(row => row.folio === params[0]).map(row => structuredClone(row)) };
      }
      if (normalized.startsWith('SELECT id FROM tms.clientes')) {
        return { rows: state.customerActive && params[0] === ids.customer ? [{ id: ids.customer }] : [] };
      }
      if (normalized.startsWith('SELECT id, cliente_id, nombre, calle')) {
        const [addressIds, customerId] = params;
        return { rows: state.addresses.filter(row => addressIds.includes(row.id) && row.cliente_id === customerId && row.activo).map(row => structuredClone(row)) };
      }
      if (normalized.startsWith('UPDATE tms.viajes')) {
        const [tripId, clienteId, originId, destinationId, originSnapshot, destinationSnapshot] = params;
        const trip = state.trips.find(row => row.id === tripId);
        if (!trip) return { rows: [] };
        Object.assign(trip, {
          cliente_id: clienteId,
          origen_id: originId,
          destino_id: destinationId,
          origen_snapshot: JSON.parse(originSnapshot),
          destino_snapshot: JSON.parse(destinationSnapshot),
          updated_at: '2026-11-10T20:00:00.000Z',
        });
        return { rows: [structuredClone(trip)] };
      }
      if (normalized.startsWith('INSERT INTO tms.viaje_eventos')) {
        state.events.push({ viaje_id: params[0], actor: params[1], motivo: params[2], datos: JSON.parse(params[3]) });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in test: ${normalized}`);
    },
    release() {},
  };
  return { state, pool: { connect: async () => client } };
}

test('actualiza un viaje, guarda snapshots y audita dentro de una transacción', async () => {
  const { state, pool } = makePool();
  const result = await updateTripCustomer({ pool, folio: '4', body, actor: ids.actor });
  assert.equal(result.cliente_id, ids.customer);
  assert.equal(result.origen_id, ids.origin);
  assert.equal(result.destino_id, ids.destination);
  assert.equal(result.origen_snapshot.nombre, 'Origen QA');
  assert.equal(result.destino_snapshot.nombre, 'Destino QA');
  assert.equal(state.events.length, 1);
  assert.equal(state.events[0].viaje_id, ids.trip1);
  assert.equal(state.events[0].datos.antes.cliente_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.deepEqual(state.calls.filter(call => ['BEGIN', 'COMMIT'].includes(call.sql)).map(call => call.sql), ['BEGIN', 'COMMIT']);
});

test('rechaza referencias inválidas antes de abrir una transacción', async () => {
  const { state, pool } = makePool();
  await assert.rejects(updateTripCustomer({ pool, folio: '4', body: { ...body, origen_id: 'bad' }, actor: ids.actor }), error => error.status === 400);
  assert.equal(state.calls.length, 0);
});

test('rechaza cliente inactivo y domicilio que no pertenece al cliente', async () => {
  const inactive = makePool({ inactiveCustomer: true });
  await assert.rejects(updateTripCustomer({ pool: inactive.pool, folio: '4', body, actor: ids.actor }), error => error.status === 422);
  assert.ok(inactive.state.calls.some(call => call.sql === 'ROLLBACK'));

  const wrongOwner = makePool({ invalidDestinationOwner: true });
  await assert.rejects(updateTripCustomer({ pool: wrongOwner.pool, folio: '4', body, actor: ids.actor }), error => error.status === 422);
  assert.equal(wrongOwner.state.trips[0].cliente_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(wrongOwner.state.events.length, 0);
});

test('rechaza ficha obsoleta y viaje finalizado sin cambiar registros', async () => {
  const stale = makePool();
  await assert.rejects(updateTripCustomer({ pool: stale.pool, folio: '4', body: { ...body, updated_at: '2026-11-10T19:00:00.000Z' }, actor: ids.actor }), error => error.status === 409);
  assert.ok(stale.state.calls.some(call => call.sql === 'ROLLBACK'));

  const finalized = makePool({ finalized: true });
  await assert.rejects(updateTripCustomer({ pool: finalized.pool, folio: '4', body, actor: ids.actor }), error => error.status === 409);
  assert.equal(finalized.state.trips[0].cliente_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});

test('aísla el cambio al folio solicitado y no modifica otro viaje ni Carta Porte', async () => {
  const { state, pool } = makePool();
  const otherBefore = structuredClone(state.trips[1]);
  await updateTripCustomer({ pool, folio: '4', body, actor: ids.actor });
  assert.deepEqual(state.trips[1], otherBefore);
  assert.equal(state.events.some(event => event.viaje_id === ids.trip2), false);
  assert.equal(state.calls.some(call => /cartas_porte|cfdi/.test(call.sql)), false);
  assert.equal(state.calls.some(call => /^(UPDATE|INSERT|DELETE) tms\.(clientes|cliente_direcciones)\b/.test(call.sql)), false);
});
