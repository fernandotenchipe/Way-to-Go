import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from '../../../node_modules/typescript/lib/typescript.js';

async function loadApi() {
  const source = await readFile(new URL('../../../app/services/logistics-api.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`) as Promise<typeof import('../../../app/services/logistics-api.ts')>;
}

test('crear viaje usa POST y el folio devuelto se puede consultar después', async () => {
  const { logisticsApi } = await loadApi();
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string }> = [];
  const trip = { id: 'trip-qa', folio: 'WTG-9001', estado_operativo: 'CONFIRMADO' };
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || 'GET';
    calls.push({ url, method });
    if (method === 'POST') {
      const body = JSON.parse(String(init.body));
      assert.equal(body.operador_id, null);
      assert.equal(body.proveedor_id, null);
      return new Response(JSON.stringify({ success: true, data: trip }), { status: 201 });
    }
    assert.equal(url, '/api/logistica/trips/WTG-9001');
    return new Response(JSON.stringify({ success: true, data: trip }), { status: 200 });
  };
  try {
    const created = await logisticsApi.createTrip({
      cliente_id: 'customer', origen_id: 'origin', destino_id: 'destination', estado_operativo: 'CONFIRMADO',
      salida_programada_at: '2026-11-18T15:00:00Z', cita_carga_at: '2026-11-18T14:00:00Z',
      entrega_estimada_at: '2026-11-18T19:00:00Z', reserva_desde: '2026-11-18T14:00:00Z',
      reserva_hasta: '2026-11-18T19:00:00Z', tipo_servicio_id: 'service', tipo_carga: 'QA',
      descripcion_carga: 'Prueba aislada', moneda: 'MXN', instrucciones: '', operador_id: null, proveedor_id: null,
    });
    const loaded = await logisticsApi.getTrip(created.data.folio);
    assert.equal(loaded.data.id, trip.id);
    assert.deepEqual(calls.map(call => call.method), ['POST', 'GET']);
    assert.equal(calls[0].url, '/api/logistica/trips');
  } finally { globalThis.fetch = originalFetch; }
});

test('el error HTTP del alta conserva código y estatus para mostrar el conflicto al usuario', async () => {
  const { logisticsApi, LogisticsApiError } = await loadApi();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, code: 'CONFLICT', error: 'Revisa el viaje' }), { status: 409 });
  try {
    await assert.rejects(logisticsApi.createTrip({
      cliente_id: 'customer', origen_id: 'origin', destino_id: 'destination', estado_operativo: 'CONFIRMADO',
      salida_programada_at: '2026-11-18T15:00:00Z', cita_carga_at: '2026-11-18T14:00:00Z',
      entrega_estimada_at: '2026-11-18T19:00:00Z', reserva_desde: '2026-11-18T14:00:00Z',
      reserva_hasta: '2026-11-18T19:00:00Z', tipo_servicio_id: 'service', tipo_carga: 'QA',
      descripcion_carga: 'Prueba aislada', moneda: 'MXN', instrucciones: '',
    }), (error: unknown) => error instanceof LogisticsApiError && error.status === 409 && error.code === 'CONFLICT');
  } finally { globalThis.fetch = originalFetch; }
});
