'use client';

import { useState } from 'react';
import {
  logisticsApi, LogisticsApiError,
  type CartaPorteDocument, type CartaPorteMerchandise, type CartaPorteMerchandiseInput,
  type LogisticsTrip, type TripCargoItem,
} from '../services/logistics-api';
import { findUnmatchedTripCargo } from '../services/carta-porte-sync';

const button = 'rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const editable = (document: CartaPorteDocument) => ['BORRADOR', 'RECHAZADO'].includes(document.cfdi.estado);
const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const decimalString = (value: string | number | null | undefined) => {
  if (value == null || value === '') return null;
  const text = String(value);
  if (!/^\d{1,14}(\.\d{1,6})?$/.test(text)) throw new Error('Usa un decimal positivo con hasta seis posiciones y sin separadores de miles.');
  return text;
};

function errorText(reason: unknown) {
  if (!(reason instanceof LogisticsApiError)) return reason instanceof Error ? reason.message : 'No se pudieron guardar las mercancías.';
  if (reason.code === 'STALE_REVISION') return 'El borrador cambió desde que abriste el editor. Recarga sus datos antes de volver a guardar.';
  if (reason.code === 'INVALID_SAT_KEY') return `La clave SAT indicada no existe o no está vigente${reason.message ? `: ${reason.message}` : '.'}`;
  if (reason.code === 'SAT_CATALOG_UNAVAILABLE' || reason.code === 'CFDI_CATALOG_UNAVAILABLE') return 'No se pudo consultar un catálogo SAT. No se guardaron los cambios.';
  if (reason.code === 'DOCUMENT_LOCKED') return 'El estado actual del documento no permite editar mercancías.';
  return reason.message;
}

export default function CartaPorteMerchandiseEditor({
  trip, document, onSaved,
}: { trip: LogisticsTrip; document: CartaPorteDocument; onSaved: (document: CartaPorteDocument) => void }) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<CartaPorteMerchandise[]>([]);
  const [editRevision, setEditRevision] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncCandidates, setSyncCandidates] = useState<TripCargoItem[]>([]);
  const [syncRevision, setSyncRevision] = useState<number | null>(null);
  const [syncTripUpdatedAt, setSyncTripUpdatedAt] = useState<string | null>(null);

  function beginEdit() {
    setError(''); setNotice(''); setDrafts(document.merchandise.map(row => ({ ...row })));
    setEditRevision(document.cfdi.revision); setEditing(true);
  }

  async function validateSatKeys(rows: Array<Partial<CartaPorteMerchandise>>, allowIncomplete = false) {
    const versionId = document.sat_version_id;
    for (const [index, row] of rows.entries()) {
      const keyMessage = (catalog: string, key: string) => `La clave “${key}” de la mercancía ${index + 1} no se encontró vigente en ${catalog}.`;
      if (row.clave_unidad_sat) {
        try {
          const unit = await logisticsApi.getCfdiCatalogKey('c_ClaveUnidad', row.clave_unidad_sat, undefined, { vigente: true });
          if (!unit.data) throw new Error(keyMessage('CFDI 4.0 · c_ClaveUnidad', row.clave_unidad_sat));
        } catch (reason) {
          if (reason instanceof LogisticsApiError && reason.code === 'CATALOG_UNAVAILABLE') throw reason;
          throw new Error(keyMessage('CFDI 4.0 · c_ClaveUnidad', row.clave_unidad_sat));
        }
      } else if (!allowIncomplete) throw new Error(`Selecciona una clave CFDI de unidad para la mercancía ${index + 1}.`);

      if (row.bienes_transp_sat) {
        if (!versionId) throw new Error('El borrador no tiene versión SAT Carta Porte 3.1 asignada; no se pueden verificar productos.');
        const result = await logisticsApi.getCartaPorteSatCatalog('c_ClaveProdServCP', versionId, row.bienes_transp_sat);
        if (!result.data.some(entry => entry.clave === row.bienes_transp_sat)) throw new Error(keyMessage('Carta Porte 3.1 · c_ClaveProdServCP', row.bienes_transp_sat));
      } else if (!allowIncomplete) throw new Error(`Captura una clave Carta Porte para la mercancía ${index + 1}.`);

      if (row.material_peligroso) {
        if (row.clave_material_peligroso_sat) {
          if (!versionId) throw new Error('Falta la versión SAT Carta Porte 3.1 para validar material peligroso.');
          const result = await logisticsApi.getCartaPorteSatCatalog('c_MaterialPeligroso', versionId, row.clave_material_peligroso_sat);
          if (!result.data.some(entry => entry.clave === row.clave_material_peligroso_sat)) throw new Error(keyMessage('Carta Porte 3.1 · c_MaterialPeligroso', row.clave_material_peligroso_sat));
        } else if (!allowIncomplete) throw new Error(`Indica la clave de material peligroso de la mercancía ${index + 1}.`);
        if (row.embalaje_sat) {
          if (!versionId) throw new Error('Falta la versión SAT Carta Porte 3.1 para validar el embalaje.');
          const result = await logisticsApi.getCartaPorteSatCatalog('c_TipoEmbalaje', versionId, row.embalaje_sat);
          if (!result.data.some(entry => entry.clave === row.embalaje_sat)) throw new Error(keyMessage('Carta Porte 3.1 · c_TipoEmbalaje', row.embalaje_sat));
        } else if (!allowIncomplete) throw new Error(`Indica el embalaje SAT de la mercancía ${index + 1}.`);
      }
    }
  }

  async function save() {
    setBusy(true); setError(''); setNotice('');
    try {
      const fresh = await logisticsApi.getCartaPorte(document.id);
      if (editRevision !== fresh.data.cfdi.revision) {
        onSaved(fresh.data); setEditRevision(fresh.data.cfdi.revision); setDrafts(fresh.data.merchandise.map(row => ({ ...row })));
        throw new Error('El borrador cambió mientras editabas. Recargué su revisión; revisa los datos y vuelve a guardar.');
      }
      if (!drafts.length) throw new Error('No hay mercancías que guardar. Para agregar, usa la sincronización controlada del viaje.');
      for (const [index, row] of drafts.entries()) {
        if (!row.descripcion?.trim()) throw new Error(`La mercancía ${index + 1} requiere descripción.`);
        if (row.cantidad == null || Number(row.cantidad) <= 0) throw new Error(`La cantidad de la mercancía ${index + 1} debe ser mayor que cero.`);
        if (!row.unidad?.trim()) throw new Error(`Indica la unidad de la mercancía ${index + 1}.`);
        if (row.peso_kg == null || Number(row.peso_kg) <= 0) throw new Error(`El peso de la mercancía ${index + 1} debe ser mayor que cero.`);
      }
      await validateSatKeys(drafts);
      const upsert: CartaPorteMerchandiseInput[] = drafts.map(row => ({
        id: row.id, posicion: row.posicion, descripcion: row.descripcion.trim(),
        cantidad: decimalString(row.cantidad), unidad: row.unidad || null, peso_kg: decimalString(row.peso_kg),
        bienes_transp_sat: row.bienes_transp_sat || null, clave_unidad_sat: row.clave_unidad_sat || null,
        material_peligroso: row.material_peligroso ?? null,
        clave_material_peligroso_sat: row.material_peligroso ? row.clave_material_peligroso_sat || null : null,
        embalaje_sat: row.material_peligroso ? row.embalaje_sat || null : null,
        descripcion_embalaje: row.material_peligroso ? row.descripcion_embalaje || null : null,
        valor_mercancia: decimalString(row.valor_mercancia), moneda_sat: row.moneda_sat || null,
        fraccion_arancelaria: row.fraccion_arancelaria || null, uuid_comercio_exterior: row.uuid_comercio_exterior || null,
      }));
      const updated = await logisticsApi.saveCartaPorteMerchandise(document.id, fresh.data.cfdi.revision, upsert);
      onSaved(updated.data); setEditing(false); setNotice('Mercancías guardadas. Se conservaron los IDs y el orden; los conceptos fiscales del CFDI no se modificaron.');
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function reviewTripCargo() {
    setBusy(true); setError(''); setNotice(''); setSyncCandidates([]);
    try {
      const [fresh, cargo] = await Promise.all([logisticsApi.getCartaPorte(document.id), logisticsApi.getTripCargo(trip.folio)]);
      if (fresh.data.cfdi.revision !== document.cfdi.revision) {
        onSaved(fresh.data); throw new Error('El borrador cambió desde que abriste esta pantalla. Se recargó; vuelve a revisar la sincronización.');
      }
      if (!cargo.data.mercancias.length) { setNotice('El viaje no tiene mercancías registradas para sincronizar.'); return; }
      const missing = findUnmatchedTripCargo(cargo.data.mercancias, fresh.data.merchandise);
      await validateSatKeys(missing.map(item => ({
        clave_unidad_sat: item.clave_unidad_sat,
        bienes_transp_sat: item.bienes_transp_sat,
        material_peligroso: item.hazmat,
        clave_material_peligroso_sat: item.clave_material_peligroso_sat,
        embalaje_sat: item.embalaje_sat,
      })), true);
      setSyncCandidates(missing); setSyncRevision(fresh.data.cfdi.revision); setSyncTripUpdatedAt(cargo.data.updated_at);
      setNotice(missing.length ? `Se encontraron ${missing.length} mercancía(s) del viaje que no tienen una coincidencia completa en Carta Porte.` : 'Todas las mercancías del viaje ya tienen una coincidencia completa en Carta Porte.');
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function addTripCargo() {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!syncCandidates.length) return;
      const [fresh, currentCargo] = await Promise.all([logisticsApi.getCartaPorte(document.id), logisticsApi.getTripCargo(trip.folio)]);
      if (syncRevision !== fresh.data.cfdi.revision) {
        onSaved(fresh.data); setSyncCandidates([]);
        throw new Error('El borrador cambió desde la revisión de sincronización. Se recargó; vuelve a revisar antes de agregar.');
      }
      if (syncTripUpdatedAt !== currentCargo.data.updated_at) {
        setSyncCandidates([]); setSyncTripUpdatedAt(null);
        throw new Error('Las mercancías del viaje cambiaron después de la comparación. Revisa la sincronización otra vez antes de agregar.');
      }
      if (syncCandidates.some(item => !(item.descripcion || item.mercancia)?.trim())) throw new Error('Hay mercancías del viaje sin descripción; complétalas en el registro operativo antes de sincronizar.');
      const lastPosition = Math.max(0, ...fresh.data.merchandise.map(row => row.posicion || 0));
      const upsert = syncCandidates.map((item, index) => ({
        posicion: lastPosition + index + 1,
        descripcion: (item.descripcion || item.mercancia)!.trim(),
        cantidad: decimalString(item.cantidad), unidad: item.unidad, peso_kg: decimalString(item.peso_kg),
        bienes_transp_sat: item.bienes_transp_sat, clave_unidad_sat: item.clave_unidad_sat,
        material_peligroso: item.hazmat ?? null,
        clave_material_peligroso_sat: item.clave_material_peligroso_sat,
        embalaje_sat: item.embalaje_sat, descripcion_embalaje: item.embalaje,
      }));
      const updated = await logisticsApi.saveCartaPorteMerchandise(document.id, fresh.data.cfdi.revision, [
        ...fresh.data.merchandise.map(row => ({
          id: row.id, posicion: row.posicion, descripcion: row.descripcion,
          cantidad: decimalString(row.cantidad), unidad: row.unidad, peso_kg: decimalString(row.peso_kg),
          bienes_transp_sat: row.bienes_transp_sat, clave_unidad_sat: row.clave_unidad_sat,
          material_peligroso: row.material_peligroso ?? null, clave_material_peligroso_sat: row.clave_material_peligroso_sat,
          embalaje_sat: row.embalaje_sat, descripcion_embalaje: row.descripcion_embalaje,
        })),
        ...upsert,
      ]);
      onSaved(updated.data); setSyncCandidates([]); setSyncTripUpdatedAt(null); setNotice(`Se agregaron ${upsert.length} mercancía(s) faltantes del viaje. Las filas previas y conceptos CFDI se conservaron.`);
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  function change<K extends keyof CartaPorteMerchandise>(id: string, field: K, value: CartaPorteMerchandise[K]) {
    setDrafts(current => current.map(row => row.id === id ? { ...row, [field]: value } : row));
  }

  const canEdit = editable(document);
  return <section className="rounded-lg border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Mercancías Carta Porte</h3><p className="mt-1 text-xs text-slate-500">Son el complemento de transporte; no son los conceptos fiscales del CFDI.</p></div>{!editing && canEdit && <button type="button" className={button} onClick={beginEdit}>Editar mercancías</button>}</div>
    {!!error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {!!notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}

    {editing ? <div className="mt-4 space-y-4">{drafts.map((row, index) => <article key={row.id} className="rounded-lg bg-slate-50 p-4">
      <p className="text-sm font-semibold">Mercancía {row.posicion || index + 1}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs">Descripción<input className={inputClass} value={row.descripcion} onChange={event => change(row.id, 'descripcion', event.target.value)} /></label>
        <label className="text-xs">Cantidad<input type="number" min="0.000001" step="any" className={inputClass} value={row.cantidad ?? ''} onChange={event => change(row.id, 'cantidad', event.target.value || null)} /></label>
        <label className="text-xs">Unidad<input className={inputClass} value={row.unidad || ''} onChange={event => change(row.id, 'unidad', event.target.value || null)} /></label>
        <label className="text-xs">Peso kg<input type="number" min="0.001" step="any" className={inputClass} value={row.peso_kg ?? ''} onChange={event => change(row.id, 'peso_kg', event.target.value || null)} /></label>
        <label className="text-xs">Clave ProdServCP<input className={inputClass} value={row.bienes_transp_sat || ''} onChange={event => change(row.id, 'bienes_transp_sat', event.target.value || null)} /></label>
        <label className="text-xs">Clave unidad CFDI<input className={inputClass} value={row.clave_unidad_sat || ''} onChange={event => change(row.id, 'clave_unidad_sat', event.target.value || null)} /></label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(row.material_peligroso)} onChange={event => setDrafts(current => current.map(item => item.id === row.id ? { ...item, material_peligroso: event.target.checked, clave_material_peligroso_sat: event.target.checked ? item.clave_material_peligroso_sat : null, embalaje_sat: event.target.checked ? item.embalaje_sat : null, descripcion_embalaje: event.target.checked ? item.descripcion_embalaje : null } : item))} />Material peligroso</label>
      {row.material_peligroso && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs">Clave material peligroso SAT<input className={inputClass} value={row.clave_material_peligroso_sat || ''} onChange={event => change(row.id, 'clave_material_peligroso_sat', event.target.value || null)} /></label><label className="text-xs">Embalaje SAT<input className={inputClass} value={row.embalaje_sat || ''} onChange={event => change(row.id, 'embalaje_sat', event.target.value || null)} /></label></div>}
    </article>)}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" disabled={busy} onClick={() => setEditing(false)}>Cancelar</button><button type="button" className={button} disabled={busy || !drafts.length} onClick={() => void save()}>{busy ? 'Validando y guardando…' : 'Guardar mercancías'}</button></div>
    </div> : <div className="mt-3 space-y-3">{document.merchandise.length ? document.merchandise.slice().sort((a,b)=>a.posicion-b.posicion).map((row,index)=><article key={row.id} className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium">{row.posicion || index+1}. {row.descripcion}</p><p className="text-slate-600">{row.cantidad ?? '—'} {row.unidad || ''} · {row.peso_kg ?? '—'} kg</p><p className="text-xs text-slate-500">ProdServCP {row.bienes_transp_sat || 'pendiente'} · Unidad CFDI {row.clave_unidad_sat || 'pendiente'}{row.material_peligroso ? ` · Material peligroso ${row.clave_material_peligroso_sat || 'pendiente'} · Embalaje ${row.embalaje_sat || 'pendiente'}` : ''}</p></article>) : <p className="text-sm text-amber-800">No hay mercancías en Carta Porte.</p>}</div>}

    {!editing && canEdit && <div className="mt-4 border-t border-slate-200 pt-4">
      <p className="text-sm font-medium">Sincronización controlada desde el viaje</p><p className="mt-1 text-xs text-slate-500">Solo se proponen filas sin coincidencia completa. La sincronización agrega filas; no reemplaza ni elimina mercancías editadas en Carta Porte.</p>
      {!syncCandidates.length ? <button type="button" className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#0b1f3b] disabled:opacity-50" disabled={busy} onClick={() => void reviewTripCargo()}>{busy ? 'Comparando con el viaje…' : 'Revisar mercancías del viaje'}</button> : <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3"><p className="text-sm font-medium">Agregar {syncCandidates.length} fila(s) a Carta Porte</p><ul className="mt-2 list-disc pl-5 text-sm">{syncCandidates.map((item,index)=><li key={`${item.id}-${index}`}>{item.descripcion || item.mercancia || 'Sin descripción'} · {item.cantidad ?? 'sin cantidad'} {item.unidad || ''} · {item.peso_kg ?? 'sin peso'} kg</li>)}</ul><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" disabled={busy} onClick={() => setSyncCandidates([])}>Cancelar</button><button type="button" className={button} disabled={busy} onClick={() => void addTripCargo()}>{busy ? 'Agregando…' : `Agregar ${syncCandidates.length} faltante(s)`}</button></div></div>}
    </div>}
    <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><strong>Conceptos fiscales CFDI:</strong> no se crean ni se modifican al sincronizar mercancías. Su edición y cálculo pertenecen a otro apartado del documento.</div>
  </section>;
}
