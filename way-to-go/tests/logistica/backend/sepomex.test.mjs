import test from 'node:test';
import assert from 'node:assert/strict';
import sepomexRouter from '../../../backend/src/modules/logistica/routes/sepomex.js';
import { createSepomexService } from '../../../backend/src/modules/logistica/services/sepomex.js';

const version = { id: '8c228643-61cf-42e6-9f61-8b6f947e01ac', fecha_fuente: '2026-10-19', fuente_url: 'https://example.invalid/source' };
const settlement = {
  codigo_postal: '01000', asentamiento: 'San Ángel', tipo_asentamiento: 'Colonia', municipio: 'Álvaro Obregón',
  estado: 'Ciudad de México', ciudad: 'Ciudad de México', clave_estado: '09', clave_municipio: '010', clave_ciudad: '01',
};

function poolWith(rows = [settlement]) {
  const calls = [];
  const pool = { async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes('FROM tms.sepomex_versiones')) return { rows: [version] };
    if (sql.includes('count(*)::int AS total')) return { rows: [{ total: rows.length }] };
    return { rows };
  } };
  return { pool, calls };
}

async function invoke(router, path, { params = {}, query = {}, permissions = ['carta_porte.catalogos.ver'] } = {}) {
  const layer = router.stack.find(item => item.route?.path === path && item.route.methods.get);
  assert.ok(layer, `No se encontró la ruta ${path}`);
  const req = { params, query, user: { permissions } };
  const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
  for (const middleware of layer.route.stack) {
    let advanced = false;
    await middleware.handle(req, res, () => { advanced = true; });
    if (!advanced) break;
  }
  return res;
}

test('código postal exacto conserva ceros iniciales, deduplica filas visibles y usa tabla/índice esperados', async () => {
  const { pool, calls } = poolWith([settlement]);
  const result = await createSepomexService({ pool }).postalCode('01000');
  assert.equal(result.codigo_postal, '01000');
  assert.equal(result.asentamientos.length, 1);
  const query = calls.find(call => call.sql.includes('FROM tms.sepomex_asentamientos'));
  assert.deepEqual(query.values, [version.id, '01000']);
  assert.match(query.sql, /SELECT DISTINCT/);
  assert.match(query.sql, /version_id = \$1 AND codigo_postal = \$2/);
  assert.match(query.sql, /id_asentamiento_cpcons/);
  assert.match(query.sql, /ORDER BY asentamiento, clave_estado, clave_municipio, id_asentamiento_cpcons/);
});

test('la consulta por código postal incluye en SELECT las columnas usadas en ORDER BY con DISTINCT', async () => {
  const calls = [];
  const pool = { async query(sql, values = []) {
    calls.push({ sql, values });
    if (sql.includes('FROM tms.sepomex_versiones')) return { rows: [version] };
    const selected = sql.match(/SELECT DISTINCT([\s\S]*?)FROM tms\.sepomex_asentamientos/i)?.[1] || '';
    const ordered = sql.match(/ORDER BY([\s\S]*)$/i)?.[1] || '';
    for (const column of ordered.split(',').map(value => value.trim())) {
      if (!new RegExp(`\\b${column}\\b`).test(selected)) {
        throw Object.assign(new Error('for SELECT DISTINCT, ORDER BY expressions must appear in select list'), { code: '42P10' });
      }
    }
    return { rows: [{ ...settlement, codigo_postal_oficina: '01000', id_asentamiento_cpcons: '0001' }] };
  } };
  const result = await createSepomexService({ pool }).postalCode('01000');
  assert.equal(result.asentamientos[0].id_asentamiento_cpcons, '0001');
  assert.equal(calls.length, 2);
});

test('búsqueda de asentamientos pagina, filtra por estado y usa parámetros en SQL', async () => {
  const { pool, calls } = poolWith([settlement]);
  const result = await createSepomexService({ pool }).settlements({ q: 'San Ángel', estado: '09', page: '2', limit: '10' });
  assert.equal(result.paginacion.pagina, 2);
  assert.equal(result.paginacion.limite, 10);
  const query = calls.find(call => call.sql.includes('LIMIT $'));
  assert.deepEqual(query.values, [version.id, '09', '%San Ángel%', 10, 10]);
  assert.match(query.sql, /asentamiento ILIKE \$3/);
  assert.match(query.sql, /municipio ILIKE \$3/);
  assert.match(query.sql, /ORDER BY 1, 2, 3, 4, 5, 6, 7, 8, 9 LIMIT \$4 OFFSET \$5/);
});

test('estados, municipios y ciudades buscan sobre la columna correspondiente', async () => {
  const { pool, calls } = poolWith([settlement]);
  const service = createSepomexService({ pool });
  await service.states({ q: 'Ciudad', limit: 5 });
  await service.municipalities({ estado: '09', q: 'Álvaro', limit: 5 });
  await service.cities({ estado: '09', municipio: 'Álvaro Obregón', q: 'Ciudad', limit: 5 });
  const statements = calls.filter(call => call.sql.includes('SELECT DISTINCT'));
  assert.match(statements[1].sql, /estado ILIKE \$2/);
  assert.match(statements[3].sql, /municipio ILIKE \$3/);
  assert.match(statements[5].sql, /ciudad ILIKE \$4/);
  assert.ok(statements[2].values.includes('09'));
  assert.ok(statements[4].values.includes('Álvaro Obregón'));
});

test('rechaza entradas inválidas y reporta código postal inexistente', async () => {
  const { pool } = poolWith([]);
  const service = createSepomexService({ pool });
  await assert.rejects(service.postalCode('1000'), { code: 'INVALID_PARAMETER', status: 400 });
  await assert.rejects(service.postalCode('ABCDE'), { code: 'INVALID_PARAMETER', status: 400 });
  await assert.rejects(service.settlements({ limit: '101' }), { code: 'INVALID_PARAMETER', status: 400 });
  await assert.rejects(service.settlements({ q: 'x' }), { code: 'INVALID_PARAMETER', status: 400 });
  await assert.rejects(service.municipalities({}), { code: 'INVALID_PARAMETER', status: 400 });
  await assert.rejects(service.postalCode('01000'), { code: 'POSTAL_CODE_NOT_FOUND', status: 404 });
});

test('reporta tablas faltantes o ausencia de versión como incompatibilidad de servicio', async () => {
  const missingVersion = createSepomexService({ pool: { async query() { return { rows: [] }; } } });
  await assert.rejects(missingVersion.states(), { code: 'SEPOMEX_NOT_AVAILABLE', status: 503 });
  const missingTable = createSepomexService({ pool: { async query() { throw Object.assign(new Error('missing table'), { code: '42P01' }); } } });
  await assert.rejects(missingTable.states(), { code: 'SEPOMEX_SCHEMA_UNAVAILABLE', status: 503 });
});

test('rutas usan permiso TMS de catálogos y entregan envoltura estándar', async () => {
  const { pool } = poolWith();
  const router = sepomexRouter({ pool });
  const denied = await invoke(router, '/sepomex/states', { permissions: [] });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.code, 'FORBIDDEN');
  const allowed = await invoke(router, '/sepomex/postal-codes/:codigo_postal', { params: { codigo_postal: '01000' } });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.body.success, true);
  assert.equal(allowed.body.data.codigo_postal, '01000');
});
