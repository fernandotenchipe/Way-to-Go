import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pool from '../../../backend/src/shared/database/db.js';

test('cajas: alta, duplicado, edición y consulta por HTTP con limpieza en PostgreSQL', { skip: process.env.RUN_LOGISTICA_HTTP_TESTS !== '1' }, async () => {
  const base = process.env.FLEET_TEST_BASE_URL || 'http://localhost:3001/api/logistica';
  const number = `DEMO-TEST-${randomUUID()}`;
  const input = {
    numero_caja: number, tipo_caja: 'Caja de prueba temporal', placas: null,
    proveedor_id: null, estatus: 'ACTIVA', subtipo_remolque_sat: null,
    largo_m: 12, ancho_m: 2.5, alto_m: 3.8, capacidad_kg: 20000,
    peso_vacio_kg: 5000, hazmat: false, refrigerada: false,
  };
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(`${base}${path}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    const created = await request('/fleet/boxes', 'POST', input);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.id;
    const duplicate = await request('/fleet/boxes', 'POST', { ...input, numero_caja: number.toLowerCase() });
    assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
    const listed = await request(`/fleet/boxes?q=${encodeURIComponent(number)}`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.length, 1);
    assert.equal(listed.body.data[0].disponibilidad, 'DISPONIBLE');
    const updated = await request(`/fleet/boxes/${id}`, 'PATCH', {
      ...input, estatus: 'MANTENIMIENTO', expected_updated_at: created.body.data.updated_at,
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    const detail = await request(`/fleet/boxes/${id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.estatus, 'MANTENIMIENTO');
    assert.equal(detail.body.data.disponibilidad, 'NO_DISPONIBLE');
    const filtered = await request('/fleet/boxes?status=MANTENIMIENTO&availability=NO_DISPONIBLE');
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.data.some(box => box.id === id));
  } finally {
    await pool.query('DELETE FROM tms.cajas WHERE numero_caja=$1', [number]);
    const remaining = await pool.query('SELECT id FROM tms.cajas WHERE numero_caja=$1', [number]);
    assert.equal(remaining.rows.length, 0);
    await pool.end();
  }
});
