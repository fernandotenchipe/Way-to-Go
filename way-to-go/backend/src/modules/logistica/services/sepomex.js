const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const POSTAL_CODE = /^\d{5}$/;
const STATE_CODE = /^\d{1,2}$/;

export class SepomexError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const invalid = (field, message = `Parámetro ${field} inválido`) => {
  throw new SepomexError(400, 'INVALID_PARAMETER', message);
};

function pageOptions(query) {
  const parse = (name, fallback, max = Number.MAX_SAFE_INTEGER) => {
    const raw = query[name];
    if (raw === undefined) return fallback;
    if (!/^\d+$/.test(String(raw))) invalid(name);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) invalid(name, `${name} debe estar entre 1 y ${max}`);
    return value;
  };
  return { page: parse('page', 1), limit: parse('limit', DEFAULT_LIMIT, MAX_LIMIT) };
}

function searchText(value, field = 'q') {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.trim().length < 2 || value.length > 100 || value.includes('\0')) {
    invalid(field, `${field} debe tener entre 2 y 100 caracteres`);
  }
  return `%${value.trim().replace(/[\\%_]/g, '\\$&')}%`;
}

function optionalText(value, field, max = 100) {
  if (value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max || value.includes('\0')) invalid(field);
  return value.trim();
}

async function latestVersion(pool) {
  const { rows } = await pool.query(`
    SELECT id, fuente_url, fecha_fuente
    FROM tms.sepomex_versiones
    ORDER BY fecha_fuente DESC, created_at DESC, id DESC
    LIMIT 1
  `);
  if (!rows[0]) throw new SepomexError(503, 'SEPOMEX_NOT_AVAILABLE', 'No hay una versión SEPOMEX disponible');
  return { id: rows[0].id, fecha_fuente: rows[0].fecha_fuente, fuente_url: rows[0].fuente_url };
}

function buildFilters(versionId, filters, searchColumns) {
  const values = [versionId];
  const clauses = ['version_id = $1'];
  const add = (sql, value) => {
    values.push(value);
    clauses.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.codigo_postal) add('codigo_postal = ?', filters.codigo_postal);
  if (filters.estado) add('clave_estado = ?', filters.estado);
  if (filters.municipio) add('municipio = ?', filters.municipio);
  if (filters.ciudad) add('ciudad = ?', filters.ciudad);
  if (filters.q) {
    values.push(filters.q);
    const position = values.length;
    clauses.push(`(${searchColumns.map(column => `${column} ILIKE $${position} ESCAPE E'\\\\'`).join(' OR ')})`);
  }
  return { where: clauses.join(' AND '), values };
}

async function pagedDistinct(pool, version, projection, filters, query, searchColumns = ['asentamiento', 'municipio']) {
  const { page, limit } = pageOptions(query);
  const { where, values } = buildFilters(version.id, filters, searchColumns);
  const source = `SELECT DISTINCT ${projection} FROM tms.sepomex_asentamientos WHERE ${where}`;
  const order = projection.split(',').map((_, index) => index + 1).join(', ');
  const [countResult, result] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total FROM (${source}) matches`, values),
    pool.query(`${source} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit]),
  ]);
  const total = countResult.rows[0]?.total ?? 0;
  return { resultados: result.rows, paginacion: { pagina: page, limite: limit, total, paginas: Math.ceil(total / limit) } };
}

function asFailure(error) {
  if (error instanceof SepomexError) return error;
  if (['42P01', '42703'].includes(error.code)) return new SepomexError(503, 'SEPOMEX_SCHEMA_UNAVAILABLE', 'Las tablas SEPOMEX no están disponibles');
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', '57P01'].includes(error.code)) return new SepomexError(503, 'DATABASE_UNAVAILABLE', 'No se pudo consultar SEPOMEX');
  return new SepomexError(503, 'SEPOMEX_UNAVAILABLE', 'No se pudo consultar SEPOMEX');
}

export function createSepomexService({ pool }) {
  if (!pool?.query) throw new TypeError('Se requiere pool PostgreSQL');

  return {
    async postalCode(value) {
      if (typeof value !== 'string' || !POSTAL_CODE.test(value)) invalid('codigo_postal', 'El código postal debe contener cinco dígitos');
      try {
        const version = await latestVersion(pool);
        const { rows } = await pool.query(`
          SELECT DISTINCT codigo_postal, asentamiento, tipo_asentamiento, municipio, estado,
            ciudad, codigo_postal_oficina, clave_estado, clave_municipio, clave_ciudad
          FROM tms.sepomex_asentamientos
          WHERE version_id = $1 AND codigo_postal = $2
          ORDER BY asentamiento, clave_estado, clave_municipio, id_asentamiento_cpcons
        `, [version.id, value]);
        if (!rows.length) throw new SepomexError(404, 'POSTAL_CODE_NOT_FOUND', 'No se encontró el código postal');
        return { version, codigo_postal: value, asentamientos: rows };
      } catch (error) { throw asFailure(error); }
    },

    async settlements(query = {}) {
      try {
        const version = await latestVersion(pool);
        const codigo_postal = optionalText(query.codigo_postal, 'codigo_postal', 5);
        if (codigo_postal && !POSTAL_CODE.test(codigo_postal)) invalid('codigo_postal', 'El código postal debe contener cinco dígitos');
        const estado = optionalText(query.estado, 'estado', 2);
        if (estado && !STATE_CODE.test(estado)) invalid('estado', 'estado debe ser la clave SEPOMEX de uno o dos dígitos');
        const municipio = optionalText(query.municipio, 'municipio');
        const ciudad = optionalText(query.ciudad, 'ciudad');
        const q = searchText(query.q);
        const result = await pagedDistinct(pool, version,
          'codigo_postal, asentamiento, tipo_asentamiento, municipio, estado, ciudad, clave_estado, clave_municipio, clave_ciudad',
          { codigo_postal, estado, municipio, ciudad, q }, query);
        return { version, ...result };
      } catch (error) { throw asFailure(error); }
    },

    async states(query = {}) {
      try {
        const version = await latestVersion(pool);
        const q = searchText(query.q);
        const result = await pagedDistinct(pool, version, 'clave_estado, estado', { q }, query, ['estado']);
        return { version, ...result };
      } catch (error) { throw asFailure(error); }
    },

    async municipalities(query = {}) {
      try {
        const version = await latestVersion(pool);
        const estado = optionalText(query.estado, 'estado', 2);
        if (!estado || !STATE_CODE.test(estado)) invalid('estado', 'Indica la clave SEPOMEX del estado');
        const q = searchText(query.q);
        const result = await pagedDistinct(pool, version, 'clave_estado, estado, clave_municipio, municipio', { estado, q }, query, ['municipio']);
        return { version, ...result };
      } catch (error) { throw asFailure(error); }
    },

    async cities(query = {}) {
      try {
        const version = await latestVersion(pool);
        const estado = optionalText(query.estado, 'estado', 2);
        if (!estado || !STATE_CODE.test(estado)) invalid('estado', 'Indica la clave SEPOMEX del estado');
        const municipio = optionalText(query.municipio, 'municipio');
        if (!municipio) invalid('municipio', 'Indica el municipio');
        const q = searchText(query.q);
        const result = await pagedDistinct(pool, version, 'clave_estado, estado, clave_municipio, municipio, ciudad, clave_ciudad',
          { estado, municipio, q }, query, ['ciudad']);
        return { version, ...result };
      } catch (error) { throw asFailure(error); }
    },
  };
}
