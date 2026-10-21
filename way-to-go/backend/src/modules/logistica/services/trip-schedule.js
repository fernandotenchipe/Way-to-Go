export const scheduleKeys = ['cita_carga_at', 'salida_programada_at', 'entrega_estimada_at', 'descarga_programada_at'];

export function validateTripSchedule(body) {
  const required = scheduleKeys.slice(0, 3);
  if (!required.every(key => typeof body[key] === 'string' && Number.isFinite(Date.parse(body[key])))) return 'Captura fechas válidas para recolección, salida y llegada';
  if (body.descarga_programada_at != null && (typeof body.descarga_programada_at !== 'string' || !Number.isFinite(Date.parse(body.descarga_programada_at)))) return 'La fecha de descarga no es válida';
  if (Date.parse(body.salida_programada_at) < Date.parse(body.cita_carga_at)
    || Date.parse(body.entrega_estimada_at) <= Date.parse(body.salida_programada_at)
    || (body.descarga_programada_at && Date.parse(body.descarga_programada_at) < Date.parse(body.entrega_estimada_at))) return 'Revisa el orden de recolección, salida, llegada y descarga';
  return null;
}

export async function reserveTripResources(client, trip, resources, from, until) {
  for (const id of [...new Set(['unidad_id', 'caja_id', 'operador_id'].map(key => resources[key]).filter(Boolean))].sort()) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['tms-recurso:' + id]);
  for (const key of ['unidad_id', 'caja_id', 'operador_id']) {
    if (!resources[key]) continue;
    const { rows } = await client.query(`SELECT id FROM tms.viajes WHERE id<>$1 AND ${key}=$2 AND estado_operativo NOT IN ('ENTREGADO','CANCELADO') AND recursos_liberados_at IS NULL AND tstzrange(reserva_desde,reserva_hasta,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') LIMIT 1`, [trip.id, resources[key], from, until]);
    if (rows.length) return 'Un recurso ya está asignado a otro viaje en ese horario';
  }
  return null;
}
