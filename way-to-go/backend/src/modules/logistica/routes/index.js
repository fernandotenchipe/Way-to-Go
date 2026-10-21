import express from 'express';
import tripRecordRouter from './trip-record.js';
import fleetRouter from './fleet.js';
import multer from 'multer';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pool, { query } from '../../../shared/database/db.js';
import { requireCostRead, requireCreateTrip, requireExtraApproval, requireFinanceRole, requireFleetEdit, requireLogisticsUser, requireTrafficRole, requireTripEdit, requireTripRead } from '../middleware/auth.js';

import { validateAddresses, insertCustomerAddresses } from '../services/customer-addresses.js';

const router = express.Router();
const routeDir = path.dirname(fileURLToPath(import.meta.url));
export const LOGISTICS_UPLOAD_DIR = path.resolve(routeDir, '../../../../uploads/logistica');
mkdirSync(LOGISTICS_UPLOAD_DIR, { recursive: true });

const statuses = new Set(['BORRADOR', 'CONFIRMADO', 'PROGRAMADO', 'EN_CAMINO_A_CARGA', 'LLEGO_A_CARGA', 'EN_CARGA', 'SALIO_CARGADO_EN_RUTA', 'LLEGO_A_DESTINO', 'EN_DESCARGA', 'ENTREGADO', 'CANCELADO']);
const transitions = {
  BORRADOR: ['CONFIRMADO', 'CANCELADO'], CONFIRMADO: ['PROGRAMADO', 'CANCELADO'], PROGRAMADO: ['EN_CAMINO_A_CARGA', 'CANCELADO'],
  EN_CAMINO_A_CARGA: ['LLEGO_A_CARGA', 'CANCELADO'], LLEGO_A_CARGA: ['EN_CARGA', 'CANCELADO'],
  EN_CARGA: ['SALIO_CARGADO_EN_RUTA', 'CANCELADO'], SALIO_CARGADO_EN_RUTA: ['LLEGO_A_DESTINO', 'CANCELADO'],
  LLEGO_A_DESTINO: ['EN_DESCARGA', 'CANCELADO'], EN_DESCARGA: ['ENTREGADO', 'CANCELADO'],
  ENTREGADO: [], CANCELADO: [],
};
const fail = (res, status, error) => res.status(status).json({ success: false, error });
const safeLimit = (value, fallback = 50) => Math.min(Math.max(Number.parseInt(value, 10) || fallback, 1), 100);
const isUuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const normalizeRfc = (value) => typeof value === 'string' ? value.trim().toUpperCase() : '';
const isValidRfc = (value) => !value || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(normalizeRfc(value));
const isValidEmail = (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
const wrap = (handler) => async (req, res) => {
  try { await handler(req, res); }
  catch (error) {
    if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', '57P01'].includes(error.code)
      || /connection terminated due to connection timeout|timeout expired|connection terminated unexpectedly/i.test(error.message || '')) {
      return fail(res, 503, 'La base de datos no responde. Revisa la conexión a Supabase e inténtalo de nuevo.');
    }
    if (error.code === '23505' && error.constraint === 'clientes_rfc_ci') return fail(res, 409, 'Ya existe un cliente registrado con ese RFC');
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
const requireActor = (req, res, next) => isUuid(req.user.id) ? next() : fail(res, 403, 'Inicia sesión con un usuario TMS válido para guardar cambios');
router.use(tripRecordRouter({ pool, wrap, fail, isUuid }));
router.use(fleetRouter({ pool, wrap, fail }));

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
      AND ($3::text IS NULL OR v.folio::text ILIKE $3 OR c.razon_social ILIKE $3 OR v.tipo_carga ILIKE $3
        OR v.origen_snapshot::text ILIKE $3 OR v.destino_snapshot::text ILIKE $3 OR o.nombre ILIKE $3)
    ORDER BY v.created_at DESC LIMIT $4 OFFSET $5`, [estado || null, clientId || null, search, limit, offset]);
  res.json({ success: true, data: rows, pagination: { limit, offset, count: rows.length } });
}));

router.post('/trips', requireCreateTrip, requireActor, wrap(async (req, res) => {
  const body = req.body || {};
  let { cliente_id: clienteId, convenio_id: convenioId, origen_id: originId, destino_id: destinationId,
    tipo_servicio_id: serviceTypeId, tipo_carga: cargoType, unidad_id: unitId, caja_id: boxId,
    operador_id: operatorId, proveedor_id: providerId, cita_carga_at: loadingAt,
    entrega_estimada_at: deliveryAt, reserva_desde: reserveFrom, reserva_hasta: reserveTo,
    flete_base: baseFare, moneda = 'MXN', instrucciones, restricciones_ruta: routeRestrictions } = body;
  const quick = body.cliente_nuevo;
  if (body.estado_operativo != null && body.estado_operativo !== 'CONFIRMADO') return fail(res, 400, 'Estado inicial inválido');
  if (quick) {
    if (clienteId || originId || destinationId || convenioId) return fail(res, 400, 'Elige cliente existente o captura rápida');
    if (typeof quick.razon_social !== 'string' || !quick.razon_social.trim() || quick.razon_social.length > 180) return fail(res, 400, 'Escribe el nombre del cliente (máximo 180 caracteres)');
    const addressError = validateAddresses(quick.direcciones);
    if (addressError || quick.direcciones.length !== 2) return fail(res, 400, addressError || 'Captura origen y destino');
  } else if (![clienteId, originId, destinationId].every(isUuid)) return fail(res, 400, 'Cliente, origen y destino no son válidos');
  if (!isUuid(serviceTypeId)) return fail(res, 400, 'Selecciona un tipo de servicio');
  if (!quick && originId === destinationId) return fail(res, 400, 'Elige ubicaciones diferentes para recoger y entregar');
  if (typeof cargoType !== 'string' || !cargoType.trim()) return fail(res, 400, 'El tipo de carga es requerido');
  if (baseFare != null && (typeof baseFare !== 'number' || !Number.isFinite(baseFare) || baseFare < 0)) return fail(res, 400, 'El flete base debe ser un monto válido');
  if (![loadingAt, deliveryAt, reserveFrom, reserveTo].every((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)))) return fail(res, 400, 'Captura fechas y horas válidas');
  if (Date.parse(reserveFrom) < Date.parse(loadingAt) || Date.parse(deliveryAt) <= Date.parse(reserveFrom) || Date.parse(reserveTo) < Date.parse(deliveryAt)) return fail(res, 400, 'Revisa el orden: recolección, salida y llegada');
  if (!['MXN', 'USD'].includes(moneda)) return fail(res, 400, 'Moneda no admitida');
  for (const value of [convenioId, unitId, boxId, operatorId, providerId]) {
    if (value != null && !isUuid(value)) return fail(res, 400, 'Referencia de recurso no válida');
  }
  const departureAt = body.salida_programada_at || reserveFrom;
  const unloadingAt = body.descarga_programada_at || null;
  if (!Number.isFinite(Date.parse(departureAt)) || Date.parse(departureAt) < Date.parse(loadingAt) || Date.parse(departureAt) >= Date.parse(deliveryAt)) return fail(res, 400, 'La salida debe estar entre la recolección y la llegada');
  if (unloadingAt && (!Number.isFinite(Date.parse(unloadingAt)) || Date.parse(unloadingAt) < Date.parse(deliveryAt) || Date.parse(unloadingAt) > Date.parse(reserveTo))) return fail(res, 400, 'La descarga debe ser posterior a la llegada y estar dentro de la reserva');
  const initialStatus = 'CONFIRMADO';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [schema] } = await client.query(`SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='tms.viajes'::regclass AND conname='viajes_estado_operativo_confirmacion_check') AS ready`);
    if (!schema?.ready) { await client.query('ROLLBACK'); return fail(res, 503, 'El alta confirmada requiere aplicar la migración 20261021_viajes_confirmados.sql. No se guardó el viaje.'); }
    if (quick) {
      // Serializa altas rápidas del mismo nombre; nunca combina clientes en silencio.
      const normalizedName = quick.razon_social.trim().toLowerCase();
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [normalizedName]);
      const { rows: [duplicate] } = await client.query('SELECT id FROM tms.clientes WHERE lower(btrim(razon_social))=$1 LIMIT 1', [normalizedName]);
      if (duplicate) { await client.query('ROLLBACK'); return fail(res, 409, 'Ya existe un cliente con ese nombre. Selecciónalo en Cliente registrado o revisa su ficha.'); }
      const { rows: [customer] } = await client.query('INSERT INTO tms.clientes(razon_social) VALUES ($1) RETURNING id', [quick.razon_social.trim()]);
      clienteId = customer.id;
      const savedAddresses = await insertCustomerAddresses(client, clienteId, quick.direcciones);
      originId = savedAddresses[0].id;
      destinationId = savedAddresses[1].id;
    } else {
      const { rows: [customer] } = await client.query('SELECT id FROM tms.clientes WHERE id=$1 AND activo FOR SHARE', [clienteId]);
      if (!customer) { await client.query('ROLLBACK'); return fail(res, 400, 'El cliente no existe o está inactivo'); }
    }

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
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$20,$13,$14,$15,$16,$17,$18,$19,now())
      RETURNING *`, [clienteId, convenioId || null, originId, destinationId, ...snapshots, serviceTypeId, cargoType.trim(), unitId || null, boxId || null, operatorId || null, providerId || null, loadingAt, deliveryAt, reserveFrom, reserveTo, instrucciones || null, routeRestrictions || null, req.user.id, initialStatus]);

    await client.query(`INSERT INTO tms.viaje_evidencias
      (viaje_id,tipo_evidencia_id,obligatoria_facturar,requiere_validacion,visible_cliente)
      SELECT $1,tipo_evidencia_id,obligatoria_facturar,requiere_validacion,visible_cliente
      FROM tms.servicio_evidencias WHERE tipo_servicio_id=$2`, [trip.id, serviceTypeId]);
    await client.query(`INSERT INTO tms.viaje_comercial (viaje_id,flete_base,moneda,condiciones_snapshot) VALUES ($1,$2,$3,$4)`, [trip.id, baseFare ?? 0, moneda, baseFare == null ? 'Flete pendiente de cotizar; cero provisional en servicio confirmado.' : null]);
    await client.query('INSERT INTO tms.viaje_tiempos(viaje_id,salida_programada_at,descarga_programada_at) VALUES ($1,$2,$3)', [trip.id, departureAt, unloadingAt]);
    await client.query('INSERT INTO tms.viaje_carga(viaje_id,descripcion) VALUES ($1,$2)', [trip.id, body.descripcion_carga || null]);
    await client.query('INSERT INTO tms.viaje_facturacion_operativa(viaje_id) VALUES ($1)', [trip.id]);
    await client.query(`INSERT INTO tms.viaje_eventos
      (viaje_id,tipo,estado_nuevo,ocurrido_at,registrado_por,origen,comentario,idempotency_key)
      VALUES ($1,'CREACION',$4,now(),$2,'INTERNO','Viaje creado desde Logística',$3)`, [trip.id, req.user.id, randomUUID(), initialStatus]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: trip });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));

router.get('/trips/:folio', requireTripRead, wrap(async (req, res) => {
  const { rows: [trip] } = await query(`
    SELECT v.*, v.folio::text AS folio, c.razon_social AS cliente, ts.nombre AS tipo_servicio,
      vt.salida_programada_at, vt.descarga_programada_at, u.numero_economico AS unidad, b.numero_caja AS caja, o.nombre AS operador,
      p.razon_social AS proveedor, vc.flete_base, vc.moneda,
      vf.estado AS estado_facturacion, prep.listo AS listo_para_facturar, prep.subtotal_sin_impuestos
    FROM tms.viajes v JOIN tms.clientes c ON c.id=v.cliente_id
    LEFT JOIN tms.tipos_servicio ts ON ts.id=v.tipo_servicio_id
    LEFT JOIN tms.unidades u ON u.id=v.unidad_id LEFT JOIN tms.cajas b ON b.id=v.caja_id
    LEFT JOIN tms.operadores o ON o.id=v.operador_id LEFT JOIN tms.proveedores p ON p.id=v.proveedor_id
    LEFT JOIN tms.viaje_tiempos vt ON vt.viaje_id=v.id
    LEFT JOIN tms.viaje_comercial vc ON vc.viaje_id=v.id
    LEFT JOIN tms.viaje_facturacion_operativa vf ON vf.viaje_id=v.id
    LEFT JOIN tms.v_listo_facturar prep ON prep.viaje_id=v.id WHERE v.folio::text=$1`, [req.params.folio]);
  if (!trip) return fail(res, 404, 'Viaje no encontrado');
  if (!req.user.permissions.includes('costos.ver')) {
    delete trip.flete_base; delete trip.moneda; delete trip.subtotal_sin_impuestos;
  }
  res.json({ success: true, data: trip });
}));

router.patch('/trips/:folio/status', requireTrafficRole, requireActor, wrap(async (req, res) => {
  const { estado, comentario, motivo_cancelacion: cancelReason } = req.body || {};
  if (!statuses.has(estado)) return fail(res, 400, 'Estado operativo inválido');
  const occurredAt = req.body.ocurrido_at || new Date().toISOString();
  if (typeof occurredAt !== 'string' || !Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt) > Date.now() + 60000) return fail(res, 400, 'La fecha del avance debe ser válida y no estar en el futuro');
  if (comentario != null && (typeof comentario !== 'string' || comentario.length > 2000)) return fail(res, 400, 'Observación no válida');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [trip] } = await client.query('SELECT * FROM tms.viajes WHERE folio::text=$1 FOR UPDATE', [req.params.folio]);
    if (!trip) { await client.query('ROLLBACK'); return fail(res, 404, 'Viaje no encontrado'); }
    if (!transitions[trip.estado_operativo]?.includes(estado)) { await client.query('ROLLBACK'); return fail(res, 409, `No se permite cambiar de ${trip.estado_operativo} a ${estado}`); }
    if (estado === 'PROGRAMADO' && !trip.proveedor_id && !(trip.unidad_id && trip.operador_id)) { await client.query('ROLLBACK'); return fail(res, 400, 'Asigna un proveedor o una unidad y operador antes de programar'); }
    if (estado === 'CANCELADO' && (typeof cancelReason !== 'string' || !cancelReason.trim())) { await client.query('ROLLBACK'); return fail(res, 400, 'Indica el motivo de cancelación'); }

    const { rows: [last] } = await client.query(`SELECT max(ocurrido_at) AS fecha FROM tms.viaje_eventos WHERE viaje_id=$1 AND tipo IN ('CREACION','ESTATUS')`, [trip.id]);
    if (last?.fecha && Date.parse(occurredAt) < new Date(last.fecha).getTime()) { await client.query('ROLLBACK'); return fail(res, 400, 'El avance no puede ser anterior al último evento operativo'); }
    const { rows: [updated] } = await client.query(`UPDATE tms.viajes SET estado_operativo=$1,
      cancelado_at=CASE WHEN $1='CANCELADO' THEN now() ELSE cancelado_at END,
      motivo_cancelacion=CASE WHEN $1='CANCELADO' THEN $2 ELSE motivo_cancelacion END,
      ultima_actualizacion_operativa_at=now() WHERE id=$3 RETURNING *`, [estado, cancelReason || null, trip.id]);
    const timeColumn = { LLEGO_A_CARGA: 'llegada_carga_at', EN_CARGA: 'inicio_carga_at', SALIO_CARGADO_EN_RUTA: 'salida_cargado_at', LLEGO_A_DESTINO: 'llegada_destino_at', EN_DESCARGA: 'inicio_descarga_at', ENTREGADO: 'fin_descarga_at' }[estado];
    if (timeColumn) await client.query(`UPDATE tms.viaje_tiempos SET ${timeColumn}=$2 WHERE viaje_id=$1`, [trip.id, occurredAt]);
    if (estado === 'ENTREGADO') await client.query('UPDATE tms.viaje_tiempos SET entregado_at=$2 WHERE viaje_id=$1', [trip.id, occurredAt]);
    await client.query(`INSERT INTO tms.viaje_eventos
      (viaje_id,tipo,estado_anterior,estado_nuevo,ocurrido_at,registrado_por,origen,comentario,idempotency_key)
      VALUES ($1,$2,$3,$4,$8,$5,'INTERNO',$6,$7)`, [trip.id, estado === 'CANCELADO' ? 'CANCELACION' : 'ESTATUS', trip.estado_operativo, estado, req.user.id, comentario || cancelReason || null, randomUUID(), occurredAt]);
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
    jsonb_agg(jsonb_build_object('entrega_id',d.id,'archivo_id',a.id,'nombre',a.nombre_original,'mime_type',a.mime_type,'estado',d.estado,'created_at',d.created_at,'subida_por_nombre',(SELECT nombre FROM tms.usuarios WHERE id=d.subida_por))) FILTER (WHERE d.id IS NOT NULL) AS entregas
    FROM tms.viaje_evidencias e JOIN tms.viajes v ON v.id=e.viaje_id
    JOIN tms.tipos_evidencia t ON t.id=e.tipo_evidencia_id JOIN tms.v_evidencias_estado estado ON estado.id=e.id
    LEFT JOIN tms.evidencia_entregas d ON d.evidencia_id=e.id LEFT JOIN tms.archivos a ON a.id=d.archivo_id
    WHERE v.folio::text=$1 GROUP BY e.id,t.codigo,t.nombre,estado.estado ORDER BY t.nombre`, [req.params.folio]);
  res.json({ success: true, data: rows });
}));

router.post('/trips/:folio/evidence', requireTripEdit, requireActor, (req, res, next) => upload.single('file')(req, res, (error) => error ? fail(res, error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.message) : next()), wrap(async (req, res) => {
  if (!req.file) return fail(res, 400, 'Selecciona un archivo');
  const { tipo_evidencia_id: evidenceTypeId, observacion = '' } = req.body || {};
  if (!isUuid(evidenceTypeId) || typeof observacion !== 'string' || observacion.length > 2000) { await unlink(req.file.path).catch(() => {}); return fail(res, 400, 'Revisa el tipo de evidencia y la observación'); }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows: [trip] } = await client.query('SELECT id FROM tms.viajes WHERE folio::text=$1 FOR UPDATE', [req.params.folio]);
    const { rows: [type] } = await client.query('SELECT id FROM tms.tipos_evidencia WHERE id=$1 AND activo', [evidenceTypeId]);
    if (!trip || !type) { await client.query('ROLLBACK'); await unlink(req.file.path); return fail(res, 404, 'Viaje o tipo de evidencia no disponible'); }
    await client.query('INSERT INTO tms.viaje_evidencias(viaje_id,tipo_evidencia_id) VALUES ($1,$2) ON CONFLICT(viaje_id,tipo_evidencia_id) DO NOTHING', [trip.id, evidenceTypeId]);
    const { rows: [evidence] } = await client.query(`SELECT e.id FROM tms.viaje_evidencias e
      JOIN tms.viajes v ON v.id=e.viaje_id WHERE v.folio::text=$1 AND e.tipo_evidencia_id=$2 FOR UPDATE`, [req.params.folio, evidenceTypeId]);
    if (!evidence) { await client.query('ROLLBACK'); await unlink(req.file.path); return fail(res, 404, 'No existe ese requisito de evidencia para el viaje'); }
    const storagePath = path.basename(req.file.filename);
    const { rows: [file] } = await client.query(`INSERT INTO tms.archivos
      (bucket,storage_path,nombre_original,mime_type,size_bytes,estado,subido_por)
      VALUES ('logistica',$1,$2,$3,$4,'DISPONIBLE',$5) RETURNING id`, [storagePath, path.basename(req.file.originalname), req.file.mimetype, req.file.size, req.user.id]);
    const { rows: [delivery] } = await client.query(`INSERT INTO tms.evidencia_entregas
      (evidencia_id,archivo_id,subida_por) VALUES ($1,$2,$3) RETURNING *`, [evidence.id, file.id, req.user.id]);
    await client.query(`INSERT INTO tms.viaje_eventos(viaje_id,tipo,ocurrido_at,registrado_por,origen,comentario,archivo_id,idempotency_key) VALUES ($1,'COMENTARIO',now(),$2,'INTERNO',$3,$4,$5)`, [trip.id, req.user.id, 'Evidencia adjunta: ' + req.file.originalname + (observacion ? '. ' + observacion : ''), file.id, randomUUID()]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...delivery, archivo_id: file.id } });
  } catch (error) { if (client) await client.query('ROLLBACK'); if (req.file) await unlink(req.file.path).catch(() => {}); throw error; }
  finally { client?.release(); }
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
       WHERE x.cliente_id=c.id AND x.activo ORDER BY x.principal DESC,x.nombre LIMIT 1) AS address_preview
    FROM tms.clientes c LEFT JOIN tms.cliente_direcciones d ON d.cliente_id=c.id AND d.activo
    WHERE ($1::text IS NULL OR c.razon_social ILIKE $1 OR c.nombre_comercial ILIKE $1 OR c.rfc ILIKE $1
      OR EXISTS (SELECT 1 FROM tms.cliente_direcciones x WHERE x.cliente_id=c.id AND x.activo AND (x.nombre ILIKE $1 OR x.ciudad ILIKE $1 OR x.estado ILIKE $1)))
    GROUP BY c.id ORDER BY c.razon_social`, [search]);
  res.json({ success: true, data: rows });
}));
router.post('/customers', requireTripEdit, wrap(async (req, res) => {
  const { razon_social: legalName, nombre_comercial: tradeName, rfc, uso_cfdi: cfdiUse,
    forma_pago: paymentForm, metodo_pago: paymentMethod, condiciones_pago: paymentTerms,
    domicilio_legal_calle: legalStreet, domicilio_legal_ciudad: legalCity, domicilio_legal_estado: legalState,
    domicilio_legal_pais: legalCountry, domicilio_legal_codigo_postal: legalPostalCode,
    canal_registro: registrationChannel, motivo_registro: registrationReason,
    servicios_acordados: agreedServices = [], regimen_fiscal: taxRegime, contactos = [], contacto, direccion } = req.body || {};
  if (typeof legalName !== 'string' || !legalName.trim()) return fail(res, 400, 'La razón social es obligatoria');
  const optionalTextFields = [tradeName, cfdiUse, paymentForm, paymentMethod, paymentTerms, legalStreet, legalCity, legalState, legalPostalCode, registrationChannel, registrationReason, taxRegime];
  if (optionalTextFields.some((value) => value != null && typeof value !== 'string')) return fail(res, 400, 'Los datos del cliente deben ser texto');
  if (rfc != null && (typeof rfc !== 'string' || !isValidRfc(rfc))) return fail(res, 400, 'El RFC debe tener formato válido de persona moral (12 caracteres) o física (13 caracteres)');
  if (legalCountry != null && (typeof legalCountry !== 'string' || legalCountry.trim().length !== 2)) return fail(res, 400, 'El país del domicilio legal debe usar un código de dos letras');
  const normalizedRfc = normalizeRfc(rfc);
  if (normalizedRfc) {
    const { rows: [duplicate] } = await query(`SELECT id FROM tms.clientes WHERE upper(btrim(rfc))=$1 LIMIT 1`, [normalizedRfc]);
    if (duplicate) return fail(res, 409, 'Ya existe un cliente registrado con ese RFC');
  }
  if (contactos != null && !Array.isArray(contactos)) return fail(res, 400, 'Los contactos deben enviarse como una lista');
  if (!Array.isArray(agreedServices) || agreedServices.some((service) => typeof service !== 'string')) return fail(res, 400, 'Los servicios acordados deben ser una lista de texto');
  const contactsToSave = contactos.length ? contactos : (contacto?.nombre ? [{ ...contacto, principal: true }] : []);
  for (const item of contactsToSave) {
    if (!item || typeof item.nombre !== 'string' || !item.nombre.trim()) return fail(res, 400, 'Cada contacto requiere nombre');
    if (item.email != null && (typeof item.email !== 'string' || !isValidEmail(item.email))) return fail(res, 400, 'El correo de un contacto no tiene un formato válido');
    if (item.principal != null && typeof item.principal !== 'boolean') return fail(res, 400, 'principal debe ser verdadero o falso');
  }
  if (contactsToSave.filter((item) => item.principal).length > 1 || contactsToSave.filter((item) => item.para_facturacion).length > 1) return fail(res, 400, 'Solo puede elegirse un contacto principal y uno de facturación');
  const addressesToSave = req.body.direcciones ?? (direccion ? [direccion] : []);
  const addressError = validateAddresses(addressesToSave);
  if (addressError) return fail(res, 400, addressError);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [customer] } = await client.query(`INSERT INTO tms.clientes
      (razon_social,nombre_comercial,rfc,uso_cfdi,forma_pago,metodo_pago,condiciones_pago,domicilio_legal_calle,
       domicilio_legal_ciudad,domicilio_legal_estado,domicilio_legal_pais,domicilio_legal_codigo_postal,canal_registro,motivo_registro,servicios_acordados,regimen_fiscal)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, [legalName.trim(), typeof tradeName === 'string' && tradeName.trim() ? tradeName.trim() : null,
      normalizedRfc || null, cfdiUse?.trim() || null, paymentForm?.trim() || null, paymentMethod?.trim() || null, paymentTerms?.trim() || null,
      legalStreet?.trim() || null, legalCity?.trim() || null, legalState?.trim() || null, legalCountry ? String(legalCountry).slice(0, 2).toUpperCase() : null,
      legalPostalCode?.trim() || null, registrationChannel?.trim() || null, registrationReason?.trim() || null,
      [...new Set(agreedServices.map((service) => service.trim()).filter(Boolean))], taxRegime?.trim() || null]);

    const savedContacts = [];
    let billingContactId = null;
    for (const item of contactsToSave) {
      const { rows: [savedContact] } = await client.query(`INSERT INTO tms.cliente_contactos
        (cliente_id,nombre,puesto,email,telefono,tipo_contacto,principal)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,cliente_id,nombre,puesto,email,telefono,tipo_contacto,principal,activo`,
      [customer.id, item.nombre.trim(), item.puesto?.trim() || null, item.email?.trim().toLowerCase() || null,
        item.telefono?.trim() || null, item.tipo_contacto?.trim() || 'OPERACIONES', Boolean(item.principal)]);
      savedContacts.push(savedContact);
      if (item.para_facturacion) billingContactId = savedContact.id;
    }

    const savedAddresses = await insertCustomerAddresses(client, customer.id, addressesToSave, savedContacts.find((item) => item.principal)?.id || null);
    const address = savedAddresses.find((item) => item.principal) || null;

    if (billingContactId) await client.query('UPDATE tms.clientes SET contacto_facturacion_id=$2 WHERE id=$1', [customer.id, billingContactId]);

    await client.query('COMMIT');
    res.status(201).json({ success: true, data: { ...customer, direcciones_activas: savedAddresses.length,
      contacto_facturacion_id: billingContactId, address_preview: address ? `${address.ciudad}, ${address.estado}` : null,
      contactos: savedContacts, direcciones: savedAddresses, convenios: [] } });
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
    ['domicilio_legal_calle', 'domicilio_legal_calle'], ['domicilio_legal_ciudad', 'domicilio_legal_ciudad'],
    ['domicilio_legal_estado', 'domicilio_legal_estado'], ['domicilio_legal_pais', 'domicilio_legal_pais'],
    ['domicilio_legal_codigo_postal', 'domicilio_legal_codigo_postal'], ['canal_registro', 'canal_registro'],
    ['motivo_registro', 'motivo_registro'], ['regimen_fiscal', 'regimen_fiscal'], ['contacto_facturacion_id', 'contacto_facturacion_id'],
  ];
  const updates = [];
  const values = [];
  for (const [column, key] of fields) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = body[key];
    if (key === 'razon_social' && (typeof value !== 'string' || !value.trim())) return fail(res, 400, 'La razón social es obligatoria');
    if (value != null && typeof value !== 'string') return fail(res, 400, `El campo ${key} debe ser texto`);
    if (key === 'rfc' && value != null && !isValidRfc(value)) return fail(res, 400, 'El RFC debe tener formato válido de persona moral (12 caracteres) o física (13 caracteres)');
    if (key === 'contacto_facturacion_id' && value != null && !isUuid(value)) return fail(res, 400, 'El contacto de facturación seleccionado no es válido');
    values.push(key === 'razon_social' ? value.trim() : key === 'rfc' ? normalizeRfc(value) || null : key === 'domicilio_legal_pais' ? value?.trim().toUpperCase() || null : value?.trim() || null);
    updates.push(`${column}=$${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'servicios_acordados')) {
    if (!Array.isArray(body.servicios_acordados) || body.servicios_acordados.some((item) => typeof item !== 'string')) return fail(res, 400, 'Los servicios acordados deben ser una lista de texto');
    values.push([...new Set(body.servicios_acordados.map((item) => item.trim()).filter(Boolean))]);
    updates.push(`servicios_acordados=$${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'contacto')) return fail(res, 400, 'Administra los contactos desde la sección de contactos para conservar el historial');
  if (!updates.length) return fail(res, 400, 'No se recibieron campos para actualizar');

  const rfcPosition = fields.findIndex(([, key]) => key === 'rfc');
  if (rfcPosition >= 0 && Object.prototype.hasOwnProperty.call(body, 'rfc') && normalizeRfc(body.rfc)) {
    const { rows: [duplicate] } = await query(`SELECT id FROM tms.clientes WHERE id<>$1 AND upper(btrim(rfc))=$2 LIMIT 1`, [req.params.id, normalizeRfc(body.rfc)]);
    if (duplicate) return fail(res, 409, 'Ya existe otro cliente registrado con ese RFC');
  }

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
    if (Object.prototype.hasOwnProperty.call(body, 'contacto_facturacion_id') && body.contacto_facturacion_id) {
      const { rows: [billingContact] } = await client.query('SELECT id FROM tms.cliente_contactos WHERE id=$1 AND cliente_id=$2 AND activo', [body.contacto_facturacion_id, req.params.id]);
      if (!billingContact) { await client.query('ROLLBACK'); return fail(res, 400, 'El contacto de facturación debe pertenecer al cliente y estar activo'); }
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
router.post('/customers/:id/contacts', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de cliente inválido');
  const { nombre, puesto, email, telefono, tipo_contacto: contactType = 'OPERACIONES', principal = false, para_facturacion: billing = false } = req.body || {};
  if (typeof nombre !== 'string' || !nombre.trim()) return fail(res, 400, 'El nombre del contacto es obligatorio');
  if (email != null && (typeof email !== 'string' || !isValidEmail(email))) return fail(res, 400, 'El correo del contacto no tiene un formato válido');
  if (typeof principal !== 'boolean' || typeof billing !== 'boolean') return fail(res, 400, 'Las selecciones del contacto deben ser verdaderas o falsas');
  if ([puesto, telefono, contactType].some((value) => value != null && typeof value !== 'string')) return fail(res, 400, 'Los datos del contacto deben ser texto');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [customer] } = await client.query('SELECT id FROM tms.clientes WHERE id=$1 AND activo FOR UPDATE', [req.params.id]);
    if (!customer) { await client.query('ROLLBACK'); return fail(res, 404, 'Cliente no encontrado o inactivo'); }
    if (principal) await client.query('UPDATE tms.cliente_contactos SET principal=false WHERE cliente_id=$1 AND principal', [req.params.id]);
    const { rows: [contact] } = await client.query(`INSERT INTO tms.cliente_contactos
      (cliente_id,nombre,puesto,email,telefono,tipo_contacto,principal)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,cliente_id,nombre,puesto,email,telefono,tipo_contacto,principal,activo`,
    [req.params.id, nombre.trim(), puesto?.trim() || null, email?.trim().toLowerCase() || null, telefono?.trim() || null, contactType.trim(), principal]);
    if (billing) await client.query('UPDATE tms.clientes SET contacto_facturacion_id=$2 WHERE id=$1', [req.params.id, contact.id]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: contact });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));
router.patch('/contacts/:id', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de contacto inválido');
  const body = req.body || {};
  const columns = { nombre: 'nombre', puesto: 'puesto', email: 'email', telefono: 'telefono', tipo_contacto: 'tipo_contacto' };
  const values = [];
  const updates = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = body[key];
    if (key === 'nombre' && (typeof value !== 'string' || !value.trim())) return fail(res, 400, 'El nombre del contacto es obligatorio');
    if (value != null && typeof value !== 'string') return fail(res, 400, `El campo ${key} debe ser texto`);
    if (key === 'email' && value != null && !isValidEmail(value)) return fail(res, 400, 'El correo del contacto no tiene un formato válido');
    values.push(key === 'email' ? value?.trim().toLowerCase() || null : value?.trim() || null);
    updates.push(`${column}=$${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'principal') && typeof body.principal !== 'boolean') return fail(res, 400, 'principal debe ser verdadero o falso');
  if (Object.prototype.hasOwnProperty.call(body, 'para_facturacion') && typeof body.para_facturacion !== 'boolean') return fail(res, 400, 'para_facturacion debe ser verdadero o falso');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [contact] } = await client.query('SELECT * FROM tms.cliente_contactos WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!contact) { await client.query('ROLLBACK'); return fail(res, 404, 'Contacto no encontrado'); }
    await client.query('SELECT id FROM tms.clientes WHERE id=$1 FOR UPDATE', [contact.cliente_id]);
    if (body.principal === true && !contact.activo) { await client.query('ROLLBACK'); return fail(res, 400, 'Reactiva el contacto antes de marcarlo como principal'); }
    if (body.principal === true) await client.query('UPDATE tms.cliente_contactos SET principal=false WHERE cliente_id=$1 AND id<>$2', [contact.cliente_id, contact.id]);
    if (body.principal != null) { values.push(body.principal); updates.push(`principal=$${values.length}`); }
    if (updates.length) {
      values.push(contact.id);
      await client.query(`UPDATE tms.cliente_contactos SET ${updates.join(', ')},updated_at=now() WHERE id=$${values.length}`, values);
    }
    if (body.para_facturacion === true) await client.query('UPDATE tms.clientes SET contacto_facturacion_id=$2,updated_at=now() WHERE id=$1', [contact.cliente_id, contact.id]);
    else if (body.para_facturacion === false) await client.query('UPDATE tms.clientes SET contacto_facturacion_id=NULL,updated_at=now() WHERE id=$1 AND contacto_facturacion_id=$2', [contact.cliente_id, contact.id]);
    const { rows: [updated] } = await client.query('SELECT id,cliente_id,nombre,puesto,email,telefono,tipo_contacto,principal,activo FROM tms.cliente_contactos WHERE id=$1', [contact.id]);
    await client.query('COMMIT');
    res.json({ success: true, data: updated });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));
router.patch('/contacts/:id/active', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de contacto inválido');
  if (typeof req.body?.activo !== 'boolean') return fail(res, 400, 'El estado activo debe ser verdadero o falso');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [contact] } = await client.query('SELECT * FROM tms.cliente_contactos WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!contact) { await client.query('ROLLBACK'); return fail(res, 404, 'Contacto no encontrado'); }
    await client.query('SELECT id FROM tms.clientes WHERE id=$1 FOR UPDATE', [contact.cliente_id]);
    await client.query('UPDATE tms.cliente_contactos SET activo=$2,principal=CASE WHEN $2 THEN principal ELSE false END,updated_at=now() WHERE id=$1', [contact.id, req.body.activo]);
    if (contact.principal && !req.body.activo) {
      const { rows: [replacement] } = await client.query('SELECT id FROM tms.cliente_contactos WHERE cliente_id=$1 AND activo ORDER BY nombre LIMIT 1', [contact.cliente_id]);
      if (replacement) await client.query('UPDATE tms.cliente_contactos SET principal=true WHERE id=$1', [replacement.id]);
    } else if (req.body.activo) {
      const { rows: [currentPrimary] } = await client.query('SELECT id FROM tms.cliente_contactos WHERE cliente_id=$1 AND activo AND principal LIMIT 1', [contact.cliente_id]);
      if (!currentPrimary) await client.query('UPDATE tms.cliente_contactos SET principal=true WHERE id=$1', [contact.id]);
    }
    if (!req.body.activo) await client.query('UPDATE tms.clientes SET contacto_facturacion_id=NULL WHERE id=$1 AND contacto_facturacion_id=$2', [contact.cliente_id, contact.id]);
    const { rows: [updated] } = await client.query('SELECT id,cliente_id,nombre,puesto,email,telefono,tipo_contacto,principal,activo FROM tms.cliente_contactos WHERE id=$1', [contact.id]);
    await client.query('COMMIT');
    res.json({ success: true, data: updated });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));
router.get('/customers/:id', requireTripRead, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de cliente inválido');
  const { rows: [customer] } = await query(`SELECT * FROM tms.clientes WHERE id=$1`, [req.params.id]);
  if (!customer) return fail(res, 404, 'Cliente no encontrado');
  const [addresses, contacts] = await Promise.all([
    query(`SELECT * FROM tms.cliente_direcciones WHERE cliente_id=$1 ORDER BY principal DESC,activo DESC,nombre`, [req.params.id]),
    query(`SELECT id,cliente_id,nombre,puesto,email,telefono,tipo_contacto,principal,activo FROM tms.cliente_contactos WHERE cliente_id=$1 ORDER BY principal DESC,activo DESC,nombre`, [req.params.id]),
  ]);
  const { rows: agreements } = await query(`SELECT a.*,s.nombre AS tipo_servicio FROM tms.cliente_convenios a
    LEFT JOIN tms.tipos_servicio s ON s.id=a.tipo_servicio_id WHERE a.cliente_id=$1 ORDER BY a.activo DESC,a.vigente_desde DESC,a.nombre`, [req.params.id]);
  res.json({ success: true, data: { ...customer, direcciones: addresses.rows, contactos: contacts.rows, convenios: agreements } });
}));
router.post('/customers/:id/agreements', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de cliente inválido');
  const { nombre, origen_id: originId, destino_id: destinationId, tipo_servicio_id: serviceTypeId, tipo_unidad: unitType,
    tipo_carga: cargoType, tarifa_base: baseRate, moneda = 'MXN', horas_libres_carga: loadingFreeHours,
    horas_libres_descarga: unloadingFreeHours, tarifa_estadia_hora: waitingFee, vigente_desde: validFrom,
    vigente_hasta: validUntil, condiciones } = req.body || {};
  if (typeof nombre !== 'string' || !nombre.trim() || !Number.isFinite(Number(baseRate)) || Number(baseRate) < 0 || typeof validFrom !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) return fail(res, 400, 'Nombre, tarifa válida y fecha de inicio son obligatorios');
  if (!['MXN', 'USD'].includes(moneda)) return fail(res, 400, 'La moneda debe ser MXN o USD');
  const optionalAmounts = [loadingFreeHours, unloadingFreeHours, waitingFee];
  if (optionalAmounts.some((value) => value != null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))) return fail(res, 400, 'Las horas y tarifas opcionales deben ser números iguales o mayores a cero');
  if (validUntil && validUntil < validFrom) return fail(res, 400, 'La fecha final no puede ser anterior a la fecha inicial');
  if ((originId && !isUuid(originId)) || (destinationId && !isUuid(destinationId)) || (serviceTypeId && !isUuid(serviceTypeId))) return fail(res, 400, 'La ubicación o tipo de servicio no es válido');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [customer] } = await client.query('SELECT id FROM tms.clientes WHERE id=$1 AND activo FOR UPDATE', [req.params.id]);
    if (!customer) { await client.query('ROLLBACK'); return fail(res, 404, 'Cliente no encontrado o inactivo'); }
    const addressIds = [originId, destinationId].filter(Boolean);
    if (addressIds.length) {
      const { rows } = await client.query('SELECT id FROM tms.cliente_direcciones WHERE id=ANY($1::uuid[]) AND cliente_id=$2 AND activo', [addressIds, req.params.id]);
      if (rows.length !== new Set(addressIds).size) { await client.query('ROLLBACK'); return fail(res, 400, 'Las ubicaciones deben pertenecer al cliente y estar activas'); }
    }
    const { rows: [agreement] } = await client.query(`INSERT INTO tms.cliente_convenios
      (cliente_id,nombre,origen_id,destino_id,tipo_servicio_id,tipo_unidad,tipo_carga,tarifa_base,moneda,horas_libres_carga,horas_libres_descarga,tarifa_estadia_hora,vigente_desde,vigente_hasta,condiciones)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [req.params.id, nombre.trim(), originId || null, destinationId || null, serviceTypeId || null, unitType?.trim() || null, cargoType?.trim() || null,
      Number(baseRate), moneda, loadingFreeHours == null || loadingFreeHours === '' ? null : Number(loadingFreeHours),
      unloadingFreeHours == null || unloadingFreeHours === '' ? null : Number(unloadingFreeHours), waitingFee == null || waitingFee === '' ? null : Number(waitingFee),
      validFrom, validUntil || null, condiciones?.trim() || null]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: agreement });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));
router.patch('/agreements/:id', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de convenio inválido');
  const body = req.body || {};
  const columns = { nombre: 'nombre', origen_id: 'origen_id', destino_id: 'destino_id', tipo_servicio_id: 'tipo_servicio_id', tipo_unidad: 'tipo_unidad', tipo_carga: 'tipo_carga', tarifa_base: 'tarifa_base', moneda: 'moneda', horas_libres_carga: 'horas_libres_carga', horas_libres_descarga: 'horas_libres_descarga', tarifa_estadia_hora: 'tarifa_estadia_hora', vigente_desde: 'vigente_desde', vigente_hasta: 'vigente_hasta', condiciones: 'condiciones' };
  const values = [];
  const updates = [];
  for (const [key, column] of Object.entries(columns)) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const value = body[key];
    if (['origen_id', 'destino_id', 'tipo_servicio_id'].includes(key) && value != null && !isUuid(value)) return fail(res, 400, `${key} no es válido`);
    if (key === 'nombre' && (typeof value !== 'string' || !value.trim())) return fail(res, 400, 'El nombre del convenio es obligatorio');
    if (key === 'tarifa_base' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return fail(res, 400, 'La tarifa debe ser un número igual o mayor a cero');
    if (['horas_libres_carga', 'horas_libres_descarga', 'tarifa_estadia_hora'].includes(key) && value != null && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) return fail(res, 400, 'Las horas y tarifas deben ser números iguales o mayores a cero');
    if (key === 'moneda' && !['MXN', 'USD'].includes(value)) return fail(res, 400, 'La moneda debe ser MXN o USD');
    values.push(['tarifa_base', 'horas_libres_carga', 'horas_libres_descarga', 'tarifa_estadia_hora'].includes(key) && value != null ? Number(value) : value === '' ? null : value);
    updates.push(`${column}=$${values.length}`);
  }
  if (!updates.length) return fail(res, 400, 'No se recibieron campos para actualizar');
  const { rows: [agreement] } = await query(`UPDATE tms.cliente_convenios SET ${updates.join(',')},updated_at=now() WHERE id=$${values.length + 1} RETURNING *`, [...values, req.params.id]);
  if (!agreement) return fail(res, 404, 'Convenio no encontrado');
  res.json({ success: true, data: agreement });
}));
router.patch('/agreements/:id/active', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de convenio inválido');
  if (typeof req.body?.activo !== 'boolean') return fail(res, 400, 'El estado activo debe ser verdadero o falso');
  const { rows: [agreement] } = await query('UPDATE tms.cliente_convenios SET activo=$2,updated_at=now() WHERE id=$1 RETURNING *', [req.params.id, req.body.activo]);
  if (!agreement) return fail(res, 404, 'Convenio no encontrado');
  res.json({ success: true, data: agreement });
}));
router.post('/customers/:id/addresses', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de cliente inválido');
  const { nombre, calle, ciudad, estado, pais = 'MX', codigo_postal: postalCode, zona_horaria: timezone = 'America/Mexico_City', horario, instrucciones, requiere_cita: appointment = false, principal: requestPrimary, tipo_ubicacion: locationType, tipo_zona: zoneType } = req.body || {};
  if (![nombre, calle, ciudad, estado].every((value) => typeof value === 'string' && value.trim())) return fail(res, 400, 'Nombre, calle, ciudad y estado son obligatorios');
  if (requestPrimary != null && typeof requestPrimary !== 'boolean') return fail(res, 400, 'principal debe ser verdadero o falso');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [customer] } = await client.query('SELECT id FROM tms.clientes WHERE id=$1 AND activo FOR UPDATE', [req.params.id]);
    if (!customer) { await client.query('ROLLBACK'); return fail(res, 404, 'Cliente no encontrado o inactivo'); }
    const { rows: [currentPrimary] } = await client.query('SELECT id FROM tms.cliente_direcciones WHERE cliente_id=$1 AND activo AND principal LIMIT 1', [req.params.id]);
    const primary = requestPrimary === true || !currentPrimary;
    if (primary) await client.query('UPDATE tms.cliente_direcciones SET principal=false WHERE cliente_id=$1 AND principal', [req.params.id]);
    const { rows: [address] } = await client.query(`INSERT INTO tms.cliente_direcciones
      (cliente_id,nombre,calle,ciudad,estado,pais,codigo_postal,zona_horaria,horario,instrucciones,requiere_cita,principal,tipo_ubicacion,tipo_zona)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [req.params.id, nombre.trim(), calle.trim(), ciudad.trim(), estado.trim(), String(pais).slice(0, 2).toUpperCase(), postalCode || null, timezone, horario || null, instrucciones || null, Boolean(appointment), primary,
      typeof locationType === 'string' ? locationType.trim() || null : null, typeof zoneType === 'string' ? zoneType.trim() || null : null]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: address });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));
router.patch('/addresses/:id', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de dirección inválido');
  const body = req.body || {};
  const textFields = [
    ['nombre', 'nombre', true], ['calle', 'calle', true], ['ciudad', 'ciudad', true], ['estado', 'estado', true],
    ['pais', 'pais', false], ['codigo_postal', 'codigo_postal', false], ['zona_horaria', 'zona_horaria', false],
    ['horario', 'horario', false], ['instrucciones', 'instrucciones', false], ['tipo_ubicacion', 'tipo_ubicacion', false], ['tipo_zona', 'tipo_zona', false],
  ];
  const updates = [];
  const values = [];
  const nullableFields = new Set(['codigo_postal', 'horario', 'instrucciones', 'tipo_ubicacion', 'tipo_zona']);
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
  if (Object.prototype.hasOwnProperty.call(body, 'principal')) {
    if (typeof body.principal !== 'boolean') return fail(res, 400, 'principal debe ser verdadero o falso');
    values.push(body.principal);
    updates.push(`principal=$${values.length}`);
  }
  if (!updates.length) return fail(res, 400, 'No se recibieron campos para actualizar');
  values.push(req.params.id);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [owner] } = await client.query('SELECT cliente_id FROM tms.cliente_direcciones WHERE id=$1', [req.params.id]);
    if (!owner) { await client.query('ROLLBACK'); return fail(res, 404, 'Dirección no encontrada'); }
    await client.query('SELECT id FROM tms.clientes WHERE id=$1 FOR UPDATE', [owner.cliente_id]);
    const { rows: [current] } = await client.query('SELECT cliente_id,activo,principal FROM tms.cliente_direcciones WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (body.principal === true) {
      if (!current.activo) { await client.query('ROLLBACK'); return fail(res, 400, 'Reactiva la dirección antes de marcarla como principal'); }
      await client.query('UPDATE tms.cliente_direcciones SET principal=false WHERE cliente_id=$1 AND id<>$2 AND principal', [current.cliente_id, req.params.id]);
    }
    let { rows: [address] } = await client.query(`UPDATE tms.cliente_direcciones SET ${updates.join(', ')}, updated_at=now() WHERE id=$${values.length} RETURNING *`, values);
    if (body.principal === false && current.principal && current.activo) {
      const { rows: [replacement] } = await client.query('SELECT id FROM tms.cliente_direcciones WHERE cliente_id=$1 AND activo AND id<>$2 ORDER BY nombre LIMIT 1', [current.cliente_id, req.params.id]);
      if (replacement) await client.query('UPDATE tms.cliente_direcciones SET principal=true WHERE id=$1', [replacement.id]);
      else await client.query('UPDATE tms.cliente_direcciones SET principal=true WHERE id=$1', [req.params.id]);
      const { rows: [refreshed] } = await client.query('SELECT * FROM tms.cliente_direcciones WHERE id=$1', [req.params.id]);
      address = refreshed;
    }
    await client.query('COMMIT');
    res.json({ success: true, data: address });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));
router.patch('/addresses/:id/active', requireTripEdit, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) return fail(res, 400, 'Identificador de dirección inválido');
  if (typeof req.body?.activo !== 'boolean') return fail(res, 400, 'El estado activo debe ser verdadero o falso');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [owner] } = await client.query('SELECT cliente_id FROM tms.cliente_direcciones WHERE id=$1', [req.params.id]);
    if (!owner) { await client.query('ROLLBACK'); return fail(res, 404, 'Dirección no encontrada'); }
    await client.query('SELECT id FROM tms.clientes WHERE id=$1 FOR UPDATE', [owner.cliente_id]);
    const { rows: [current] } = await client.query('SELECT cliente_id,activo,principal FROM tms.cliente_direcciones WHERE id=$1 FOR UPDATE', [req.params.id]);
    await client.query(`UPDATE tms.cliente_direcciones
      SET activo=$2, principal=CASE WHEN $2=false AND principal THEN false ELSE principal END, updated_at=now()
      WHERE id=$1 RETURNING *`, [req.params.id, req.body.activo]);
    if (current.principal && !req.body.activo) {
      const { rows: [replacement] } = await client.query('SELECT id FROM tms.cliente_direcciones WHERE cliente_id=$1 AND activo ORDER BY nombre LIMIT 1', [current.cliente_id]);
      if (replacement) await client.query('UPDATE tms.cliente_direcciones SET principal=true WHERE id=$1', [replacement.id]);
    } else if (req.body.activo) {
      const { rows: [primary] } = await client.query('SELECT id FROM tms.cliente_direcciones WHERE cliente_id=$1 AND activo AND principal LIMIT 1', [current.cliente_id]);
      if (!primary) await client.query('UPDATE tms.cliente_direcciones SET principal=true WHERE id=$1', [req.params.id]);
    }
    const { rows: [refreshed] } = await client.query('SELECT * FROM tms.cliente_direcciones WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, data: refreshed });
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}));
router.get('/units', requireTripRead, wrap(async (_req, res) => { const { rows } = await query(`SELECT u.*,p.razon_social AS proveedor FROM tms.unidades u LEFT JOIN tms.proveedores p ON p.id=u.proveedor_id ORDER BY u.numero_economico`); res.json({ success: true, data: rows }); }));
router.get('/operators', requireTripRead, wrap(async (_req, res) => { const { rows } = await query(`SELECT o.*,p.razon_social AS proveedor FROM tms.operadores o LEFT JOIN tms.proveedores p ON p.id=o.proveedor_id ORDER BY o.nombre`); res.json({ success: true, data: rows }); }));
router.get('/providers', requireTripRead, wrap(async (_req, res) => { const { rows } = await query('SELECT * FROM tms.proveedores ORDER BY razon_social'); res.json({ success: true, data: rows }); }));
router.post('/units', requireFleetEdit, wrap(async (req, res) => {
  const body = req.body || {};
  const numero = typeof body.numero_economico === 'string' ? body.numero_economico.trim() : '';
  const tipo = typeof body.tipo_unidad === 'string' ? body.tipo_unidad.trim() : '';
  const optionalText = (value, max) => value == null || (typeof value === 'string' && value.trim().length <= max);
  const validPositive = (value) => value == null || (Number.isFinite(Number(value)) && Number(value) > 0);
  if (!numero || numero.length > 80 || !tipo || tipo.length > 100
    || !optionalText(body.placas, 30) || !optionalText(body.marca, 80) || !optionalText(body.modelo, 80)
    || (body.anio != null && (!Number.isInteger(Number(body.anio)) || Number(body.anio) < 1900 || Number(body.anio) > 2200))
    || !validPositive(body.capacidad_kg) || (body.capacidad_pallets != null && (!Number.isInteger(Number(body.capacidad_pallets)) || Number(body.capacidad_pallets) <= 0))
    || (body.proveedor_id != null && !isUuid(body.proveedor_id))) return fail(res, 400, 'Revisa el número económico, tipo y datos de capacidad de la unidad');
  const demoBypass = process.env.NODE_ENV !== 'production' && process.env.LOGISTICA_AUTH_DISABLED === 'true' && numero.toUpperCase().startsWith('DEMO-');
  if (!isUuid(req.user.id) && !demoBypass) return fail(res, 403, 'Inicia sesión con un usuario TMS válido para dar de alta una unidad');
  const { rows: [unit] } = await query(`INSERT INTO tms.unidades(numero_economico,placas,tipo_unidad,marca,modelo,anio,capacidad_kg,capacidad_pallets,hazmat,refrigerada,proveedor_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(numero_economico) DO NOTHING RETURNING *`,
  [numero, body.placas?.trim() || null, tipo, body.marca?.trim() || null, body.modelo?.trim() || null, body.anio ?? null,
    body.capacidad_kg ?? null, body.capacidad_pallets ?? null, body.hazmat === true, body.refrigerada === true, body.proveedor_id || null]);
  if (unit) return res.status(201).json({ success: true, data: unit, created: true });
  const { rows: [existing] } = await query('SELECT * FROM tms.unidades WHERE numero_economico=$1', [numero]);
  return res.json({ success: true, data: existing, created: false });
}));
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
