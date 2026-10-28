import express from 'express';
import { randomUUID } from 'node:crypto';
import { requireTripRead, requireTripEdit } from '../middleware/auth.js';
import { scheduleKeys, validateTripSchedule, reserveTripResources } from '../services/trip-schedule.js';

export default function tripRecordRouter({ pool, wrap, fail, isUuid }) {
  const router = express.Router();
  router.get('/session', (req, res) => {
    const localDemo = process.env.NODE_ENV !== 'production' && process.env.LOGISTICA_AUTH_DISABLED === 'true';
    const validActor = isUuid(req.user.id);
    res.json({ success: true, data: {
      nombre: req.user.name,
      canEdit: validActor && req.user.permissions.includes('viajes.editar'),
      canEditFleet: (validActor && req.user.permissions.includes('flota.editar')) || localDemo,
      demoFleetOnly: !validActor && localDemo,
      canEditOperators: (validActor && req.user.permissions.includes('viajes.editar')) || localDemo,
      demoOperatorsOnly: localDemo,
      canAdvance: validActor && req.user.permissions.includes('viajes.estatus'),
      validActor,
    } });
  });
  router.post('/trips/:folio/notes', requireTripEdit, wrap(async (req, res) => {
    if (!isUuid(req.user.id)) return fail(res, 403, 'Inicia sesión con un usuario TMS válido para agregar notas');
    const text = req.body?.texto;
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) return fail(res, 400, 'Escribe una nota de hasta 2000 caracteres');
    const { rows: [note] } = await pool.query(`INSERT INTO tms.viaje_eventos(viaje_id,tipo,ocurrido_at,registrado_por,origen,comentario,datos,idempotency_key)
      SELECT id,'COMENTARIO',now(),$2,'INTERNO',$3,'{"categoria":"NOTA"}'::jsonb,$4 FROM tms.viajes WHERE folio::text=$1 RETURNING id`, [req.params.folio, req.user.id, text.trim(), randomUUID()]);
    if (!note) return fail(res, 404, 'Viaje no encontrado');
    res.status(201).json({ success: true, data: note });
  }));
  router.get('/trips/:folio/record', requireTripRead, wrap(async (req, res) => {
    const { rows: [trip] } = await pool.query('SELECT id FROM tms.viajes WHERE folio::text=$1', [req.params.folio]);
    if (!trip) return fail(res, 404, 'Viaje no encontrado');
    const [times, events, units, operators, boxes, providers] = await Promise.all([
      pool.query('SELECT * FROM tms.viaje_tiempos WHERE viaje_id=$1', [trip.id]),
      pool.query(`SELECT e.*,u.nombre AS registrado_por_nombre FROM tms.viaje_eventos e JOIN tms.usuarios u ON u.id=e.registrado_por WHERE e.viaje_id=$1 ORDER BY e.created_at DESC,e.id DESC`, [trip.id]),
      pool.query("SELECT id,numero_economico AS nombre,proveedor_id FROM tms.unidades WHERE estatus='ACTIVA' ORDER BY numero_economico"),
      pool.query('SELECT id,nombre,proveedor_id FROM tms.operadores WHERE activo ORDER BY nombre'),
      pool.query("SELECT id,numero_caja AS nombre,proveedor_id FROM tms.cajas WHERE estatus='ACTIVA' ORDER BY numero_caja"),
      pool.query('SELECT id,razon_social AS nombre FROM tms.proveedores WHERE activo ORDER BY razon_social'),
    ]);
    res.json({ success: true, data: { tiempos: times.rows[0] || {}, eventos: events.rows, unidades: units.rows, operadores: operators.rows, cajas: boxes.rows, proveedores: providers.rows } });
  }));
  for (const operation of ['record', 'assignment']) router.patch(`/trips/:folio/${operation}`, requireTripEdit, wrap(async (req, res) => {
    if (!isUuid(req.user.id)) return fail(res, 403, 'Inicia sesión con un usuario TMS válido para guardar cambios');
    const body = req.body || {};
    if (typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) return fail(res, 400, 'Indica el motivo del cambio (hasta 1000 caracteres)');
    if (typeof body.updated_at !== 'string' || !Number.isFinite(Date.parse(body.updated_at))) return fail(res, 400, 'Actualiza la ficha antes de guardar');
    if (operation === 'record' && (typeof body.tipo_carga !== 'string' || !body.tipo_carga.trim() || body.tipo_carga.length > 160 || typeof body.instrucciones !== 'string' || body.instrucciones.length > 2000)) return fail(res, 400, 'Revisa la carga y las instrucciones');
    const changesSchedule = operation === 'record' && scheduleKeys.some(key => Object.hasOwn(body, key));
    if (changesSchedule) {
      const error = validateTripSchedule(body);
      if (error) return fail(res, 400, error);
    }
    if (operation === 'assignment') {
      if (!['PROPIO', 'PROVEEDOR'].includes(body.modalidad)) return fail(res, 400, 'Selecciona transporte propio o proveedor');
      for (const key of ['unidad_id', 'operador_id', 'caja_id', 'proveedor_id']) if (body[key] != null && !isUuid(body[key])) return fail(res, 400, 'Referencia de transporte no válida');
      if (body.modalidad === 'PROPIO' && (!body.unidad_id || !body.operador_id || body.proveedor_id)) return fail(res, 400, 'Selecciona unidad y operador propios');
      if (body.modalidad === 'PROVEEDOR' && !body.proveedor_id) return fail(res, 400, 'Selecciona un proveedor');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [trip] } = await client.query('SELECT * FROM tms.viajes WHERE folio::text=$1 FOR UPDATE', [req.params.folio]);
      if (!trip) { await client.query('ROLLBACK'); return fail(res, 404, 'Viaje no encontrado'); }
      if (['ENTREGADO', 'CANCELADO'].includes(trip.estado_operativo)) { await client.query('ROLLBACK'); return fail(res, 409, 'El viaje está finalizado y no admite estos cambios'); }
      if (new Date(trip.updated_at).getTime() !== Date.parse(body.updated_at)) { await client.query('ROLLBACK'); return fail(res, 409, 'Otra persona actualizó el viaje. Recarga la ficha antes de guardar'); }
      let before, after;
      if (operation === 'record') {
        before = { tipo_carga: trip.tipo_carga, instrucciones: trip.instrucciones };
        after = { tipo_carga: body.tipo_carga.trim(), instrucciones: body.instrucciones.trim() };
        await client.query('UPDATE tms.viajes SET tipo_carga=$2,instrucciones=$3 WHERE id=$1', [trip.id, after.tipo_carga, after.instrucciones]);
        if (changesSchedule) {
          const { rows: [times] } = await client.query('SELECT salida_programada_at,descarga_programada_at FROM tms.viaje_tiempos WHERE viaje_id=$1 FOR UPDATE', [trip.id]);
          const end = body.descarga_programada_at || body.entrega_estimada_at;
          const conflict = await reserveTripResources(client, trip, { unidad_id: trip.unidad_id, caja_id: trip.caja_id, operador_id: trip.operador_id }, body.cita_carga_at, end);
          if (conflict) { await client.query('ROLLBACK'); return fail(res, 409, conflict); }
          for (const key of scheduleKeys) {
            const value = key === 'salida_programada_at' || key === 'descarga_programada_at' ? times?.[key] : trip[key];
            before[key] = value ? new Date(value).toISOString() : null;
            after[key] = body[key] ? new Date(body[key]).toISOString() : null;
          }
          await client.query('UPDATE tms.viajes SET cita_carga_at=$2,entrega_estimada_at=$3,reserva_desde=$2,reserva_hasta=$4 WHERE id=$1', [trip.id, after.cita_carga_at, after.entrega_estimada_at, end]);
          await client.query('UPDATE tms.viaje_tiempos SET salida_programada_at=$2,descarga_programada_at=$3 WHERE viaje_id=$1', [trip.id, after.salida_programada_at, after.descarga_programada_at]);
        }
      } else {
        const owner = body.modalidad === 'PROVEEDOR' ? body.proveedor_id : null;
        if (owner) {
          const { rows } = await client.query('SELECT id FROM tms.proveedores WHERE id=$1 AND activo FOR SHARE', [owner]);
          if (!rows.length) { await client.query('ROLLBACK'); return fail(res, 400, 'El proveedor está inactivo o no existe'); }
        }
        for (const [key, table, condition] of [['unidad_id', 'unidades', "estatus='ACTIVA'"], ['caja_id', 'cajas', "estatus='ACTIVA'"], ['operador_id', 'operadores', 'activo']]) {
          if (!body[key]) continue;
          const { rows } = await client.query(`SELECT id FROM tms.${table} WHERE id=$1 AND ${condition} AND proveedor_id IS NOT DISTINCT FROM $2::uuid FOR SHARE`, [body[key], owner]);
          if (!rows.length) { await client.query('ROLLBACK'); return fail(res, 400, 'Selecciona recursos activos de la modalidad o proveedor elegido'); }
        }
        const conflict = await reserveTripResources(client, trip, body, trip.reserva_desde, trip.reserva_hasta);
        if (conflict) { await client.query('ROLLBACK'); return fail(res, 409, conflict); }
        before = Object.fromEntries(['unidad_id','caja_id','operador_id','proveedor_id'].map(key => [key, trip[key]]));
        after = { unidad_id: body.unidad_id || null, caja_id: body.caja_id || null, operador_id: body.operador_id || null, proveedor_id: owner };
        await client.query('UPDATE tms.viajes SET unidad_id=$2,caja_id=$3,operador_id=$4,proveedor_id=$5 WHERE id=$1', [trip.id, after.unidad_id, after.caja_id, after.operador_id, owner]);
      }
      await client.query(`INSERT INTO tms.viaje_eventos(viaje_id,tipo,ocurrido_at,registrado_por,origen,comentario,datos,idempotency_key) VALUES ($1,$2,now(),$3,'INTERNO',$4,$5::jsonb,$6)`, [trip.id, operation === 'record' ? 'CORRECCION' : 'ASIGNACION', req.user.id, body.motivo.trim(), JSON.stringify({ antes: before, despues: after }), randomUUID()]);
      await client.query('COMMIT');
      res.json({ success: true, data: { id: trip.id } });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }));
  return router;
}
