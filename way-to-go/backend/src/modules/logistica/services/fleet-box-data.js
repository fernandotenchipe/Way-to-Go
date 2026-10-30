const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const statuses = new Set(['ACTIVA', 'MANTENIMIENTO', 'BAJA']);
const satCatalog = "lower(catalogo) IN ('c_subtiporem','subtiporem')";

function error(status, message) { const result = new Error(message); result.status = status; return result; }
function text(value, max, required = false) {
  if (value == null || value === '') { if (required) throw error(400, 'Completa los campos obligatorios'); return null; }
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw error(400, 'Revisa los campos de texto');
  return value.trim();
}
function number(value, zero = false) {
  if (value == null || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (zero ? 0 : Number.EPSILON)) throw error(400, 'Revisa pesos, capacidad y dimensiones');
  return value;
}
export function parseFleetBox(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw error(400, 'Indica los datos de la caja o remolque');
  const box = {
    numero_caja: text(body.numero_caja, 80, true), tipo_caja: text(body.tipo_caja, 100, true),
    placas: text(body.placas, 30), proveedor_id: body.proveedor_id || null,
    estatus: body.estatus || 'ACTIVA', subtipo_remolque_sat: text(body.subtipo_remolque_sat, 30),
    largo_m: number(body.largo_m), ancho_m: number(body.ancho_m), alto_m: number(body.alto_m),
    capacidad_kg: number(body.capacidad_kg), peso_vacio_kg: number(body.peso_vacio_kg, true),
    hazmat: body.hazmat, refrigerada: body.refrigerada,
  };
  if (!statuses.has(box.estatus) || (box.proveedor_id && !uuid(box.proveedor_id)) || typeof box.hazmat !== 'boolean' || typeof box.refrigerada !== 'boolean') throw error(400, 'Revisa estado, proveedor y características del equipo');
  return box;
}

const availability = `CASE WHEN b.estatus<>'ACTIVA' THEN 'NO_DISPONIBLE'
  WHEN trip.reserva_desde<=now() THEN 'ASIGNADA'
  WHEN trip.id IS NOT NULL THEN 'RESERVADA' ELSE 'DISPONIBLE' END AS disponibilidad`;
const tripJoin = `LEFT JOIN LATERAL (
  SELECT v.id,v.folio::text AS folio,v.reserva_desde,v.reserva_hasta,v.estado_operativo
  FROM tms.viajes v WHERE v.caja_id=b.id AND v.estado_operativo NOT IN ('BORRADOR','ENTREGADO','CANCELADO')
  AND v.recursos_liberados_at IS NULL
  ORDER BY CASE WHEN v.reserva_desde<=now() THEN 0 ELSE 1 END,v.reserva_desde LIMIT 1
) trip ON true`;
const selectBox = `SELECT b.*,p.razon_social AS proveedor,
  trip.folio AS viaje_folio,trip.reserva_desde AS reserva_desde,trip.reserva_hasta AS reserva_hasta,
  ${availability},(SELECT count(*)::int FROM tms.caja_documentos d WHERE d.caja_id=b.id) AS documentos
  FROM tms.cajas b LEFT JOIN tms.proveedores p ON p.id=b.proveedor_id ${tripJoin}`;

export async function listFleetBoxes(pool, filters = {}) {
  const q = String(filters.q || '').trim().slice(0, 150);
  const status = filters.status || 'all', owner = filters.owner || 'all', available = filters.availability || 'all';
  if (!['all','ACTIVA','MANTENIMIENTO','BAJA'].includes(status) || !['all','own','provider'].includes(owner) || !['all','DISPONIBLE','ASIGNADA','RESERVADA','NO_DISPONIBLE'].includes(available)) throw error(400, 'Filtro inválido');
  const query = `SELECT * FROM (${selectBox}) boxes WHERE ($1='' OR numero_caja ILIKE $2 OR tipo_caja ILIKE $2 OR placas ILIKE $2 OR proveedor ILIKE $2)
    AND ($3='all' OR estatus=$3) AND ($4='all' OR ($4='own' AND proveedor_id IS NULL) OR ($4='provider' AND proveedor_id IS NOT NULL))
    AND ($5='all' OR disponibilidad=$5) ORDER BY numero_caja`;
  return (await pool.query(query,[q,`%${q}%`,status,owner,available])).rows;
}
export async function getFleetBox(pool, id) {
  if (!uuid(id)) throw error(400, 'Equipo inválido');
  const box = (await pool.query(`${selectBox} WHERE b.id=$1`,[id])).rows[0];
  if (!box) throw error(404, 'Caja o remolque no encontrado');
  const documents = (await pool.query(`SELECT d.*,d.emitido_el::text AS emitido_el,d.vence_el::text AS vence_el,a.nombre_original,a.mime_type,a.size_bytes
    FROM tms.caja_documentos d JOIN tms.archivos a ON a.id=d.archivo_id
    WHERE d.caja_id=$1 AND a.estado='DISPONIBLE' ORDER BY d.created_at DESC`,[id])).rows;
  return {...box,documentos: documents};
}
export async function listTrailerTypes(pool, q = '') {
  return (await pool.query(`SELECT DISTINCT ON (c.clave) c.clave,c.descripcion FROM tms.cp_sat_claves c
    JOIN tms.cp_sat_versiones v ON v.id=c.version_id WHERE ${satCatalog.replace('catalogo','c.catalogo')}
    AND v.vigente_desde<=current_date AND (v.vigente_hasta IS NULL OR v.vigente_hasta>=current_date)
    AND (c.vigente_desde IS NULL OR c.vigente_desde<=current_date) AND (c.vigente_hasta IS NULL OR c.vigente_hasta>=current_date)
    AND (c.clave ILIKE $1 OR c.descripcion ILIKE $1) ORDER BY c.clave,v.vigente_desde DESC LIMIT 100`,[`%${String(q).trim().slice(0,100)}%`])).rows;
}
export async function saveFleetBox(pool, body, id = null) {
  const box = parseFleetBox(body);
  if (id && !uuid(id)) throw error(400, 'Equipo inválido');
  const local = process.env.NODE_ENV !== 'production' && process.env.LOGISTICA_AUTH_DISABLED === 'true';
  if (local && !box.numero_caja.toUpperCase().startsWith('DEMO-')) throw error(400, 'En modo local solo puedes guardar equipos DEMO-');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const normalized = box.numero_caja.toLocaleLowerCase('es-MX');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`tms.cajas:${normalized}`]);
    const prior = id ? (await db.query('SELECT id,numero_caja,proveedor_id,estatus,updated_at FROM tms.cajas WHERE id=$1 FOR UPDATE',[id])).rows[0] : null;
    if (id && !prior) throw error(404, 'Caja o remolque no encontrado');
    if (local && prior && !prior.numero_caja.toUpperCase().startsWith('DEMO-')) throw error(403, 'En modo local solo puedes editar equipos DEMO-');
    if (prior && (!body.expected_updated_at || new Date(prior.updated_at).getTime() !== Date.parse(body.expected_updated_at))) throw error(409, 'La ficha cambió. Recárgala antes de guardar');
    const duplicate = (await db.query('SELECT id FROM tms.cajas WHERE lower(btrim(numero_caja))=$1 AND id IS DISTINCT FROM $2::uuid LIMIT 1',[normalized,id])).rows[0];
    if (duplicate) throw error(409, 'Ya existe una caja o remolque con ese número');
    if (box.proveedor_id) {
      const provider = (await db.query('SELECT id FROM tms.proveedores WHERE id=$1 AND activo FOR SHARE',[box.proveedor_id])).rows[0];
      if (!provider) throw error(400, 'El proveedor no existe o está inactivo');
    }
    if (box.subtipo_remolque_sat) {
      const key = (await db.query(`SELECT c.clave FROM tms.cp_sat_claves c JOIN tms.cp_sat_versiones v ON v.id=c.version_id
        WHERE ${satCatalog.replace('catalogo','c.catalogo')} AND c.clave=$1
        AND v.vigente_desde<=current_date AND (v.vigente_hasta IS NULL OR v.vigente_hasta>=current_date)
        AND (c.vigente_desde IS NULL OR c.vigente_desde<=current_date) AND (c.vigente_hasta IS NULL OR c.vigente_hasta>=current_date) LIMIT 1`,[box.subtipo_remolque_sat])).rows[0];
      if (!key) throw error(400, 'Selecciona un subtipo de remolque del catálogo SAT vigente');
    }
    if (prior && (prior.proveedor_id !== box.proveedor_id || (prior.estatus === 'ACTIVA' && box.estatus !== 'ACTIVA'))) {
      const assigned = (await db.query(`SELECT id FROM tms.viajes WHERE caja_id=$1 AND estado_operativo NOT IN ('BORRADOR','ENTREGADO','CANCELADO')
        AND recursos_liberados_at IS NULL LIMIT 1`,[id])).rows[0];
      if (assigned) throw error(409, 'El equipo tiene un viaje activo o reservado; no se puede cambiar su proveedor o desactivarlo');
    }
    const keys = Object.keys(box), values = Object.values(box);
    const saved = id
      ? (await db.query(`UPDATE tms.cajas SET ${keys.map((key,i)=>`${key}=$${i+2}`).join(',')} WHERE id=$1 RETURNING *`,[id,...values])).rows[0]
      : (await db.query(`INSERT INTO tms.cajas(${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,values)).rows[0];
    await db.query('COMMIT');
    return saved;
  } catch (e) { await db.query('ROLLBACK'); throw e; }
  finally { db.release(); }
}

export async function addFleetBoxDocument(pool, id, body, file, actor) {
  if (!uuid(id) || !uuid(actor)) throw error(403, 'Se requiere una sesión TMS válida');
  const tipo = text(body.tipo, 80, true), folio = text(body.folio, 100);
  const emitido = body.emitido_el || null, vence = body.vence_el || null;
  for (const date of [emitido, vence]) if (date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) throw error(400, 'Revisa las fechas del documento');
  if (emitido && vence && vence < emitido) throw error(400, 'El vencimiento es anterior a la emisión');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const box = (await db.query('SELECT id FROM tms.cajas WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if (!box) throw error(404, 'Caja o remolque no encontrado');
    const archive = (await db.query(`INSERT INTO tms.archivos(bucket,storage_path,nombre_original,mime_type,size_bytes,sha256,estado,subido_por)
      VALUES('logistica-cajas',$1,$2,$3,$4,$5,'DISPONIBLE',$6) RETURNING id`,[file.key,file.name,file.mime,file.size,file.hash,actor])).rows[0];
    const document = (await db.query(`INSERT INTO tms.caja_documentos(caja_id,tipo,folio,archivo_id,emitido_el,vence_el)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[id,tipo,folio,archive.id,emitido,vence])).rows[0];
    await db.query('UPDATE tms.cajas SET updated_at=now() WHERE id=$1',[id]);
    await db.query('COMMIT');
    return {...document,nombre_original:file.name,mime_type:file.mime,size_bytes:file.size};
  } catch (e) { await db.query('ROLLBACK'); throw e; }
  finally { db.release(); }
}
export async function getFleetBoxDocumentFile(pool, id, documentId) {
  if (!uuid(id) || !uuid(documentId)) throw error(400, 'Documento inválido');
  const row = (await pool.query(`SELECT a.storage_path,a.nombre_original,a.mime_type,a.size_bytes,a.sha256
    FROM tms.caja_documentos d JOIN tms.archivos a ON a.id=d.archivo_id
    WHERE d.caja_id=$1 AND d.id=$2 AND a.bucket='logistica-cajas' AND a.estado='DISPONIBLE'`,[id,documentId])).rows[0];
  if (!row) throw error(404, 'Documento no encontrado');
  return row;
}
