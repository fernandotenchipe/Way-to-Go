import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../../../shared/database/db.js';
import { requireCostRead, requireCreateTrip, requireExtraApproval, requireFinanceRole, requireLogisticsUser, requireTrafficRole, requireTripEdit, requireTripRead } from '../middleware/auth.js';

const router = express.Router();
const routeDir = path.dirname(fileURLToPath(import.meta.url));
export const LOGISTICS_UPLOAD_DIR = path.resolve(routeDir, '../../../../uploads/logistica');
mkdirSync(LOGISTICS_UPLOAD_DIR, { recursive: true });

const statuses = new Set(['BORRADOR', 'PROGRAMADO', 'EN_CAMINO_A_CARGA', 'LLEGO_A_CARGA', 'EN_CARGA', 'SALIO_CARGADO_EN_RUTA', 'LLEGO_A_DESTINO', 'EN_DESCARGA', 'ENTREGADO', 'CANCELADO']);
const transitions = {
  BORRADOR: ['PROGRAMADO', 'CANCELADO'], PROGRAMADO: ['EN_CAMINO_A_CARGA', 'CANCELADO'],
  EN_CAMINO_A_CARGA: ['LLEGO_A_CARGA', 'CANCELADO'], LLEGO_A_CARGA: ['EN_CARGA', 'CANCELADO'],
  EN_CARGA: ['SALIO_CARGADO_EN_RUTA', 'CANCELADO'], SALIO_CARGADO_EN_RUTA: ['LLEGO_A_DESTINO', 'CANCELADO'],
  LLEGO_A_DESTINO: ['EN_DESCARGA', 'CANCELADO'], EN_DESCARGA: ['ENTREGADO', 'CANCELADO'],
  ENTREGADO: [], CANCELADO: [],
};
const fail = (res, status, error) => res.status(status).json({ success: false, error });
const safeLimit = (value, fallback = 50) => Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), 100);
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const wrap = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (error) {
    if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', '57P01'].includes(error.code)
      || /connection terminated due to connection timeout|timeout expired|connection terminated unexpectedly/i.test(error.message || '')) {
      return fail(res, 503, 'La base de datos no responde. Revisa la conexión a Supabase e inténtalo de nuevo.');
    }
    if (error.code === '23505') return fail(res, 409, 'El registro ya existe');
    if (error.code === '23503' || error.code === '23514') return fail(res, 400, 'La información no cumple las referencias o reglas del TMS');
    if (error.code === '23P01') return fail(res, 409, 'El recurso ya está reservado en ese horario');
    console.error('Logística API error:', error);
    return fail(res, 500, 'No se pudo completar la operación de logística');
  }
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, LOGISTICS_UPLOAD_DIR),
    filename: (_req, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']).has(file.mimetype)) return callback(new Error('Solo se permiten imágenes JPG, PNG, WEBP y PDF'));
    callback(null, true);
  },
});

router.get('/health', (_req, res) => res.json({ success: true, module: 'logistica', database_schema: 'tms', status: 'ready' }));
router.use(requireLogisticsUser);

router.get('/dashboard', requireTripRead, wrap(async (_req, res) => {
  const { rows: [summary] } = await query(`
    SELECT COUNT(*) FILTER (WHERE estado_operativo NOT IN ('ENTREGADO','CANCELADO'))::int AS viajes_activos,
      COUNT(*) FILTER (WHERE estado_operativo IN ('PROGRAMADO','EN_CAMINO_A_CARGA','LLEGO_A_CARGA','EN_CARGA','SALIO_CARGADO_EN_RUTA','LLEGO_A_DESTINO','EN_DESCARGA'))::int AS en_operacion,
      COUNT(*) FILTER (WHERE estado_operativo='ENTREGADO')::int AS entregados,
      COUNT(*) FILTER (WHERE estado_operativo NOT IN ('ENTREGADO','CANCELADO') AND ultima_actualizacion_operativa_at < now()-umbral_sin_actualizacion)::int AS sin_actualizacion
    FROM tms.viajes`);
  const { rows: [billing] } = await query(`SELECT COUNT(*) FILTER (WHERE listo)::int AS listos_para_facturar FROM tms.v_listo_facturar`);
  const { rows: recent } = await query(`
    SELECT v.id, v.folio::text AS folio, v.estado_operativo, v.cita_carga_at, v.entrega_estimada_at,
      c.razon_social AS cliente, o.nombre AS operador, u.numero_economico AS unidad
    FROM tms.viajes v JOIN tms.clientes c ON c.id=v.cliente_id
    LEFT JOIN tms.operadores o ON o.id=v.operador_id LEFT JOIN tms.unidades u ON u.id=v.unidad_id
    WHERE v.estado_operativo NOT IN ('ENTREGADO','CANCELADO') ORDER BY v.updated_at DESC LIMIT 8`);
  res.json({ success: true, data: { summary: { ...summary, ...billing }, recent_trips: recent } });
}));

router.get('/trips', requireTripRead, wrap(async (req, res) => {
  const { estado, cliente_id: clientId, q } = req.query;
  const limit = safeLimit(req.query.limit);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  if (estado && !statuses.has(String(estado))) return fail(res, 400, 'Estado operativo inválido');
  const search = q ? `%${String(q).trim().slice(0, 100)}%` : null;
  const { rows } = await query(`
    SELECT v.id, v.folio::text AS folio, v.cliente_id, c.razon_social AS cliente, v.estado_operativo,
      v.tipo_servicio_id, ts.nombre AS tipo_servicio, v.tipo_carga, v.cita_carga_at, v.entrega_estimada_at,
      v.origen_snapshot, v.destino_snapshot, v.unidad_id, u.numero_economico AS unidad,
      v.operador_id, o.nombre AS operador, v.created_at, v.updated_at
    FROM tms.viajes v JOIN tms.clientes c ON c.id=v.cliente_id
    LEFT JOIN tms.tipos_servicio ts ON ts.id=v.tipo_servicio_id
    LEFT JOIN tms.unidades u ON u.id=v.unidad_id LEFT JOIN tms.operadores o ON o.id=v.operador_id
    WHERE ($1::text IS NULL OR v.estado_operativo=$1)
      AND ($2::uuid IS NULL OR v.cliente_id=$2)
      AND ($3::text IS NULL OR v.folio::text ILIKE $3 OR c.razon_social ILIKE $3 OR v.tipo_carga ILIKE $3)
    ORDER BY v.created_at DESC LIMIT $4 OFFSET $5`, [estado || null, clientId || null, search, limit, offset]);
  res.json({ success: true, data: rows, pagination: { limit, offset, count: rows.length } });
}));

router.post('/trips', requireCreateTrip, wrap(async (req, res) => {
  const body = req.body || {};
  const { cliente_id: clienteId, convenio_id: convenioId, origen_id: originId, destino_id: destinationId,
    tipo_servicio_id: serviceTypeId, tipo_carga: cargoType, unidad_id: unitId, caja_id: boxId,
    operador_id: operatorId, proveedor_id: providerId, cita_carga_at: loadingAt,
    entrega_estimada_at: deliveryAt, reserva_desde: reserveFrom, reserva_hasta: reserveTo,
    flete_base: baseFare, moneda = 'MXN', instrucciones, restricciones_ruta: routeRestrictions } = body;
  if (![clienteId, originId, destinationId, serviceTypeId].every((value) => typeof value === 'string')) return fail(res, 400, 'Cliente, origen, destino y tipo de servicio son requeridos');
  if (typeof cargoType !== 'string' || !cargoType.trim()) return fail(res, 400, 'El tipo de carga es requerido');
  if (!Number.isFinite(Number(baseFare)) || Number(baseFare) < 0) return fail(res, 400, 'El flete base debe ser un monto válido');
  if (!loadingAt || !deliveryAt || !reserveFrom || !reserveTo) return fail(res, 400, 'Citas y rango de reserva son requeridos');
  if (!['MXN', 'USD'].includes(moneda)) return fail(res, 400, 'Moneda no admitida');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: addresses } = await client.query(`
      SELECT id, cliente_id, nombre, calle, ciudad, estado, pais, codigo_postal, zona_horaria,
        horario, instrucciones, requiere_cita
      FROM tms.cliente_direcciones WHERE id=ANY($1::uuid[]) AND cliente_id=$2 AND activo FOR SHARE`,
    [[originId, destinationId], clienteId]);
    const origin = addresses.find((row) => row.id === originId);
    const destination = addresses.find((row) => row.id === destinationId);
    if (!origin || !destination) { await client.query('ROLLBACK'); return fail(res, 400, 'Origen o destino no pertenece al cliente o está inactivo'); }
    const { rows: serviceRows } = await client.query('SELECT id FROM tms.tipos_servicio WHERE id=$1 AND activo', [serviceTypeId]);
    if (!serviceRows.length) { await client.query('ROLLBACK'); return fail(res, 400, 'Tipo de servicio inexistente o inactivo'); }

    const snapshots = [origin, destination].map((address) => JSON.stringify(address));
    const { rows: [trip] } = await client.query(`
      INSERT INTO tms.viajes (cliente_id, convenio_id, origen_id, destino_id, origen_snapshot, destino_snapshot,
        tipo_servicio_id, tipo_carga, unidad_id, caja_id, operador_id, proveedor_id, estado_operativo,
        cita_carga_at, entrega_estimada_at, reserva_desde, reserva_hasta, instrucciones, restricciones_ruta,
        creado_por, ultima_actualizacion_operativa_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,'PROGRAMADO',$13,$14,$15,$16,$17,$18,$19,now())
      RETURNING *`, [clienteId, convenioId || null, originId, destinationId, ...snapshots, serviceTypeId, cargoType.trim(), unitId || null, boxId || null, operatorId || null, providerId || null, loadingAt, deliveryAt, reserveFrom, reserveTo, instrucciones || null, routeRestrictions || null, req.user.id]);

    const checklist = await client.query(`INSERT INTO tms.viaje_evidencias
      (viaje_id,tipo_evidencia_id,obligatoria_facturar,requiere_validacion,visible_cliente)
      SELECT $1,tipo_evidencia_id,obligatoria_facturar,requiere_validacion,visible_cliente
      FROM tms.servicio_evidencias WHERE tipo_servicio_id=$2`, [trip.id, serviceTypeId]);
    if (checklist.rowCount === 0) { await client.query('ROLLBACK'); return fail(res, 409, 'El servicio no tiene plantilla de evidencias configurada'); }
    await client.query(`INSERT INTO tms.viaje_comercial (viaje_id,flete_base,moneda) VALUES ($1,$2,$3)`, [trip.id, baseFare, moneda]);
    await client.query('INSERT INTO tms.viaje_tiempos(viaje_id) VALUES ($1)', [trip.id]);
    await client.query('INSERT INTO tms.viaje_carga(viaje_id,descripcion) VALUES ($1,$2)', [trip.id, body.descripcion_carga || null]);
    await client.query('INSERT INTO tms.viaje_facturacion_operativa(viaje_id) VALUES ($1)', [trip.id]);
    await client.query('UPDATE tms.viaje_comercial SET checklist_confirmado_por=$1, checklist_confirmado_at=now() WHERE viaje_id=$2', [req.user.id, trip.id]);
    await client.query(`INSERT INTO tms.viaje_eventos
      (viaje_id,tipo,estado_nuevo,ocurrido_at,registrado_por,origen,comentario,idempotency_key)
      VALUES ($1,'CREACION','PROGRAMADO',now(),$2,'INTERNO','Viaje creado desde Logística',$3)`, [trip.id, req.user.id, randomUUID()]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: trip });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

router.get('/trips/:folio', requireTripRead, wrap(async (req, res) => {
  const { rows: [trip] } = await query(`
    SELECT v.*, v.folio::text AS folio, c.razon_social AS cliente, ts.nombre AS tipo_servicio,
      u.numero_economico AS unidad, b.numero_caja AS caja, o.nombre AS operador,
      p.razon_social AS proveedor, vc.flete_base, vc.moneda,
      vf.estado AS estado_facturacion, prep.listo AS listo_para_facturar, prep.subtotal_sin_impuestos
    FROM tms.viajes v JOIN tms.clientes c ON c.id=v.cliente_id
    LEFT JOIN tms.tipos_servicio ts ON ts.id=v.tipo_servicio_id
    LEFT JOIN tms.unidades u ON u.id=v.unidad_id LEFT JOIN tms.cajas b ON b.id=v.caja_id
    LEFT JOIN tms.operadores o ON o.id=v.operador_id LEFT JOIN tms.proveedores p ON p.id=v.proveedor_id
    LEFT JOIN tms.viaje_comercial vc ON vc.viaje_id=v.id
    LEFT JOIN tms.viaje_facturacion_operativa vf ON vf.viaje_id=v.id
    LEFT JOIN tms.v_listo_facturar prep ON prep.viaje_id=v.id WHERE v.folio::text=$1`, [req.params.folio]);
  if (!trip) return fail(res, 404, 'Viaje no encontrado');
  if (!req.user.permissions.includes('costos.ver')) {
    delete trip.flete_base; delete trip.moneda; delete trip.subtotal_sin_impuestos;
  }
  res.json({ success: true, data: trip });
}));

router.patch('/trips/:folio/status', requireTrafficRole, wrap(async (req, res) => {
  const { estado, comentario, motivo_cancelacion: cancelReason } = req.body || {};
  if (!statuses.has(estado)) return fail(res, 400, 'Estado operativo inválido');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [trip] } = await client.query('SELECT * FROM tms.viajes WHERE folio::text=$1 FOR UPDATE', [req.params.folio]);
    if (!trip) { await client.query('ROLLBACK'); return fail(res, 404, 'Viaje no encontrado'); }
    if (!transitions[trip.estado_operativo]?.includes(estado)) { await client.query('ROLLBACK'); return fail(res, 409, `No se permite cambiar de ${trip.estado_operativo} a ${estado}`); }
    if (estado === 'CANCELADO' && (typeof cancelReason !== 'string' || !cancelReason.trim())) { await client.query('ROLLBACK'); return fail(res, 400, 'Indica el motivo de cancelación'); }

    const { rows: [updated] } = await client.query(`UPDATE tms.viajes SET estado_operativo=$1,
      cancelado_at=CASE WHEN $1='CANCELADO' THEN now() ELSE cancelado_at END,
      motivo_cancelacion=CASE WHEN $1='CANCELADO' THEN $2 ELSE motivo_cancelacion END,
      ultima_actualizacion_operativa_at=now() WHERE id=$3 RETURNING *`, [estado, cancelReason || null, trip.id]);
    const timeColumn = { LLEGO_A_CARGA: 'llegada_carga_at', EN_CARGA: 'inicio_carga_at', SALIO_CARGADO_EN_RUTA: 'salida_cargado_at', LLEGO_A_DESTINO: 'llegada_destino_at', EN_DESCARGA: 'inicio_descarga_at', ENTREGADO: 'entregado_at' }[estado];
    if (timeColumn) await client.query(`UPDATE tms.viaje_tiempos SET ${timeColumn}=now() WHERE viaje_id=$1`, [trip.id]);
    await client.query(`INSERT INTO tms.viaje_eventos
      (viaje_id,tipo,estado_anterior,estado_nuevo,ocurrido_at,registrado_por,origen,comentario,idempotency_key)
      VALUES ($1,$2,$3,$4,now(),$5,'INTERNO',$6,$7)`, [trip.id, estado === 'CANCELADO' ? 'CANCELACION' : 'ESTATUS', trip.estado_operativo, estado, req.user.id, comentario || cancelReason || null, randomUUID()]);
    await client.query('COMMIT');
    res.json({ success: true, data: updated });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

router.get('/trips/:folio/events', requireTripRead, wrap(async (req, res) => {
  const { rows } = await query(`SELECT e.* FROM tms.viaje_eventos e JOIN tms.viajes v ON v.id=e.viaje_id
    WHERE v.folio::text=$1 ORDER BY e.ocurrido_at DESC,e.created_at DESC`, [req.params.folio]);
  res.json({ success: true, data: rows });
}));

router.get('/trips/:folio/evidence', requireTripRead, wrap(async (req, res) => {
  const { rows } = await query(`SELECT e.id,e.tipo_evidencia_id,t.codigo,t.nombre,e.obligatoria_facturar,
    e.visible_cliente,e.no_aplica,estado.estado AS estado,
    jsonb_agg(jsonb_build_object('entrega_id',d.id,'archivo_id',a.id,'nombre',a.nombre_original,'mime_type',a.mime_type,'estado',d.estado,'created_at',d.created_at)) FILTER (WHERE d.id IS NOT NULL) AS entregas
    FROM tms.viaje_evidencias e JOIN tms.viajes v ON v.id=e.viaje_id
    JOIN tms.tipos_evidencia t ON t.id=e.tipo_evidencia_id JOIN tms.v_evidencias_estado estado ON estado.id=e.id
    LEFT JOIN tms.evidencia_entregas d ON d.evidencia_id=e.id LEFT JOIN tms.archivos a ON a.id=d.archivo_id
    WHERE v.folio::text=$1 GROUP BY e.id,t.codigo,t.nombre,estado.estado ORDER BY t.nombre`, [req.params.folio]);
  res.json({ success: true, data: rows });
}));

router.post('/trips/:folio/evidence', requireTripEdit, (req, res, next) => upload.single('file')(req, res, (error) => error ? fail(res, error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.message) : next()), wrap(async (req, res) => {
  if (!req.file) return fail(res, 400, 'Selecciona un archivo');
  const { tipo_evidencia_id: evidenceTypeId } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [evidence] } = await client.query(`SELECT e.id FROM tms.viaje_evidencias e
      JOIN tms.viajes v ON v.id=e.viaje_id WHERE v.folio::text=$1 AND e.tipo_evidencia_id=$2 FOR UPDATE`, [req.params.folio, evidenceTypeId]);
    if (!evidence) { await client.query('ROLLBACK'); await unlink(req.file.path); return fail(res, 404, 'No existe ese requisito de evidencia para el viaje'); }
    const storagePath = path.basename(req.file.filename);
    const { rows: [file] } = await client.query(`INSERT INTO tms.archivos
      (bucket,storage_path,nombre_original,mime_type,size_bytes,estado,subido_por)
      VALUES ('logistica',$1,$2,$3,$4,'DISPONIBLE',$5) RETURNING id`, [storagePath, path.basename(req.file.originalname), req.file.mimetype, req.file.size, req.user.id]);
    const { rows: [delivery] } = await client.query(`INSERT INTO tms.evidencia_entregas
      (evidencia_id,archivo_id,subida_por) VALUES ($1,$2,$3) RETURNING *`, [evidence.id, file.id, req.user.id]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...delivery, archivo_id: file.id } });
  } catch (error) { await client.query('ROLLBACK'); if (req.file) await unlink(req.file.path).catch(() => {}); throw error; }
  finally { client.release(); }
}));

router.get('/evidence/:id/download', requireTripRead, wrap(async (req, res) => {
  const { rows: [file] } = await query(`SELECT a.storage_path,a.nombre_original,a.mime_type FROM tms.archivos a
    JOIN tms.evidencia_entregas e ON e.archivo_id=a.id WHERE a.id=$1 AND a.bucket='logistica' AND a.estado='DISPONIBLE'`, [req.params.id]);
  if (!file) return fail(res, 404, 'Archivo no encontrado');
  const filepath = path.resolve(LOGISTICS_UPLOAD_DIR, path.basename(file.storage_path));
  return res.type(file.mime_type).download(filepath, path.basename(file.nombre_original));
}));

router.get('/customers', requireTripRead, wrap(async (req, res) => {
  const search = req.query.q ? `%${String(req.query.q).trim().slice(0, 100)}%` : null;
  const { rows } = await query(`SELECT c.*, count(DISTINCT d.id)::int AS direcciones_activas,
      (SELECT concat_ws(', ', x.ciudad, x.estado) FROM tms.cliente_direcciones x
       WHERE x.cliente_id=c.id AND x.activo ORDER BY x.nombre LIMIT 1) AS address_preview
    FROM tms.clientes c LEFT JOIN tms.cliente_direcciones d ON d.cliente_id=c.id AND d.activo
    WHERE ($1::text IS NULL OR c.razon_social ILIKE $1 OR c.nombre_comercial ILIKE $1 OR c.rfc ILIKE $1
      OR EXISTS (SELECT 1 FROM tms.cliente_direcciones x WHERE x.cliente_id=c.id AND x.activo AND (x.nombre ILIKE $1 OR x.ciudad ILIKE $1 OR x.estado ILIKE $1)))
    GROUP BY c.id ORDER BY c.razon_social`, [search]);
  res.json({ success: true, data: rows });
}));
router.post('/customers', requireTripEdit, wrap(async (req, res) => {
  const { razon_social: legalName, nombre_comercial: tradeName, rfc, uso_cfdi: cfdiUse,
    forma_pago: paymentForm, metodo_pago: paymentMethod, condiciones_pago: paymentTerms,
    contacto, direccion } = req.body || {};
  if (typeof legalName !== 'string' || !legalName.trim()) return fail(res, 400, 'La razón social es obligatoria');
  if (rfc != null && (typeof rfc !== 'string' || rfc.trim().length > 13)) return fail(res, 400, 'El RFC debe tener como máximo 13 caracteres');
  if (contacto && typeof contacto.nombre === 'string' && !contacto.nombre.trim() && (contacto.email || contacto.telefono || contacto.puesto)) return fail(res, 400, 'El nombre del contacto es obligatorio cuando agregas sus datos');
  if (direccion && [direccion.nombre, direccion.calle, direccion.ciudad, direccion.estado].some((value) => typeof value === 'string' && value.trim())
    && ![direccion.nombre, direccion.calle, direccion.ciudad, direccion.estado].every((value) => typeof value === 'string' && value.trim())) {
    return fail(res, 400, 'Completa nombre, calle, ciudad y estado para guardar la dirección');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [customer] } = await client.query(`INSERT INTO tms.clientes
      (razon_social,nombre_comercial,rfc,uso_cfdi,forma_pago,metodo_pago,condiciones_pago)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [legalName.trim(), typeof tradeName === 'string' && tradeName.trim() ? tradeName.trim() : null,
      rfc?.trim().toUpperCase() || null, cfdiUse?.trim() || null, paymentForm?.trim() || null, paymentMethod?.trim() || null, paymentTerms?.trim() || null]);

    let contact = null;
    if (typeof contacto?.nombre === 'string' && contacto.nombre.trim()) {
      const { rows: [savedContact] } = await client.query(`INSERT INTO tms.cliente_contactos
        (cliente_id,nombre,puesto,email,telefono,tipo_contacto,principal)
        VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id,nombre,puesto,email,telefono,tipo_contacto,principal`,
      [customer.id, contacto.nombre.trim(), contacto.puesto?.trim() || null, contacto.email?.trim() || null,
        contacto.telefono?.trim() || null, contacto.tipo_contacto?.trim() || 'OPERACIONES']);
      contact = savedContact;
    }

    let address = null;
    if (typeof direccion?.nombre === 'string' && direccion.nombre.trim()) {
      const { rows: [savedAddress] } = await client.query(`INSERT INTO tms.cliente_direcciones
        (cliente_id,nombre,calle,ciudad,estado,pais,codigo_postal,zona_horaria,horario,instrucciones,requiere_cita,contacto_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [customer.id, direccion.nombre.trim(), direccion.calle.trim(), direccion.ciudad.trim(), direccion.estado.trim(),
        String(direccion.pais || 'MX').slice(0, 2).toUpperCase(), direccion.codigo_postal?.trim() || null,
        direccion.zona_horaria || 'America/Mexico_City', direccion.horario?.trim() || null,
        direccion.instrucciones?.trim() || null, Boolean(direccion.requiere_cita), contact?.id || null]);
      address = savedAddress;
    }

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...customer, direcciones_activas: address ? 1 : 0,
      address_preview: address ? `${address.ciudad}, ${address.estado}` : null, contactos: contact ? [contact] : [], direcciones: address ? [address] : [] } });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}));
router.patch('/customers/:id', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de cliente inválido');
  const body = req.body || {};
  const fields = [
    ['razon_social', 'razon_social'], ['nombre_comercial', 'nombre_comercial'], ['rfc', 'rfc'],
    ['uso_cfdi', 'uso_cfdi'], ['forma_pago', 'forma_pago'], ['metodo_pago', 'metodo_pago'], ['condiciones_pago', 'condiciones_pago'],
  ];
  const updates = [];
  const values = [];
  for (const [column, key] of fields) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = body[key];
    if (key === 'razon_social' && (typeof value !== 'string' || !value.trim())) return fail(res, 400, 'La razón social es obligatoria');
    if (value != null && typeof value !== 'string') return fail(res, 400, `El campo ${key} debe ser texto`);
    if (key === 'rfc' && typeof value === 'string' && value.trim().length > 13) return fail(res, 400, 'El RFC debe tener como máximo 13 caracteres');
    values.push(key === 'razon_social' ? value.trim() : key === 'rfc' ? value?.trim().toUpperCase() || null : value?.trim() || null);
    updates.push(`${column}=$${values.length}`);
  }
  const hasContactUpdate = Object.prototype.hasOwnProperty.call(body, 'contacto');
  const contact = body.contacto || {};
  if (hasContactUpdate && (typeof contact !== 'object' || Array.isArray(contact))) return fail(res, 400, 'Los datos del contacto no son válidos');
  if (hasContactUpdate && ['nombre', 'puesto', 'email', 'telefono', 'tipo_contacto'].some((key) => contact[key] != null && typeof contact[key] !== 'string')) return fail(res, 400, 'Los campos del contacto deben ser texto');
  const hasContactData = [contact.nombre, contact.puesto, contact.email, contact.telefono].some((value) => typeof value === 'string' && value.trim());
  if (hasContactUpdate && hasContactData && (typeof contact.nombre !== 'string' || !contact.nombre.trim())) return fail(res, 400, 'El nombre del contacto es obligatorio cuando agregas sus datos');
  if (!updates.length && !hasContactUpdate) return fail(res, 400, 'No se recibieron campos para actualizar');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let customer;
    if (updates.length) {
      values.push(req.params.id);
      const result = await client.query(`UPDATE tms.clientes SET ${updates.join(', ')}, updated_at=now() WHERE id=$${values.length} RETURNING *`, values);
      [customer] = result.rows;
    } else {
      const result = await client.query('SELECT * FROM tms.clientes WHERE id=$1 FOR UPDATE', [req.params.id]);
      [customer] = result.rows;
    }
    if (!customer) { await client.query('ROLLBACK'); return fail(res, 404, 'Cliente no encontrado'); }

    if (hasContactUpdate && hasContactData) {
      const { rows: [existingContact] } = await client.query('SELECT id FROM tms.cliente_contactos WHERE cliente_id=$1 AND principal AND activo FOR UPDATE', [req.params.id]);
      const contactValues = [contact.nombre.trim(), contact.puesto?.trim() || null, contact.email?.trim() || null,
        contact.telefono?.trim() || null, contact.tipo_contacto?.trim() || 'OPERACIONES'];
      if (existingContact) {
        await client.query(`UPDATE tms.cliente_contactos SET nombre=$2,puesto=$3,email=$4,telefono=$5,tipo_contacto=$6,updated_at=now() WHERE id=$1`, [existingContact.id, ...contactValues]);
      } else {
        await client.query(`INSERT INTO tms.cliente_contactos (cliente_id,nombre,puesto,email,telefono,tipo_contacto,principal)
          VALUES ($1,$2,$3,$4,$5,$6,true)`, [req.params.id, ...contactValues]);
      }
    } else if (hasContactUpdate) {
      await client.query(`UPDATE tms.cliente_contactos SET activo=false,principal=false,updated_at=now()
        WHERE cliente_id=$1 AND principal AND activo`, [req.params.id]);
    }
    await client.query('COMMIT');
    res.json({ success: true, data: customer });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}));
router.patch('/customers/:id/active', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de cliente inválido');
  if (typeof req.body?.activo !== 'boolean') return fail(res, 400, 'El estado activo debe ser verdadero o falso');
  const { rows: [customer] } = await query('UPDATE tms.clientes SET activo=$2, updated_at=now() WHERE id=$1 RETURNING *', [req.params.id, req.body.activo]);
  if (!customer) return fail(res, 404, 'Cliente no encontrado');
  res.json({ success: true, data: customer });
}));
router.get('/customers/:id', requireTripRead, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de cliente inválido');
  const { rows: [customer] } = await query(`SELECT * FROM tms.clientes WHERE id=$1`, [req.params.id]);
  if (!customer) return fail(res, 404, 'Cliente no encontrado');
  const [addresses, contacts] = await Promise.all([
    query(`SELECT * FROM tms.cliente_direcciones WHERE cliente_id=$1 ORDER BY activo DESC,nombre`, [req.params.id]),
    query(`SELECT id,nombre,puesto,email,telefono,tipo_contacto,principal FROM tms.cliente_contactos WHERE cliente_id=$1 AND activo ORDER BY principal DESC,nombre`, [req.params.id]),
  ]);
  res.json({ success: true, data: { ...customer, direcciones: addresses.rows, contactos: contacts.rows } });
}));
router.post('/customers/:id/addresses', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de cliente inválido');
  const { nombre, calle, ciudad, estado, pais = 'MX', codigo_postal: postalCode, zona_horaria: timezone = 'America/Mexico_City', horario, instrucciones, requiere_cita: appointment = false } = req.body || {};
  if (![nombre, calle, ciudad, estado].every((value) => typeof value === 'string' && value.trim())) return fail(res, 400, 'Nombre, calle, ciudad y estado son obligatorios');
  const { rows: [address] } = await query(`INSERT INTO tms.cliente_direcciones
    (cliente_id,nombre,calle,ciudad,estado,pais,codigo_postal,zona_horaria,horario,instrucciones,requiere_cita)
    SELECT id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11 FROM tms.clientes WHERE id=$1 AND activo RETURNING *`,
  [req.params.id, nombre.trim(), calle.trim(), ciudad.trim(), estado.trim(), String(pais).slice(0, 2).toUpperCase(), postalCode || null, timezone, horario || null, instrucciones || null, Boolean(appointment)]);
  if (!address) return fail(res, 404, 'Cliente no encontrado o inactivo');
  res.status(201).json({ success: true, data: address });
}));
router.patch('/addresses/:id', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de dirección inválido');
  const body = req.body || {};
  const textFields = [
    ['nombre', 'nombre', true], ['calle', 'calle', true], ['ciudad', 'ciudad', true], ['estado', 'estado', true],
    ['pais', 'pais', false], ['codigo_postal', 'codigo_postal', false], ['zona_horaria', 'zona_horaria', false],
    ['horario', 'horario', false], ['instrucciones', 'instrucciones', false],
  ];
  const updates = [];
  const values = [];
  const nullableFields = new Set(['codigo_postal', 'horario', 'instrucciones']);
  for (const [column, key, required] of textFields) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = body[key];
    if (value == null && nullableFields.has(key)) {
      values.push(null);
      updates.push(`${column}=$${values.length}`);
      continue;
    }
    if (typeof value !== 'string' || (required && !value.trim())) return fail(res, 400, `${key} debe contener texto${required ? ' y no puede quedar vacío' : ''}`);
    const normalized = value.trim();
    if (key === 'pais' && normalized.length !== 2) return fail(res, 400, 'El país debe usar un código de dos letras');
    values.push(key === 'pais' ? normalized.toUpperCase() : normalized || null);
    updates.push(`${column}=$${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'requiere_cita')) {
    if (typeof body.requiere_cita !== 'boolean') return fail(res, 400, 'requiere_cita debe ser verdadero o falso');
    values.push(body.requiere_cita);
    updates.push(`requiere_cita=$${values.length}`);
  }
  if (!updates.length) return fail(res, 400, 'No se recibieron campos para actualizar');
  values.push(req.params.id);
  const { rows: [address] } = await query(`UPDATE tms.cliente_direcciones SET ${updates.join(', ')}, updated_at=now() WHERE id=$${values.length} RETURNING *`, values);
  if (!address) return fail(res, 404, 'Dirección no encontrada');
  res.json({ success: true, data: address });
}));
router.patch('/addresses/:id/active', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de dirección inválido');
  if (typeof req.body?.activo !== 'boolean') return fail(res, 400, 'El estado activo debe ser verdadero o falso');
  const { rows: [address] } = await query('UPDATE tms.cliente_direcciones SET activo=$2, updated_at=now() WHERE id=$1 RETURNING *', [req.params.id, req.body.activo]);
  if (!address) return fail(res, 404, 'Dirección no encontrada');
  res.json({ success: true, data: address });
}));
router.get('/units', requireTripRead, wrap(async (_req, res) => { const { rows } = await query(`SELECT u.*,p.razon_social AS proveedor FROM tms.unidades u LEFT JOIN tms.proveedores p ON p.id=u.proveedor_id ORDER BY u.numero_economico`); res.json({ success: true, data: rows }); }));
router.get('/operators', requireTripRead, wrap(async (_req, res) => { const { rows } = await query(`SELECT o.*,p.razon_social AS proveedor FROM tms.operadores o LEFT JOIN tms.proveedores p ON p.id=o.proveedor_id ORDER BY o.nombre`); res.json({ success: true, data: rows }); }));
router.get('/providers', requireTripRead, wrap(async (_req, res) => { const { rows } = await query('SELECT * FROM tms.proveedores ORDER BY razon_social'); res.json({ success: true, data: rows }); }));
router.get('/catalogs', requireTripRead, wrap(async (_req, res) => {
  const [services, evidence, costs, extras] = await Promise.all([
    query('SELECT * FROM tms.tipos_servicio WHERE activo ORDER BY nombre'),
    query('SELECT * FROM tms.tipos_evidencia WHERE activo ORDER BY nombre'),
    query('SELECT * FROM tms.tipos_costo WHERE activo ORDER BY nombre'),
    query('SELECT * FROM tms.tipos_extra WHERE activo ORDER BY nombre'),
  ]);
  res.json({ success: true, data: { servicios: services.rows, evidencias: evidence.rows, costos: costs.rows, extras: extras.rows } });
}));

router.get('/trips/:folio/costs', requireCostRead, wrap(async (req, res) => {
  const { rows } = await query(`SELECT c.* FROM tms.viaje_costos c JOIN tms.viajes v ON v.id=c.viaje_id
    WHERE v.folio::text=$1 AND c.anulado_at IS NULL ORDER BY c.created_at DESC`, [req.params.folio]);
  res.json({ success: true, data: rows });
}));
router.post('/trips/:folio/costs', requireFinanceRole, wrap(async (req, res) => {
  const { tipo_costo_id: typeId, descripcion, monto_estimado: estimated, monto_real: actual, moneda = 'MXN', tipo_cambio_a_viaje: fx = 1 } = req.body || {};
  if (!typeId || typeof descripcion !== 'string' || !descripcion.trim() || (estimated == null && actual == null)) return fail(res, 400, 'Tipo, descripción y al menos un monto son requeridos');
  const { rows: [cost] } = await query(`INSERT INTO tms.viaje_costos (viaje_id,tipo_costo_id,descripcion,monto_estimado,monto_real,moneda,tipo_cambio_a_viaje,creado_por)
    SELECT v.id,$2,$3,$4,$5,$6,$7,$8 FROM tms.viajes v WHERE v.folio::text=$1 RETURNING *`, [req.params.folio, typeId, descripcion.trim(), estimated ?? null, actual ?? null, moneda, fx, req.user.id]);
  if (!cost) return fail(res, 404, 'Viaje no encontrado');
  res.status(201).json({ success: true, data: cost });
}));

router.get('/trips/:folio/extras', requireTripRead, wrap(async (req, res) => {
  const { rows } = await query(`SELECT x.* FROM tms.viaje_extras x JOIN tms.viajes v ON v.id=x.viaje_id WHERE v.folio::text=$1 ORDER BY x.created_at DESC`, [req.params.folio]);
  res.json({ success: true, data: rows });
}));
router.post('/trips/:folio/extras', requireTripEdit, wrap(async (req, res) => {
  const { tipo_extra_id: typeId, descripcion, monto, moneda = 'MXN', se_cobra_cliente: billable = false, se_agrega_factura: billOnInvoice = false } = req.body || {};
  if (!typeId || typeof descripcion !== 'string' || !descripcion.trim() || !Number.isFinite(Number(monto)) || Number(monto) < 0) return fail(res, 400, 'Tipo, descripción y monto válido son requeridos');
  const { rows: [extra] } = await query(`INSERT INTO tms.viaje_extras (viaje_id,tipo_extra_id,descripcion,monto,moneda,se_cobra_cliente,se_agrega_factura,creado_por)
    SELECT v.id,$2,$3,$4,$5,$6,$7,$8 FROM tms.viajes v JOIN tms.viaje_comercial c ON c.viaje_id=v.id AND c.moneda=$5 WHERE v.folio::text=$1 RETURNING *`,
  [req.params.folio, typeId, descripcion.trim(), monto, moneda, billable, billOnInvoice, req.user.id]);
  if (!extra) return fail(res, 404, 'Viaje no encontrado o moneda distinta a la pactada');
  res.status(201).json({ success: true, data: extra });
}));
router.patch('/extras/:id/approval', requireExtraApproval, wrap(async (req, res) => {
  const { estado, motivo_revision: reason } = req.body || {};
  if (!['VALIDADO', 'RECHAZADO'].includes(estado)) return fail(res, 400, 'Estado de autorización inválido');
  if (estado === 'RECHAZADO' && (typeof reason !== 'string' || !reason.trim())) return fail(res, 400, 'Indica el motivo del rechazo');
  const { rows: [extra] } = await query(`UPDATE tms.viaje_extras SET estado=$1,revisado_por=$2,revisado_at=now(),motivo_revision=$3
    WHERE id=$4 AND estado='PENDIENTE' RETURNING *`, [estado, req.user.id, estado === 'RECHAZADO' ? reason.trim() : null, req.params.id]);
  if (!extra) return fail(res, 404, 'Extra pendiente no encontrado');
  res.json({ success: true, data: extra });
}));

export default router;
