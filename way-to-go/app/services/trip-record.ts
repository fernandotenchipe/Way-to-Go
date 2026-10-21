import type { LogisticsTrip, LogisticsTripRecord, LogisticsTripStatus } from './logistics-api';
import { getDemoTrips } from './logistics-demo-trips';

export const tripStatusLabels: Record<LogisticsTripStatus, string> = { BORRADOR: 'Borrador', PROGRAMADO: 'Programado', EN_CAMINO_A_CARGA: 'En camino a carga', LLEGO_A_CARGA: 'Llegó a carga', EN_CARGA: 'En carga', SALIO_CARGADO_EN_RUTA: 'En ruta', LLEGO_A_DESTINO: 'Llegó a destino', EN_DESCARGA: 'En descarga', ENTREGADO: 'Entregado', CANCELADO: 'Cancelado' };
export const nextTripStatus: Partial<Record<LogisticsTripStatus, LogisticsTripStatus>> = { PROGRAMADO: 'EN_CAMINO_A_CARGA', EN_CAMINO_A_CARGA: 'LLEGO_A_CARGA', LLEGO_A_CARGA: 'EN_CARGA', EN_CARGA: 'SALIO_CARGADO_EN_RUTA', SALIO_CARGADO_EN_RUTA: 'LLEGO_A_DESTINO', LLEGO_A_DESTINO: 'EN_DESCARGA', EN_DESCARGA: 'ENTREGADO' };
export const tripTimeKeys: Partial<Record<LogisticsTripStatus, string>> = { LLEGO_A_CARGA: 'llegada_carga_at', EN_CARGA: 'inicio_carga_at', SALIO_CARGADO_EN_RUTA: 'salida_cargado_at', LLEGO_A_DESTINO: 'llegada_destino_at', EN_DESCARGA: 'inicio_descarga_at', ENTREGADO: 'fin_descarga_at' };

export function emptyDemoRecord(): LogisticsTripRecord {
  return { tiempos: {}, eventos: [], unidades: [{ id: 'demo-unit-12', nombre: 'DEMO · WTG-12', proveedor_id: null }, { id: 'demo-unit-09', nombre: 'DEMO · WTG-09', proveedor_id: null }], operadores: [{ id: 'demo-driver-1', nombre: 'DEMO · Luis Herrera', proveedor_id: null }], cajas: [{ id: 'demo-box-1', nombre: 'DEMO · CX-04', proveedor_id: null }], proveedores: [{ id: 'demo-provider-1', nombre: 'DEMO · Transportes del Norte' }] };
}

export function findDemoTrip(folio: string): LogisticsTrip | undefined {
  const saved = getDemoTrips().find(row => row.folio === folio);
  if (saved) return saved;
  if (!/^VJ-105[4-8]$/.test(folio)) return undefined;
  const record = emptyDemoRecord();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
  record.tiempos = { llegada_carga_at: now, inicio_carga_at: now, salida_cargado_at: now };
  record.eventos = [{ id: 'demo-initial', tipo: 'CREACION', comentario: 'Registro de ejemplo para explorar la ficha; no existe en la base.', ocurrido_at: now, registrado_por_nombre: 'Usuario demo' }];
  const location = (nombre: string, ciudad: string) => ({ nombre, ciudad, estado: ciudad === 'Apodaca' ? 'Nuevo León' : 'Coahuila', calle: 'Dirección ficticia de demostración', pais: 'MX', zona_horaria: 'America/Monterrey' });
  return { id: folio, folio, cliente_id: 'demo-client', cliente: 'DEMO · Comercializadora Norte', tipo_servicio_id: null, tipo_servicio: 'DEMO · Traslado nacional', tipo_carga: 'Autopartes · ejemplo', cita_carga_at: now, entrega_estimada_at: now, salida_programada_at: now, origen_snapshot: location('DEMO · CEDIS Apodaca', 'Apodaca'), destino_snapshot: location('DEMO · Sucursal Saltillo', 'Saltillo'), estado_operativo: 'SALIO_CARGADO_EN_RUTA', unidad_id: 'demo-unit-12', unidad: 'DEMO · WTG-12', operador_id: 'demo-driver-1', operador: 'DEMO · Luis Herrera', caja_id: 'demo-box-1', caja: 'DEMO · CX-04', created_at: now, updated_at: now, demo_record: record };
}
