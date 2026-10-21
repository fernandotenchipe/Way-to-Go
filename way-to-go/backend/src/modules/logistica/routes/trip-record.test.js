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
    async query(sql, params) {
      if (params) calls.push({ sql, params });
      calls.push(sql);
      if (sql.includes('INSERT INTO tms.viaje_eventos') && sql.includes('SELECT id,') ) return { rows: scenario.missing ? [] : [{ id }] };
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
  const router = tripRecordRouter({ pool: { connect: async () => client, query: (...args) => client.query(...args) }, wrap, fail, isUuid });
  const route = router.stack.find(layer => layer.route?.path === `/trips/:folio/${operation}` && layer.route.methods[operation === 'notes' ? 'post' : 'patch']).route;
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  await route.stack.at(-1).handle({ params: { folio: '1' }, user: { id: scenario.actor || id }, body }, res);
  return { res, calls: calls.filter(value => typeof value === 'string'), params: calls.filter(value => typeof value === 'object') };
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

const schedule = { cita_carga_at: stamp, salida_programada_at: '2026-10-21T11:00:00Z', entrega_estimada_at: '2026-10-21T13:00:00Z', descarga_programada_at: null };
test('Una nota conserva autor, categoría y texto sin editar datos del viaje', async () => {
  const { res, calls, params } = await invoke('notes', { texto: '  QA acuerdo de entrega  ' });
  assert.equal(res.statusCode, 201);
  assert.ok(calls.some(sql => sql.includes('"categoria":"NOTA"')));
  assert.equal(params[0].params[1], id);
  assert.equal(params[0].params[2], 'QA acuerdo de entrega');
  assert.ok(!calls.some(sql => sql.startsWith('UPDATE')));
});
test('Notas vacías, excesivas, viaje inexistente e identidad inválida se rechazan', async () => {
  assert.equal((await invoke('notes', { texto: ' ' })).res.statusCode, 400);
  assert.equal((await invoke('notes', { texto: 'x'.repeat(2001) })).res.statusCode, 400);
  assert.equal((await invoke('notes', { texto: 'QA' }, { missing: true })).res.statusCode, 404);
  assert.equal((await invoke('notes', { texto: 'QA' }, { actor: 'local-dev' })).res.statusCode, 403);
});
test('Reprogramar registra valores anteriores y nuevos sin alterar horas reales', async () => {
  const { res, calls, params } = await invoke('record', { ...edit, ...schedule });
  assert.equal(res.statusCode, 200);
  const audit = JSON.parse(params.find(call => call.sql.includes('INSERT INTO tms.viaje_eventos')).params[4]);
  assert.equal(audit.despues.salida_programada_at, '2026-10-21T11:00:00.000Z');
  assert.ok(Object.hasOwn(audit.antes, 'cita_carga_at'));
  assert.ok(calls.some(sql => sql.includes('reserva_desde=$2,reserva_hasta=$4')));
  assert.ok(!calls.some(sql => sql.includes('SET llegada_carga_at') || sql.includes('SET salida_cargado_at')));
  assert.ok(calls.includes('COMMIT'));
});
test('Horario invertido se rechaza y conflicto al reprogramar revierte cambios', async () => {
  assert.equal((await invoke('record', { ...edit, ...schedule, entrega_estimada_at: stamp })).res.statusCode, 400);
  const { res, calls } = await invoke('record', { ...edit, ...schedule }, { trip: { unidad_id: id }, conflict: true });
  assert.equal(res.statusCode, 409);
  assert.ok(calls.includes('ROLLBACK'));
  assert.ok(!calls.includes('COMMIT'));
});
