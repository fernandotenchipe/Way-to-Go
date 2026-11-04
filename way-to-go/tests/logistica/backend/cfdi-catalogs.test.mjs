import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import cfdiCatalogRouter from '../../../backend/src/modules/logistica/routes/cfdi-catalogs.js';
import { AmbiguousCatalogKeyError, createLocalCfdiCatalogProvider, createPostgresCfdiCatalogProvider } from '../../../backend/src/modules/logistica/services/cfdi-catalogs.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const record = (catalogo, clave, descripcion, vigente_desde = '2020-01-01', vigente_hasta = null, clave_contexto = {}) => ({
  catalogo, clave, clave_contexto, descripcion, vigente_desde, vigente_hasta, reglas: { fuente: { hoja: catalogo, fila_excel: 1 }, celdas: [] },
});

async function localProvider(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-cfdi-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const rows = [
    record('c_UsoCFDI', 'G01', 'Adquisición de mercancías'),
    record('c_UsoCFDI', 'P01', 'Por definir', null, '2021-12-31'),
    record('c_RegimenFiscal', '601', 'General de Ley Personas Morales', null, null, { c_Pais: 'MEX' }),
    record('c_RegimenFiscal', '601', 'Régimen extranjero', null, null, { c_Pais: 'USA' }),
  ];
  const byCatalog = new Map();
  for (const row of rows) byCatalog.set(row.catalogo, [...(byCatalog.get(row.catalogo) || []), row]);
  const catalogos = {};
  for (const [catalog, values] of byCatalog) {
    const bytes = values.map((row) => `${JSON.stringify(row)}\n`).join('');
    const file = `${catalog}.jsonl`;
    await writeFile(path.join(dir, file), bytes, 'utf8');
    catalogos[catalog] = { archivo: file, registros: values.length, sha256: hash(bytes), bytes: Buffer.byteLength(bytes) };
  }
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify({ formato: 'test-v1', catalogos }), 'utf8');
  return { dir, provider: createLocalCfdiCatalogProvider({ dataDir: dir, validateOfficialManifest: false }) };
}

test('proveedor local enumera catálogos y pagina sin exponer reglas originales', async (t) => {
  const { provider } = await localProvider(t);
  assert.deepEqual((await provider.listCatalogs()).map((item) => item.catalogo), ['c_RegimenFiscal', 'c_UsoCFDI']);
  const page = await provider.search('c_UsoCFDI', { q: 'mercancías', page: 1, limit: 1, fecha: '2026-11-04' });
  assert.equal(page.paginacion.total, 1);
  assert.equal(page.resultados[0].clave, 'G01');
  assert.equal('reglas' in page.resultados[0], false);
});

test('proveedor local conserva ceros iniciales, filtra vigencia y exige contexto en claves ambiguas', async (t) => {
  const { provider } = await localProvider(t);
  const active = await provider.search('c_UsoCFDI', { vigente: true, fecha: '2026-11-04' });
  assert.deepEqual(active.resultados.map((item) => item.clave), ['G01']);
  const row = await provider.getByKey('c_RegimenFiscal', '601', { contexto: { c_Pais: 'MEX' } });
  assert.equal(row.clave, '601');
  await assert.rejects(provider.getByKey('c_RegimenFiscal', '601'), AmbiguousCatalogKeyError);
  await assert.rejects(provider.search('c_UsoCFDI', { fecha: '11/04/2026' }), { code: 'INVALID_DATE' });
});

test('proveedor local rechaza modificaciones del JSONL contra el manifiesto', async (t) => {
  const { dir, provider } = await localProvider(t);
  await writeFile(path.join(dir, 'c_UsoCFDI.jsonl'), `${JSON.stringify(record('c_UsoCFDI', 'G02', 'Alterado'))}\n`, 'utf8');
  await assert.rejects(provider.search('c_UsoCFDI'), /SHA-256/);
});

test('rutas CFDI exigen permiso TMS y entregan respuestas paginadas', async (t) => {
  const { provider } = await localProvider(t);
  const router = cfdiCatalogRouter({ provider });
  const route = router.stack.find((layer) => layer.route?.path === '/cfdi/catalogs/:catalog' && layer.route.methods.get).route;
  const invoke = async (permissions) => {
    const req = { params: { catalog: 'c_UsoCFDI' }, query: { q: 'G01' }, user: { permissions } };
    const res = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    for (const layer of route.stack) { let next = false; await layer.handle(req, res, () => { next = true; }); if (!next) break; }
    return res;
  };
  assert.equal((await invoke([])).statusCode, 403);
  const authorized = await invoke(['carta_porte.catalogos.ver']);
  assert.equal(authorized.body.success, true);
  assert.equal(authorized.body.data.resultados[0].clave, 'G01');
});

test('proveedor PostgreSQL comparte contrato y parametriza búsqueda, vigencia y paginación', async () => {
  const calls = [];
  const pool = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes('count(*)::int AS total')) return { rows: [{ total: 2 }] };
    return { rows: [{ catalogo: 'c_FormaPago', clave: '01', clave_contexto: {}, descripcion: 'Efectivo', vigente_desde: null, vigente_hasta: null }] };
  } };
  const provider = createPostgresCfdiCatalogProvider({ pool });
  const result = await provider.search('c_FormaPago', { q: "x%' OR true --", page: 2, limit: 1, fecha: '2026-11-04' });
  assert.equal(result.paginacion.total, 2);
  assert.equal(result.paginacion.pagina, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].params[1], "%x%' OR true --%");
  assert.match(calls[1].sql, /LIMIT \$3 OFFSET \$5/);
  assert.equal(calls[1].params[4], 1);
});

