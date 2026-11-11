import { randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ADDRESS_FIELDS = 'id, cliente_id, nombre, calle, ciudad, estado, pais, codigo_postal, zona_horaria, horario, instrucciones, requiere_cita';

export class TripCustomerError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TripCustomerError(400, 'Envía un objeto válido');
  const allowed = new Set(['cliente_id', 'origen_id', 'destino_id', 'updated_at', 'motivo']);
  if (Object.keys(body).some(key => !allowed.has(key))) throw new TripCustomerError(400, 'El cuerpo contiene campos no permitidos');
  for (const key of ['cliente_id', 'origen_id', 'destino_id']) {
    if (typeof body[key] !== 'string' || !UUID.test(body[key])) throw new TripCustomerError(400, `Referencia ${key} inválida`);
  }
  if (body.origen_id === body.destino_id) throw new TripCustomerError(400, 'Origen y destino deben ser domicilios distintos');
  if (typeof body.updated_at !== 'string' || !Number.isFinite(Date.parse(body.updated_at))) {
    throw new TripCustomerError(400, 'Envía updated_at de la ficha consultada');
  }
  if (typeof body.motivo !== 'string' || !body.motivo.trim() || body.motivo.length > 1000) {
    throw new TripCustomerError(400, 'Indica el motivo del cambio (hasta 1000 caracteres)');
  }
  return {
    cliente_id: body.cliente_id,
    origen_id: body.origen_id,
    destino_id: body.destino_id,
    updated_at: body.updated_at,
    motivo: body.motivo.trim(),
  };
}

/** Changes one trip's customer and its two owned address references atomically. */
export async function updateTripCustomer({ pool, folio, body, actor }) {
  if (typeof folio !== 'string' || !folio.trim()) throw new TripCustomerError(400, 'Folio de viaje inválido');
  if (typeof actor !== 'string' || !UUID.test(actor)) throw new TripCustomerError(403, 'Inicia sesión con un usuario TMS válido para guardar cambios');
  const input = parseInput(body);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const tripResult = await db.query('SELECT * FROM tms.viajes WHERE folio::text=$1 FOR UPDATE', [folio]);
    const trip = tripResult.rows[0];
    if (!trip) throw new TripCustomerError(404, 'Viaje no encontrado');
    if (['ENTREGADO', 'CANCELADO'].includes(trip.estado_operativo)) {
      throw new TripCustomerError(409, 'El viaje está finalizado y no admite cambios de cliente');
    }
    if (new Date(trip.updated_at).getTime() !== Date.parse(input.updated_at)) {
      throw new TripCustomerError(409, 'Otra persona actualizó el viaje. Recarga la ficha antes de guardar');
    }

    const customerResult = await db.query(
      'SELECT id FROM tms.clientes WHERE id=$1 AND activo FOR SHARE',
      [input.cliente_id],
    );
    if (!customerResult.rows.length) throw new TripCustomerError(422, 'El cliente no existe o está inactivo');

    const addressResult = await db.query(
      `SELECT ${ADDRESS_FIELDS} FROM tms.cliente_direcciones
       WHERE id=ANY($1::uuid[]) AND cliente_id=$2 AND activo FOR SHARE`,
      [[input.origen_id, input.destino_id], input.cliente_id],
    );
    if (addressResult.rows.length !== 2) {
      throw new TripCustomerError(422, 'Ambos domicilios deben existir, estar activos y pertenecer al cliente');
    }
    const origin = addressResult.rows.find(address => address.id === input.origen_id);
    const destination = addressResult.rows.find(address => address.id === input.destino_id);
    if (!origin || !destination) throw new TripCustomerError(422, 'Origen o destino no pertenece al cliente');

    const before = {
      cliente_id: trip.cliente_id,
      origen_id: trip.origen_id,
      destino_id: trip.destino_id,
    };
    const after = {
      cliente_id: input.cliente_id,
      origen_id: input.origen_id,
      destino_id: input.destino_id,
    };
    const updatedResult = await db.query(
      `UPDATE tms.viajes
       SET cliente_id=$2, origen_id=$3, destino_id=$4,
           origen_snapshot=$5::jsonb, destino_snapshot=$6::jsonb, updated_at=now()
       WHERE id=$1
       RETURNING *`,
      [trip.id, input.cliente_id, input.origen_id, input.destino_id,
        JSON.stringify(origin), JSON.stringify(destination)],
    );
    if (!updatedResult.rows.length) throw new TripCustomerError(409, 'Otra persona actualizó el viaje. Recarga la ficha antes de guardar');

    await db.query(
      `INSERT INTO tms.viaje_eventos
       (viaje_id,tipo,ocurrido_at,registrado_por,origen,comentario,datos,idempotency_key)
       VALUES ($1,'CORRECCION',now(),$2,'INTERNO',$3,$4::jsonb,$5)`,
      [trip.id, actor, input.motivo, JSON.stringify({ antes: before, despues: after }), randomUUID()],
    );
    await db.query('COMMIT');
    return updatedResult.rows[0];
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
