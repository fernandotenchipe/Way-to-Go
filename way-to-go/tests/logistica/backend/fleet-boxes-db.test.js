import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pool from '../../../backend/src/shared/database/db.js';
import { addFleetBoxDocument, getFleetBox, listFleetBoxes, listTrailerTypes, saveFleetBox } from '../../../backend/src/modules/logistica/services/fleet-box-data.js';

test('cajas: alta, edición, listado y consulta en PostgreSQL sin conservar datos de prueba', { skip: process.env.RUN_LOGISTICA_DB_TESTS !== '1' }, async () => {
  const client = await pool.connect();
  const number = `DEMO-TEST-${randomUUID()}`;
  await client.query('BEGIN');
  const transactionPool = {
    query: (...args) => client.query(...args),
    connect: async () => ({
      query: (sql, ...args) => sql === 'BEGIN' || sql === 'COMMIT' ? Promise.resolve({ rows: [] }) : client.query(sql, ...args),
      release: () => {},
    }),
  };
  try {
    const input = { numero_caja: number, tipo_caja: 'Caja de prueba', placas: null, proveedor_id: null,
      estatus: 'ACTIVA', subtipo_remolque_sat: null, largo_m: 12, ancho_m: 2.5, alto_m: 3.8,
      capacidad_kg: 20000, peso_vacio_kg: 5000, hazmat: false, refrigerada: false };
    const created = await saveFleetBox(transactionPool, input);
    assert.equal(created.numero_caja, number);
    const listed = await listFleetBoxes(transactionPool, { q: number });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].disponibilidad, 'DISPONIBLE');
    const updated = await saveFleetBox(transactionPool, { ...input, estatus: 'MANTENIMIENTO', expected_updated_at: created.updated_at.toISOString() }, created.id);
    assert.equal(updated.estatus, 'MANTENIMIENTO');
    const detail = await getFleetBox(transactionPool, created.id);
    assert.equal(detail.disponibilidad, 'NO_DISPONIBLE');
    assert.deepEqual(detail.documentos, []);
    const actor = (await client.query('SELECT id FROM tms.usuarios ORDER BY id LIMIT 1')).rows[0]?.id;
    if (actor) {
      await addFleetBoxDocument(transactionPool, created.id, { tipo: 'OTRO', folio: 'TEST', emitido_el: '2026-01-01', vence_el: '2027-01-01' },
        { key: `${randomUUID()}.pdf`, name: 'prueba.pdf', mime: 'application/pdf', size: 3, hash: 'a'.repeat(64) }, actor);
      const withDocument = await getFleetBox(transactionPool, created.id);
      assert.equal(withDocument.documentos.length, 1);
      assert.equal(withDocument.documentos[0].tipo, 'OTRO');
    }
    const satTypes = await listTrailerTypes(transactionPool);
    assert.ok(Array.isArray(satTypes));
  } finally {
    await client.query('ROLLBACK');
    client.release();
    const persisted = await pool.query('SELECT id FROM tms.cajas WHERE numero_caja=$1', [number]);
    assert.equal(persisted.rows.length, 0);
    await pool.end();
  }
});
