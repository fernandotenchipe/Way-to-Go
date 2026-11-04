import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const routeDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(routeDir, '../../../..');
export const DEFAULT_CFDI_DATA_DIR = path.join(backendRoot, 'private-data', 'cfdi', '4.0', 'ca9536cc4e4af64e2f2e0afc527f08bd0d1601e9d30a25d93dc4dcc4e256573b');
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const safeCatalog = /^[A-Za-z][A-Za-z0-9_]{0,80}$/;
const todayMexico = () => {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

export class CatalogNotFoundError extends Error {
  constructor(message = 'Catálogo CFDI inexistente') { super(message); this.status = 404; this.code = 'UNKNOWN_CATALOG'; }
}
export class AmbiguousCatalogKeyError extends Error {
  constructor() { super('La clave tiene varias variantes; envía el contexto de la clave'); this.status = 409; this.code = 'AMBIGUOUS_KEY'; }
}

const normalizeSearch = (value) => String(value ?? '').toLocaleLowerCase('es-MX').trim();
const pageNumber = (value, fallback) => Math.max(1, Math.min(Number.parseInt(value, 10) || fallback, 1_000_000));
const pageSize = (value) => Math.max(1, Math.min(Number.parseInt(value, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
const isInForce = (row, onDate) => (!row.vigente_desde || row.vigente_desde <= onDate)
  && (!row.vigente_hasta || row.vigente_hasta >= onDate);
const assertDate = (date) => {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error('La fecha debe usar formato YYYY-MM-DD'), { status: 400, code: 'INVALID_DATE' });
  }
};
const publicRow = ({ catalogo, clave, clave_contexto, descripcion, vigente_desde, vigente_hasta }) =>
  ({ catalogo, clave, clave_contexto, descripcion, vigente_desde, vigente_hasta });

async function* verifiedLines(file, expectedHash, expectedBytes) {
  const stream = createReadStream(file);
  const digest = createHash('sha256');
  let bytes = 0;
  stream.on('data', (chunk) => { digest.update(chunk); bytes += chunk.length; });
  const input = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of input) if (line.trim()) yield line;
  const actual = digest.digest('hex');
  if (actual !== expectedHash || bytes !== expectedBytes) throw new Error('El SHA-256 o tamaño del archivo local CFDI no coincide con su manifiesto');
}

/** Local JSONL catalog provider. Loads one catalog at a time, never the whole CFDI family. */
export function createLocalCfdiCatalogProvider({ dataDir = process.env.CFDI_CATALOG_DATA_DIR || DEFAULT_CFDI_DATA_DIR, validateOfficialManifest = true } = {}) {
  let manifestPromise;
  const manifest = () => manifestPromise ??= readFile(path.join(dataDir, 'manifest.json'), 'utf8').then((text) => {
    const index = JSON.parse(text);
    if (validateOfficialManifest && (index.formato !== 'wtg-cfdi-jsonl-v1' || index.familia !== 'CFDI'
      || index.version_cfdi !== '4.0' || index.sha256_excel !== 'ca9536cc4e4af64e2f2e0afc527f08bd0d1601e9d30a25d93dc4dcc4e256573b'
      || index.registros_esperados !== 362381 || index.registros_exportados !== 362381 || index.registros_rechazados !== 0)) {
      throw new Error('El manifiesto CFDI local no corresponde al inventario oficial validado');
    }
    return index;
  });
  const getCatalog = async (catalog) => {
    if (!safeCatalog.test(catalog)) throw new CatalogNotFoundError();
    const index = await manifest();
    const entry = index.catalogos?.[catalog];
    if (!entry || !Number.isSafeInteger(entry.registros) || entry.registros < 0 || !Number.isSafeInteger(entry.bytes)
      || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || entry.archivo !== `${catalog}.jsonl`) throw new CatalogNotFoundError();
    return { entry, file: path.join(dataDir, entry.archivo) };
  };
  return {
    async listCatalogs() {
      const index = await manifest();
      return Object.entries(index.catalogos || {}).map(([catalogo, item]) => ({ catalogo, registros: item.registros })).sort((a, b) => a.catalogo.localeCompare(b.catalogo, 'es'));
    },
    async search(catalog, { q = '', page = 1, limit = DEFAULT_PAGE_SIZE, vigente = true, fecha = todayMexico() } = {}) {
      assertDate(fecha);
      if (String(q).length > 160) throw Object.assign(new Error('La búsqueda no puede superar 160 caracteres'), { status: 400, code: 'QUERY_TOO_LONG' });
      const { entry, file } = await getCatalog(catalog);
      await access(file);
      const needle = normalizeSearch(q);
      const currentOnly = vigente !== false && vigente !== 'false';
      const p = pageNumber(page, 1), take = pageSize(limit), offset = (p - 1) * take;
      const matches = [];
      let total = 0, scanned = 0;
      for await (const line of verifiedLines(file, entry.sha256, entry.bytes)) {
        if (!line) continue;
        scanned += 1;
        const row = JSON.parse(line);
        if (currentOnly && !isInForce(row, fecha)) continue;
        if (needle && !normalizeSearch(`${row.clave} ${row.descripcion}`).includes(needle)) continue;
        if (total >= offset && matches.length < take) matches.push(publicRow(row));
        total += 1;
      }
      if (scanned !== entry.registros) throw new Error(`Conteo del catálogo ${catalog} no coincide con su manifiesto`);
      return { catalogo: catalog, resultados: matches, paginacion: { pagina: p, limite: take, total, paginas: Math.ceil(total / take) }, vigente: currentOnly, fecha_consulta: fecha };
    },
    async getByKey(catalog, key, { contexto, vigente = false, fecha = todayMexico() } = {}) {
      assertDate(fecha);
      const { entry, file } = await getCatalog(catalog);
      await access(file);
      const keyText = String(key);
      const matched = [];
      let scanned = 0;
      for await (const line of verifiedLines(file, entry.sha256, entry.bytes)) {
        if (!line) continue;
        scanned += 1;
        const row = JSON.parse(line);
        if (row.clave !== keyText || (contexto !== undefined && !isDeepStrictEqual(row.clave_contexto, contexto))) continue;
        if (vigente && !isInForce(row, fecha)) continue;
        matched.push(row);
        if (matched.length > 1) throw new AmbiguousCatalogKeyError();
      }
      if (scanned !== entry.registros) throw new Error(`Conteo del catálogo ${catalog} no coincide con su manifiesto`);
      return matched[0] ?? null;
    },
  };
}

/** PostgreSQL provider implements the same public contract for the future cutover. */
export function createPostgresCfdiCatalogProvider({ pool }) {
  if (!pool?.query) throw new TypeError('Se requiere pool PostgreSQL');
  const versionSql = `SELECT id FROM tms.cp_sat_versiones WHERE familia='CFDI' AND version_cfdi='4.0' AND vigente_desde <= CURRENT_DATE AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE) ORDER BY vigente_desde DESC LIMIT 1`;
  return {
    async listCatalogs() {
      const { rows } = await pool.query(`SELECT c.catalogo, count(*)::int AS registros FROM tms.cp_sat_claves c JOIN (${versionSql}) v ON v.id=c.version_id GROUP BY c.catalogo ORDER BY c.catalogo`);
      return rows.map((row) => ({ catalogo: row.catalogo, registros: row.registros }));
    },
    async search(catalog, { q = '', page = 1, limit = DEFAULT_PAGE_SIZE, vigente = true, fecha = todayMexico() } = {}) {
      assertDate(fecha);
      if (String(q).length > 160) throw Object.assign(new Error('La búsqueda no puede superar 160 caracteres'), { status: 400, code: 'QUERY_TOO_LONG' });
      if (!safeCatalog.test(catalog)) throw new CatalogNotFoundError();
      const p = pageNumber(page, 1), take = pageSize(limit), offset = (p - 1) * take;
      const activeClause = vigente === false || vigente === 'false' ? '' : 'AND (c.vigente_desde IS NULL OR c.vigente_desde <= $4::date) AND (c.vigente_hasta IS NULL OR c.vigente_hasta >= $4::date)';
      const args = [catalog, `%${String(q).trim()}%`, take, fecha, offset];
      const whereClause = `c.catalogo=$1 AND ($2='%%' OR c.clave ILIKE $2 OR c.descripcion ILIKE $2) ${activeClause}`;
      const countArgs = vigente === false || vigente === 'false' ? args.slice(0, 2) : args.slice(0, 4);
      const { rows: countRows } = await pool.query(`WITH version AS (${versionSql}) SELECT count(*)::int AS total FROM tms.cp_sat_claves c JOIN version v ON v.id=c.version_id WHERE ${whereClause}`, countArgs);
      const total = countRows[0]?.total ?? 0;
      const { rows } = await pool.query(`WITH version AS (${versionSql}), filtered AS (
        SELECT c.catalogo,c.clave,c.clave_contexto,c.descripcion,c.vigente_desde,c.vigente_hasta
        FROM tms.cp_sat_claves c JOIN version v ON v.id=c.version_id
        WHERE ${whereClause}
      ) SELECT catalogo,clave,clave_contexto,descripcion,vigente_desde,vigente_hasta FROM filtered ORDER BY clave,clave_contexto LIMIT $3 OFFSET $5`, args);
      if (!total) {
        const found = await pool.query(`SELECT EXISTS(SELECT 1 FROM tms.cp_sat_claves c JOIN (${versionSql}) v ON v.id=c.version_id WHERE c.catalogo=$1) AS found`, [catalog]);
        if (!found.rows[0]?.found) throw new CatalogNotFoundError();
      }
      return { catalogo: catalog, resultados: rows, paginacion: { pagina: p, limite: take, total, paginas: Math.ceil(total / take) }, vigente: vigente !== false && vigente !== 'false', fecha_consulta: fecha };
    },
    async getByKey(catalog, key, { contexto, vigente = false, fecha = todayMexico() } = {}) {
      assertDate(fecha);
      if (!safeCatalog.test(catalog)) throw new CatalogNotFoundError();
      const args = [catalog, String(key)];
      let contextClause = '';
      if (contexto !== undefined) { args.push(JSON.stringify(contexto)); contextClause = `AND c.clave_contexto=$3::jsonb`; }
      let activeClause = '';
      if (vigente) { args.push(fecha); activeClause = `AND (c.vigente_desde IS NULL OR c.vigente_desde <= $${args.length}::date) AND (c.vigente_hasta IS NULL OR c.vigente_hasta >= $${args.length}::date)`; }
      const { rows } = await pool.query(`SELECT c.catalogo,c.clave,c.clave_contexto,c.descripcion,c.vigente_desde,c.vigente_hasta,c.reglas FROM tms.cp_sat_claves c JOIN (${versionSql}) v ON v.id=c.version_id WHERE c.catalogo=$1 AND c.clave=$2 ${contextClause} ${activeClause} ORDER BY c.clave_contexto LIMIT 2`, args);
      if (rows.length > 1 && contexto === undefined) throw new AmbiguousCatalogKeyError();
      return rows[0] ?? null;
    },
  };
}

export function createCfdiCatalogProvider({ pool, mode = process.env.CFDI_CATALOG_PROVIDER || 'local', dataDir } = {}) {
  if (mode === 'local') return createLocalCfdiCatalogProvider({ dataDir });
  if (mode === 'postgres') return createPostgresCfdiCatalogProvider({ pool });
  throw new Error('CFDI_CATALOG_PROVIDER debe ser local o postgres');
}
