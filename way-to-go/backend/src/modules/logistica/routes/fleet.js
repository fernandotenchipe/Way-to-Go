import express from 'express';
import { requireFleetEdit, requireFleetRead } from '../middleware/auth.js';

export default function fleetRouter({ pool, wrap, fail }) {
  const router = express.Router();

  router.get('/fleet', requireFleetRead, wrap(async (req, res) => {
    const [units, location] = await Promise.all([
      pool.query(`SELECT u.id,u.numero_economico,u.placas,u.tipo_unidad,u.marca,u.modelo,u.anio,u.capacidad_kg,u.capacidad_pallets,u.hazmat,u.refrigerada,u.proveedor_id,p.razon_social AS proveedor,u.estatus,
        arrival.ocurrido_at AS ultima_llegada_at,arrival_user.nombre AS llegada_por,
        block.id AS bloqueo_id,block.ocurrido_at AS bloqueada_at,block.motivo AS bloqueo_motivo,block_user.nombre AS bloqueada_por,
        trip.folio::text AS proximo_folio,trip.cita_carga_at AS proxima_reserva_desde,trip.entrega_estimada_at AS proxima_reserva_hasta,
        docs.vigentes,docs.vencidos
        FROM tms.unidades u LEFT JOIN tms.proveedores p ON p.id=u.proveedor_id
        LEFT JOIN LATERAL (SELECT e.ocurrido_at,e.registrado_por FROM tms.unidad_eventos e WHERE e.unidad_id=u.id AND e.tipo='LLEGADA' ORDER BY e.ocurrido_at DESC,e.id DESC LIMIT 1) arrival ON true
        LEFT JOIN tms.usuarios arrival_user ON arrival_user.id=arrival.registrado_por
        LEFT JOIN LATERAL (SELECT e.id,e.ocurrido_at,e.motivo,e.registrado_por FROM tms.unidad_eventos e WHERE e.unidad_id=u.id AND e.tipo='BLOQUEO' AND NOT EXISTS(SELECT 1 FROM tms.unidad_eventos rel WHERE rel.tipo='LIBERACION' AND rel.relacionado_id=e.id) ORDER BY e.ocurrido_at DESC LIMIT 1) block ON true
        LEFT JOIN tms.usuarios block_user ON block_user.id=block.registrado_por
        LEFT JOIN LATERAL (SELECT v.folio,v.cita_carga_at,v.entrega_estimada_at FROM tms.viajes v WHERE v.unidad_id=u.id AND v.estado_operativo NOT IN ('ENTREGADO','CANCELADO') AND v.recursos_liberados_at IS NULL AND v.reserva_hasta>now() ORDER BY v.reserva_desde LIMIT 1) trip ON true
        LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE d.vence_el IS NULL OR d.vence_el>=current_date)::int AS vigentes,count(*) FILTER(WHERE d.vence_el<current_date)::int AS vencidos FROM tms.unidad_documentos d WHERE d.unidad_id=u.id) docs ON true
        ORDER BY u.numero_economico`),
      pool.query('SELECT direccion,latitud,longitud,updated_at FROM tms.ubicacion_wtg WHERE id=1'),
    ]);
    const canSeeArrivalAudit = req.user.permissions.includes('flota.editar');
    const visibleUnits = canSeeArrivalAudit ? units.rows : units.rows.map(unit => ({ ...unit, ultima_llegada_at: null, llegada_por: null, bloqueada_at: null, bloqueada_por: null }));
    res.json({ success: true, data: { units: visibleUnits, location: location.rows[0] || null } });
  }));

  router.put('/fleet/location', requireFleetEdit, wrap(async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.user.id)) return fail(res, 403, 'Se requiere una sesión TMS válida para configurar la ubicación');
    const { direccion, latitud, longitud } = req.body || {};
    if (typeof direccion !== 'string' || !direccion.trim() || direccion.trim().length > 500 || !Number.isFinite(Number(latitud)) || Number(latitud) < -90 || Number(latitud) > 90 || !Number.isFinite(Number(longitud)) || Number(longitud) < -180 || Number(longitud) > 180) return fail(res, 400, 'Indica una dirección y un punto válido en el mapa');
    const { rows: [location] } = await pool.query(`INSERT INTO tms.ubicacion_wtg(id,direccion,latitud,longitud,actualizado_por) VALUES(1,$1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET direccion=EXCLUDED.direccion,latitud=EXCLUDED.latitud,longitud=EXCLUDED.longitud,actualizado_por=EXCLUDED.actualizado_por,updated_at=now() RETURNING *`, [direccion.trim(), Number(latitud), Number(longitud), req.user.id]);
    res.json({ success: true, data: location });
  }));

  router.get('/fleet/calendar', requireFleetRead, wrap(async (req, res) => {
    const from = req.query.from; const until = req.query.until;
    if (!from || !until || !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(until)) || Date.parse(until) <= Date.parse(from)) return fail(res, 400, 'Indica un periodo válido para consultar reservas');
    const { rows } = await pool.query(`
      SELECT u.id AS unidad_id,u.numero_economico,'VIAJE'::text AS tipo,v.reserva_desde AS desde,v.reserva_hasta AS hasta,NULL::text AS motivo,v.folio::text AS folio,vu.nombre AS responsable
      FROM tms.unidades u JOIN tms.viajes v ON v.unidad_id=u.id AND v.estado_operativo NOT IN ('ENTREGADO','CANCELADO') AND v.recursos_liberados_at IS NULL
        AND tstzrange(v.reserva_desde,v.reserva_hasta,'[)') && tstzrange($1::timestamptz,$2::timestamptz,'[)')
      LEFT JOIN tms.usuarios vu ON vu.id=v.creado_por WHERE u.estatus<>'BAJA'
      UNION ALL
      SELECT u.id,u.numero_economico,'BLOQUEO'::text,b.ocurrido_at,rel.ocurrido_at,b.motivo,NULL::text,bu.nombre
      FROM tms.unidades u JOIN tms.unidad_eventos b ON b.unidad_id=u.id AND b.tipo='BLOQUEO' AND b.ocurrido_at<$2::timestamptz
      LEFT JOIN LATERAL(SELECT r.ocurrido_at,r.registrado_por FROM tms.unidad_eventos r WHERE r.tipo='LIBERACION' AND r.relacionado_id=b.id ORDER BY r.ocurrido_at DESC LIMIT 1) rel ON true
      LEFT JOIN tms.usuarios bu ON bu.id=b.registrado_por
      WHERE u.estatus<>'BAJA' AND COALESCE(rel.ocurrido_at,'infinity'::timestamptz)>$1::timestamptz
      ORDER BY numero_economico,desde`, [from, until]);
    const visibleRows = req.user.permissions.includes('flota.editar') ? rows : rows.map(event => ({ ...event, responsable: null }));
    res.json({ success: true, data: visibleRows });
  }));

  router.post('/fleet/:id/arrival', requireFleetEdit, wrap(async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.user.id)) return fail(res, 403, 'Se requiere una sesión TMS válida para registrar la llegada');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [unit] } = await client.query('SELECT id,estatus FROM tms.unidades WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!unit) { await client.query('ROLLBACK'); return fail(res, 404, 'Unidad no encontrada'); }
      if (unit.estatus === 'BAJA') { await client.query('ROLLBACK'); return fail(res, 409, 'No se puede registrar llegada para una unidad dada de baja'); }
      const { rows: locations } = await client.query('SELECT id FROM tms.ubicacion_wtg WHERE id=1');
      if (!locations.length) { await client.query('ROLLBACK'); return fail(res, 409, 'Configura primero la ubicación de las instalaciones de WTG'); }
      const { rows: [arrival] } = await client.query(`INSERT INTO tms.unidad_eventos(unidad_id,tipo,registrado_por,ocurrido_at) VALUES($1,'LLEGADA',$2,now()) RETURNING *`, [unit.id, req.user.id]);
      await client.query('COMMIT'); res.status(201).json({ success: true, data: arrival });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }));

  router.post('/fleet/:id/block', requireFleetEdit, wrap(async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(req.user.id)) return fail(res, 403, 'Se requiere una sesión TMS válida para bloquear la unidad');
    const reason = req.body?.motivo;
    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000) return fail(res, 400, 'Indica el motivo del bloqueo');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [unit] } = await client.query('SELECT id,estatus FROM tms.unidades WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!unit) { await client.query('ROLLBACK'); return fail(res, 404, 'Unidad no encontrada'); }
      if (unit.estatus === 'BAJA') { await client.query('ROLLBACK'); return fail(res, 409, 'No se puede bloquear una unidad dada de baja'); }
      const { rows: [latest] } = await client.query('SELECT tipo FROM tms.unidad_eventos WHERE unidad_id=$1 ORDER BY ocurrido_at DESC,id DESC LIMIT 1', [unit.id]);
      if (latest?.tipo !== 'LLEGADA') { await client.query('ROLLBACK'); return fail(res, 409, 'Registra primero la llegada de la unidad a las instalaciones de WTG'); }
      const { rows: trips } = await client.query("SELECT id FROM tms.viajes WHERE unidad_id=$1 AND estado_operativo NOT IN ('ENTREGADO','CANCELADO') AND recursos_liberados_at IS NULL AND reserva_hasta>now() LIMIT 1", [unit.id]);
      if (trips.length) { await client.query('ROLLBACK'); return fail(res, 409, 'La unidad todavía tiene un viaje activo o reservado'); }
      const { rows: [block] } = await client.query(`INSERT INTO tms.unidad_eventos(unidad_id,tipo,registrado_por,motivo) VALUES($1,'BLOQUEO',$2,$3) RETURNING *`, [unit.id, req.user.id, reason.trim()]);
      await client.query("UPDATE tms.unidades SET estatus='MANTENIMIENTO' WHERE id=$1", [unit.id]);
      await client.query('COMMIT'); res.status(201).json({ success: true, data: block });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }));

  router.post('/fleet/:id/release', requireFleetEdit, wrap(async (req, res) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(req.user.id)) return fail(res, 403, 'Se requiere una sesión TMS válida para liberar la unidad');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [unit] } = await client.query('SELECT id,estatus FROM tms.unidades WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (!unit) { await client.query('ROLLBACK'); return fail(res, 404, 'Unidad no encontrada'); }
      const { rows: [block] } = await client.query(`SELECT e.id FROM tms.unidad_eventos e WHERE e.unidad_id=$1 AND e.tipo='BLOQUEO' AND NOT EXISTS(SELECT 1 FROM tms.unidad_eventos r WHERE r.tipo='LIBERACION' AND r.relacionado_id=e.id) ORDER BY e.ocurrido_at DESC LIMIT 1 FOR UPDATE`, [unit.id]);
      if (!block) { await client.query('ROLLBACK'); return fail(res, 409, 'La unidad no tiene un bloqueo activo'); }
      if (unit.estatus !== 'BAJA') await client.query("UPDATE tms.unidades SET estatus='ACTIVA' WHERE id=$1", [unit.id]);
      const { rows: [release] } = await client.query(`INSERT INTO tms.unidad_eventos(unidad_id,tipo,registrado_por,relacionado_id) VALUES($1,'LIBERACION',$2,$3) RETURNING *`, [unit.id, req.user.id, block.id]);
      await client.query('COMMIT'); res.json({ success: true, data: release });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }));

  return router;
}
