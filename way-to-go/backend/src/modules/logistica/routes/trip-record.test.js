import { test } from 'node:test';
import assert from 'node:assert/strict';
import tripRecordRouter from './trip-record.js';

const id = '11111111-1111-4111-8111-111111111111';
const stamp = '2026-10-21T10:00:00.000Z';
const trip = { id, estado_operativo: 'BORRADOR', updated_at: stamp, reserva_desde: stamp, reserva_hasta: '2026-10-21T14:00:00.000Z' };
const isUuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);
async function invoke(operation, body, scenario = {}) {
  const calls = [];
  const client = {
    release() { calls.push('RELEASE'); },
    async query(sql) {
      calls.push(sql);
      if (sql.startsWith('SELECT * FROM tms.viajes')) return { rows: [{ ...trip, ...scenario.trip }] };
      if (sql.includes('SELECT id FROM tms.unidades')) return { rows: scenario.inactive ? [] : [{ id }] };
      if (sql.includes('SELECT id FROM tms.operadores')) return { rows: [{ id }] };
      if (sql.includes('WHERE id<>')) return { rows: scenario.conflict ? [{ id: 'otro-viaje' }] : [] };
      if (sql.includes('INSERT INTO tms.viaje_eventos') && scenario.auditFailure) throw new Error('Fallo simulado del historial');
      return { rows: [] };
    },
  };
  const fail = (res, status, error) => res.status(status).json({ error });
  const wrap = fn => async (req, res) => { try { await fn(req, res); } catch (error) { fail(res, 500, error.message); } };
  const router = tripRecordRouter({ pool: { connect: async () => client }, wrap, fail, isUuid });
  const route = router.stack.find(layer => layer.route?.path === `/trips/:folio/${operation}` && layer.route.methods.patch).route;
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await route.stack.at(-1).handle({ params: { folio: '1' }, user: { id: scenario.actor || id }, body }, res);
  return { res, calls };
}
const edit = { tipo_carga: 'QA Autopartes', instrucciones: 'QA Andén 2', motivo: 'Corrección QA', updated_at: stamp };
const assignment = { modalidad: 'PROPIO', unidad_id: id, operador_id: id, caja_id: null, proveedor_id: null, motivo: 'Asignación QA', updated_at: stamp };

test('Guardar datos registra historial y confirma la transacción', async () => {
  const { res, calls } = await invoke('record', edit);
  assert.equal(res.statusCode, 200);
  assert.ok(calls.some(sql => sql.startsWith('UPDATE tms.viajes SET tipo_carga')));
  assert.ok(calls.some(sql => sql.includes('INSERT INTO tms.viaje_eventos')));
  assert.ok(calls.includes('COMMIT'));
});
test('Si falla el historial se revierten también los cambios', async () => {
  const { res, calls } = await invoke('record', edit, { auditFailure: true });
  assert.equal(res.statusCode, 500);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.includes('COMMIT'));
  assert.equal(calls.at(-1), 'RELEASE');
});
test('Una ficha desactualizada no sobrescribe el cambio de otra persona', async () => {
  const { res, calls } = await invoke('record', edit, { trip: { updated_at: '2026-10-21T11:00:00Z' } });
  assert.equal(res.statusCode, 409);
  assert.ok(!calls.some(sql => sql.startsWith('UPDATE')));
});
test('Viajes finalizados e identidad local temporal no permiten edición', async () => {
  assert.equal((await invoke('record', edit, { trip: { estado_operativo: 'ENTREGADO' } })).res.statusCode, 409);
  const result = await invoke('record', edit, { actor: 'local-dev' });
  assert.equal(result.res.statusCode, 403);
  assert.equal(result.calls.length, 0);
});
test('Recursos inactivos o de otra modalidad se rechazan', async () => {
  const { res, calls } = await invoke('assignment', assignment, { inactive: true });
  assert.equal(res.statusCode, 400);
  assert.ok(!calls.some(sql => sql.startsWith('UPDATE')));
});
test('Un conflicto de horario impide asignar el recurso', async () => {
  const { res, calls } = await invoke('assignment', assignment, { conflict: true });
  assert.equal(res.statusCode, 409);
  assert.ok(calls.some(sql => sql.includes('pg_advisory_xact_lock')));
  assert.ok(!calls.includes('COMMIT'));
});
test('Asignación válida se guarda sin cambiar el estado del viaje', async () => {
  const { res, calls } = await invoke('assignment', assignment);
  assert.equal(res.statusCode, 200);
  assert.ok(calls.some(sql => sql.startsWith('UPDATE tms.viajes SET unidad_id')));
  assert.ok(!calls.some(sql => sql.includes('SET estado_operativo')));
  assert.ok(calls.includes('COMMIT'));
});
