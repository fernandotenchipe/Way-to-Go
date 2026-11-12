'use client';

import { useState } from 'react';
import {
  logisticsApi, LogisticsApiError,
  type CartaPorteAddressResource, type CartaPorteDocument, type CartaPorteLocationInput,
  type LogisticsTrip,
} from '../services/logistics-api';
import { assignLocationOrder, moveLocation, repeatedLocationKeys, type CartaPorteLocationDraft } from '../services/carta-porte-locations';

const button = 'rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const input = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const editable = (document: CartaPorteDocument) => ['BORRADOR', 'RECHAZADO'].includes(document.cfdi.estado);
const decimalString = (value: string | number | null | undefined) => {
  if (value == null || value === '') return null;
  const text = String(value);
  if (!/^\d{1,14}(\.\d{1,2})?$/.test(text)) throw new Error('La distancia debe ser un decimal no negativo de hasta dos posiciones.');
  return text;
};
const snapshotText = (address?: Record<string, unknown> | null) => address
  ? ['calle', 'numero_exterior', 'colonia', 'localidad', 'municipio', 'estado', 'codigo_postal'].map(key => address[key]).filter(Boolean).join(', ') || 'Domicilio pendiente'
  : 'Domicilio pendiente';
const addressOptionText = (option: CartaPorteAddressResource) => [option.nombre, option.calle, option.numero_exterior, option.colonia, option.localidad, option.municipio, option.estado, option.codigo_postal].filter(Boolean).join(' · ');
const localDateTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const isoDateTime = (value: string) => value ? new Date(value).toISOString() : null;
const tripAddress = (value: Record<string, unknown> | null) => value
  ? [value.nombre, value.calle, value.numero_exterior, value.localidad, value.ciudad, value.municipio, value.estado, value.codigo_postal].filter(Boolean).join(', ') || 'Domicilio no detallado'
  : 'Sin ruta asignada';

function errorText(reason: unknown) {
  if (!(reason instanceof LogisticsApiError)) return reason instanceof Error ? reason.message : 'No se pudieron guardar las ubicaciones.';
  if (reason.code === 'STALE_REVISION') return 'El borrador cambió desde que abriste el editor. Recarga sus datos e inténtalo nuevamente.';
  if (reason.code === 'ADDRESS_OWNER') return 'La dirección seleccionada no pertenece al participante de la Carta Porte.';
  if (reason.code === 'DOCUMENT_LOCKED') return 'El estado actual del documento no permite editar ubicaciones.';
  if (reason.code === 'LOCATION_IN_USE') return 'No se puede quitar una ubicación vinculada a una distribución de mercancías. Actualiza primero esa distribución.';
  if (reason.code === 'LOCATION_TIME_ORDER') return 'Las fechas deben respetar el orden de las paradas.';
  if (reason.code === 'ORIGIN_DESTINATION_REQUIRED') return 'Conserva por lo menos un origen y un destino.';
  return reason.message;
}

export default function CartaPorteLocationsEditor({
  trip, document, onSaved,
}: { trip: LogisticsTrip; document: CartaPorteDocument; onSaved: (document: CartaPorteDocument) => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [options, setOptions] = useState<CartaPorteAddressResource[]>([]);
  const [drafts, setDrafts] = useState<CartaPorteLocationDraft[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [newType, setNewType] = useState<'Origen' | 'Destino'>('Destino');
  const [newAddressId, setNewAddressId] = useState('');
  const [editRevision, setEditRevision] = useState<number | null>(null);

  async function beginEdit() {
    setBusy(true); setError(''); setNotice('');
    try {
      const [customerResult, currentResults] = await Promise.all([
        logisticsApi.getCustomer(trip.cliente_id),
        Promise.all(document.locations.map(location => location.direccion_id
          ? logisticsApi.getCartaPorteCatalogItem<CartaPorteAddressResource>('addresses', location.direccion_id).then(result => result.data).catch(() => null)
          : Promise.resolve(null))),
      ]);
      const activeAddresses = customerResult.data.direcciones.filter(address => address.activo);
      const addressResults = await Promise.all(activeAddresses.map(address =>
        logisticsApi.getCartaPorteCatalog<CartaPorteAddressResource>('addresses', { q: address.nombre, limit: 100 })
          .then(result => result.data.filter(row => row.cliente_direccion_id === address.id))
      ));
      const catalogAddresses: CartaPorteAddressResource[] = [];
      for (let offset = 0; offset < 5000; offset += 100) {
        const page = await logisticsApi.getCartaPorteCatalog<CartaPorteAddressResource>('addresses', { limit: 100, offset });
        catalogAddresses.push(...page.data);
        if (page.data.length < 100) break;
      }
      const byId = new Map<string, CartaPorteAddressResource>();
      [...currentResults, ...addressResults.flat(), ...catalogAddresses].forEach(row => { if (row) byId.set(row.id, row); });
      const sorted = [...document.locations].sort((a, b) => a.posicion - b.posicion);
      setOptions([...byId.values()]);
      setDrafts(sorted.map((location, index) => ({
        key: location.id,
        id: location.id,
        tipo: location.tipo,
        posicion: index + 1,
        identificador_sat: location.identificador_sat,
        participante_id: location.participante_id || null,
        direccion_id: location.direccion_id || null,
        fecha_hora: location.fecha_hora || null,
        zona_horaria: location.zona_horaria || null,
        distancia_recorrida_km: location.distancia_recorrida_km ?? null,
      })));
      setRemovedIds([]);
      setNewAddressId('');
      setEditRevision(document.cfdi.revision);
      setEditing(true);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  function addLocation() {
    const address = options.find(option => option.id === newAddressId);
    if (!address?.participante_id) { setError('Selecciona una dirección de Carta Porte con participante.'); return; }
    setError('');
    setDrafts(rows => [...rows, {
      key: crypto.randomUUID(), tipo: newType, posicion: rows.length + 1, identificador_sat: '',
      participante_id: address.participante_id, direccion_id: address.id, fecha_hora: null,
      zona_horaria: address.zona_horaria || null, distancia_recorrida_km: null,
    }]);
  }

  function removeLocation(row: CartaPorteLocationDraft) {
    setDrafts(rows => rows.filter(item => item.key !== row.key));
    if (row.id) setRemovedIds(rows => rows.includes(row.id!) ? rows : [...rows, row.id!]);
  }

  function updateLocation(key: string, change: Partial<CartaPorteLocationDraft>) {
    setDrafts(rows => rows.map(row => row.key === key ? { ...row, ...change } : row));
  }

  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!editable(document)) throw new LogisticsApiError('El estado actual del documento no permite editar ubicaciones.', 'DOCUMENT_LOCKED', 409);
      const fresh = await logisticsApi.getCartaPorte(document.id);
      if (!editable(fresh.data)) throw new LogisticsApiError('El estado actual del documento no permite editar ubicaciones.', 'DOCUMENT_LOCKED', 409);
      if (editRevision !== fresh.data.cfdi.revision) {
        onSaved(fresh.data);
        setEditRevision(fresh.data.cfdi.revision);
        throw new Error('El borrador cambió mientras editabas. Recargué su revisión; confirma los cambios antes de volver a guardar.');
      }
      const ordered = assignLocationOrder(drafts);
      if (!ordered.some(row => row.tipo === 'Origen') || !ordered.some(row => row.tipo === 'Destino')) throw new Error('La ruta requiere por lo menos un origen y un destino.');
      let previousTime: number | null = null;
      const upsert: CartaPorteLocationInput[] = ordered.map((row, index) => {
        const address = options.find(option => option.id === row.direccion_id);
        if (!row.direccion_id && !row.id) throw new Error(`Selecciona una dirección para la nueva parada ${index + 1}.`);
        if (row.direccion_id && !address && !fresh.data.locations.some(item => item.id === row.id && item.direccion_id === row.direccion_id)) throw new Error(`No se encontró la dirección seleccionada para la parada ${index + 1}.`);
        const participantId = address?.participante_id || row.participante_id || null;
        if (row.direccion_id && !participantId) throw new Error(`La dirección de la parada ${index + 1} no tiene participante Carta Porte.`);
        const date = isoDateTime(String(row.fecha_hora || ''));
        if (date) {
          const time = Date.parse(date);
          if (previousTime !== null && time < previousTime) throw new Error('Las fechas deben respetar el orden de la secuencia.');
          previousTime = time;
        }
        return {
          ...(row.id ? { id: row.id } : {}), tipo: row.tipo, posicion: index + 1, identificador_sat: row.identificador_sat,
          participante_id: participantId, direccion_id: row.direccion_id || null,
          fecha_hora: date, zona_horaria: address?.zona_horaria || row.zona_horaria || null,
          distancia_recorrida_km: decimalString(row.distancia_recorrida_km),
        };
      });
      const updated = await logisticsApi.saveCartaPorteLocations(document.id, fresh.data.cfdi.revision, upsert, removedIds);
      onSaved(updated.data); setEditing(false); setNotice('Cambios guardados. Se conservaron los IDs y referencias; la ruta de Logística no se sincronizó automáticamente.');
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  const canEdit = editable(document);
  const routeStops = [...document.locations].sort((a, b) => a.posicion - b.posicion);
  const duplicateKeys = new Set(repeatedLocationKeys(drafts));
  return <section className="rounded-lg border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="text-sm font-semibold">Recorrido de Carta Porte</h3><p className="mt-1 text-xs text-slate-500">Origen: punto de salida de la mercancía. Destino: punto de llegada o entrega. Puede haber varias recolecciones y entregas.</p></div>
      {!editing && canEdit && <button type="button" className={button} disabled={busy} onClick={() => void beginEdit()}>{busy ? 'Cargando…' : 'Editar recorrido'}</button>}
    </div>
    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-950">
      <p className="font-semibold">Ruta operativa de Logística</p>
      <p className="mt-1">{tripAddress(trip.origen_snapshot)} → {tripAddress(trip.destino_snapshot)}</p>
      <p className="mt-1 text-blue-800">Esta ruta describe los extremos programados del viaje. Paradas operativas como combustible o descanso no se copian. Las ubicaciones fiscales de abajo se editan y guardan explícitamente; cambios posteriores en Logística no las sobrescriben.</p>
    </div>
    {!!error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {!!notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {!editing && <ol className="mt-3 space-y-2">{routeStops.length ? routeStops.map(location => <li key={location.id} className="rounded-lg bg-slate-50 p-3 text-sm">
      <p className="font-medium">{location.posicion}. {location.tipo === 'Origen' ? 'Origen · salida / recolección' : 'Destino · llegada / entrega'} · {location.identificador_sat}</p>
      <p className="text-slate-600">{location.participante_snapshot?.nombre || 'Participante pendiente'} · {snapshotText(location.domicilio_snapshot)}</p>
      <p className="text-xs text-slate-500">Fecha {location.fecha_hora || 'pendiente'} · zona {location.zona_horaria || 'pendiente'} · distancia recorrida {location.distancia_recorrida_km ?? 'pendiente'} km</p>
    </li>) : <li className="mt-2 text-sm text-amber-800">No hay ubicaciones fiscales guardadas. Las ubicaciones operativas del viaje no se copian automáticamente.</li>}</ol>}

    {editing && canEdit && <div className="mt-4 space-y-3">
      <p className="text-xs text-slate-600">Los movimientos y cambios quedan como borrador en pantalla hasta pulsar <strong>Guardar recorrido</strong>. Cancelar descarta los cambios locales.</p>
      {!options.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No hay domicilios Carta Porte vinculados disponibles para nuevas paradas. No se crearán ni modificarán datos maestros desde aquí.</p>}
      {!!duplicateKeys.size && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Hay paradas del mismo tipo con el mismo domicilio. Pueden representar operaciones legítimas; confirma que no sea una duplicación accidental.</p>}
      {orderedDrafts(drafts).map((row, index) => {
        const selected = options.find(option => option.id === row.direccion_id);
        return <article key={row.key} className={`rounded-lg border bg-slate-50 p-3 ${duplicateKeys.has(row.key) ? 'border-amber-300' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">Parada {index + 1} · {row.identificador_sat || 'nuevo'}</p><div className="flex gap-1">
            <button type="button" aria-label={`Mover parada ${index + 1} arriba`} className="rounded border bg-white px-2 py-1 text-xs" disabled={busy || index === 0} onClick={() => setDrafts(rows => moveLocation(rows, index, -1))}>↑</button>
            <button type="button" aria-label={`Mover parada ${index + 1} abajo`} className="rounded border bg-white px-2 py-1 text-xs" disabled={busy || index === drafts.length - 1} onClick={() => setDrafts(rows => moveLocation(rows, index, 1))}>↓</button>
            <button type="button" className="rounded border border-rose-200 bg-white px-2 py-1 text-xs text-rose-800" disabled={busy} onClick={() => removeLocation(row)}>Quitar</button>
          </div></div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs">Tipo de parada<select className={input} value={row.tipo} onChange={event => updateLocation(row.key, { tipo: event.target.value as 'Origen' | 'Destino' })}><option value="Origen">Origen · salida / recolección</option><option value="Destino">Destino · llegada / entrega</option></select></label>
            <label className="text-xs">Domicilio registrado<select className={input} value={row.direccion_id || ''} onChange={event => { const address = options.find(option => option.id === event.target.value); updateLocation(row.key, { direccion_id: event.target.value || null, participante_id: address?.participante_id || row.participante_id || null, zona_horaria: address?.zona_horaria || row.zona_horaria || null }); }}><option value="">Conservar domicilio actual</option>{options.map(option => <option key={option.id} value={option.id}>{addressOptionText(option)}</option>)}</select></label>
            <label className="text-xs">Fecha y hora local<input className={input} type="datetime-local" value={localDateTime(row.fecha_hora)} onChange={event => updateLocation(row.key, { fecha_hora: isoDateTime(event.target.value) })} />{(selected?.zona_horaria || row.zona_horaria) && <span className="mt-1 block text-slate-500">Zona horaria: {selected?.zona_horaria || row.zona_horaria}</span>}</label>
            <label className="text-xs">Distancia recorrida desde la parada anterior (km)<input className={input} inputMode="decimal" value={row.distancia_recorrida_km ?? ''} onChange={event => updateLocation(row.key, { distancia_recorrida_km: event.target.value || null })} placeholder="Pendiente" /></label>
          </div>
        </article>;
      })}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-slate-300 p-3">
        <label className="text-xs">Agregar como<select className={input} value={newType} onChange={event => setNewType(event.target.value as 'Origen' | 'Destino')}><option value="Origen">Origen · recolección</option><option value="Destino">Destino · entrega</option></select></label>
        <label className="min-w-64 flex-1 text-xs">Domicilio<select className={input} value={newAddressId} onChange={event => setNewAddressId(event.target.value)}><option value="">Selecciona un domicilio existente</option>{options.map(option => <option key={option.id} value={option.id}>{addressOptionText(option)}</option>)}</select></label>
        <button type="button" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-[#0b1f3b] disabled:opacity-50" disabled={busy || !options.length || !newAddressId} onClick={addLocation}>Agregar parada</button>
      </div>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancelar</button><button type="button" className={button} disabled={busy} onClick={() => void save()}>{busy ? 'Validando y guardando…' : 'Guardar recorrido'}</button></div>
    </div>}
  </section>;
}

function orderedDrafts(rows: CartaPorteLocationDraft[]) { return assignLocationOrder(rows); }
