import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTrips, toTripRow } from '../../../app/services/trip-list.js';

const trip = {
  id: '1', folio: 'VJ-QA-1', cliente_id: 'customer-1', cliente: 'Cliente QA', estado_operativo: 'CONFIRMADO',
  tipo_servicio_id: null, tipo_servicio: null, tipo_carga: 'Refacciones QA', cita_carga_at: null, entrega_estimada_at: null,
  origen_snapshot: { nombre: 'Bodega QA', ciudad: 'Monterrey' }, destino_snapshot: { nombre: 'Sucursal QA', ciudad: 'Querétaro' },
  unidad_id: null, unidad: null, operador_id: null, operador: 'Operador QA', created_at: '2026-10-21T12:00:00.000Z', updated_at: '2026-10-21T12:00:00.000Z',
};

test('trip row keeps route and assignment details and uses a readable status', () => {
  const row = toTripRow(trip);
  assert.equal(row.folio, 'VJ-QA-1');
  assert.equal(row.route, 'Bodega QA, Monterrey → Sucursal QA, Querétaro');
  assert.equal(row.driver, 'Operador QA');
  assert.equal(row.cargo, 'Refacciones QA');
  assert.equal(row.status, 'Confirmado');
});

test('trip search and state filter match user-visible route, operator and status', () => {
  const row = toTripRow(trip);
  assert.equal(filterTrips([row], 'Querétaro', 'Todos').length, 1);
  assert.equal(filterTrips([row], 'Operador QA', 'Todos').length, 1);
  assert.equal(filterTrips([row], 'Refacciones QA', 'Todos').length, 1);
  assert.equal(filterTrips([row], '', 'Confirmado').length, 1);
  assert.equal(filterTrips([row], '', 'Entregado').length, 0);
});
