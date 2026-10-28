import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOperatorService } from '../../../backend/src/modules/logistica/services/operators.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalAuthDisabled = process.env.LOGISTICA_AUTH_DISABLED;

function mockPool() {
  const calls = [];
  const db = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.startsWith('INSERT INTO tms.operadores')) return { rows: [{ id: '11111111-1111-4111-8111-111111111111', nombre: params[0] }] };
      return { rows: [] };
    },
    release() {},
  };
  return { calls, connect: async () => db };
}

test('el modo local guarda solo operadores DEMO y deja actor de auditoría vacío', async () => {
  process.env.NODE_ENV = 'development';
  process.env.LOGISTICA_AUTH_DISABLED = 'true';
  try {
    const pool = mockPool();
    const service = createOperatorService({ pool });
    const saved = await service.save(null, { nombre: 'DEMO-Ana', tipo: 'PROPIO' }, 'local-dev');
    assert.equal(saved.nombre, 'DEMO-Ana');
    const audit = pool.calls.find(call => call.sql.startsWith('INSERT INTO tms.cp_auditoria'));
    assert.equal(audit.params[2], null);
    assert.ok(pool.calls.some(call => call.sql === 'COMMIT'));

    const rejectedPool = mockPool();
    await assert.rejects(createOperatorService({ pool: rejectedPool }).save(null, { nombre: 'Ana', tipo: 'PROPIO' }, 'local-dev'), error => error.code === 'DEMO_ONLY');
    assert.ok(!rejectedPool.calls.some(call => call.sql.startsWith('INSERT INTO tms.operadores')));
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalAuthDisabled === undefined) delete process.env.LOGISTICA_AUTH_DISABLED;
    else process.env.LOGISTICA_AUTH_DISABLED = originalAuthDisabled;
  }
});

test('sin excepción local el backend sigue exigiendo usuario TMS', async () => {
  process.env.NODE_ENV = 'production';
  process.env.LOGISTICA_AUTH_DISABLED = 'true';
  try {
    const pool = mockPool();
    await assert.rejects(createOperatorService({ pool }).save(null, { nombre: 'DEMO-Ana', tipo: 'PROPIO' }, 'local-dev'), error => error.code === 'REAL_ACTOR_REQUIRED');
    assert.equal(pool.calls.length, 0);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalAuthDisabled === undefined) delete process.env.LOGISTICA_AUTH_DISABLED;
    else process.env.LOGISTICA_AUTH_DISABLED = originalAuthDisabled;
  }
});
