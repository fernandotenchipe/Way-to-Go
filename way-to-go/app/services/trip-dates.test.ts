import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node ejecuta este archivo directamente con soporte TypeScript.
import { tripDateToIso } from './trip-dates.ts';

test('Las citas usan la zona del lugar y permiten comparar ciudades diferentes', () => {
  assert.equal(tripDateToIso('2026-10-20T08:00', 'America/Mexico_City'), '2026-10-20T14:00:00.000Z');
  assert.equal(tripDateToIso('2026-10-20T08:00', 'America/Tijuana'), '2026-10-20T15:00:00.000Z');
  assert.equal(tripDateToIso('2026-10-20T08:00', 'America/Cancun'), '2026-10-20T13:00:00.000Z');
});
test('No acepta fechas inexistentes ni horas ambiguas por cambio de horario', () => {
  assert.throws(() => tripDateToIso('2026-02-30T08:00', 'America/Mexico_City'));
  assert.throws(() => tripDateToIso('2026-03-08T02:30', 'America/Tijuana'));
  assert.throws(() => tripDateToIso('2026-11-01T01:30', 'America/Tijuana'));
});
