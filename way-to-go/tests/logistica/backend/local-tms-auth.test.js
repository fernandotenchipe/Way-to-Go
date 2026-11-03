import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequireLogisticsUser, requireFleetEdit } from '../../../backend/src/modules/logistica/middleware/auth.js';

const UUID = '11111111-1111-4111-8111-111111111111';
const keys = ['NODE_ENV', 'LOGISTICA_AUTH_DISABLED', 'LOGISTICA_LOCAL_TMS_ACCESS', 'LOGISTICA_LOCAL_TMS_USER_EMAIL'];

async function withEnvironment(values, run) {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    for (const key of keys) {
      if (values[key] === undefined) delete process.env[key];
      else process.env[key] = values[key];
    }
    await run();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

const localEnvironment = {
  NODE_ENV: 'development',
  LOGISTICA_AUTH_DISABLED: 'false',
  LOGISTICA_LOCAL_TMS_ACCESS: 'true',
  LOGISTICA_LOCAL_TMS_USER_EMAIL: 'dev.tms.local@example.invalid',
};

test('acceso local carga identidad y permisos TMS sin token; autorización de Flota sigue activa', async () => {
  await withEnvironment(localEnvironment, async () => {
    let queriedEmail;
    const middleware = createRequireLogisticsUser(async (_sql, [email]) => {
      queriedEmail = email;
      return { rows: [
        { id: UUID, email, nombre: 'Desarrollo local TMS', role: 'LOCAL_TMS_DEV', permission: 'flota.ver' },
        { id: UUID, email, nombre: 'Desarrollo local TMS', role: 'LOCAL_TMS_DEV', permission: 'flota.editar' },
      ] };
    });
    const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    const res = response();
    let nextCalls = 0;
    await middleware(req, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
    assert.equal(queriedEmail, localEnvironment.LOGISTICA_LOCAL_TMS_USER_EMAIL);
    assert.equal(req.user.id, UUID);
    assert.deepEqual(req.user.permissions, ['flota.ver', 'flota.editar']);
    requireFleetEdit(req, res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 2);
    req.user.permissions = ['flota.ver'];
    requireFleetEdit(req, res, () => { nextCalls += 1; });
    assert.equal(res.statusCode, 403);
    assert.equal(nextCalls, 2);
  });
});

test('acceso local rechaza conexiones no locales antes de consultar la base', async () => {
  await withEnvironment(localEnvironment, async () => {
    let queried = false;
    const middleware = createRequireLogisticsUser(async () => { queried = true; return { rows: [] }; });
    const res = response();
    await middleware({ headers: {}, socket: { remoteAddress: '192.0.2.10' } }, res, () => assert.fail('No debe autorizar'));
    assert.equal(res.statusCode, 403);
    assert.equal(queried, false);
  });
});

test('en producción la variable temporal no permite entrar sin token', async () => {
  await withEnvironment({ ...localEnvironment, NODE_ENV: 'production' }, async () => {
    const middleware = createRequireLogisticsUser(async () => assert.fail('No debe consultar la base'));
    const res = response();
    await middleware({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }, res, () => assert.fail('No debe autorizar'));
    assert.equal(res.statusCode, 401);
  });
});

test('usuario local inexistente o inactivo no recibe identidad TMS', async () => {
  await withEnvironment(localEnvironment, async () => {
    const middleware = createRequireLogisticsUser(async () => ({ rows: [] }));
    const res = response();
    await middleware({ headers: {}, socket: { remoteAddress: '::1' } }, res, () => assert.fail('No debe autorizar'));
    assert.equal(res.statusCode, 403);
  });
});
