import { test } from 'node:test';
import assert from 'node:assert/strict';
import router from '../routes/index.js';
import pool from '../../../shared/database/db.js';
import { validateAddresses } from './customer-addresses.js';

const uuid = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const address = (nombre) => ({ nombre, calle: 'QA Calle 1', ciudad: 'QA Ciudad', estado: 'QA Estado', pais: 'MX' });
const valid = {
  estado_operativo: 'BORRADOR', tipo_servicio_id: uuid('3'), tipo_carga: 'QA Carga',
  cita_carga_at: '2026-10-20T14:00:00Z', salida_programada_at: '2026-10-20T15:00:00Z',
  entrega_estimada_at: '2026-10-20T18:00:00Z', reserva_desde: '2026-10-20T14:00:00Z', reserva_hasta: '2026-10-20T18:00:00Z',
  cliente_nuevo: { razon_social: 'QA Cliente', direcciones: [address('QA Origen'), address('QA Destino')] },
};

// Dobles en memoria: no se abre ninguna conexión PostgreSQL.
async function invoke(body, { duplicate = false, failCargo = false, inactive = false, path = '/trips' } = {}) {
  const calls = [];
  let connected = false;
  let addressNumber = 0;
  const original = pool.connect;
  pool.connect = async () => {
    connected = true;
    return {
      release() { calls.push(['RELEASE']); },
      async query(sql, params = []) {
        calls.push([sql, params]);
        if (sql.includes('lower(btrim(razon_social))')) return { rows: duplicate ? [{ id: uuid('1') }] : [] };
        if (sql.includes('INSERT INTO tms.clientes')) return { rows: [{ id: uuid('1') }] };
        if (sql.includes('INSERT INTO tms.cliente_direcciones')) return { rows: [{ ...body.cliente_nuevo?.direcciones[addressNumber], id: uuid(String(++addressNumber + 3)), principal: addressNumber === 1 }] };
        if (sql.includes('SELECT id FROM tms.clientes')) return { rows: inactive ? [] : [{ id: uuid('1') }] };
        if (sql.includes('FROM tms.cliente_direcciones WHERE id=ANY')) return { rows: [{ ...address('QA Origen'), id: params[0][0] }, { ...address('QA Destino'), id: params[0][1] }] };
        if (sql.includes('FROM tms.tipos_servicio')) return { rows: [{ id: uuid('3') }] };
        if (sql.includes('INSERT INTO tms.viajes')) return { rows: [{ id: uuid('2'), folio: '123', estado_operativo: params[19] }] };
        if (sql.includes('INSERT INTO tms.viaje_carga') && failCargo) throw Object.assign(new Error('Fallo QA simulado'), { code: '23514' });
        return { rows: [], rowCount: 0 };
      },
    };
  };
  const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  try {
    const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods.post).route;
    await route.stack.at(-1).handle({ body, user: { id: uuid('9') } }, response);
    return { response, calls, connected };
  } finally { pool.connect = original; }
}

test('Captura rápida guarda cliente, dos ubicaciones y borrador en una sola transacción', async () => {
  const { response, calls } = await invoke(valid);
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.estado_operativo, 'BORRADOR');
  assert.equal(calls.filter(([sql]) => sql.includes('INSERT INTO tms.cliente_direcciones')).length, 2);
  assert.ok(calls.some(([sql]) => sql === 'COMMIT'));
  assert.ok(!calls.some(([sql]) => sql === 'ROLLBACK'));
});
test('Fallo posterior a crear cliente y viaje revierte toda la transacción', async () => {
  const { response, calls } = await invoke(valid, { failCargo: true });
  assert.equal(response.statusCode, 400);
  assert.ok(calls.some(([sql]) => sql.includes('INSERT INTO tms.viajes')));
  assert.ok(calls.some(([sql]) => sql === 'ROLLBACK'));
  assert.ok(!calls.some(([sql]) => sql === 'COMMIT'));
  assert.equal(calls.at(-1)[0], 'RELEASE');
});
test('Nombre existente rechaza captura rápida sin crear otro cliente', async () => {
  const { response, calls } = await invoke(valid, { duplicate: true });
  assert.equal(response.statusCode, 409);
  assert.ok(!calls.some(([sql]) => sql.includes('INSERT INTO tms.clientes')));
});
test('Fechas invertidas se rechazan antes de conectar', async () => {
  const { response, connected } = await invoke({ ...valid, entrega_estimada_at: '2026-10-19T14:00:00Z' });
  assert.equal(response.statusCode, 400);
  assert.equal(connected, false);
});
test('Cliente inactivo no permite guardar viajes', async () => {
  const { response, calls } = await invoke({ ...valid, cliente_nuevo: undefined, cliente_id: uuid('1'), origen_id: uuid('4'), destino_id: uuid('5') }, { inactive: true });
  assert.equal(response.statusCode, 400);
  assert.ok(!calls.some(([sql]) => sql.includes('INSERT INTO tms.viajes')));
});
test('Alta de cliente acepta múltiples ubicaciones dentro de la transacción', async () => {
  const { response, calls } = await invoke({ razon_social: 'QA Empresa', direcciones: [address('QA Matriz'), { ...address('QA Sucursal'), principal: true }] }, { path: '/customers' });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.direcciones_activas, 2);
  assert.equal(calls.filter(([sql]) => sql.includes('INSERT INTO tms.cliente_direcciones')).length, 2);
  assert.ok(calls.some(([sql]) => sql === 'COMMIT'));
});
test('Ubicaciones incompletas, múltiples principales y zonas inválidas se rechazan', () => {
  assert.ok(validateAddresses([{ nombre: 'QA Incompleta' }]));
  assert.ok(validateAddresses([{ ...address('QA Uno'), principal: true }, { ...address('QA Dos'), principal: true }]));
  assert.ok(validateAddresses([{ ...address('QA Zona'), zona_horaria: 'No/Existe' }]));
  assert.equal(validateAddresses([address('QA Completa')]), null);
});
