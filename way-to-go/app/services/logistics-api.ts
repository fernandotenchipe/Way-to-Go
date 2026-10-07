export type LogisticsTripStatus =
  | 'BORRADOR' | 'PROGRAMADO' | 'EN_CAMINO_A_CARGA' | 'LLEGO_A_CARGA' | 'EN_CARGA'
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
  origen_snapshot: Record<string, unknown> | null;
  destino_snapshot: Record<string, unknown> | null;
  unidad_id: string | null;
  unidad: string | null;
  operador_id: string | null;
  operador: string | null;
  created_at: string;
  updated_at: string;
}

export interface LogisticsResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

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
    return this.request<{ summary: Record<string, number>; recent_trips: LogisticsTrip[] }>('dashboard');
  }

  getTrips(filters: { estado?: LogisticsTripStatus; cliente_id?: string; q?: string; limit?: number; offset?: number } = {}) {
    const search = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value != null && search.set(key, String(value)));
    return this.request<LogisticsTrip[]>(`trips${search.size ? `?${search}` : ''}`);
  }

  createTrip(input: Record<string, unknown>) {
    return this.request<LogisticsTrip>('trips', { method: 'POST', body: JSON.stringify(input) });
  }

  updateTripStatus(folio: string, estado: LogisticsTripStatus, comentario?: string, motivoCancelacion?: string) {
    return this.request<LogisticsTrip>(`trips/${encodeURIComponent(folio)}/status`, {
      method: 'PATCH', body: JSON.stringify({ estado, comentario, motivo_cancelacion: motivoCancelacion }),
    });
  }

  uploadEvidence(folio: string, file: File, tipoEvidenciaId: string) {
    const body = new FormData();
    body.set('file', file);
    body.set('tipo_evidencia_id', tipoEvidenciaId);
    return this.request<Record<string, unknown>>(`trips/${encodeURIComponent(folio)}/evidence`, { method: 'POST', body });
  }
}

export const logisticsApi = new LogisticsApi();
