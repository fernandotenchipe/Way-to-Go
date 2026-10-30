export type LogisticsTripStatus =
  | 'BORRADOR' | 'CONFIRMADO' | 'PROGRAMADO' | 'EN_CAMINO_A_CARGA' | 'LLEGO_A_CARGA' | 'EN_CARGA'
  | 'SALIO_CARGADO_EN_RUTA' | 'LLEGO_A_DESTINO' | 'EN_DESCARGA' | 'ENTREGADO' | 'CANCELADO';

export interface LogisticsTrip {
  id: string;
  folio: string;
  cliente_id: string;
  cliente: string;
  estado_operativo: LogisticsTripStatus;
  tipo_servicio_id: string | null;
  tipo_servicio: string | null;
  tipo_carga: string | null;
  cita_carga_at: string | null;
  entrega_estimada_at: string | null;
  reserva_desde?: string | null;
  salida_programada_at?: string | null;
  descarga_programada_at?: string | null;
  instrucciones?: string | null;
  origen_snapshot: Record<string, unknown> | null;
  destino_snapshot: Record<string, unknown> | null;
  unidad_id: string | null;
  unidad: string | null;
  operador_id: string | null;
  operador: string | null;
  caja_id?: string | null;
  caja?: string | null;
  proveedor_id?: string | null;
  proveedor?: string | null;
  demo_record?: LogisticsTripRecord;
  demo_evidence?: LogisticsEvidence[];
  created_at: string;
  updated_at: string;
}

export interface LogisticsResource { id: string; nombre: string; proveedor_id?: string | null }
export interface LogisticsOperator {
  id: string; nombre: string; telefono: string | null; email: string | null;
  tipo: 'PROPIO' | 'PROVEEDOR'; proveedor_id: string | null; proveedor?: string | null;
  activo: boolean; rfc: string | null; numero_licencia: string | null; licencia_vence_el: string | null;
  residencia_fiscal_sat: string | null; numero_registro_tributario: string | null;
  domicilio_fiscal: Record<string, string | null>; updated_at: string;
  documentos?: number; viaje_folio?: string | null; viaje_estado?: LogisticsTripStatus | null;
  origen_snapshot?: Record<string, unknown> | null; destino_snapshot?: Record<string, unknown> | null;
  reserva_desde?: string | null; reserva_hasta?: string | null;
}
export type LogisticsOperatorInput = Pick<LogisticsOperator, 'nombre' | 'telefono' | 'email' | 'tipo' | 'proveedor_id' | 'rfc' | 'numero_licencia' | 'licencia_vence_el' | 'residencia_fiscal_sat' | 'numero_registro_tributario' | 'domicilio_fiscal'>;
export interface LogisticsOperatorDocument { id: string; tipo: string; folio: string | null; nombre_original: string; mime_type: string; size_bytes: number; emitido_el: string | null; vence_el: string | null; created_at: string; validado_at: string | null }
export interface LogisticsOperatorDetail extends Omit<LogisticsOperator, 'documentos'> {
  documentos: LogisticsOperatorDocument[];
  viajes: Array<{ id: string; folio: string; cliente: string; estado_operativo: LogisticsTripStatus; reserva_desde: string | null; reserva_hasta: string | null; origen_snapshot: Record<string, unknown> | null; destino_snapshot: Record<string, unknown> | null; recursos_liberados_at: string | null }>;
  historial: Array<{ id: string; accion: string; actor: string | null; created_at: string; datos: { antes?: Record<string, unknown>; despues?: Record<string, unknown>; nombre?: string; tipo?: string } }>;
}
export interface LogisticsFleetInsurance { id?: string; tipo: 'RESPONSABILIDAD_CIVIL' | 'AMBIENTAL' | 'CARGA'; aseguradora: string | null; poliza: string | null; vigente_desde: string | null; vigente_hasta: string | null }
export interface LogisticsFleetUnit { id: string; numero_economico: string; placas: string | null; tipo_unidad: string; marca: string | null; modelo: string | null; anio: number | null; capacidad_kg: number | null; capacidad_pallets: number | null; hazmat: boolean; refrigerada: boolean; proveedor_id: string | null; proveedor: string | null; estatus: 'ACTIVA' | 'MANTENIMIENTO' | 'BAJA'; updated_at: string; configuracion_vehicular_sat: string | null; permiso_sict_sat: string | null; numero_permiso_sict: string | null; peso_vacio_kg: number | null; peso_bruto_permitido_t: number | null; vin: string | null; largo_m: number | null; ancho_m: number | null; alto_m: number | null; seguros: LogisticsFleetInsurance[]; ultima_llegada_at: string | null; llegada_por: string | null; bloqueo_id: string | null; bloqueada_at: string | null; bloqueo_motivo: string | null; bloqueada_por: string | null; proximo_folio: string | null; proxima_reserva_desde: string | null; proxima_reserva_hasta: string | null; vigentes: number; vencidos: number }
export type LogisticsFleetUnitInput = Pick<LogisticsFleetUnit, 'numero_economico' | 'placas' | 'tipo_unidad' | 'marca' | 'modelo' | 'anio' | 'capacidad_kg' | 'capacidad_pallets' | 'hazmat' | 'refrigerada' | 'proveedor_id' | 'configuracion_vehicular_sat' | 'permiso_sict_sat' | 'numero_permiso_sict' | 'peso_vacio_kg' | 'peso_bruto_permitido_t' | 'vin' | 'largo_m' | 'ancho_m' | 'alto_m' | 'seguros'>;
export interface LogisticsFleetBoxDocument { id: string; tipo: string; folio: string | null; emitido_el: string | null; vence_el: string | null; validado_at: string | null; nombre_original: string; mime_type: string; size_bytes: number }
export interface LogisticsFleetBox { id: string; numero_caja: string; tipo_caja: string; placas: string | null; proveedor_id: string | null; proveedor: string | null; estatus: 'ACTIVA' | 'MANTENIMIENTO' | 'BAJA'; disponibilidad: 'DISPONIBLE' | 'ASIGNADA' | 'RESERVADA' | 'NO_DISPONIBLE'; viaje_folio: string | null; reserva_desde: string | null; reserva_hasta: string | null; subtipo_remolque_sat: string | null; largo_m: number | null; ancho_m: number | null; alto_m: number | null; capacidad_kg: number | null; peso_vacio_kg: number | null; hazmat: boolean; refrigerada: boolean; documentos: number; updated_at: string }
export interface LogisticsFleetBoxDetail extends Omit<LogisticsFleetBox, 'documentos'> { documentos: LogisticsFleetBoxDocument[] }
export type LogisticsFleetBoxInput = Pick<LogisticsFleetBox, 'numero_caja' | 'tipo_caja' | 'placas' | 'proveedor_id' | 'estatus' | 'subtipo_remolque_sat' | 'largo_m' | 'ancho_m' | 'alto_m' | 'capacidad_kg' | 'peso_vacio_kg' | 'hazmat' | 'refrigerada'>;
export interface LogisticsFleetLocation { direccion: string; latitud: number; longitud: number; updated_at: string }
export interface LogisticsFleetEvent { unidad_id: string; numero_economico: string; tipo: 'VIAJE' | 'BLOQUEO'; desde: string; hasta: string | null; motivo: string | null; folio: string | null; responsable: string | null }
export interface LogisticsTripEvent { id: string; tipo: string; comentario: string | null; ocurrido_at: string; created_at?: string; registrado_por_nombre?: string; estado_nuevo?: string | null; datos?: { categoria?: string; antes?: Record<string, unknown>; despues?: Record<string, unknown> } }
export interface LogisticsTripRecord { tiempos: Record<string, string | null>; eventos: LogisticsTripEvent[]; unidades: LogisticsResource[]; operadores: LogisticsResource[]; cajas: LogisticsResource[]; proveedores: LogisticsResource[] }
export interface LogisticsEvidence { id: string; tipo_evidencia_id: string; nombre: string; estado: string; obligatoria_facturar?: boolean; entregas: Array<{ archivo_id: string; nombre: string; estado: string; created_at: string; subida_por_nombre?: string; mime_type: string }> | null }
export interface LogisticsTripSession { nombre: string; canEdit: boolean; canEditFleet: boolean; demoFleetOnly?: boolean; canEditOperators?: boolean; demoOperatorsOnly?: boolean; canAdvance: boolean; validActor: boolean }

export interface LogisticsResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  created?: boolean;
}

export interface LogisticsDashboardTrip {
  folio: string;
  estado_operativo: LogisticsTripStatus;
  cliente: string;
  unidad: string | null;
  operador: string | null;
  cita_carga_at: string | null;
  entrega_estimada_at: string | null;
  origen_snapshot: Record<string, unknown> | null;
  destino_snapshot: Record<string, unknown> | null;
  updated_at: string;
}

export interface LogisticsDashboardData {
  summary: {
    viajes_activos: number;
    en_operacion: number;
    entregados: number;
    sin_actualizacion: number;
    listos_para_facturar: number;
  };
  recent_trips: Array<LogisticsDashboardTrip | LogisticsTrip>;
}

export interface LogisticsCustomer {
  id: string;
  razon_social: string;
  nombre_comercial: string | null;
  rfc: string | null;
  uso_cfdi?: string | null;
  forma_pago?: string | null;
  metodo_pago?: string | null;
  condiciones_pago?: string | null;
  domicilio_legal_calle?: string | null;
  domicilio_legal_ciudad?: string | null;
  domicilio_legal_estado?: string | null;
  domicilio_legal_pais?: string | null;
  domicilio_legal_codigo_postal?: string | null;
  canal_registro?: string | null;
  motivo_registro?: string | null;
  servicios_acordados?: string[];
  regimen_fiscal?: string | null;
  contacto_facturacion_id?: string | null;
  activo: boolean;
  direcciones_activas?: number;
  created_at: string;
  updated_at: string;
}

export interface LogisticsAddress {
  id: string;
  cliente_id: string;
  nombre: string;
  calle: string;
  ciudad: string;
  estado: string;
  pais: string;
  codigo_postal: string | null;
  zona_horaria: string;
  horario: string | null;
  instrucciones: string | null;
  requiere_cita: boolean;
  activo: boolean;
  principal?: boolean;
  tipo_ubicacion?: string | null;
  tipo_zona?: string | null;
}

export interface LogisticsCustomerContact {
  id: string;
  cliente_id?: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  puesto: string | null;
  tipo_contacto: string | null;
  principal: boolean;
  activo: boolean;
}

export interface LogisticsCustomerAgreement {
  id: string;
  cliente_id: string;
  nombre: string;
  origen_id: string | null;
  destino_id: string | null;
  tipo_servicio_id: string | null;
  tipo_servicio?: string | null;
  tipo_unidad: string | null;
  tipo_carga: string | null;
  tarifa_base: number;
  moneda: string;
  horas_libres_carga: number | null;
  horas_libres_descarga: number | null;
  tarifa_estadia_hora: number | null;
  vigente_desde: string;
  vigente_hasta: string | null;
  condiciones: string | null;
  activo: boolean;
}

export interface LogisticsCustomerDetail extends LogisticsCustomer {
  direcciones: LogisticsAddress[];
  contactos: LogisticsCustomerContact[];
  convenios: LogisticsCustomerAgreement[];
}

export interface LogisticsServiceType {
  id: string;
  nombre: string;
  codigo?: string;
  activo: boolean;
}

export interface LogisticsCustomerCreateInput {
  razon_social: string;
  nombre_comercial?: string;
  rfc?: string;
  uso_cfdi?: string;
  forma_pago?: string;
  metodo_pago?: string;
  condiciones_pago?: string;
  domicilio_legal_calle?: string;
  domicilio_legal_ciudad?: string;
  domicilio_legal_estado?: string;
  domicilio_legal_pais?: string;
  domicilio_legal_codigo_postal?: string;
  canal_registro?: string;
  motivo_registro?: string;
  servicios_acordados?: string[];
  regimen_fiscal?: string;
  contacto_facturacion_id?: string | null;
  contactos?: Array<{ nombre: string; puesto?: string; email?: string; telefono?: string; tipo_contacto?: string; principal?: boolean; para_facturacion?: boolean }>;
  direccion?: Omit<LogisticsAddress, 'id' | 'cliente_id' | 'activo'>;
  direcciones?: LogisticsAddressInput[];
}

export type LogisticsAddressInput = Omit<LogisticsAddress, 'id' | 'cliente_id' | 'activo'>;

export interface LogisticsTripCreateInput {
  cliente_id?: string;
  origen_id?: string;
  destino_id?: string;
  cliente_nuevo?: { razon_social: string; direcciones: LogisticsAddressInput[] };
  estado_operativo: 'CONFIRMADO';
  salida_programada_at: string;
  descarga_programada_at?: string;
  tipo_servicio_id: string;
  tipo_carga: string;
  descripcion_carga: string;
  cita_carga_at: string;
  entrega_estimada_at: string;
  reserva_desde: string;
  reserva_hasta: string;
  flete_base?: number;
  moneda: string;
  instrucciones: string;
  operador_id?: string | null;
  proveedor_id?: string | null;
}

export interface CartaPorteIssuer { id: string; nombre: string; razon_social: string; rfc: string; activo: boolean }
export interface CartaPorteSummary { id: string; cfdi_id: string; estado: string; origen: string; revision: number; uuid_fiscal: string | null; created_at: string }
export interface CartaPorteDocument { id: string; viaje_id: string; cfdi_id: string; cfdi: { id: string; estado: string; origen: string; revision: number; tipo_comprobante: 'I' | 'T' }; transport?: Array<{ unidad_id: string | null; placas?: string | null; configuracion_vehicular_sat?: string | null; permiso_sict_sat?: string | null; numero_permiso_sict?: string | null }>; figures: Array<{ id?: string; tipo_figura_sat: string; operador_id?: string | null; nombre: string; rfc?: string | null; numero_licencia?: string | null; residencia_fiscal_sat?: string | null; numero_registro_tributario?: string | null; domicilio_snapshot?: Record<string, string | null> }> }

export type LogisticsCustomerUpdateInput = Partial<Omit<LogisticsCustomerCreateInput, 'direccion'>>;
export type LogisticsAddressUpdateInput = Partial<Omit<LogisticsAddress, 'id' | 'cliente_id' | 'activo'>>;

class LogisticsApi {
  private async request<T>(path: string, init: RequestInit = {}): Promise<LogisticsResponse<T>> {
    const token = typeof window === 'undefined' ? null : localStorage.getItem('auth_token');
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(`/api/logistica/${path}`, { ...init, headers, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Error de logística (${response.status})`);
    return result as LogisticsResponse<T>;
  }

  getDashboard() {
    return this.request<LogisticsDashboardData>('dashboard');
  }

  getCustomers(q = '') {
    const search = new URLSearchParams();
    if (q.trim()) search.set('q', q.trim());
    return this.request<LogisticsCustomer[]>(`customers${search.size ? `?${search}` : ''}`);
  }

  getCustomer(id: string) {
    return this.request<LogisticsCustomerDetail>(`customers/${encodeURIComponent(id)}`);
  }

  getCatalogs() {
    return this.request<{ servicios: LogisticsServiceType[]; evidencias: Array<{ id: string; nombre: string; codigo?: string }>; costos: unknown[]; extras: unknown[] }>('catalogs');
  }

  createCustomer(input: LogisticsCustomerCreateInput) {
    return this.request<LogisticsCustomer>('customers', { method: 'POST', body: JSON.stringify(input) });
  }

  addCustomerContact(id: string, input: Omit<LogisticsCustomerContact, 'id' | 'cliente_id' | 'activo'> & { email?: string | null }) {
    return this.request<LogisticsCustomerContact>(`customers/${encodeURIComponent(id)}/contacts`, { method: 'POST', body: JSON.stringify(input) });
  }

  updateCustomerContact(id: string, input: Partial<LogisticsCustomerContact>) {
    return this.request<LogisticsCustomerContact>(`contacts/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  setCustomerContactActive(id: string, activo: boolean) {
    return this.request<LogisticsCustomerContact>(`contacts/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ activo }) });
  }

  addCustomerAgreement(id: string, input: Omit<LogisticsCustomerAgreement, 'id' | 'cliente_id' | 'activo' | 'tipo_servicio'>) {
    return this.request<LogisticsCustomerAgreement>(`customers/${encodeURIComponent(id)}/agreements`, { method: 'POST', body: JSON.stringify(input) });
  }

  updateCustomerAgreement(id: string, input: Partial<LogisticsCustomerAgreement>) {
    return this.request<LogisticsCustomerAgreement>(`agreements/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  setCustomerAgreementActive(id: string, activo: boolean) {
    return this.request<LogisticsCustomerAgreement>(`agreements/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ activo }) });
  }

  updateCustomer(id: string, input: LogisticsCustomerUpdateInput) {
    return this.request<LogisticsCustomer>(`customers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  setCustomerActive(id: string, activo: boolean) {
    return this.request<LogisticsCustomer>(`customers/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ activo }) });
  }

  addCustomerAddress(id: string, input: Omit<LogisticsAddress, 'id' | 'cliente_id' | 'activo'>) {
    return this.request<LogisticsAddress>(`customers/${encodeURIComponent(id)}/addresses`, { method: 'POST', body: JSON.stringify(input) });
  }

  updateCustomerAddress(id: string, input: LogisticsAddressUpdateInput) {
    return this.request<LogisticsAddress>(`addresses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) });
  }

  setCustomerAddressActive(id: string, activo: boolean) {
    return this.request<LogisticsAddress>(`addresses/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ activo }) });
  }

  getTrips(filters: { estado?: LogisticsTripStatus; cliente_id?: string; q?: string; limit?: number; offset?: number } = {}) {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value != null && search.set(key, String(value)));
    return this.request<LogisticsTrip[]>(`trips${search.size ? `?${search}` : ''}`);
  }

  getTrip(folio: string) {
    return this.request<LogisticsTrip>(`trips/${encodeURIComponent(folio)}`);
  }

  getTripSession() { return this.request<LogisticsTripSession>('session'); }
  getCartaPorteIssuers() { return this.request<CartaPorteIssuer[]>('carta-porte/catalogs/issuers'); }
  getTripCartaPortes(folio: string) { return this.request<CartaPorteSummary[]>(`trips/${encodeURIComponent(folio)}/carta-porte`); }
  createTripCartaPorte(folio: string, input: { empresa_emisora_id: string; tipo_comprobante: 'I' | 'T' }) { return this.request<CartaPorteDocument>(`trips/${encodeURIComponent(folio)}/carta-porte`, { method: 'POST', body: JSON.stringify(input) }); }
  getCartaPorte(id: string) { return this.request<CartaPorteDocument>(`carta-porte/${encodeURIComponent(id)}`); }
  saveCartaPorteFigures(id: string, expected_revision: number, figures: CartaPorteDocument['figures']) { return this.request<CartaPorteDocument>(`carta-porte/${encodeURIComponent(id)}/figures`, { method: 'PUT', body: JSON.stringify({ expected_revision, figures: { upsert: figures, remove: [] } }) }); }
  saveCartaPorteTransport(id: string, expected_revision: number, unidad_id: string) { return this.request<CartaPorteDocument>(`carta-porte/${encodeURIComponent(id)}/transport`, { method: 'PUT', body: JSON.stringify({ expected_revision, transport: { upsert: [{ unidad_id }], remove: [] } }) }); }
  getOperators(filters: { q?: string; status?: 'all' | 'active' | 'inactive'; limit?: number; offset?: number } = {}) { const search = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])); return this.request<LogisticsOperator[]>(`operators/manage?${search}`); }
  getOperator(id: string) { return this.request<LogisticsOperatorDetail>(`operators/${encodeURIComponent(id)}`); }
  createOperator(input: LogisticsOperatorInput) { return this.request<LogisticsOperator>('operators', { method: 'POST', body: JSON.stringify(input) }); }
  updateOperator(id: string, input: LogisticsOperatorInput & { expected_updated_at: string }) { return this.request<LogisticsOperator>(`operators/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }); }
  setOperatorActive(id: string, activo: boolean, expected_updated_at: string) { return this.request<LogisticsOperator>(`operators/${encodeURIComponent(id)}/active`, { method: 'PATCH', body: JSON.stringify({ activo, expected_updated_at }) }); }
  addOperatorDocument(id: string, input: FormData) { return this.request<LogisticsOperatorDocument>(`operators/${encodeURIComponent(id)}/documents`, { method: 'POST', body: input }); }
  async getOperatorDocument(id: string, documentId: string) { const token = localStorage.getItem('auth_token'); const response = await fetch(`/api/logistica/operators/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' }); if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo descargar el documento'); } return response.blob(); }
  getFleet() { return this.request<{ units: LogisticsFleetUnit[]; location: LogisticsFleetLocation | null }>('fleet'); }
  getFleetBoxes(filters: { q?: string; status?: string; owner?: string; availability?: string } = {}) { const search = new URLSearchParams(Object.entries(filters).filter(([, v]) => v && v !== 'all')); return this.request<LogisticsFleetBox[]>(`fleet/boxes?${search}`); }
  getFleetBox(id: string) { return this.request<LogisticsFleetBoxDetail>(`fleet/boxes/${encodeURIComponent(id)}`); }
  getTrailerTypes(q = '') { return this.request<Array<{ clave: string; descripcion: string }>>(`fleet/trailer-types?q=${encodeURIComponent(q)}`); }
  saveFleetBox(input: LogisticsFleetBoxInput) { return this.request<LogisticsFleetBox>('fleet/boxes', { method: 'POST', body: JSON.stringify(input) }); }
  updateFleetBox(id: string, input: LogisticsFleetBoxInput, expected_updated_at: string) { return this.request<LogisticsFleetBox>(`fleet/boxes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...input, expected_updated_at }) }); }
  addFleetBoxDocument(id: string, form: FormData) { return this.request<LogisticsFleetBoxDocument>(`fleet/boxes/${encodeURIComponent(id)}/documents`, { method: 'POST', body: form }); }
  async getFleetBoxDocument(id: string, documentId: string) { const token = localStorage.getItem('auth_token'); const response = await fetch(`/api/logistica/fleet/boxes/${encodeURIComponent(id)}/documents/${encodeURIComponent(documentId)}/download`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' }); if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'No se pudo descargar el documento'); } return response.blob(); }
  createFleetUnit(input: { numero_economico: string; placas?: string | null; tipo_unidad: string; marca?: string | null; modelo?: string | null; anio?: number | null; capacidad_kg?: number | null; capacidad_pallets?: number | null; hazmat: boolean; refrigerada: boolean; proveedor_id?: string | null }) { return this.request<LogisticsFleetUnit>('units', { method: 'POST', body: JSON.stringify(input) }); }
  saveFleetUnit(input: LogisticsFleetUnitInput) { return this.request<LogisticsFleetUnit>('fleet/units', { method: 'POST', body: JSON.stringify(input) }); }
  updateFleetUnit(id: string, input: LogisticsFleetUnitInput, expected_updated_at: string) { return this.request<LogisticsFleetUnit>(`fleet/units/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...input, expected_updated_at }) }); }
  getFleetProviders() { return this.request<Array<{ id: string; razon_social: string; activo: boolean }>>('providers'); }
  getFleetCalendar(from: string, until: string) { const search = new URLSearchParams({ from, until }); return this.request<LogisticsFleetEvent[]>(`fleet/calendar?${search}`); }
  saveFleetLocation(input: { direccion: string; latitud: number; longitud: number }) { return this.request<LogisticsFleetLocation>('fleet/location', { method: 'PUT', body: JSON.stringify(input) }); }
  registerFleetArrival(id: string) { return this.request(`fleet/${encodeURIComponent(id)}/arrival`, { method: 'POST', body: JSON.stringify({}) }); }
  blockFleetUnit(id: string, motivo: string) { return this.request(`fleet/${encodeURIComponent(id)}/block`, { method: 'POST', body: JSON.stringify({ motivo }) }); }
  releaseFleetUnit(id: string) { return this.request(`fleet/${encodeURIComponent(id)}/release`, { method: 'POST', body: JSON.stringify({}) }); }
  getTripRecord(folio: string) { return this.request<LogisticsTripRecord>(`trips/${encodeURIComponent(folio)}/record`); }
  getTripEvidence(folio: string) { return this.request<LogisticsEvidence[]>(`trips/${encodeURIComponent(folio)}/evidence`); }
  editTripRecord(folio: string, input: { tipo_carga: string; instrucciones: string; motivo: string; updated_at: string; cita_carga_at?: string; salida_programada_at?: string; entrega_estimada_at?: string; descarga_programada_at?: string | null }) { return this.request(`trips/${encodeURIComponent(folio)}/record`, { method: 'PATCH', body: JSON.stringify(input) }); }
  addTripNote(folio: string, texto: string) { return this.request(`trips/${encodeURIComponent(folio)}/notes`, { method: 'POST', body: JSON.stringify({ texto }) }); }
  assignTrip(folio: string, input: { modalidad: string; unidad_id: string | null; operador_id: string | null; caja_id: string | null; proveedor_id: string | null; motivo: string; updated_at: string }) { return this.request(`trips/${encodeURIComponent(folio)}/assignment`, { method: 'PATCH', body: JSON.stringify(input) }); }
  async getEvidenceFile(id: string) {
    const headers = new Headers();
    const token = localStorage.getItem('auth_token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`/api/logistica/evidence/${encodeURIComponent(id)}/download`, { headers, cache: 'no-store' });
    if (!response.ok) { const body = await response.json(); throw new Error(body.error || 'No se pudo abrir el archivo'); }
    return response.blob();
  }

  createTrip(input: LogisticsTripCreateInput) {
    return this.request<LogisticsTrip>('trips', { method: 'POST', body: JSON.stringify(input) });
  }

  updateTripStatus(folio: string, estado: LogisticsTripStatus, comentario?: string, motivoCancelacion?: string, ocurridoAt?: string) {
    return this.request<LogisticsTrip>(`trips/${encodeURIComponent(folio)}/status`, {
      method: 'PATCH', body: JSON.stringify({ estado, comentario, motivo_cancelacion: motivoCancelacion, ocurrido_at: ocurridoAt }),
    });
  }

  uploadEvidence(folio: string, file: File, tipoEvidenciaId: string, observacion = '') {
    const body = new FormData();
    body.set('file', file);
    body.set('tipo_evidencia_id', tipoEvidenciaId);
    body.set('observacion', observacion);
    return this.request<Record<string, unknown>>(`trips/${encodeURIComponent(folio)}/evidence`, { method: 'POST', body });
  }
}

export const logisticsApi = new LogisticsApi();
