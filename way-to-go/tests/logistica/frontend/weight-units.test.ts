import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node executes this TypeScript test directly.
import { formatMetricTonnes, kilogramsToMetricTonnes } from '../../../app/services/weight-units.ts';

test('convierte 3,500 kg a 3.5 toneladas métricas', () => {
  assert.equal(kilogramsToMetricTonnes(3500), 3.5);
  assert.equal(formatMetricTonnes(kilogramsToMetricTonnes(3500)), '3.5 t');
});

test('formatea el peso Carta Porte ya almacenado en toneladas sin convertirlo otra vez', () => {
  assert.equal(formatMetricTonnes('3.500'), '3.5 t');
  assert.equal(formatMetricTonnes(3500), '3500 t');
});

test('presenta los pendientes y conserva un cero real', () => {
  assert.equal(formatMetricTonnes(null), 'Pendiente');
  assert.equal(formatMetricTonnes(undefined), 'Pendiente');
  assert.equal(formatMetricTonnes(0), '0 t');
});

test('no convierte valores de kilogramos no finitos', () => {
  assert.throws(() => kilogramsToMetricTonnes(Number.NaN), /número finito/);
});
