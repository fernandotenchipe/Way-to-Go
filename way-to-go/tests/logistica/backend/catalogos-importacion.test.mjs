import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  archive, compareExistingRows, existingVersion, expectedSchema, importPrepared, loadRows, parseArgs,
  preflightDatabase, resolveDatabaseConfig, runPreflight, runPreflightCommand, tableNames, validateSchema, verifyPreparedJsonl, versionMetadata,
} from '../../../backend/tools/importar-catalogos.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const stageInfo = async file => ({ registros_jsonl: file, registros_sha256: sha(await readFile(file)),
  registros_bytes: (await readFile(file)).length });
const actor = { actorId: '11111111-1111-4111-8111-111111111111', actorEmail: 'dev@example.test', dbRole: 'importador_local' };
const schemaRows = family => tableNames(family).map(relname => ({
  relname, columns: { ...expectedSchema[relname].columns }, primary_key: [...expectedSchema[relname].pk],
  column_metadata: Object.fromEntries(Object.entries(expectedSchema[relname].requiredDefaults ?? {}).map(([name, type]) =>
    [name, { type, not_null: true, default: name === 'id' ? 'gen_random_uuid()' : 'now()' }])),
  unique_keys: expectedSchema[relname].unique ?? [], esquema: true, leer: true, insertar: true, rls_activa: false,
}));

test('dry-run no exige credenciales ni activa la carga real', () => {
  const dry = parseArgs(['--mode', 'dry-run', '--report', 'reporte.json']);
  assert.equal(dry.mode, 'dry-run');
  const copyCheck = parseArgs(['--mode', 'dry-run', '--family', 'CARTA_PORTE', '--official-copy', 'copia.xls', '--report', 'reporte.json']);
  assert.equal(copyCheck.officialCopy, 'copia.xls');
  assert.throws(() => parseArgs(['--mode', 'dry-run', '--family', 'CFDI', '--official-copy', 'copia.xls', '--report', 'reporte.json']), /solo se admite/);
  assert.throws(() => parseArgs(['--mode', 'import', '--report', 'reporte.json', '--confirm-write']), /development/);
  assert.throws(() => parseArgs(['--mode', 'dry-run', '--report', 'reporte.json', '--actor-id', actor.actorId]), /Argumento inválido/);
});

test('preflight requiere configuración local, identidad fija y ruta de archivo', () => {
  const saved = Object.fromEntries(['NODE_ENV', 'TMS_CATALOG_ACTOR_ID', 'TMS_CATALOG_ACTOR_EMAIL',
    'TMS_CATALOG_DB_ROLE', 'TMS_CATALOG_DATABASE_URL'].map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { NODE_ENV: 'development', TMS_CATALOG_ACTOR_ID: actor.actorId,
      TMS_CATALOG_ACTOR_EMAIL: actor.actorEmail, TMS_CATALOG_DB_ROLE: actor.dbRole,
      TMS_CATALOG_DATABASE_URL: 'postgresql://not-a-real-secret@example.invalid/database' });
    const options = parseArgs(['--mode', 'preflight', '--family', 'ALL', '--archive-dir', path.resolve(tmpdir()), '--report', 'report.json']);
    assert.equal(options.mode, 'preflight');
    assert.equal(options.family, 'ALL');
    assert.equal(options.minFreeBytes, 1024 ** 3);
    assert.throws(() => parseArgs(['--mode', 'preflight', '--report', 'report.json']), /archive-dir/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('la conexión del importador reutiliza DB_* del backend sin exigir otra URL', () => {
  const names = ['TMS_CATALOG_DATABASE_URL', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const saved = Object.fromEntries(names.map(key => [key, process.env[key]]));
  try {
    delete process.env.TMS_CATALOG_DATABASE_URL;
    Object.assign(process.env, { DB_HOST: 'db.example.test', DB_PORT: '5432', DB_NAME: 'tms_test',
      DB_USER: 'user_test', DB_PASSWORD: 'password_test_only' });
    const config = resolveDatabaseConfig({ loadFile: false });
    assert.equal(config.source, 'backend/.env (DB_*)');
    assert.deepEqual(config.client, { host: 'db.example.test', port: '5432', database: 'tms_test',
      user: 'user_test', password: 'password_test_only' });
    process.env.TMS_CATALOG_DATABASE_URL = 'postgresql://explicit.test/db';
    assert.equal(resolveDatabaseConfig({ loadFile: false }).source, 'TMS_CATALOG_DATABASE_URL');
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('la importación solo toma identidad fija del entorno local', () => {
  const saved = Object.fromEntries(['NODE_ENV', 'TMS_CATALOG_ACTOR_ID', 'TMS_CATALOG_ACTOR_EMAIL',
    'TMS_CATALOG_DB_ROLE', 'TMS_CATALOG_DATABASE_URL'].map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { NODE_ENV: 'development', TMS_CATALOG_ACTOR_ID: actor.actorId,
      TMS_CATALOG_ACTOR_EMAIL: actor.actorEmail, TMS_CATALOG_DB_ROLE: actor.dbRole,
      TMS_CATALOG_DATABASE_URL: 'postgresql://placeholder.invalid/test' });
    const options = parseArgs(['--mode', 'import', '--family', 'SEPOMEX', '--confirm-write',
      '--archive-dir', path.resolve(tmpdir()), '--report', 'reporte.json']);
    assert.equal(options.actorId, actor.actorId);
    assert.throws(() => parseArgs(['--mode', 'import', '--family', 'SEPOMEX', '--confirm-write',
      '--actor-id', '00000000-0000-4000-8000-000000000000', '--archive-dir', path.resolve(tmpdir()),
      '--report', 'reporte.json']), /Argumento inválido/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

function simulatedReadOnlyDb(overrides = {}) {
  const indexes = ['archivos_bucket_storage_path_key', 'cp_sat_versiones_familia_sha256_key',
    'cp_sat_versiones_cfdi_revision_uidx', 'cp_sat_versiones_familia_vigencia_idx', 'cp_sat_claves_pkey',
    'cp_sat_claves_contexto_idx', 'cp_sat_claves_catalogo_clave_idx', 'cp_sat_claves_descripcion_trgm_idx',
    'cp_sat_claves_clave_trgm_idx', 'sepomex_versiones_sha256_key', 'sepomex_asentamientos_pkey',
    'sepomex_asentamientos_cp_idx', 'sepomex_asentamientos_municipio_idx',
    'sepomex_asentamientos_colonia_trgm_idx', 'sepomex_asentamientos_municipio_trgm_idx'];
  const statements = [];
  return { statements, async query(sql, params = []) {
    statements.push(sql);
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error(`Simulador rechazó consulta no-SELECT: ${sql.slice(0, 30)}`);
    if (sql.includes('current_user AS rol_postgresql')) return { rows: [{ rol_postgresql: actor.dbRole, rol_conexion: actor.dbRole }] };
    if (sql.includes('FROM tms.usuarios')) return { rows: [{ id: actor.actorId, activo: 't', autorizado: overrides.autorizado === false ? 'f' : 't' }] };
    if (sql.includes('FROM pg_class c')) return { rows: schemaRows(params[0]?.includes('sepomex_versiones') ? 'ALL' : 'CFDI').map(row => ({
      ...row, rls_habilitada: true, rls_activa: false,
    })) };
    if (sql.includes('FROM pg_index')) return { rows: params[0].filter(name => !overrides.missingIndex || name !== overrides.missingIndex)
      .map(nombre => ({ nombre, valido: 't', listo: 't', unico: ['archivos_bucket_storage_path_key',
        'cp_sat_versiones_familia_sha256_key', 'cp_sat_versiones_cp_revision_uidx', 'cp_sat_versiones_cfdi_revision_uidx',
        'cp_sat_claves_pkey', 'sepomex_versiones_sha256_key', 'sepomex_asentamientos_pkey'].includes(nombre) ? 't' : 'f', definicion: `CREATE INDEX ${nombre}` })) };
    if (sql.includes('FROM unnest($1::text[])')) return { rows: params[0].map(signature => ({ signature,
      disponible: signature === overrides.missingFunction ? 'f' : 't', ejecutable: signature === overrides.missingFunction ? 'f' : 't' })) };
    if (sql.includes('jsonb_to_recordset')) return { rows: [{ jsonb_probe: overrides.jsonbProbe ?? 1, hash_probe: '42',
      statement_timeout: overrides.statementTimeout ?? '2min', idle_in_transaction_session_timeout: overrides.idleTimeout ?? '0', lock_timeout: '0',
      transaction_timeout: null, server_version_num: '170000' }] };
    if (sql.includes('UNION ALL SELECT \'SEPOMEX\'')) return { rows: overrides.versions ?? [] };
    throw new Error(`Consulta inesperada del simulador: ${sql.slice(0, 70)}`);
  } };
}

test('preflight exige actor TMS activo, permiso y privilegios de escritura con consultas SELECT', async () => {
  const db = simulatedReadOnlyDb();
  const granted = await preflightDatabase(db, actor, 'CFDI');
  assert.equal(granted.tablas.length, 7);
  assert.equal(granted.rol_postgresql, actor.dbRole);
  assert.ok(db.statements.every(sql => /^\s*SELECT\b/i.test(sql)));
  await assert.rejects(preflightDatabase(simulatedReadOnlyDb({ autorizado: false }), actor, 'CFDI'), /carece/);
  await assert.rejects(preflightDatabase(db, { ...actor, dbRole: 'otro' }, 'CFDI'), /rol PostgreSQL/);
  const noInsert = schemaRows('CFDI');
  noInsert.find(row => row.relname === 'archivos').insertar = false;
  assert.throws(() => validateSchema(noInsert, 'CFDI'), /Permisos: falta INSERT/);
  const wrongType = schemaRows('CFDI');
  wrongType.find(row => row.relname === 'cp_sat_claves').columns.clave_contexto = 'text';
  assert.throws(() => validateSchema(wrongType, 'CFDI'), /Tipo: tms\.cp_sat_claves\.clave_contexto es text; se esperaba jsonb/);
  const wrongKey = schemaRows('CFDI');
  wrongKey.find(row => row.relname === 'cp_sat_claves').primary_key = ['version_id', 'catalogo', 'clave'];
  assert.throws(() => validateSchema(wrongKey, 'CFDI'), /Clave primaria: tms\.cp_sat_claves/);
  const noUnique = schemaRows('CFDI');
  noUnique.find(row => row.relname === 'cp_sat_versiones').unique_keys = [];
  assert.throws(() => validateSchema(noUnique, 'CFDI'), /Restricción UNIQUE: tms\.cp_sat_versiones no tiene \(familia, sha256\)/);
  const activeRls = schemaRows('CFDI');
  activeRls.find(row => row.relname === 'cp_sat_claves').rls_activa = true;
  assert.throws(() => validateSchema(activeRls, 'CFDI'), /RLS/);
});

test('la estructura real descrita de tms.archivos satisface el INSERT y reporta diferencias específicas', () => {
  const rows = schemaRows('CFDI');
  const archivos = rows.find(row => row.relname === 'archivos');
  Object.assign(archivos.columns, { created_at: 'timestamp with time zone', updated_at: 'timestamp with time zone' });
  validateSchema(rows, 'CFDI');
  const bad = structuredClone(rows);
  const badFiles = bad.find(row => row.relname === 'archivos');
  badFiles.insertar = false;
  badFiles.rls_activa = true;
  badFiles.unique_keys = [];
  badFiles.columns.sha256 = 'bytea';
  badFiles.column_metadata.created_at.default = null;
  assert.throws(() => validateSchema(bad, 'CFDI'), error => {
    assert.match(error.message, /Permisos: falta INSERT en tms\.archivos/);
    assert.match(error.message, /RLS: está efectiva para el rol actual en tms\.archivos/);
    assert.match(error.message, /Tipo: tms\.archivos\.sha256 es bytea; se esperaba text/);
    assert.match(error.message, /Restricción UNIQUE: tms\.archivos no tiene \(bucket, storage_path\)/);
    assert.match(error.message, /Default: tms\.archivos\.created_at no tiene default/);
    return true;
  });
});

test('normaliza arrays PostgreSQL en texto y JSONB antes de comparar restricciones', () => {
  const rows = schemaRows('ALL').map(row => ({
    ...row,
    primary_key: `{${row.primary_key.join(',')}}`,
    unique_keys: JSON.stringify(row.unique_keys),
    columns: JSON.stringify(row.columns),
    column_metadata: JSON.stringify(row.column_metadata),
    esquema: 't', leer: 't', insertar: 't', rls_activa: 'f',
  }));
  assert.equal(rows.find(row => row.relname === 'archivos').primary_key, '{id}');
  assert.equal(rows.find(row => row.relname === 'cp_sat_claves').primary_key,
    '{version_id,catalogo,clave,clave_contexto}');
  assert.doesNotThrow(() => validateSchema(rows, 'ALL'));

  const noInsert = structuredClone(rows);
  noInsert.find(row => row.relname === 'archivos').insertar = 'f';
  assert.throws(() => validateSchema(noInsert, 'ALL'), /Permisos: falta INSERT en tms\.archivos/);
});

test('preflight simulado genera JSON compatible, consulta versiones y no filtra credenciales', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-preflight-'));
  const db = simulatedReadOnlyDb({ versions: [{ familia: 'CFDI', sha256: 'abc', version_cfdi: '4.0', version_complemento: null, revision: 'r1' }] });
  try {
    const report = await runPreflight({ db, identity: actor, family: 'ALL', archiveDir: dir, minFreeBytes: 0 });
    assert.equal(report.estado, 'compatible');
    assert.equal(report.solo_lectura_base_datos, true);
    assert.equal(report.escrituras_sql, 0);
    assert.equal(report.versiones_ya_importadas.CFDI[0].sha256, 'abc');
    assert.ok(db.statements.every(sql => /^\s*SELECT\b/i.test(sql)));
    assert.ok(!JSON.stringify(report).includes('postgresql://'));
    const files = await readdir(dir);
    assert.deepEqual(files, [], 'el archivo local de prueba debe eliminarse al terminar');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('preflight se detiene e informa incompatibilidades de índice y jsonb', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-preflight-error-'));
  try {
    const badIndex = await runPreflight({ db: simulatedReadOnlyDb({ missingIndex: 'cp_sat_claves_pkey' }),
      identity: actor, family: 'CFDI', archiveDir: dir, minFreeBytes: 0 });
    assert.equal(badIndex.estado, 'incompatible');
    assert.match(badIndex.problemas.join(' '), /índices/);
    const badJson = await runPreflight({ db: simulatedReadOnlyDb({ jsonbProbe: 0 }),
      identity: actor, family: 'CFDI', archiveDir: dir, minFreeBytes: 0 });
    assert.equal(badJson.estado, 'incompatible');
    assert.match(badJson.problemas.join(' '), /jsonb_to_recordset/);
    const badTimeout = await runPreflight({ db: simulatedReadOnlyDb({ statementTimeout: '10s' }),
      identity: actor, family: 'CFDI', archiveDir: dir, minFreeBytes: 0 });
    assert.equal(badTimeout.estado, 'incompatible');
    assert.match(badTimeout.problemas.join(' '), /statement_timeout/);
    const badFunction = await runPreflight({ db: simulatedReadOnlyDb({ missingFunction: 'hashtextextended(text,bigint)' }),
      identity: actor, family: 'CFDI', archiveDir: dir, minFreeBytes: 0 });
    assert.equal(badFunction.estado, 'incompatible');
    assert.match(badFunction.problemas.join(' '), /hashtextextended/);
    const badStorage = await runPreflight({ db: simulatedReadOnlyDb(), identity: actor, family: 'CFDI',
      archiveDir: path.join(dir, 'no-existe'), minFreeBytes: 0 });
    assert.equal(badStorage.estado, 'incompatible');
    assert.match(badStorage.problemas.join(' '), /Almacenamiento/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('el comando preflight acepta cliente PostgreSQL simulado sin exponer su URL', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-preflight-command-'));
  const saved = process.env.TMS_CATALOG_DATABASE_URL;
  process.env.TMS_CATALOG_DATABASE_URL = 'postgresql://secret:secret@simulator.invalid/db';
  class FakeClient {
    constructor(config) { assert.match(config.connectionString, /secret/); this.db = simulatedReadOnlyDb(); }
    async connect() {}
    async query(sql, params) { return this.db.query(sql, params); }
    async end() {}
  }
  try {
    const report = await runPreflightCommand({ ...actor, family: 'CFDI', archiveDir: dir, minFreeBytes: 0 }, FakeClient);
    assert.equal(report.estado, 'compatible');
    assert.ok(!JSON.stringify(report).includes('secret'));
  } finally {
    if (saved === undefined) delete process.env.TMS_CATALOG_DATABASE_URL; else process.env.TMS_CATALOG_DATABASE_URL = saved;
    await rm(dir, { recursive: true, force: true });
  }
});

test('versión existente incompleta detiene reintento; una íntegra se reconoce', async () => {
  const db = { async query(sql) {
    if (sql.includes('SELECT id,metadatos')) return { rows: [{ id: 'version', metadatos: {
      archivo_original: { sha256: 'abc', archivo_id: 'file-id' }, registros_sha256: 'json-hash',
      registros_filas: 2, registros_bytes: 10,
    } }] };
    return { rows: [{ total: 2 }] };
  } };
  const prepared = { familia: 'CFDI', sha256: 'abc', registros_sha256: 'json-hash', registros_bytes: 10,
    totales: { transformados: 3 } };
  await assert.rejects(existingVersion(db, prepared), /incompleta/);
  prepared.totales.transformados = 2;
  assert.equal((await existingVersion(db, prepared)).count, 2);
});

test('lotes JSONL insertan cada fila y detectan conteos diferentes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-catalog-test-'));
  try {
    const file = path.join(dir, 'records.jsonl');
    await writeFile(file, '{"codigo_postal":"00001"}\n{"codigo_postal":"00002"}\n{"codigo_postal":"00003"}\n');
    let batches = 0;
    const db = { async query(_sql, params) { batches++; return { rowCount: JSON.parse(params[0]).length }; } };
    const prepared = { familia: 'SEPOMEX', ...await stageInfo(file), totales: { transformados: 3 } };
    assert.equal(await loadRows(db, prepared, 'version', 2), 3);
    assert.equal(batches, 2);
    prepared.totales.transformados = 4;
    await assert.rejects(loadRows(db, prepared, 'version', 2), /Conteo procesado/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('SHA-256 rechaza un JSONL alterado antes de conectar y antes de COMMIT', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-catalog-test-'));
  try {
    const file = path.join(dir, 'records.jsonl');
    await writeFile(file, '{"clave":"A"}\n');
    const prepared = { familia: 'CFDI', ...await stageInfo(file), totales: { transformados: 1 } };
    await verifyPreparedJsonl(prepared);
    await writeFile(file, '{"clave":"B"}\n');
    await assert.rejects(verifyPreparedJsonl(prepared), /cambió antes/);
    let sent = 0;
    const db = { async query(_sql, params) { sent += JSON.parse(params[0]).length; return { rowCount: 1 }; } };
    await assert.rejects(loadRows(db, prepared, 'version', 100), /cambió mientras/);
    assert.equal(sent, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('reintento coteja todos los campos y falla si una fila existente difiere', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-catalog-test-'));
  try {
    const file = path.join(dir, 'records.jsonl');
    await writeFile(file, '{"catalogo":"c_A","clave":"A","descripcion":"Original"}\n');
    const prepared = { familia: 'CFDI', ...await stageInfo(file), totales: { transformados: 1 } };
    const db = { async query() { return { rows: [{ matched: 0 }] }; } };
    await assert.rejects(compareExistingRows(db, prepared, 'version', 100), /no coincide/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('archivado conserva el original y manifiesto con referencias verificables', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-catalog-test-'));
  try {
    const original = path.join(dir, 'origen.xls');
    const manifest = path.join(dir, 'traza.jsonl');
    const destination = path.join(dir, 'archive');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(destination);
    await writeFile(original, 'xls-prueba');
    await writeFile(manifest, '{"fila_excel":2}\n');
    const sha = value => createHash('sha256').update(value).digest('hex');
    const prepared = { familia: 'SEPOMEX', archivo_original: original, manifiesto_jsonl: manifest,
      sha256: sha('xls-prueba'), manifiesto_sha256: sha('{"fila_excel":2}\n'),
      manifiesto_filas: 1, metadatos: { nota: ['19/10/2026'] } };
    let id = 0;
    const db = { async query(sql) {
      if (sql.includes('SELECT id,sha256')) return { rows: [] };
      return { rows: [{ id: `archivo-${++id}` }] };
    } };
    const saved = await archive(db, prepared, destination, 'actor', []);
    assert.equal(saved.length, 2);
    assert.equal((await readFile(path.join(destination, saved[1].storage_path), 'utf8')), '{"fila_excel":2}\n');
    const metadata = versionMetadata({ ...prepared, registros_sha256: sha('staging'), registros_bytes: 7,
      totales: { transformados: 1 } }, saved,
    { actor: actor.actorId, rol_postgresql: actor.dbRole, rol_conexion: actor.dbRole });
    assert.equal(metadata.manifiesto_filas, 1);
    assert.equal(metadata.importacion.rol_postgresql, actor.dbRole);
    assert.equal(metadata.registros_sha256, sha('staging'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('si falla un lote, revierte PostgreSQL y retira solo los artefactos nuevos', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-catalog-test-'));
  try {
    const original = path.join(dir, 'origen.xls');
    const records = path.join(dir, 'records.jsonl');
    const destination = path.join(dir, 'archive');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(destination);
    await writeFile(original, 'xls-prueba');
    await writeFile(records, '{"catalogo":"c_A","clave":"A"}\n');
    const calls = [];
    const db = { async query(sql) {
      calls.push(sql);
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: true }] };
      if (sql.includes('SELECT id,metadatos')) return { rows: [] };
      if (sql.includes('SELECT id,sha256')) return { rows: [] };
      if (sql.includes('INSERT INTO tms.archivos')) return { rows: [{ id: 'file-id' }] };
      if (sql.includes('INSERT INTO tms.cp_sat_versiones')) return { rows: [{ id: 'version-id' }] };
      if (sql.includes('INSERT INTO tms.cp_sat_claves')) throw new Error('lote fallido');
      return { rows: [] };
    } };
    const prepared = { familia: 'CFDI', sha256: sha('xls-prueba'),
      archivo_original: original, ...await stageInfo(records), metadatos: {},
      fuente_url: 'https://sat.gob.mx', fecha_fuente: '2026-10-29', totales: { transformados: 1 } };
    await assert.rejects(importPrepared(db, prepared, { archiveDir: destination, actorId: 'actor', batchSize: 100 }), /lote fallido/);
    assert.ok(calls.includes('ROLLBACK'));
    assert.ok(!calls.includes('COMMIT'));
    assert.deepEqual(await readdir(destination), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('carga satisfactoria confirma una sola transacción tras verificar conteo', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-catalog-test-'));
  try {
    const original = path.join(dir, 'origen.xls');
    const records = path.join(dir, 'records.jsonl');
    const destination = path.join(dir, 'archive');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(destination);
    await writeFile(original, 'xls-prueba');
    await writeFile(records, '{"catalogo":"c_A","clave":"A"}\n');
    const calls = [];
    const db = { async query(sql, params) {
      calls.push(sql);
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: true }] };
      if (sql.includes('SELECT id,metadatos')) return { rows: [] };
      if (sql.includes('SELECT id,sha256')) return { rows: [] };
      if (sql.includes('INSERT INTO tms.archivos')) return { rows: [{ id: 'file-id' }] };
      if (sql.includes('INSERT INTO tms.cp_sat_versiones')) return { rows: [{ id: 'version-id' }] };
      if (sql.includes('INSERT INTO tms.cp_sat_claves')) return { rowCount: JSON.parse(params[0]).length };
      if (sql.includes('SELECT count(*)::int')) return { rows: [{ total: 1 }] };
      return { rows: [] };
    } };
    const prepared = { familia: 'CFDI', sha256: sha('xls-prueba'),
      archivo_original: original, ...await stageInfo(records), metadatos: {},
      fuente_url: 'https://sat.gob.mx', fecha_fuente: '2026-10-29', totales: { transformados: 1 } };
    const result = await importPrepared(db, prepared, { archiveDir: destination, actorId: 'actor', batchSize: 100 });
    assert.equal(result.importados, 1);
    assert.equal(calls[0], 'BEGIN');
    assert.equal(calls.at(-1), 'COMMIT');
    assert.equal((await readdir(destination)).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('COMMIT incierto conserva artefactos y no informa una carga confirmada', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wtg-catalog-test-'));
  try {
    const original = path.join(dir, 'origen.xls');
    const records = path.join(dir, 'records.jsonl');
    const destination = path.join(dir, 'archive');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(destination);
    await writeFile(original, 'xls-prueba');
    await writeFile(records, '{"catalogo":"c_A","clave":"A"}\n');
    const calls = [];
    const db = { async query(sql, params) {
      calls.push(sql);
      if (sql.includes('pg_try_advisory_xact_lock')) return { rows: [{ locked: true }] };
      if (sql.includes('SELECT id,metadatos')) return { rows: [] };
      if (sql.includes('SELECT id,sha256')) return { rows: [] };
      if (sql.includes('INSERT INTO tms.archivos')) return { rows: [{ id: 'file-id' }] };
      if (sql.includes('INSERT INTO tms.cp_sat_versiones')) return { rows: [{ id: 'version-id' }] };
      if (sql.includes('INSERT INTO tms.cp_sat_claves')) return { rowCount: JSON.parse(params[0]).length };
      if (sql.includes('SELECT count(*)::int')) return { rows: [{ total: 1 }] };
      if (sql === 'COMMIT') throw new Error('conexión perdida durante COMMIT');
      return { rows: [] };
    } };
    const prepared = { familia: 'CFDI', sha256: sha('xls-prueba'), archivo_original: original,
      ...await stageInfo(records), metadatos: {}, fuente_url: 'https://sat.gob.mx',
      fecha_fuente: '2026-10-29', totales: { transformados: 1 } };
    await assert.rejects(importPrepared(db, prepared, { archiveDir: destination, actorId: actor.actorId,
      batchSize: 100 }), /conexión perdida/);
    assert.ok(calls.includes('COMMIT'));
    assert.ok(!calls.includes('ROLLBACK'));
    assert.equal((await readdir(destination)).length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
