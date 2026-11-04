/** Carga aislada de catálogos. Dry run no crea cliente PostgreSQL. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, open, readFile, rm, stat, statfs, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const preparer = path.join(root, 'tools/catalogos_importacion.py');
const backendEnv = path.join(root, 'backend', '.env');
const families = ['CARTA_PORTE', 'CFDI', 'SEPOMEX'];
const bucket = 'logistica-catalogos';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;

export const expectedSchema = {
  usuarios: { columns: { id: 'uuid', email: 'text', activo: 'boolean' }, pk: ['id'] },
  usuario_roles: { columns: { usuario_id: 'uuid', rol_id: 'uuid' }, pk: ['usuario_id', 'rol_id'] },
  rol_permisos: { columns: { rol_id: 'uuid', permiso_id: 'uuid' }, pk: ['rol_id', 'permiso_id'] },
  permisos: { columns: { id: 'uuid', codigo: 'text' }, pk: ['id'] },
  archivos: { columns: { id: 'uuid', bucket: 'text', storage_path: 'text', nombre_original: 'text',
    mime_type: 'text', size_bytes: 'bigint', sha256: 'text', estado: 'text', subido_por: 'uuid' },
    pk: ['id'], unique: [['bucket', 'storage_path']],
    requiredDefaults: { id: 'uuid', created_at: 'timestamp with time zone', updated_at: 'timestamp with time zone' }, write: true },
  cp_sat_versiones: { columns: { id: 'uuid', familia: 'text', version_complemento: 'text',
    version_cfdi: 'text', revision: 'text', fuente_url: 'text', sha256: 'text',
    vigente_desde: 'date', vigente_hasta: 'date', metadatos: 'jsonb' },
    pk: ['id'], unique: [['familia', 'sha256']], write: true },
  cp_sat_claves: { columns: { version_id: 'uuid', catalogo: 'text', clave: 'text',
    clave_contexto: 'jsonb', descripcion: 'text', vigente_desde: 'date', vigente_hasta: 'date', reglas: 'jsonb' },
    pk: ['version_id', 'catalogo', 'clave', 'clave_contexto'], write: true },
  sepomex_versiones: { columns: { id: 'uuid', fuente_url: 'text', sha256: 'text', fecha_fuente: 'date',
    publicado_at: 'timestamp with time zone', metadatos: 'jsonb' },
    pk: ['id'], unique: [['sha256']], write: true },
  sepomex_asentamientos: { columns: { version_id: 'uuid', codigo_postal: 'text', asentamiento: 'text',
    tipo_asentamiento: 'text', municipio: 'text', estado: 'text', ciudad: 'text',
    codigo_postal_oficina: 'text', clave_estado: 'text', oficina: 'text',
    clave_codigo_postal: 'text', clave_tipo_asentamiento: 'text', clave_municipio: 'text',
    id_asentamiento_cpcons: 'text', zona: 'text', clave_ciudad: 'text' },
    pk: ['version_id', 'clave_estado', 'clave_municipio', 'id_asentamiento_cpcons'], write: true },
};

const expectedIndexes = {
  CARTA_PORTE: ['archivos_bucket_storage_path_key', 'cp_sat_versiones_familia_sha256_key',
    'cp_sat_versiones_cp_revision_uidx', 'cp_sat_versiones_familia_vigencia_idx', 'cp_sat_claves_pkey',
    'cp_sat_claves_contexto_idx', 'cp_sat_claves_catalogo_clave_idx', 'cp_sat_claves_descripcion_trgm_idx',
    'cp_sat_claves_clave_trgm_idx'],
  CFDI: ['archivos_bucket_storage_path_key', 'cp_sat_versiones_familia_sha256_key',
    'cp_sat_versiones_cfdi_revision_uidx', 'cp_sat_versiones_familia_vigencia_idx', 'cp_sat_claves_pkey',
    'cp_sat_claves_contexto_idx', 'cp_sat_claves_catalogo_clave_idx', 'cp_sat_claves_descripcion_trgm_idx',
    'cp_sat_claves_clave_trgm_idx'],
  SEPOMEX: ['archivos_bucket_storage_path_key', 'sepomex_versiones_sha256_key', 'sepomex_asentamientos_pkey',
    'sepomex_asentamientos_cp_idx', 'sepomex_asentamientos_municipio_idx',
    'sepomex_asentamientos_colonia_trgm_idx', 'sepomex_asentamientos_municipio_trgm_idx'],
};
const uniqueIndexes = new Set(['archivos_bucket_storage_path_key', 'cp_sat_versiones_familia_sha256_key',
  'cp_sat_versiones_cp_revision_uidx', 'cp_sat_versiones_cfdi_revision_uidx', 'cp_sat_claves_pkey',
  'sepomex_versiones_sha256_key', 'sepomex_asentamientos_pkey']);
const requiredFunctions = ['jsonb_to_recordset(jsonb)', 'hashtextextended(text,bigint)',
  'pg_advisory_xact_lock(bigint)', 'gen_random_uuid()', 'row_security_active(oid)'];

export function resolveDatabaseConfig({ loadFile = true } = {}) {
  // Match the backend's dotenv source explicitly because this CLI is run from
  // the repository root, while `npm start` normally runs with backend as cwd.
  if (loadFile) dotenv.config({ path: backendEnv });
  const explicitUrl = process.env.TMS_CATALOG_DATABASE_URL?.trim();
  if (explicitUrl) return { source: 'TMS_CATALOG_DATABASE_URL', client: { connectionString: explicitUrl } };
  const { DB_HOST: host, DB_PORT: port, DB_NAME: database, DB_USER: user, DB_PASSWORD: password } = process.env;
  if (!host || !database || !user || !password) {
    throw new Error('No se encontró conexión PostgreSQL: configura TMS_CATALOG_DATABASE_URL o las variables DB_* existentes en backend/.env');
  }
  return { source: 'backend/.env (DB_*)', client: { host, port, database, user, password } };
}

async function connectDatabase(ClientClass) {
  const config = resolveDatabaseConfig();
  if (ClientClass) {
    const client = new ClientClass({ ...config.client, connectionTimeoutMillis: 10000 });
    await client.connect();
    return { client, close: () => client.end() };
  }
  if (config.source === 'TMS_CATALOG_DATABASE_URL') {
    const client = new pg.Client({ ...config.client, connectionTimeoutMillis: 10000 });
    await client.connect();
    return { client, close: () => client.end() };
  }
  // Use the backend's configured Pool so DB_* are not duplicated in this tool.
  const { default: pool } = await import('../src/shared/database/db.js');
  const client = await pool.connect();
  return { client, close: async () => { client.release(); await pool.end(); } };
}

export function parseArgs(argv) {
  const options = { mode: null, family: 'ALL', batchSize: 500, python: 'python', minFreeBytes: 1024 ** 3 };
  const values = new Map([
    ['--mode', 'mode'], ['--family', 'family'], ['--batch-size', 'batchSize'],
    ['--python', 'python'], ['--report', 'report'], ['--archive-dir', 'archiveDir'],
    ['--carta-porte', 'cartaPorte'], ['--cfdi', 'cfdi'], ['--sepomex', 'sepomex'],
    ['--official-copy', 'officialCopy'],
    ['--min-free-bytes', 'minFreeBytes'],
  ]);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--confirm-write') { options.confirmWrite = true; continue; }
    const key = values.get(argv[i]);
    if (!key || i + 1 >= argv.length) throw new Error(`Argumento inválido: ${argv[i]}`);
    options[key] = argv[++i];
  }
  if (!['dry-run', 'import', 'preflight'].includes(options.mode)) throw new Error('Indica --mode dry-run, preflight o import');
  if (![...families, 'ALL'].includes(options.family)) throw new Error('Familia inválida');
  if (options.officialCopy && options.family !== 'CARTA_PORTE') throw new Error('--official-copy solo se admite con --family CARTA_PORTE');
  options.batchSize = Number(options.batchSize);
  if (!Number.isInteger(options.batchSize) || options.batchSize < 100 || options.batchSize > 1000) throw new Error('El lote debe medir entre 100 y 1000 filas');
  if (!options.report) throw new Error('Indica --report con ruta JSON de salida');
  options.minFreeBytes = Number(options.minFreeBytes);
  if (!Number.isSafeInteger(options.minFreeBytes) || options.minFreeBytes < 0) throw new Error('--min-free-bytes debe ser un entero no negativo');
  if (options.mode === 'preflight') {
    if (process.env.NODE_ENV !== 'development') throw new Error('El preflight local exige NODE_ENV=development');
    if (!options.archiveDir || !path.isAbsolute(options.archiveDir)) throw new Error('Indica --archive-dir absoluto para validar el almacenamiento');
    options.actorId = process.env.TMS_CATALOG_ACTOR_ID?.trim();
    options.actorEmail = process.env.TMS_CATALOG_ACTOR_EMAIL?.trim();
    options.dbRole = process.env.TMS_CATALOG_DB_ROLE?.trim();
    if (!uuid.test(options.actorId ?? '') || !options.actorEmail || !options.dbRole) {
      throw new Error('Configura TMS_CATALOG_ACTOR_ID, TMS_CATALOG_ACTOR_EMAIL y TMS_CATALOG_DB_ROLE fuera del repositorio');
    }
    options.databaseConfigSource = resolveDatabaseConfig().source;
  }
  if (options.mode === 'import') {
    if (process.env.NODE_ENV !== 'development') throw new Error('La importación local exige NODE_ENV=development');
    if (options.family === 'ALL') throw new Error('Importa un archivo por invocación para aislar cada transacción');
    if (!options.confirmWrite) throw new Error('La carga real exige --confirm-write');
    if (!options.archiveDir || !path.isAbsolute(options.archiveDir)) throw new Error('Indica --archive-dir absoluto y persistente');
    options.actorId = process.env.TMS_CATALOG_ACTOR_ID?.trim();
    options.actorEmail = process.env.TMS_CATALOG_ACTOR_EMAIL?.trim();
    options.dbRole = process.env.TMS_CATALOG_DB_ROLE?.trim();
    if (!uuid.test(options.actorId ?? '') || !options.actorEmail || !options.dbRole) {
      throw new Error('Configura TMS_CATALOG_ACTOR_ID, TMS_CATALOG_ACTOR_EMAIL y TMS_CATALOG_DB_ROLE fuera del repositorio');
    }
    if (options.family !== 'SEPOMEX' && !options.officialCopy) throw new Error('SAT exige --official-copy descargada desde el enlace oficial');
    options.databaseConfigSource = resolveDatabaseConfig().source;
  }
  return options;
}

export async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function runPreparer(options, mode, stage, report) {
  const args = [preparer, '--mode', mode, '--family', options.family, '--report', report];
  if (stage) args.push('--stage', stage);
  if (options.officialCopy) args.push('--official-copy', options.officialCopy);
  for (const [key, flag] of [['cartaPorte', '--carta-porte'], ['cfdi', '--cfdi'], ['sepomex', '--sepomex']]) {
    if (options[key]) args.push(flag, options[key]);
  }
  const code = await new Promise((resolve, reject) => {
    const child = spawn(options.python, args, { stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (code !== 0) {
    const error = new Error(`Preparación local falló (${code})`);
    try { error.preparation = JSON.parse(await readFile(report, 'utf8')); } catch { /* Sin reporte local. */ }
    throw error;
  }
  return JSON.parse(await readFile(report, 'utf8'));
}

export function tableNames(family) {
  const auth = ['usuarios', 'usuario_roles', 'rol_permisos', 'permisos', 'archivos'];
  if (family === 'ALL') return [...auth, 'cp_sat_versiones', 'cp_sat_claves', 'sepomex_versiones', 'sepomex_asentamientos'];
  return family === 'SEPOMEX' ? [...auth, 'sepomex_versiones', 'sepomex_asentamientos']
    : [...auth, 'cp_sat_versiones', 'cp_sat_claves'];
}

function parseJsonValue(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function parsePgArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.startsWith('{') || !value.endsWith('}')) return value;
  const items = [];
  let token = '';
  let quoted = false;
  let escaped = false;
  let wasQuoted = false;
  for (const char of value.slice(1, -1)) {
    if (escaped) { token += char; escaped = false; continue; }
    if (char === '\\' && quoted) { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; wasQuoted = true; continue; }
    if (char === ',' && !quoted) {
      items.push(!wasQuoted && token === 'NULL' ? null : token);
      token = ''; wasQuoted = false; continue;
    }
    token += char;
  }
  if (token.length || wasQuoted || value !== '{}') items.push(!wasQuoted && token === 'NULL' ? null : token);
  return items;
}

function normalizePgBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value == null) return false;
  return ['t', 'true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

function normalizeSchemaRow(row) {
  const columns = parseJsonValue(row.columns);
  const columnMetadata = parseJsonValue(row.column_metadata);
  let uniqueKeys = parseJsonValue(row.unique_keys);
  if (!Array.isArray(uniqueKeys)) uniqueKeys = parsePgArray(uniqueKeys);
  return {
    ...row,
    columns: columns && typeof columns === 'object' && !Array.isArray(columns) ? columns : {},
    column_metadata: columnMetadata && typeof columnMetadata === 'object' && !Array.isArray(columnMetadata) ? columnMetadata : {},
    primary_key: parsePgArray(row.primary_key),
    unique_keys: Array.isArray(uniqueKeys) ? uniqueKeys.map(key => parsePgArray(key)) : [],
    esquema: normalizePgBoolean(row.esquema),
    leer: normalizePgBoolean(row.leer),
    insertar: normalizePgBoolean(row.insertar),
    rls_activa: normalizePgBoolean(row.rls_activa),
  };
}

export function validateSchema(rows, family) {
  rows = rows.map(normalizeSchemaRow);
  const required = tableNames(family);
  const diagnostics = [];
  const found = new Set(rows.map(row => row.relname));
  for (const name of required) if (!found.has(name)) diagnostics.push(`Tabla ausente: tms.${name}`);
  for (const row of rows) {
    const expected = expectedSchema[row.relname];
    if (!expected) {
      diagnostics.push(`Tabla inesperada: tms.${row.relname}`);
      continue;
    }
    if (!row.esquema) diagnostics.push(`Permisos: falta USAGE en esquema tms (tabla tms.${row.relname})`);
    if (!row.leer) diagnostics.push(`Permisos: falta SELECT en tms.${row.relname}`);
    if (expected.write && !row.insertar) diagnostics.push(`Permisos: falta INSERT en tms.${row.relname}`);
    if (expected.write && row.rls_activa) diagnostics.push(`RLS: está efectiva para el rol actual en tms.${row.relname}`);
    for (const [name, type] of Object.entries(expected.columns)) {
      const actual = row.columns?.[name];
      if (actual == null) diagnostics.push(`Columnas: falta tms.${row.relname}.${name} (tipo esperado ${type})`);
      else if (actual !== type) diagnostics.push(`Tipo: tms.${row.relname}.${name} es ${actual}; se esperaba ${type}`);
    }
    for (const [name, type] of Object.entries(expected.requiredDefaults ?? {})) {
      const actual = row.column_metadata?.[name];
      if (!actual) diagnostics.push(`Columnas: falta tms.${row.relname}.${name}, omitida por el INSERT y requerida con default ${type}`);
      else {
        if (actual.type !== type) diagnostics.push(`Tipo: tms.${row.relname}.${name} es ${actual.type}; se esperaba ${type}`);
        if (!normalizePgBoolean(actual.not_null)) diagnostics.push(`Restricción NOT NULL: tms.${row.relname}.${name} debería ser NOT NULL`);
        if (actual.default == null) diagnostics.push(`Default: tms.${row.relname}.${name} no tiene default aunque el INSERT la omite`);
      }
    }
    if (JSON.stringify(row.primary_key) !== JSON.stringify(expected.pk)) {
      diagnostics.push(`Clave primaria: tms.${row.relname} es ${JSON.stringify(row.primary_key ?? null)}; se esperaba ${JSON.stringify(expected.pk)}`);
    }
    for (const key of expected.unique ?? []) {
      if (!row.unique_keys?.some(actual => JSON.stringify(actual) === JSON.stringify(key))) {
        diagnostics.push(`Restricción UNIQUE: tms.${row.relname} no tiene (${key.join(', ')}); restricciones UNIQUE detectadas: ${JSON.stringify(row.unique_keys ?? [])}`);
      }
    }
  }
  if (diagnostics.length) {
    const error = new Error(`Preflight de esquema incompatible:\n - ${diagnostics.join('\n - ')}`);
    error.diagnostics = diagnostics;
    throw error;
  }
}

export async function preflightDatabase(db, identity, family) {
  const role = (await db.query('SELECT current_user AS rol_postgresql, session_user AS rol_conexion')).rows[0];
  if (role?.rol_postgresql !== identity.dbRole || role?.rol_conexion !== identity.dbRole) {
    throw new Error('El rol PostgreSQL no coincide con TMS_CATALOG_DB_ROLE');
  }
  const user = (await db.query(`SELECT u.id, u.activo, EXISTS (
    SELECT 1 FROM tms.usuario_roles ur JOIN tms.rol_permisos rp ON rp.rol_id=ur.rol_id
    JOIN tms.permisos p ON p.id=rp.permiso_id
    WHERE ur.usuario_id=u.id AND p.codigo='carta_porte.catalogos.editar'
  ) AS autorizado FROM tms.usuarios u WHERE u.id=$1 AND lower(u.email)=lower($2)`, [identity.actorId, identity.actorEmail])).rows[0];
  if (!normalizePgBoolean(user?.activo) || !normalizePgBoolean(user?.autorizado)) throw new Error('La identidad fija TMS no está activa, no coincide con el correo o carece de carta_porte.catalogos.editar');
  const rows = (await db.query(`SELECT c.relname,
    has_schema_privilege(current_user,'tms','USAGE') AS esquema,
    has_table_privilege(current_user,c.oid,'SELECT') AS leer,
    has_table_privilege(current_user,c.oid,'INSERT') AS insertar,
    row_security_active(c.oid) AS rls_activa,
    c.relrowsecurity AS rls_habilitada,
    (SELECT jsonb_object_agg(a.attname, format_type(a.atttypid,a.atttypmod))
       FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT jsonb_object_agg(a.attname,jsonb_build_object(
       'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)))
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
       WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS column_metadata,
    (SELECT array_agg(a.attname ORDER BY k.ordinality)
       FROM pg_constraint p JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(attnum,ordinality) ON true
       JOIN pg_attribute a ON a.attrelid=p.conrelid AND a.attnum=k.attnum
       WHERE p.conrelid=c.oid AND p.contype='p') AS primary_key,
    (SELECT COALESCE(jsonb_agg(to_jsonb(u.key_columns)), '[]'::jsonb) FROM (
       SELECT array_agg(a.attname ORDER BY k.ordinality) AS key_columns
       FROM pg_constraint p JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(attnum,ordinality) ON true
       JOIN pg_attribute a ON a.attrelid=p.conrelid AND a.attnum=k.attnum
       WHERE p.conrelid=c.oid AND p.contype='u' GROUP BY p.oid) u) AS unique_keys
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='tms' AND c.relname=ANY($1::text[])`, [tableNames(family)])).rows.map(normalizeSchemaRow);
  validateSchema(rows, family);
  const indexFamily = family === 'ALL' ? ['CARTA_PORTE', 'CFDI', 'SEPOMEX'] : [family];
  const neededIndexes = [...new Set(indexFamily.flatMap(name => expectedIndexes[name]))];
  const indexes = (await db.query(`SELECT i.relname AS nombre, x.indisvalid AS valido, x.indisready AS listo,
    x.indisunique AS unico, pg_get_indexdef(x.indexrelid) AS definicion
    FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=i.relnamespace
    WHERE n.nspname='tms' AND i.relname=ANY($1::text[])`, [neededIndexes])).rows.map(index => ({
      ...index, valido: normalizePgBoolean(index.valido), listo: normalizePgBoolean(index.listo),
      unico: normalizePgBoolean(index.unico),
    }));
  const indexMap = new Map(indexes.map(index => [index.nombre, index]));
  const missingIndexes = neededIndexes.filter(name => !indexMap.get(name)?.valido || !indexMap.get(name)?.listo ||
    (uniqueIndexes.has(name) && !indexMap.get(name)?.unico));
  if (missingIndexes.length) throw new Error(`Faltan índices necesarios o no están válidos: ${missingIndexes.join(', ')}`);
  const functions = (await db.query(`SELECT expected.signature,
    to_regprocedure(expected.signature) IS NOT NULL AS disponible,
    CASE WHEN to_regprocedure(expected.signature) IS NULL THEN false
      ELSE has_function_privilege(current_user,to_regprocedure(expected.signature),'EXECUTE') END AS ejecutable
    FROM unnest($1::text[]) AS expected(signature)`, [requiredFunctions])).rows;
  const missingFunctions = functions.filter(fn => !normalizePgBoolean(fn.disponible) || !normalizePgBoolean(fn.ejecutable)).map(fn => fn.signature);
  if (missingFunctions.length) throw new Error(`Funciones requeridas no disponibles o sin EXECUTE: ${missingFunctions.join(', ')}`);
  const compatibility = (await db.query(`SELECT
    (SELECT count(*)::int FROM jsonb_to_recordset('[{"probe":"ok"}]'::jsonb) AS r(probe text) WHERE probe='ok') AS jsonb_probe,
    hashtextextended('wtg-catalog-preflight',0)::text AS hash_probe,
    current_setting('statement_timeout') AS statement_timeout,
    current_setting('idle_in_transaction_session_timeout') AS idle_in_transaction_session_timeout,
    current_setting('lock_timeout') AS lock_timeout,
    current_setting('transaction_timeout',true) AS transaction_timeout,
    current_setting('server_version_num') AS server_version_num`)).rows[0];
  if (Number(compatibility?.jsonb_probe) !== 1 || compatibility?.hash_probe == null) throw new Error('jsonb_to_recordset o hashtextextended no son compatibles');
  const timeouts = {
    statement_timeout: compatibility.statement_timeout,
    idle_in_transaction_session_timeout: compatibility.idle_in_transaction_session_timeout,
    lock_timeout: compatibility.lock_timeout,
    transaction_timeout: compatibility.transaction_timeout || 'no disponible',
  };
  if (timeoutMs(timeouts.statement_timeout) !== 0 && timeoutMs(timeouts.statement_timeout) < 30_000) throw new Error('statement_timeout menor a 30 segundos; puede interrumpir un lote');
  if (timeoutMs(timeouts.idle_in_transaction_session_timeout) !== 0 && timeoutMs(timeouts.idle_in_transaction_session_timeout) < 60_000) throw new Error('idle_in_transaction_session_timeout menor a 60 segundos');
  if (timeouts.transaction_timeout !== 'no disponible' && timeoutMs(timeouts.transaction_timeout) !== 0 && timeoutMs(timeouts.transaction_timeout) < 300_000) throw new Error('transaction_timeout menor a 5 minutos; no alcanza para una carga atómica grande');
  const versions = (await db.query(`SELECT familia,sha256,version_cfdi,version_complemento,revision FROM tms.cp_sat_versiones
    UNION ALL SELECT 'SEPOMEX' AS familia,sha256,NULL::text,NULL::text,NULL::text FROM tms.sepomex_versiones`)).rows;
  const imported = Object.fromEntries(families.map(name => [name, versions.filter(item => item.familia === name)]));
  return { actor: user.id, rol_postgresql: role.rol_postgresql, rol_conexion: role.rol_conexion,
    tablas: rows.map(row => ({ nombre: row.relname, rls_habilitada: row.rls_habilitada, rls_efectiva: row.rls_activa,
      columnas: row.columns, definiciones_columnas: row.column_metadata,
      primary_key: row.primary_key, unique_keys: row.unique_keys,
      permisos: { select: row.leer, insert: row.insertar } })),
    indices: indexes, funciones: functions, timeouts, compatibilidad: { jsonb_to_recordset: true, hashtextextended: true,
      server_version_num: compatibility.server_version_num }, versiones_existentes: imported };
}

function timeoutMs(value) {
  if (value == null || value === '' || value === '0') return 0;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|min|h|d)?\s*$/i.exec(value);
  if (!match) return Number.POSITIVE_INFINITY;
  const factor = ({ ms: 1, s: 1000, min: 60_000, h: 3_600_000, d: 86_400_000 })[(match[2] ?? 'ms').toLowerCase()];
  return Number(match[1]) * factor;
}

export async function preflightStorage(directory, requiredBytes) {
  const info = await stat(directory);
  if (!info.isDirectory()) throw new Error('El almacenamiento no es un directorio');
  await access(directory, constants.R_OK | constants.W_OK);
  const space = await statfs(directory);
  const availableBytes = BigInt(space.bavail) * BigInt(space.bsize);
  if (availableBytes < BigInt(requiredBytes)) throw new Error('Espacio libre menor al mínimo configurado');
  const marker = path.join(directory, `.catalogos-preflight-${process.pid}-${Date.now()}`);
  const handle = await open(marker, 'wx');
  try { await handle.writeFile('ok'); } finally { await handle.close(); await unlink(marker); }
  return { directorio: path.resolve(directory), legible: true, escribible: true,
    espacio_disponible_bytes: Number(availableBytes), espacio_minimo_bytes: requiredBytes };
}

export async function runPreflight({ db, identity, family = 'ALL', archiveDir, minFreeBytes = 1024 ** 3 }) {
  const report = { modo: 'preflight', familia: family, estado: 'iniciada', solo_lectura_base_datos: true,
    escrituras_sql: 0, comprobaciones: {}, versiones_ya_importadas: {} };
  const errors = [];
  try { report.comprobaciones.almacenamiento = await preflightStorage(archiveDir, minFreeBytes); }
  catch (error) { errors.push(`Almacenamiento: ${sanitizeError(error)}`); }
  try {
    report.comprobaciones.base_datos = await preflightDatabase(db, identity, family);
    report.versiones_ya_importadas = report.comprobaciones.base_datos.versiones_existentes;
  } catch (error) {
    errors.push(`Base de datos: ${sanitizeError(error)}`);
    if (error.diagnostics) report.comprobaciones.diferencias_esquema = error.diagnostics;
  }
  report.estado = errors.length ? 'incompatible' : 'compatible';
  if (errors.length) report.problemas = errors;
  return report;
}

export async function runPreflightCommand(options, ClientClass) {
  let connection;
  let connectionError;
  try { connection = await connectDatabase(ClientClass); }
  catch (error) { connectionError = error; }
  try {
    const db = connectionError ? { async query() { throw connectionError; } } : connection.client;
    const report = await runPreflight({ db, identity: options, family: options.family,
      archiveDir: options.archiveDir, minFreeBytes: options.minFreeBytes });
    report.configuracion_conexion = options.databaseConfigSource ?? resolveDatabaseConfig().source;
    return report;
  } finally { await connection?.close().catch(() => {}); }
}

function sanitizeError(error) {
  return String(error?.message ?? error).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, '[cadena PostgreSQL oculta]');
}

export async function existingVersion(db, prepared) {
  const sep = prepared.familia === 'SEPOMEX';
  const versionTable = sep ? 'sepomex_versiones' : 'cp_sat_versiones';
  const detailTable = sep ? 'sepomex_asentamientos' : 'cp_sat_claves';
  const params = sep ? [prepared.sha256] : [prepared.familia, prepared.sha256];
  const condition = sep ? 'sha256=$1' : 'familia=$1 AND sha256=$2';
  const version = (await db.query(`SELECT id,metadatos FROM tms.${versionTable} WHERE ${condition}`, params)).rows[0];
  if (!version) return null;
  const count = Number((await db.query(`SELECT count(*)::int AS total FROM tms.${detailTable} WHERE version_id=$1`, [version.id])).rows[0].total);
  if (count !== prepared.totales.transformados) throw new Error(`Versión ${version.id} existente pero incompleta: ${count} de ${prepared.totales.transformados}`);
  const stored = version.metadatos;
  if (stored?.archivo_original?.sha256 !== prepared.sha256 || !stored?.archivo_original?.archivo_id ||
      stored?.registros_sha256 !== prepared.registros_sha256 ||
      stored?.registros_filas !== prepared.totales.transformados ||
      stored?.registros_bytes !== prepared.registros_bytes ||
      (sep && (stored?.manifiesto_sha256 !== prepared.manifiesto_sha256 || stored?.manifiesto_filas !== prepared.manifiesto_filas ||
               !stored?.manifiesto?.archivo_id))) {
    throw new Error('Versión existente sin trazabilidad o con huellas distintas; requiere revisión manual');
  }
  return { id: version.id, count, metadatos: stored };
}

async function copyVerified(source, destination, expectedSha, created) {
  try { await copyFile(source, destination, constants.COPYFILE_EXCL); created.push(destination); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (await digest(destination) !== expectedSha) throw new Error(`Archivo archivado no coincide: ${destination}`);
  return { path: destination, size: (await stat(destination)).size, sha256: expectedSha };
}

export async function archive(db, prepared, directory, actor, created) {
  const artifacts = [{ source: prepared.archivo_original, key: `${prepared.sha256}.xls`, sha256: prepared.sha256,
    mime: 'application/vnd.ms-excel' }];
  if (prepared.familia === 'SEPOMEX') artifacts.push({ source: prepared.manifiesto_jsonl,
    key: `${prepared.sha256}-sepomex-manifiesto.jsonl`, sha256: prepared.manifiesto_sha256, mime: 'application/x-ndjson' });
  const saved = [];
  for (const artifact of artifacts) {
    const file = await copyVerified(artifact.source, path.join(directory, artifact.key), artifact.sha256, created);
    let row = (await db.query('SELECT id,sha256,size_bytes,estado FROM tms.archivos WHERE bucket=$1 AND storage_path=$2', [bucket, artifact.key])).rows[0];
    if (row && (row.sha256 !== file.sha256 || Number(row.size_bytes) !== file.size || row.estado !== 'DISPONIBLE')) {
      throw new Error(`Registro de archivo incompatible: ${artifact.key}`);
    }
    if (!row) {
      row = (await db.query(`INSERT INTO tms.archivos
        (bucket,storage_path,nombre_original,mime_type,size_bytes,sha256,estado,subido_por)
        VALUES ($1,$2,$3,$4,$5,$6,'DISPONIBLE',$7) RETURNING id`,
      [bucket, artifact.key, path.basename(artifact.source), artifact.mime, file.size, file.sha256, actor])).rows[0];
    }
    saved.push({ archivo_id: row.id, bucket, storage_path: artifact.key, sha256: file.sha256, size_bytes: file.size });
  }
  return saved;
}

export function versionMetadata(prepared, saved, preflight = {}) {
  const meta = { ...prepared.metadatos, archivo_original: saved[0],
    registros_sha256: prepared.registros_sha256,
    registros_filas: prepared.totales?.transformados,
    registros_bytes: prepared.registros_bytes,
    importacion: { actor_tms_id: preflight.actor, rol_postgresql: preflight.rol_postgresql,
      rol_conexion: preflight.rol_conexion } };
  if (prepared.familia === 'SEPOMEX') Object.assign(meta, {
    manifiesto_formato: 'jsonl-v1', manifiesto_sha256: prepared.manifiesto_sha256,
    manifiesto_filas: prepared.manifiesto_filas, manifiesto: saved[1], tipo_fuente_url: 'pagina_de_descarga',
  });
  return meta;
}

export async function insertVersion(db, prepared, metadata) {
  if (prepared.familia === 'SEPOMEX') {
    return (await db.query(`INSERT INTO tms.sepomex_versiones(fuente_url,sha256,fecha_fuente,publicado_at,metadatos)
      VALUES($1,$2,$3,NULL,$4::jsonb) RETURNING id`,
    [prepared.fuente_url, prepared.sha256, prepared.fecha_fuente, JSON.stringify(metadata)])).rows[0].id;
  }
  const complement = prepared.familia === 'CARTA_PORTE' ? '3.1' : null;
  return (await db.query(`INSERT INTO tms.cp_sat_versiones
    (familia,version_complemento,version_cfdi,revision,fuente_url,sha256,vigente_desde,vigente_hasta,metadatos)
    VALUES($1,$2,'4.0',$3,$4,$5,$6,NULL,$7::jsonb) RETURNING id`,
  [prepared.familia, complement, `archivo-sha256:${prepared.sha256}`, prepared.fuente_url, prepared.sha256,
    prepared.fecha_fuente, JSON.stringify(metadata)])).rows[0].id;
}

const sepFields = ['codigo_postal', 'asentamiento', 'tipo_asentamiento', 'municipio', 'estado', 'ciudad',
  'codigo_postal_oficina', 'clave_estado', 'oficina', 'clave_codigo_postal', 'clave_tipo_asentamiento',
  'clave_municipio', 'id_asentamiento_cpcons', 'zona', 'clave_ciudad'];
const satFields = ['catalogo', 'clave', 'clave_contexto', 'descripcion', 'vigente_desde', 'vigente_hasta', 'reglas'];
const sepRecordTypes = sepFields.map(name => `${name} text`).join(',');
const satRecordTypes = 'catalogo text,clave text,clave_contexto jsonb,descripcion text,vigente_desde date,vigente_hasta date,reglas jsonb';

export const sqlBatch = {
  SEPOMEX: `INSERT INTO tms.sepomex_asentamientos
    (version_id,codigo_postal,asentamiento,tipo_asentamiento,municipio,estado,ciudad,codigo_postal_oficina,
     clave_estado,oficina,clave_codigo_postal,clave_tipo_asentamiento,clave_municipio,id_asentamiento_cpcons,zona,clave_ciudad)
    SELECT $2::uuid,x.* FROM jsonb_to_recordset($1::jsonb) AS x(${sepRecordTypes})`,
  SAT: `INSERT INTO tms.cp_sat_claves
    (version_id,catalogo,clave,clave_contexto,descripcion,vigente_desde,vigente_hasta,reglas)
    SELECT $2::uuid,x.catalogo,x.clave,x.clave_contexto,x.descripcion,x.vigente_desde,x.vigente_hasta,x.reglas
    FROM jsonb_to_recordset($1::jsonb) AS x(${satRecordTypes})`,
};

const sepContentFields = sepFields.filter(name => !['clave_estado', 'clave_municipio', 'id_asentamiento_cpcons'].includes(name));
const satContentFields = satFields.filter(name => !['catalogo', 'clave', 'clave_contexto'].includes(name));
export const sqlCompare = {
  SEPOMEX: `SELECT count(*)::int AS matched FROM jsonb_to_recordset($1::jsonb) AS x(${sepRecordTypes})
    JOIN tms.sepomex_asentamientos d ON d.version_id=$2::uuid AND d.clave_estado=x.clave_estado
      AND d.clave_municipio=x.clave_municipio AND d.id_asentamiento_cpcons=x.id_asentamiento_cpcons
    WHERE ${sepContentFields.map(name => `d.${name} IS NOT DISTINCT FROM x.${name}`).join(' AND ')}`,
  SAT: `SELECT count(*)::int AS matched FROM jsonb_to_recordset($1::jsonb) AS x(${satRecordTypes})
    JOIN tms.cp_sat_claves d ON d.version_id=$2::uuid AND d.catalogo=x.catalogo AND d.clave=x.clave
      AND d.clave_contexto=x.clave_contexto
    WHERE ${satContentFields.map(name => `d.${name} IS NOT DISTINCT FROM x.${name}`).join(' AND ')}`,
};

export async function verifyPreparedJsonl(prepared) {
  if (!sha256.test(prepared.registros_sha256 ?? '') || !Number.isSafeInteger(prepared.registros_bytes) || prepared.registros_bytes <= 0) {
    throw new Error('Falta la huella SHA-256 o el tamaño del JSONL preparado');
  }
  const info = await stat(prepared.registros_jsonl);
  if (info.size !== prepared.registros_bytes || await digest(prepared.registros_jsonl) !== prepared.registros_sha256) {
    throw new Error('El JSONL preparado cambió antes de conectar a PostgreSQL');
  }
}

export async function processPreparedRows(prepared, batchSize, onBatch) {
  const hash = createHash('sha256');
  let pending = Buffer.alloc(0), batch = [], bytes = 0, processed = 0;
  const flush = async () => {
    if (!batch.length) return;
    const matched = await onBatch(batch);
    if (matched !== batch.length) throw new Error('El lote no coincide completamente con el JSONL preparado');
    processed += matched;
    batch = [];
  };
  const addLine = async line => {
    if (!line.length) throw new Error('El JSONL contiene una línea vacía');
    batch.push(JSON.parse(line.toString('utf8')));
    if (batch.length >= batchSize) await flush();
  };
  for await (const chunk of createReadStream(prepared.registros_jsonl)) {
    hash.update(chunk);
    bytes += chunk.length;
    pending = Buffer.concat([pending, chunk]);
    let newline;
    while ((newline = pending.indexOf(10)) >= 0) {
      await addLine(pending.subarray(0, newline));
      pending = pending.subarray(newline + 1);
    }
  }
  if (pending.length) await addLine(pending);
  await flush();
  if (bytes !== prepared.registros_bytes || hash.digest('hex') !== prepared.registros_sha256) {
    throw new Error('El JSONL cambió mientras se enviaban sus bytes a PostgreSQL');
  }
  if (processed !== prepared.totales.transformados) throw new Error(`Conteo procesado ${processed} distinto de ${prepared.totales.transformados}`);
  return processed;
}

export async function loadRows(db, prepared, versionId, batchSize) {
  const query = sqlBatch[prepared.familia === 'SEPOMEX' ? 'SEPOMEX' : 'SAT'];
  return processPreparedRows(prepared, batchSize, async batch => {
    const result = await db.query(query, [JSON.stringify(batch), versionId]);
    return result.rowCount;
  });
}

export async function compareExistingRows(db, prepared, versionId, batchSize) {
  const query = sqlCompare[prepared.familia === 'SEPOMEX' ? 'SEPOMEX' : 'SAT'];
  return processPreparedRows(prepared, batchSize, async batch => {
    const result = await db.query(query, [JSON.stringify(batch), versionId]);
    return Number(result.rows[0]?.matched);
  });
}

export async function importPrepared(db, prepared, options) {
  const created = [];
  let committed = false;
  let commitAttempted = false;
  await db.query('BEGIN');
  try {
    const lock = (await db.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS locked", [`tms-catalogos:${prepared.familia}:${prepared.sha256}`])).rows[0];
    if (!lock?.locked) throw new Error('Ya hay una importación de este archivo en curso');
    const previous = await existingVersion(db, prepared);
    if (previous) {
      await compareExistingRows(db, prepared, previous.id, options.batchSize);
      const artifacts = [previous.metadatos.archivo_original, previous.metadatos.manifiesto].filter(Boolean);
      for (const item of artifacts) {
        if (!item.storage_path || path.basename(item.storage_path) !== item.storage_path ||
            await digest(path.join(options.archiveDir, item.storage_path)) !== item.sha256) {
          throw new Error('La versión existente no tiene archivos íntegros en el archivo configurado');
        }
        const registered = (await db.query(`SELECT bucket,storage_path,sha256,size_bytes,estado FROM tms.archivos WHERE id=$1`, [item.archivo_id])).rows[0];
        if (!registered || registered.bucket !== bucket || registered.storage_path !== item.storage_path ||
            registered.sha256 !== item.sha256 || Number(registered.size_bytes) !== item.size_bytes ||
            registered.estado !== 'DISPONIBLE') {
          throw new Error('La versión existente perdió su registro de archivo en tms.archivos');
        }
      }
      commitAttempted = true;
      await db.query('COMMIT');
      committed = true;
      return { estado: 'ya_importada', version_id: previous.id, importados: 0, existentes: previous.count };
    }
    const saved = await archive(db, prepared, options.archiveDir, options.actorId, created);
    const versionId = await insertVersion(db, prepared, versionMetadata(prepared, saved, options.preflight));
    const imported = await loadRows(db, prepared, versionId, options.batchSize);
    const final = Number((await db.query(`SELECT count(*)::int AS total FROM tms.${prepared.familia === 'SEPOMEX' ? 'sepomex_asentamientos' : 'cp_sat_claves'} WHERE version_id=$1`, [versionId])).rows[0].total);
    if (final !== imported) throw new Error('La cuenta PostgreSQL no coincide antes del COMMIT');
    commitAttempted = true;
    await db.query('COMMIT');
    committed = true;
    return { estado: 'importada', version_id: versionId, importados: imported, existentes: 0, archivos: saved };
  } catch (error) {
    if (!committed && !commitAttempted) {
      await db.query('ROLLBACK').catch(() => {});
      for (const file of created) await unlink(file).catch(() => {});
    }
    // Si COMMIT perdió la conexión, el resultado es incierto. Conservar los
    // artefactos y conciliar la versión por SHA antes de cualquier reintento.
    throw error;
  }
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) {
    const argv = process.argv.slice(2);
    const reportFlag = argv.indexOf('--report');
    if (argv[argv.indexOf('--mode') + 1] === 'preflight' && reportFlag >= 0 && argv[reportFlag + 1]) {
      const report = { modo: 'preflight', estado: 'incompatible', solo_lectura_base_datos: true,
        escrituras_sql: 0, problemas: [sanitizeError(error)] };
      await mkdir(path.dirname(path.resolve(argv[reportFlag + 1])), { recursive: true });
      await writeFile(argv[reportFlag + 1], JSON.stringify(report, null, 2), 'utf8');
      console.log(JSON.stringify(report, null, 2));
    } else console.error(sanitizeError(error));
    process.exitCode = 1;
    return;
  }
  const output = { modo: options.mode, familia: options.family, estado: 'iniciada', leidos: 0, importados: 0, rechazados: 0 };
  let work;
  try {
    if (options.mode === 'preflight') {
      const report = await runPreflightCommand(options);
      await mkdir(path.dirname(path.resolve(options.report)), { recursive: true });
      await writeFile(options.report, JSON.stringify(report, null, 2), 'utf8');
      console.log(JSON.stringify(report, null, 2));
      console.log(`Reporte: ${options.report}`);
      if (report.estado !== 'compatible') process.exitCode = 1;
      return;
    }
    if (options.mode === 'dry-run') {
      const report = await runPreparer(options, 'dry-run', null, options.report);
      console.log(`${report.total_leidos} leídos, ${report.total_transformados} transformados, ${report.total_rechazados} rechazados. Sin conexión PostgreSQL.`);
      return;
    }
    work = await mkdtemp(path.join(tmpdir(), 'wtg-catalogos-'));
    const reportPath = path.join(work, 'preparacion.json');
    const prepared = (await runPreparer(options, 'prepare', path.join(work, 'stage'), reportPath)).familias[0];
    output.leidos = prepared.totales.leidos;
    output.rechazados = prepared.totales.rechazados;
    output.esperados = prepared.totales.esperados;
    output.transformados = prepared.totales.transformados;
    output.catalogos = prepared.conteos;
    output.sha256 = prepared.sha256;
    if (options.officialCopy) output.comparacion_copia_oficial = prepared.comparacion_copia_oficial;
    if (prepared.totales.rechazados || prepared.totales.transformados !== prepared.totales.esperados) throw new Error('La preparación no conservó todos los registros');
    await verifyPreparedJsonl(prepared);
    if (options.officialCopy) {
      const comparison = prepared.comparacion_copia_oficial;
      if (!comparison?.aceptada || comparison.procedencia_sat_demostrada !== false) {
        throw new Error('Falta evidencia completa y aceptada de comparación de la copia oficial');
      }
      if (await digest(prepared.archivo_original) !== comparison.sha256_original ||
          await digest(options.officialCopy) !== comparison.sha256_copia) {
        throw new Error('El original o la copia cambió después de la comparación; repite la preparación');
      }
    }
    const archiveBytes = (await stat(prepared.archivo_original)).size +
      (prepared.manifiesto_jsonl ? (await stat(prepared.manifiesto_jsonl)).size : 0);
    await preflightStorage(options.archiveDir, archiveBytes);
    const connection = await connectDatabase();
    const client = connection.client;
    try {
      output.preflight = await preflightDatabase(client, options, options.family);
      const result = await importPrepared(client, prepared, { ...options, preflight: output.preflight });
      Object.assign(output, result);
    } finally { await connection.close().catch(() => {}); }
    console.log(`${output.estado}: ${output.importados} importados; versión ${output.version_id}`);
  } catch (error) {
    output.estado = 'fallida';
    output.error = sanitizeError(error);
    if (error.preparation) {
      output.preparacion = error.preparation;
      output.comparacion_copia_oficial = error.preparation.familias?.find(item => item.comparacion_copia_oficial)?.comparacion_copia_oficial;
      output.leidos = error.preparation.familias?.reduce((sum, item) => sum + item.totales.leidos, 0) ?? 0;
      output.rechazados = error.preparation.familias?.reduce((sum, item) => sum + item.totales.rechazados, 0) ?? 0;
    }
    process.exitCode = 1;
    console.error(sanitizeError(error));
  } finally {
    if (work) await rm(work, { recursive: true, force: true });
    if (options.mode === 'import') {
      await mkdir(path.dirname(path.resolve(options.report)), { recursive: true });
      await writeFile(options.report, JSON.stringify(output, null, 2), 'utf8');
      console.log(`Reporte: ${options.report}`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
