'use client';

import { useState } from 'react';
import {
  logisticsApi, LogisticsApiError,
  type CartaPorteAddressResource, type CartaPorteDocument, type CartaPorteLocationInput,
  type LogisticsAddress, type LogisticsTrip,
} from '../services/logistics-api';

const button = 'rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const editable = (document: CartaPorteDocument) => ['BORRADOR', 'RECHAZADO'].includes(document.cfdi.estado);
const decimalString = (value: string | number | null | undefined) => {
  if (value == null || value === '') return null;
  const text = String(value);
  if (!/^\d{1,14}(\.\d{1,6})?$/.test(text)) throw new Error('La distancia debe ser un decimal válido de hasta seis posiciones.');
  return text;
};
const addressText = (address: LogisticsAddress) => [address.calle, address.numero_exterior, address.colonia, address.localidad, address.ciudad, address.estado, address.codigo_postal].filter(Boolean).join(', ');
const snapshotText = (address?: Record<string, unknown> | null) => address
  ? ['calle', 'numero_exterior', 'colonia', 'localidad', 'municipio', 'estado', 'codigo_postal'].map(key => address[key]).filter(Boolean).join(', ') || 'Domicilio pendiente'
  : 'Domicilio pendiente';

function errorText(reason: unknown) {
  if (!(reason instanceof LogisticsApiError)) return reason instanceof Error ? reason.message : 'No se pudieron guardar las ubicaciones.';
  if (reason.code === 'STALE_REVISION') return 'El borrador cambió desde que abriste el editor. Recarga sus datos e inténtalo nuevamente.';
  if (reason.code === 'ADDRESS_OWNER') return 'La dirección seleccionada no pertenece al cliente de la Carta Porte.';
  if (reason.code === 'DOCUMENT_LOCKED') return 'El estado actual del documento no permite editar ubicaciones.';
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
  const [addresses, setAddresses] = useState<LogisticsAddress[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
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
      const byId = new Map<string, CartaPorteAddressResource>();
      [...currentResults, ...addressResults.flat()].forEach(row => { if (row) byId.set(row.id, row); });
      const selectedByLocation: Record<string, string> = {};
      document.locations.forEach(location => {
        if (location.direccion_id && byId.has(location.direccion_id)) selectedByLocation[location.id] = location.direccion_id;
      });
      setAddresses(activeAddresses);
      setOptions([...byId.values()]);
      setSelected(selectedByLocation);
      setEditRevision(document.cfdi.revision);
      setEditing(true);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
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
        throw new Error('El borrador cambió mientras editabas. Recargué la revisión actual; verifica las selecciones y vuelve a guardar.');
      }
      const upsert: CartaPorteLocationInput[] = fresh.data.locations.map(location => {
        const selectedAddressId = selected[location.id] || location.direccion_id || '';
        const address = options.find(option => option.id === selectedAddressId);
        if (selected[location.id] && !address) throw new Error(`No se encontró el domicilio seleccionado para ${location.tipo}.`);
        if (address && !address.participante_id) throw new Error(`El domicilio de ${location.tipo} no tiene participante de Carta Porte vinculado.`);
        return {
          id: location.id,
          tipo: location.tipo,
          posicion: location.posicion,
          identificador_sat: location.identificador_sat,
          participante_id: address?.participante_id || location.participante_id || null,
          direccion_id: address?.id || location.direccion_id || null,
          fecha_hora: location.fecha_hora || null,
          zona_horaria: location.zona_horaria || address?.zona_horaria || null,
          distancia_recorrida_km: decimalString(location.distancia_recorrida_km),
        };
      });
      const updated = await logisticsApi.saveCartaPorteLocations(document.id, fresh.data.cfdi.revision, upsert);
      onSaved(updated.data); setEditing(false); setNotice('Ubicaciones guardadas; se conservaron sus identificadores, posiciones, fechas y distancias.');
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  const canEdit = editable(document);
  const hasCartaPorteAddress = options.some(option => option.cliente_direccion_id && addresses.some(address => address.id === option.cliente_direccion_id));
  return <section className="rounded-lg border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Ubicaciones</h3>{!editing && canEdit && <button type="button" className={button} disabled={busy || !document.locations.length} onClick={() => void beginEdit()}>{busy ? 'Cargando domicilios…' : 'Editar ubicaciones'}</button>}</div>
    {!document.locations.length && <p className="mt-2 text-sm text-amber-800">Este borrador no tiene ubicaciones existentes para editar.</p>}
    {(!editing || !canEdit) && document.locations.length > 0 && <div className="mt-3 space-y-3">{document.locations.slice().sort((a,b)=>a.posicion-b.posicion).map(location => <article key={location.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{location.tipo} · {location.identificador_sat} · posición {location.posicion}</p><p className="text-slate-600">{location.participante_snapshot?.nombre || 'Participante pendiente'} · {snapshotText(location.domicilio_snapshot)}</p><p className="text-xs text-slate-500">Fecha {location.fecha_hora || 'pendiente'} · zona {location.zona_horaria || 'pendiente'} · distancia {location.distancia_recorrida_km ?? 'pendiente'} km</p></article>)}</div>}
    {!!error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {!!notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {editing && canEdit && <div className="mt-3 space-y-4">{document.locations.slice().sort((a,b)=>a.posicion-b.posicion).map(location => {
      const selectedId = selected[location.id] || location.direccion_id || '';
      const selectedCpAddress = options.find(option => option.id === selectedId);
      const customerAddress = addresses.find(address => address.id === selectedCpAddress?.cliente_direccion_id);
      return <div key={location.id} className="rounded-lg bg-slate-50 p-3">
        <p className="text-sm font-medium">{location.tipo} · {location.identificador_sat} · posición {location.posicion}</p>
        <p className="mt-1 text-xs text-slate-600">Fecha {location.fecha_hora || 'pendiente'} · zona {location.zona_horaria || 'pendiente'} · distancia {location.distancia_recorrida_km ?? 'pendiente'} km</p>
        <label className="mt-3 block text-sm">Domicilio registrado del cliente
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2" value={selectedId} onChange={event => setSelected(current => ({ ...current, [location.id]: event.target.value }))}>
            <option value="">Conservar domicilio actual</option>
            {options.filter(option => option.cliente_direccion_id && addresses.some(address => address.id === option.cliente_direccion_id)).map(option => {
              const address = addresses.find(item => item.id === option.cliente_direccion_id)!;
              return <option key={option.id} value={option.id}>{address.nombre} · {addressText(address)}</option>;
            })}
            {selectedCpAddress && !customerAddress && <option value={selectedCpAddress.id}>Domicilio actual de Carta Porte (sin ficha de cliente)</option>}
          </select>
        </label>
        {customerAddress && <p className="mt-1 text-xs text-slate-500">Se vinculará al domicilio QA/cliente registrado: {addressText(customerAddress)}</p>}
      </div>;
    })}
      {!addresses.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">El cliente del viaje no tiene domicilios activos disponibles. No se crearán domicilios desde este editor.</p>}
      {!!addresses.length && !hasCartaPorteAddress && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Hay domicilios activos, pero aún no tienen una referencia espejo de Carta Porte. Este editor solo selecciona referencias existentes y no crea catálogos.</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>Cancelar</button><button type="button" className={button} disabled={busy || !addresses.length} onClick={() => void save()}>{busy ? 'Guardando…' : 'Guardar ubicaciones'}</button></div>
    </div>}
  </section>;
}
