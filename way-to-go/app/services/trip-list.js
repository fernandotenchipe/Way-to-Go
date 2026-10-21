/** @typedef {import('./logistics-api').LogisticsTrip} LogisticsTrip */
/** @typedef {{ folio: string; client: string; route: string; unit: string; driver: string; status: string; update: string; eta: string; cargo: string; evidence: string; amount: string }} TripRow */

const statusLabels = { BORRADOR: 'Borrador', CONFIRMADO: 'Confirmado', PROGRAMADO: 'Programado', EN_CAMINO_A_CARGA: 'En camino a carga', LLEGO_A_CARGA: 'Llegó a carga', EN_CARGA: 'En carga', SALIO_CARGADO_EN_RUTA: 'En ruta', LLEGO_A_DESTINO: 'Llegó a destino', EN_DESCARGA: 'En descarga', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado' };

/** @param {LogisticsTrip} trip @returns {TripRow} */
export function toTripRow(trip) {
  const address = snapshot => snapshot ? [snapshot.nombre, snapshot.ciudad, snapshot.estado].filter(Boolean).join(', ') : '';
  const route = [address(trip.origen_snapshot), address(trip.destino_snapshot)].filter(Boolean).join(' → ') || 'Ruta pendiente';
  return {
    folio: trip.folio,
    client: trip.cliente,
    route,
    unit: [trip.unidad, trip.caja].filter(Boolean).join(' · ') || trip.proveedor || 'Sin asignar',
    driver: trip.operador || 'Sin asignar',
    status: statusLabels[trip.estado_operativo] || trip.estado_operativo,
    update: formatUpdate(trip.updated_at),
    eta: trip.entrega_estimada_at ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(trip.entrega_estimada_at)) : 'Pendiente',
    cargo: trip.tipo_carga || '', evidence: '', amount: '',
  };
}

/** @param {TripRow[]} rows @param {string} query @param {string} status */
export function filterTrips(rows, query, status) {
  const term = query.trim().toLocaleLowerCase('es-MX');
  return rows.filter(row => (!term || `${row.folio} ${row.client} ${row.route} ${row.unit} ${row.driver} ${row.cargo}`.toLocaleLowerCase('es-MX').includes(term))
    && (status === 'Todos' || status === 'Todos los estados' || row.status === status));
}

function formatUpdate(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (!Number.isFinite(minutes)) return 'Sin fecha';
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (minutes < 1440) return `Hace ${Math.floor(minutes / 60)} h`;
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
