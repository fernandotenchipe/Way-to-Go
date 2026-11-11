import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node executes this TypeScript test directly.
import { buildTripCartaPorteFiscalInput, resolveTripCartaPorteFiscalSelection } from '../../../app/services/carta-porte-fiscal.ts';

test('el servicio de transporte explícito se envía como CFDI I', () => {
  assert.deepEqual(buildTripCartaPorteFiscalInput('issuer-1', 'SERVICIO_TRANSPORTE', false), {
    empresa_emisora_id: 'issuer-1', tipo_comprobante: 'I', escenario_fiscal: 'SERVICIO_TRANSPORTE',
  });
});

test('el traslado propio requiere confirmación explícita y se envía como CFDI T', () => {
  assert.throws(() => resolveTripCartaPorteFiscalSelection('TRASLADO_BIENES_PROPIOS', false), /Confirma expresamente/);
  assert.deepEqual(buildTripCartaPorteFiscalInput('issuer-1', 'TRASLADO_BIENES_PROPIOS', true), {
    empresa_emisora_id: 'issuer-1', tipo_comprobante: 'T', escenario_fiscal: 'TRASLADO_BIENES_PROPIOS', mercancias_propias: true,
  });
});

test('no hay escenario fiscal implícito y no se deriva de la asignación del viaje', () => {
  assert.throws(() => resolveTripCartaPorteFiscalSelection('', false), /Selecciona explícitamente/);
});
