import type { LogisticsOperatorDetail, LogisticsOperatorInput, LogisticsOperatorDocument, LogisticsResource, LogisticsTripStatus } from './logistics-api';

const STORAGE_KEY = 'wtg-logistics-demo-operators';
const FILE_DB = 'wtg-logistics-demo-files';
const FILE_STORE = 'operator-documents';
const now = () => new Date().toISOString();

const demoProviders = [{ id: 'demo-provider-1', razon_social: 'Transportes de Prueba, S.A. de C.V.', activo: true }];
const demoHistory = (createdAt: string) => [{ id: 'demo-history-1', accion: 'CREAR', actor: 'Modo demostración', created_at: createdAt, datos: { nombre: 'Registro de ejemplo' } }];

function seedOperators(): LogisticsOperatorDetail[] {
  const createdAt = now();
  const emptyAddress = {
    calle: 'Avenida de Prueba', numero_exterior: '100', numero_interior: null, colonia: 'Centro',
    municipio: 'Ciudad de México', localidad: null, estado: 'Ciudad de México', codigo_postal: '06000',
    pais_sat: 'MEX', estado_sat: null, municipio_sat: null, localidad_sat: null, colonia_sat: null, referencia: null,
  };
  const base = {
    telefono: '5550000100', email: 'operador.demo@example.test', activo: true, numero_licencia: 'DEMO-LIC-001',
    licencia_vence_el: '2027-10-01', domicilio_fiscal: emptyAddress, updated_at: createdAt,
    documentos: [], viajes: [] as Array<{ id: string; folio: string; cliente: string; estado_operativo: LogisticsTripStatus; reserva_desde: string | null; reserva_hasta: string | null; origen_snapshot: Record<string, unknown> | null; destino_snapshot: Record<string, unknown> | null; recursos_liberados_at: string | null }>,
    historial: demoHistory(createdAt),
  };
  return [
    { ...base, id: 'demo-operator-propio', nombre: 'Operador Demo Propio', tipo: 'PROPIO', proveedor_id: null, proveedor: null, rfc: 'DEMO900101AAA', residencia_fiscal_sat: 'MEX', numero_registro_tributario: null },
    { ...base, id: 'demo-operator-proveedor', nombre: 'Operador Demo Proveedor', tipo: 'PROVEEDOR', proveedor_id: demoProviders[0].id, proveedor: demoProviders[0].razon_social, rfc: null, residencia_fiscal_sat: 'USA', numero_registro_tributario: 'DEMO-TAX-001', numero_licencia: 'DEMO-LIC-002', licencia_vence_el: '2026-11-10' },
  ];
}

function readOperators(): LogisticsOperatorDetail[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const value: unknown = JSON.parse(saved);
      if (Array.isArray(value)) return value as LogisticsOperatorDetail[];
    }
  } catch { /* Reinitialize malformed local demo data. */ }
  const seeded = seedOperators();
  writeOperators(seeded);
  return seeded;
}

function writeOperators(rows: LogisticsOperatorDetail[]) {
  if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function getDemoOperatorProviders() { return demoProviders; }

export function getDemoOperatorResources(): LogisticsResource[] {
  return readOperators().filter((operator) => operator.activo).map((operator) => ({ id: operator.id, nombre: operator.nombre, proveedor_id: operator.proveedor_id }));
}

export function listDemoOperators(filters: { q?: string; status?: 'all' | 'active' | 'inactive'; limit?: number; offset?: number } = {}) {
  const query = filters.q?.trim().toLocaleLowerCase('es-MX') || '';
  const status = filters.status || 'all';
  const rows = readOperators().filter((row) => {
    const matchesQuery = !query || [row.nombre, row.rfc, row.proveedor].some((value) => value?.toLocaleLowerCase('es-MX').includes(query));
    return matchesQuery && (status === 'all' || row.activo === (status === 'active'));
  });
  return rows.slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 50)).map(({ viajes, historial, documentos, ...row }) => ({ ...row, documentos: documentos.length, viaje_folio: viajes[0]?.folio || null, viaje_estado: viajes[0]?.estado_operativo || null }));
}

export function getDemoOperator(id: string) { return readOperators().find((row) => row.id === id) || null; }

function providerName(id: string | null) { return demoProviders.find((provider) => provider.id === id)?.razon_social || null; }

export function saveDemoOperator(id: string | null, input: LogisticsOperatorInput) {
  const rows = readOperators();
  const timestamp = now();
  if (id) {
    const current = rows.find((row) => row.id === id);
    if (!current) throw new Error('Operador de demostración no encontrado.');
    const updated = { ...current, ...input, proveedor: input.tipo === 'PROVEEDOR' ? providerName(input.proveedor_id) : null, updated_at: timestamp,
      historial: [{ id: `demo-history-${crypto.randomUUID()}`, accion: 'EDITAR', actor: 'Modo demostración', created_at: timestamp, datos: { despues: input } }, ...current.historial] };
    writeOperators(rows.map((row) => row.id === id ? updated : row));
    return updated;
  }
  const created: LogisticsOperatorDetail = {
    ...input, id: `demo-operator-${crypto.randomUUID()}`, proveedor: input.tipo === 'PROVEEDOR' ? providerName(input.proveedor_id) : null,
    activo: true, updated_at: timestamp, documentos: [], viajes: [],
    historial: [{ id: `demo-history-${crypto.randomUUID()}`, accion: 'CREAR', actor: 'Modo demostración', created_at: timestamp, datos: { despues: input } }],
  };
  writeOperators([created, ...rows]);
  return created;
}

export function setDemoOperatorActive(id: string, activo: boolean) {
  const rows = readOperators(), timestamp = now();
  const current = rows.find((row) => row.id === id);
  if (!current) throw new Error('Operador de demostración no encontrado.');
  const updated = { ...current, activo, updated_at: timestamp,
    historial: [{ id: `demo-history-${crypto.randomUUID()}`, accion: 'CAMBIAR_ESTADO', actor: 'Modo demostración', created_at: timestamp, datos: { antes: { activo: current.activo }, despues: { activo } } }, ...current.historial] };
  writeOperators(rows.map((row) => row.id === id ? updated : row));
  return updated;
}

function openFileDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(FILE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(FILE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento local de documentos.'));
  });
}

async function storeDemoFile(id: string, file: File) {
  const db = await openFileDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(FILE_STORE, 'readwrite');
    transaction.objectStore(FILE_STORE).put(file, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('No se pudo guardar el documento en este navegador.'));
  });
  db.close();
}

export async function addDemoOperatorDocument(id: string, file: File, values: { tipo: string; folio: string | null; emitido_el: string | null; vence_el: string | null }) {
  const rows = readOperators(), index = rows.findIndex((row) => row.id === id);
  if (index < 0) throw new Error('Operador de demostración no encontrado.');
  if (!rows[index].activo) throw new Error('Reactiva al operador antes de adjuntar documentos.');
  const timestamp = now(), documentId = `demo-document-${crypto.randomUUID()}`;
  await storeDemoFile(documentId, file);
  const document: LogisticsOperatorDocument = { id: documentId, tipo: values.tipo, folio: values.folio, nombre_original: file.name, mime_type: file.type || 'application/octet-stream', size_bytes: file.size, emitido_el: values.emitido_el, vence_el: values.vence_el, created_at: timestamp, validado_at: null };
  const current = rows[index];
  rows[index] = { ...current, updated_at: timestamp, documentos: [document, ...current.documentos], historial: [{ id: `demo-history-${crypto.randomUUID()}`, accion: 'ADJUNTAR_DOCUMENTO', actor: 'Modo demostración', created_at: timestamp, datos: { nombre: file.name, tipo: values.tipo } }, ...current.historial] };
  writeOperators(rows);
  return document;
}

export async function getDemoOperatorDocument(documentId: string) {
  const db = await openFileDatabase();
  const file = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = db.transaction(FILE_STORE, 'readonly').objectStore(FILE_STORE).get(documentId);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(new Error('No se pudo leer el documento local.'));
  });
  db.close();
  if (!file) throw new Error('El archivo ya no está guardado en este navegador.');
  return file;
}
