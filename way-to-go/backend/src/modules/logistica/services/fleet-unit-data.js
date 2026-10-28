const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const insuranceTypes = ['RESPONSABILIDAD_CIVIL', 'AMBIENTAL', 'CARGA'];
const textFields = { numero_economico: 80, placas: 30, tipo_unidad: 100, marca: 80, modelo: 80, configuracion_vehicular_sat: 30, permiso_sict_sat: 30, numero_permiso_sict: 100, vin: 100 };
const decimalFields = ['capacidad_kg', 'peso_vacio_kg', 'peso_bruto_permitido_t', 'largo_m', 'ancho_m', 'alto_m'];
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : value ? String(value).slice(0, 10) : null;

function invalid(message) { const error = new Error(message); error.status = 400; throw error; }
function conflict(message) { const error = new Error(message); error.status = 409; throw error; }
function cleanText(value, max) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) invalid('Revisa los campos de texto de la unidad');
  return value.trim() || null;
}

export function parseFleetUnit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Indica los datos de la unidad');
  const unit = Object.fromEntries(Object.entries(textFields).map(([key, max]) => [key, cleanText(input[key], max)]));
  if (!unit.numero_economico || !unit.tipo_unidad) invalid('Indica el número económico y el tipo de unidad');
  for (const key of decimalFields) {
    const value = input[key];
    if (value == null || value === '') unit[key] = null;
    else if (!Number.isFinite(Number(value)) || Number(value) < (key === 'peso_vacio_kg' ? 0 : Number.EPSILON)) invalid(`Revisa ${key}`);
    else unit[key] = Number(value);
  }
  for (const key of ['anio', 'capacidad_pallets']) {
    const value = input[key];
    if (value == null || value === '') unit[key] = null;
    else if (!Number.isInteger(Number(value)) || Number(value) < (key === 'anio' ? 1900 : 1) || (key === 'anio' && Number(value) > 2200)) invalid(`Revisa ${key}`);
    else unit[key] = Number(value);
  }
  for (const key of ['hazmat', 'refrigerada']) {
    if (typeof input[key] !== 'boolean') invalid(`Revisa ${key}`);
    unit[key] = input[key];
  }
  unit.proveedor_id = input.proveedor_id || null;
  if (unit.proveedor_id && !uuid(unit.proveedor_id)) invalid('Selecciona un proveedor válido');
  if (!Array.isArray(input.seguros) || input.seguros.length !== insuranceTypes.length) invalid('Revisa los seguros de la unidad');
  const seguros = insuranceTypes.map(tipo => {
    const item = input.seguros.find(row => row?.tipo === tipo);
    if (!item) invalid('Revisa los seguros de la unidad');
    const aseguradora = cleanText(item.aseguradora, 180), poliza = cleanText(item.poliza, 100);
    const vigente_desde = item.vigente_desde || null, vigente_hasta = item.vigente_hasta || null;
    if (Boolean(aseguradora) !== Boolean(poliza)) invalid('Captura aseguradora y póliza juntas');
    for (const date of [vigente_desde, vigente_hasta]) if (date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))) invalid('Revisa las fechas de los seguros');
    if ((vigente_desde || vigente_hasta) && !aseguradora) invalid('Indica aseguradora y póliza para guardar vigencias');
    if (vigente_desde && vigente_hasta && vigente_hasta < vigente_desde) invalid('La vigencia del seguro termina antes de empezar');
    return { tipo, aseguradora, poliza, vigente_desde, vigente_hasta };
  });
  return { unit, seguros };
}

export async function saveFleetUnit(pool, input, id = null, expectedUpdatedAt = null) {
  const { unit, seguros } = parseFleetUnit(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let previous;
    if (id) {
      if (!uuid(id)) invalid('Unidad no válida');
      const { rows } = await client.query('SELECT id,numero_economico,proveedor_id,updated_at FROM tms.unidades WHERE id=$1 FOR UPDATE', [id]);
      previous = rows[0];
      if (!previous) { const error = new Error('Unidad no encontrada'); error.status = 404; throw error; }
      if (process.env.NODE_ENV !== 'production' && process.env.LOGISTICA_AUTH_DISABLED === 'true' && (!unit.numero_economico.toUpperCase().startsWith('DEMO-') || !previous.numero_economico?.toUpperCase().startsWith('DEMO-'))) invalid('En modo local solo puedes editar unidades DEMO-');
      if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt)) || new Date(previous.updated_at).getTime() !== Date.parse(expectedUpdatedAt)) conflict('La unidad cambió. Recarga la ficha antes de guardar');
      if (previous.proveedor_id !== unit.proveedor_id) {
        const { rows: trips } = await client.query("SELECT id FROM tms.viajes WHERE unidad_id=$1 AND estado_operativo NOT IN ('ENTREGADO','CANCELADO') AND recursos_liberados_at IS NULL LIMIT 1", [id]);
        if (trips.length) conflict('La unidad tiene un viaje activo; no se puede cambiar de proveedor ahora');
      }
    } else if (process.env.NODE_ENV !== 'production' && process.env.LOGISTICA_AUTH_DISABLED === 'true' && !unit.numero_economico.toUpperCase().startsWith('DEMO-')) invalid('En modo local usa un número económico que comience con DEMO-');
    if (unit.proveedor_id && unit.proveedor_id !== previous?.proveedor_id) {
      const { rows } = await client.query('SELECT id FROM tms.proveedores WHERE id=$1 AND activo FOR SHARE', [unit.proveedor_id]);
      if (!rows.length) invalid('El proveedor no existe o está inactivo');
    }
    const keys = Object.keys(unit);
    const values = keys.map(key => unit[key]);
    const sql = id
      ? `UPDATE tms.unidades SET ${keys.map((key, index) => `${key}=$${index + 2}`).join(',')} WHERE id=$1 RETURNING *`
      : `INSERT INTO tms.unidades(${keys.join(',')}) VALUES(${keys.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`;
    const params = id ? [id, ...values] : values;
    const { rows: [saved] } = await client.query(sql, params);
    for (const policy of seguros) {
      const { rows: existing } = await client.query('SELECT id,aseguradora,poliza,vigente_desde,vigente_hasta FROM tms.unidad_seguros WHERE unidad_id=$1 AND tipo=$2 AND activo ORDER BY updated_at DESC,id DESC FOR UPDATE', [saved.id, policy.tipo]);
      if (!policy.aseguradora) {
        if (existing.length) await client.query('UPDATE tms.unidad_seguros SET activo=false,updated_at=now() WHERE id=ANY($1::uuid[])', [existing.map(row => row.id)]);
        continue;
      }
      const same = existing[0] && existing[0].aseguradora === policy.aseguradora && existing[0].poliza === policy.poliza
        && day(existing[0].vigente_desde) === policy.vigente_desde
        && day(existing[0].vigente_hasta) === policy.vigente_hasta;
      if (same) {
        if (existing.length > 1) await client.query('UPDATE tms.unidad_seguros SET activo=false,updated_at=now() WHERE id=ANY($1::uuid[])', [existing.slice(1).map(row => row.id)]);
      } else {
        if (existing.length) await client.query('UPDATE tms.unidad_seguros SET activo=false,updated_at=now() WHERE id=ANY($1::uuid[])', [existing.map(row => row.id)]);
        await client.query('INSERT INTO tms.unidad_seguros(unidad_id,tipo,aseguradora,poliza,vigente_desde,vigente_hasta) VALUES($1,$2,$3,$4,$5,$6)', [saved.id, policy.tipo, policy.aseguradora, policy.poliza, policy.vigente_desde, policy.vigente_hasta]);
      }
    }
    await client.query('COMMIT');
    return saved;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
