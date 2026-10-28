'use client';

import { useCallback, useEffect, useState } from 'react';
import { logisticsApi, type CartaPorteDocument, type CartaPorteSummary, type LogisticsTrip } from '../services/logistics-api';
import { getDemoOperator } from '../services/logistics-demo-operators';

const button = 'rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const storageKey = (folio: string) => `wtg-demo-carta-porte:${folio}`;
type Issuer = { id: string; nombre: string; razon_social?: string; activo: boolean };

function localDocuments(folio: string): CartaPorteDocument[] {
  try { return JSON.parse(localStorage.getItem(storageKey(folio)) || '[]') as CartaPorteDocument[]; } catch { return []; }
}

export default function TripCartaPortePanel({ trip, demo }: { trip: LogisticsTrip; demo: boolean }) {
  const [documents, setDocuments] = useState<CartaPorteSummary[]>([]);
  const [document, setDocument] = useState<CartaPorteDocument | null>(null);
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [issuerId, setIssuerId] = useState('');
  const [invoiceType, setInvoiceType] = useState<'I' | 'T'>('I');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (demo) {
        const rows = localDocuments(trip.folio);
        setDocuments(rows.map(row => ({ id: row.id, cfdi_id: row.cfdi_id, estado: row.cfdi.estado, origen: row.cfdi.origen, revision: row.cfdi.revision, uuid_fiscal: null, created_at: new Date().toISOString() })));
        setDocument(rows[0] || null);
      } else {
        const [result, issuerResult] = await Promise.all([logisticsApi.getTripCartaPortes(trip.folio), logisticsApi.getCartaPorteIssuers()]);
        setDocuments(result.data); setIssuers(issuerResult.data.filter(row => row.activo)); setIssuerId(current => current || issuerResult.data.find(row => row.activo)?.id || '');
        const latest = result.data[0];
        setDocument(latest ? (await logisticsApi.getCartaPorte(latest.id)).data : null);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo consultar la Carta Porte del viaje.'); }
    finally { setLoading(false); }
  }, [demo, trip.folio]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function saveFigure(cp: CartaPorteDocument) {
    if (!trip.operador_id) throw new Error('Asigna primero un operador al viaje.');
    if (demo) {
      const details = localDocuments(trip.folio);
      const current = details.find(row => row.id === cp.id) || cp;
      const operator = getDemoOperator(trip.operador_id);
      const operatorName = operator?.nombre || trip.operador || 'Operador asignado al viaje';
      const figure = { id: `demo-figure-${trip.operador_id}`, tipo_figura_sat: '01', operador_id: trip.operador_id, nombre: operatorName,
        rfc: operator?.rfc || null, numero_licencia: operator?.numero_licencia || null, residencia_fiscal_sat: operator?.residencia_fiscal_sat || null,
        numero_registro_tributario: operator?.numero_registro_tributario || null, domicilio_snapshot: operator?.domicilio_fiscal || {} };
      const next = { ...current, figures: [figure] };
      localStorage.setItem(storageKey(trip.folio), JSON.stringify(details.map(row => row.id === cp.id ? next : row)));
      setDocument(next);
      setNotice('Operador vinculado a la Carta Porte en modo demostración.');
      return;
    }
    const [detail, operatorResult] = await Promise.all([logisticsApi.getCartaPorte(cp.id), logisticsApi.getOperator(trip.operador_id)]);
    const operator = operatorResult.data;
    const updated = await logisticsApi.saveCartaPorteFigures(cp.id, detail.data.cfdi.revision, [{
      tipo_figura_sat: '01', operador_id: operator.id, nombre: operator.nombre, rfc: operator.rfc,
      numero_licencia: operator.numero_licencia, residencia_fiscal_sat: operator.residencia_fiscal_sat,
      numero_registro_tributario: operator.numero_registro_tributario,
    }]);
    setDocument(updated.data);
    setDocuments(rows => rows.map(row => row.id === cp.id ? { ...row, revision: updated.data.cfdi.revision } : row));
    setNotice('Operador del viaje copiado a la figura 01 de la Carta Porte.');
  }

  async function createDraft() {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!trip.operador_id) throw new Error('Asigna primero un operador al viaje.');
      if (demo) {
        const id = `demo-cp-${crypto.randomUUID()}`;
        const cfdiId = `demo-cfdi-${crypto.randomUUID()}`;
        const created: CartaPorteDocument = { id, viaje_id: trip.id, cfdi_id: cfdiId, cfdi: { id: cfdiId, estado: 'BORRADOR', origen: 'PROPIO', revision: 1, tipo_comprobante: invoiceType }, transport: trip.unidad_id ? [{ unidad_id: trip.unidad_id }] : [], figures: [] };
        const rows = [created, ...localDocuments(trip.folio)];
        localStorage.setItem(storageKey(trip.folio), JSON.stringify(rows));
        await saveFigure(created);
        setDocuments(rows.map(row => ({ id: row.id, cfdi_id: row.cfdi_id, estado: row.cfdi.estado, origen: row.cfdi.origen, revision: row.cfdi.revision, uuid_fiscal: null, created_at: new Date().toISOString() })));
      } else {
        if (!issuerId) throw new Error('Selecciona una empresa emisora activa.');
        const created = await logisticsApi.createTripCartaPorte(trip.folio, { empresa_emisora_id: issuerId, tipo_comprobante: invoiceType });
        await saveFigure(created.data);
        await load();
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo crear el borrador.'); }
    finally { setBusy(false); }
  }

  async function syncOperator() {
    if (!document) return;
    setBusy(true); setError(''); setNotice('');
    try { await saveFigure(document); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo actualizar el operador.'); }
    finally { setBusy(false); }
  }

  async function syncUnit() {
    if (!document || !trip.unidad_id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (demo) {
        const rows = localDocuments(trip.folio);
        const next = { ...document, transport: [{ unidad_id: trip.unidad_id }] };
        localStorage.setItem(storageKey(trip.folio), JSON.stringify(rows.map(row => row.id === document.id ? next : row)));
        setDocument(next);
      } else {
        const detail = await logisticsApi.getCartaPorte(document.id);
        const updated = await logisticsApi.saveCartaPorteTransport(document.id, detail.data.cfdi.revision, trip.unidad_id);
        setDocument(updated.data);
        setDocuments(rows => rows.map(row => row.id === document.id ? { ...row, revision: updated.data.cfdi.revision } : row));
      }
      setNotice('Unidad asignada vinculada al borrador de Carta Porte.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo vincular la unidad.'); }
    finally { setBusy(false); }
  }

  const figure = document?.figures?.find(row => row.tipo_figura_sat === '01');
  const alreadyLinked = Boolean(figure && figure.operador_id === trip.operador_id);
  const transport = document?.transport?.[0];
  const unitLinked = Boolean(transport && transport.unidad_id === trip.unidad_id);
  return <section className="rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="font-bold text-[#0b1f3b]">Carta Porte del viaje</h2>
    <p className="mt-2 text-sm text-slate-600">La Carta Porte se prepara dentro de este viaje. La unidad y el operador asignados aportan sus datos reutilizables al borrador. Al completar el traslado se podrá validar y timbrar desde el flujo del viaje.</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {!trip.operador_id && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Asigna un operador en la pestaña Asignación antes de crear la Carta Porte.</p>}
    {!trip.unidad_id && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">La unidad se puede asignar después. Hazlo en Asignación antes de completar la Carta Porte.</p>}
    {loading ? <p role="status" className="mt-4 text-sm text-slate-500">Consultando documentos…</p> : <>
      {documents.length > 0 && <div className="mt-4 rounded-lg border border-slate-200 p-4"><p className="text-sm font-semibold">Borrador más reciente · {document?.cfdi.estado || documents[0].estado}</p><p className="mt-1 text-xs text-slate-500">Revisión {document?.cfdi.revision ?? documents[0].revision} · {document?.cfdi.tipo_comprobante === 'T' ? 'Traslado' : 'Ingreso'}</p>{figure ? <p className="mt-3 text-sm">Figura 01: <strong>{figure.nombre}</strong>{alreadyLinked ? ' · vinculada al operador asignado' : ' · requiere sincronización con la asignación actual'}</p> : <p className="mt-3 text-sm text-amber-800">Aún no tiene figura de operador.</p>}{!alreadyLinked && trip.operador_id && <button type="button" className={`${button} mt-4`} disabled={busy} onClick={() => void syncOperator()}>{busy ? 'Guardando…' : 'Vincular operador asignado'}</button>}</div>}
      {documents.length > 0 && trip.unidad_id && <div className="mt-3 rounded-lg border border-slate-200 p-4 text-sm"><p>Unidad asignada: <strong>{trip.unidad || trip.unidad_id}</strong>{unitLinked ? ' · vinculada al borrador' : ' · pendiente de vincular'}</p>{transport?.placas && <p className="mt-1 text-xs text-slate-500">Placas guardadas en el borrador: {transport.placas}</p>}{!unitLinked && ['BORRADOR', 'RECHAZADO'].includes(document?.cfdi.estado || '') && <button type="button" className={`${button} mt-3`} disabled={busy} onClick={() => void syncUnit()}>{busy ? 'Guardando…' : 'Vincular unidad asignada'}</button>}</div>}
      {!documents.length && <p className="mt-4 text-sm text-slate-500">Aún no hay una Carta Porte para este viaje.</p>}
      {demo ? <p className="mt-4 text-xs text-amber-800">Modo demostración: el borrador, el operador y la referencia de la unidad se guardan solo en este navegador. Los datos del vehículo se copiarán al usar el servicio real.</p> : <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">Empresa emisora<select className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" value={issuerId} onChange={event => setIssuerId(event.target.value)}><option value="">Seleccionar</option>{issuers.map(row => <option key={row.id} value={row.id}>{row.razon_social || row.nombre}</option>)}</select></label><label className="text-sm">Tipo de comprobante<select className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" value={invoiceType} onChange={event => setInvoiceType(event.target.value as 'I' | 'T')}><option value="I">Ingreso</option><option value="T">Traslado</option></select></label></div>}
      {!documents.length && <button type="button" className={`${button} mt-4`} disabled={busy || !trip.operador_id || (!demo && (!issuerId || !issuers.length))} onClick={() => void createDraft()}>{busy ? 'Creando borrador…' : 'Crear borrador de Carta Porte'}</button>}
      {documents.length > 1 && <p className="mt-3 text-xs text-slate-500">Este viaje tiene {documents.length} documentos de Carta Porte.</p>}
    </>}
  </section>;
}
