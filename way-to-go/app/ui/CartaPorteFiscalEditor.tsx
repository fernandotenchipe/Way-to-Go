'use client';

import { useMemo, useState } from 'react';
import { logisticsApi, LogisticsApiError, type CartaPorteConceptInput, type CartaPorteDocument, type CartaPorteTaxInput, type CartaPorteValidationResult } from '../services/logistics-api';
import CfdiCatalogSelect from './CfdiCatalogSelect';

const button = 'rounded-lg bg-[#0b1f3b] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50';
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none disabled:bg-slate-50';
const editable = (doc: CartaPorteDocument) => ['BORRADOR', 'RECHAZADO'].includes(doc.cfdi.estado);
type Concept = CartaPorteConceptInput & { importe?: string | number | null };
type Tax = CartaPorteTaxInput & { importe?: string | number | null };
const asText = (value: unknown) => value == null ? '' : String(value);
function localDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}
function errorMessage(reason: unknown) {
  if (!(reason instanceof LogisticsApiError)) return reason instanceof Error ? reason.message : 'No se pudo guardar.';
  if (reason.code === 'STALE_REVISION') return 'El borrador cambió en otra sesión. Recarga los datos antes de guardar.';
  if (reason.code === 'DOCUMENT_LOCKED') return 'El documento ya no está editable.';
  if (reason.code === 'TRANSFER_TAXES_NOT_ALLOWED') return 'El CFDI tipo T no admite impuestos de contraprestación.';
  if (reason.code === 'TRANSFER_CONCEPT_MISMATCH') return 'Para tipo T, agrega explícitamente conceptos que correspondan a las claves de mercancías Carta Porte.';
  return reason.message;
}
function getLatestRevision(doc: CartaPorteDocument) {
  return logisticsApi.getCartaPorte(doc.id).then(response => {
    if (response.data.cfdi.revision !== doc.cfdi.revision) throw new LogisticsApiError('El borrador cambió en otra sesión. Recarga los datos antes de guardar.', 'STALE_REVISION', 409);
    if (!editable(response.data)) throw new LogisticsApiError('El documento ya no está editable.', 'DOCUMENT_LOCKED', 409);
    return response.data.cfdi.revision;
  });
}

export default function CartaPorteFiscalEditor({ document, onSaved, readOnly = false }: {
  document: CartaPorteDocument; onSaved: (document: CartaPorteDocument) => void; readOnly?: boolean;
}) {
  const [date, setDate] = useState(() => localDateTime(document.cfdi.fecha_expedicion));
  const [currency, setCurrency] = useState(document.cfdi.moneda || '');
  const [exportation, setExportation] = useState(document.cfdi.exportacion_sat || '');
  const [cfdiUse, setCfdiUse] = useState(document.cfdi.uso_cfdi_sat || '');
  const [paymentForm, setPaymentForm] = useState(document.cfdi.forma_pago_sat || '');
  const [paymentMethod, setPaymentMethod] = useState(document.cfdi.metodo_pago_sat || '');
  const [international, setInternational] = useState(Boolean(document.transporte_internacional));
  const [concepts, setConcepts] = useState<Concept[]>(() => (document.concepts || []).map(concept => ({
    id: concept.id, posicion: concept.posicion, descripcion: concept.descripcion, identificador: concept.identificador,
    clave_producto_servicio_sat: concept.clave_producto_servicio_sat || '', clave_unidad_sat: concept.clave_unidad_sat || '',
    unidad: concept.unidad, objeto_impuesto_sat: concept.objeto_impuesto_sat || '', cantidad: asText(concept.cantidad),
    valor_unitario: asText(concept.valor_unitario), descuento: asText(concept.descuento), importe: concept.importe,
  })));
  const [taxes, setTaxes] = useState<Tax[]>(() => (document.taxes || []).map(tax => ({
    id: tax.id, concepto_id: tax.concepto_id, movimiento: tax.movimiento, impuesto_sat: tax.impuesto_sat,
    tipo_factor_sat: tax.tipo_factor_sat, base: asText(tax.base), tasa_cuota: asText(tax.tasa_cuota), importe: tax.importe,
  })));
  const [removedConcepts, setRemovedConcepts] = useState<string[]>([]);
  const [removedTaxes, setRemovedTaxes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [validation, setValidation] = useState<CartaPorteValidationResult | null>(null);
  const isEditable = !readOnly && editable(document);
  const isTransfer = document.cfdi.tipo_comprobante === 'T';
  const cargoKeys = useMemo(() => [...new Set((document.merchandise || []).map(row => row.bienes_transp_sat).filter((key): key is string => Boolean(key)))], [document.merchandise]);

  async function saveFiscal() {
    setBusy(true); setError(''); setNotice('');
    try {
      const revision = await getLatestRevision(document);
      const result = await logisticsApi.patchCartaPorte(document.id, revision, {
        invoice: {
          fecha_expedicion: date ? new Date(date).toISOString() : null,
          moneda: currency || null, exportacion_sat: exportation || null, uso_cfdi_sat: cfdiUse || null,
          ...(isTransfer ? { forma_pago_sat: null, metodo_pago_sat: null } : { forma_pago_sat: paymentForm || null, metodo_pago_sat: paymentMethod || null }),
        },
        header: { transporte_internacional: international },
      });
      onSaved(result.data); setNotice('Datos fiscales guardados.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  function addConcept() {
    setConcepts(rows => [...rows, { id: crypto.randomUUID(), posicion: rows.length + 1, descripcion: '', clave_producto_servicio_sat: '', clave_unidad_sat: '', objeto_impuesto_sat: isTransfer ? '01' : '', cantidad: '1', valor_unitario: isTransfer ? '0' : '', descuento: isTransfer ? '0' : null }]);
  }
  function updateConcept(id: string, patch: Partial<Concept>) { setConcepts(rows => rows.map(row => row.id === id ? { ...row, ...patch, importe: undefined } : row)); }
  function removeConcept(id: string) {
    setConcepts(rows => rows.filter(row => row.id !== id));
    if ((document.concepts || []).some(row => row.id === id)) setRemovedConcepts(rows => [...rows, id]);
    const tiedTaxes = taxes.filter(tax => tax.concepto_id === id);
    setTaxes(rows => rows.filter(tax => tax.concepto_id !== id));
    setRemovedTaxes(rows => [...rows, ...tiedTaxes.filter(tax => (document.taxes || []).some(saved => saved.id === tax.id)).map(tax => tax.id)]);
  }
  function addTax() {
    if (isTransfer) return;
    const id = crypto.randomUUID();
    setTaxes(rows => [...rows, { id, concepto_id: concepts[0]?.id || '', movimiento: 'TRASLADO', impuesto_sat: '', tipo_factor_sat: 'Tasa', base: '', tasa_cuota: '' }]);
  }
  function updateTax(id: string, patch: Partial<Tax>) { setTaxes(rows => rows.map(row => row.id === id ? { ...row, ...patch, importe: undefined } : row)); }

  async function saveConcepts() {
    setBusy(true); setError(''); setNotice('');
    try {
      const revision = await getLatestRevision(document);
      const conceptUpserts = concepts.map(concept => {
        const { importe: calculatedAmount, ...inputConcept } = concept;
        void calculatedAmount;
        return { ...inputConcept, cantidad: concept.cantidad.trim(), valor_unitario: isTransfer ? '0' : concept.valor_unitario.trim(),
          descuento: isTransfer ? '0' : concept.descuento || null };
      });
      const taxUpserts = isTransfer ? [] : taxes.map(tax => {
        const { importe: calculatedAmount, ...inputTax } = tax;
        void calculatedAmount;
        return { ...inputTax, base: tax.base.trim(), tasa_cuota: tax.tipo_factor_sat === 'Exento' ? null : tax.tasa_cuota || null };
      });
      const result = await logisticsApi.saveCartaPorteInvoiceItems(document.id, revision,
        { upsert: conceptUpserts, remove: removedConcepts }, { upsert: taxUpserts, remove: isTransfer ? (document.taxes || []).map(tax => tax.id) : removedTaxes });
      onSaved(result.data); setRemovedConcepts([]); setRemovedTaxes([]); setNotice('Conceptos e impuestos guardados. Los importes se calcularon en el backend.');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }

  async function validate() {
    setBusy(true); setError(''); setNotice(''); setValidation(null);
    try {
      const revision = await getLatestRevision(document);
      const result = await logisticsApi.validateCartaPorte(document.id, revision);
      setValidation(result.data);
    } catch (reason) {
      if (reason instanceof LogisticsApiError && (reason.fields.length || reason.warnings.length)) {
        setValidation({ valid: false, errors: reason.fields, structural_errors: reason.fields.filter(item => item.category === 'ESTRUCTURA'), fiscal_errors: reason.fields.filter(item => item.category === 'FISCAL'), warnings: reason.warnings, pending_fields: [], revision: document.cfdi.revision, estado: document.cfdi.estado });
      } else setError(errorMessage(reason));
    } finally { setBusy(false); }
  }

  const issueList = (title: string, items: Array<{ path?: string; code?: string; message: string }>, color: string) => items.length > 0 && <section className={`rounded-lg p-3 ${color}`}><h4 className="text-sm font-semibold">{title}</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{items.map((item, index) => <li key={`${item.path}-${item.code}-${index}`}>{item.path ? <strong>{item.path}: </strong> : null}{item.message}</li>)}</ul></section>;

  return <div className="space-y-4 rounded-lg border border-slate-200 p-4">
    <div>
      <h3 className="font-semibold">Datos fiscales del CFDI</h3>
      <p className="mt-1 text-xs text-slate-500">Tipo {document.cfdi.tipo_comprobante} · el tipo de un documento existente es fijo · revisión {document.cfdi.revision}</p>
    </div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-xs font-medium text-slate-600">Fecha de expedición<input className={`${input} mt-1`} type="datetime-local" value={date} onChange={event => setDate(event.target.value)} disabled={!isEditable}/></label>
      <CfdiCatalogSelect key={`currency-${document.cfdi.revision}-${document.cfdi.moneda}`} catalog="c_Moneda" name="carta-porte-moneda" label="Moneda" defaultValue={currency} disabled={!isEditable} onValueChange={setCurrency}/>
      <CfdiCatalogSelect key={`export-${document.cfdi.revision}-${document.cfdi.exportacion_sat}`} catalog="c_Exportacion" name="carta-porte-exportacion" label="Exportación SAT" defaultValue={exportation} disabled={!isEditable} onValueChange={setExportation}/>
      <CfdiCatalogSelect key={`use-${document.cfdi.revision}-${document.cfdi.uso_cfdi_sat}`} catalog="c_UsoCFDI" name="carta-porte-uso" label="Uso CFDI" defaultValue={cfdiUse} disabled={!isEditable} onValueChange={setCfdiUse}/>
      {!isTransfer && <>
        <CfdiCatalogSelect key={`payform-${document.cfdi.revision}-${document.cfdi.forma_pago_sat}`} catalog="c_FormaPago" name="carta-porte-forma-pago" label="Forma de pago" defaultValue={paymentForm} disabled={!isEditable} onValueChange={setPaymentForm}/>
        <CfdiCatalogSelect key={`paymethod-${document.cfdi.revision}-${document.cfdi.metodo_pago_sat}`} catalog="c_MetodoPago" name="carta-porte-metodo-pago" label="Método de pago" defaultValue={paymentMethod} disabled={!isEditable} onValueChange={setPaymentMethod}/>
      </>}
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700"><input type="checkbox" checked={international} onChange={event => setInternational(event.target.checked)} disabled={!isEditable}/> Transporte internacional</label>
    </div>
    {isEditable && <button type="button" className={button} disabled={busy} onClick={() => void saveFiscal()}>{busy ? 'Guardando…' : 'Guardar datos fiscales'}</button>}

    <section className="space-y-3 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">Conceptos fiscales CFDI</h3><p className="mt-1 text-xs text-slate-500">Independientes de las mercancías Carta Porte. No se copian automáticamente.</p></div>{isEditable && <button type="button" className={button} onClick={addConcept}>Agregar concepto</button>}</div>
      {isTransfer && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Tipo T: agrega manualmente los conceptos de traslado; deben corresponder a las claves de mercancías del complemento, llevar objeto de impuesto 01 y valores cero. Claves de mercancía del borrador: {cargoKeys.length ? cargoKeys.join(', ') : 'pendientes'}.</p>}
      {!concepts.length && <p className="text-sm text-slate-500">No hay conceptos fiscales.</p>}
      {concepts.map((concept, index) => <article key={concept.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-slate-600 sm:col-span-2">Descripción<input className={`${input} mt-1`} value={concept.descripcion} onChange={event => updateConcept(concept.id, { descripcion: event.target.value })} disabled={!isEditable}/></label>
        <label className="text-xs font-medium text-slate-600">Cantidad<input className={`${input} mt-1`} inputMode="decimal" value={concept.cantidad} onChange={event => updateConcept(concept.id, { cantidad: event.target.value })} disabled={!isEditable}/></label>
        <label className="text-xs font-medium text-slate-600">Valor unitario<input className={`${input} mt-1`} inputMode="decimal" value={isTransfer ? '0' : concept.valor_unitario} onChange={event => updateConcept(concept.id, { valor_unitario: event.target.value })} disabled={!isEditable || isTransfer}/></label>
        <label className="text-xs font-medium text-slate-600">Descuento<input className={`${input} mt-1`} inputMode="decimal" value={isTransfer ? '0' : concept.descuento || ''} onChange={event => updateConcept(concept.id, { descuento: event.target.value || null })} disabled={!isEditable || isTransfer}/></label>
        <CfdiCatalogSelect key={`prod-${document.cfdi.revision}-${concept.id}-${concept.clave_producto_servicio_sat}`} catalog={isTransfer ? 'c_ClaveProdServCP' : 'c_ClaveProdServ'} name={`concept-${concept.id}-product`} label={isTransfer ? 'Producto Carta Porte SAT' : 'Producto o servicio SAT'} defaultValue={concept.clave_producto_servicio_sat} disabled={!isEditable} onValueChange={value => updateConcept(concept.id, { clave_producto_servicio_sat: value })}/>
        <CfdiCatalogSelect key={`unit-${document.cfdi.revision}-${concept.id}-${concept.clave_unidad_sat}`} catalog="c_ClaveUnidad" name={`concept-${concept.id}-unit`} label="Unidad CFDI" defaultValue={concept.clave_unidad_sat} disabled={!isEditable} onValueChange={value => updateConcept(concept.id, { clave_unidad_sat: value })}/>
        <CfdiCatalogSelect key={`obj-${document.cfdi.revision}-${concept.id}-${concept.objeto_impuesto_sat}`} catalog="c_ObjetoImp" name={`concept-${concept.id}-tax-object`} label="Objeto de impuesto" defaultValue={isTransfer ? '01' : concept.objeto_impuesto_sat} disabled={!isEditable || isTransfer} onValueChange={value => updateConcept(concept.id, { objeto_impuesto_sat: value })}/>
        <div className="self-end text-xs text-slate-600">Importe calculado por backend: <strong>{concept.importe == null ? 'Pendiente' : concept.importe}</strong></div>
        {isEditable && <button type="button" className="self-end text-left text-xs font-semibold text-rose-700" onClick={() => removeConcept(concept.id)}>Eliminar concepto {index + 1}</button>}
      </article>)}

      {!isTransfer && <div className="space-y-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-semibold">Impuestos por concepto</h4><p className="mt-1 text-xs text-slate-500">Bases, tasas e importes se procesan en el backend; un factor Exento no lleva tasa.</p></div>{isEditable && <button type="button" className={button} disabled={!concepts.length} onClick={addTax}>Agregar impuesto</button>}</div>
        {taxes.map((tax, index) => <article key={tax.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs font-medium text-slate-600">Concepto<select className={`${input} mt-1`} value={tax.concepto_id} onChange={event => updateTax(tax.id, { concepto_id: event.target.value })} disabled={!isEditable}><option value="">Selecciona concepto</option>{concepts.map((row, rowIndex) => <option key={row.id} value={row.id}>{rowIndex + 1}. {row.descripcion || 'Sin descripción'}</option>)}</select></label>
          <label className="text-xs font-medium text-slate-600">Movimiento<select className={`${input} mt-1`} value={tax.movimiento} onChange={event => updateTax(tax.id, { movimiento: event.target.value as Tax['movimiento'] })} disabled={!isEditable}><option value="TRASLADO">Traslado</option><option value="RETENCION">Retención</option></select></label>
          <CfdiCatalogSelect key={`tax-${document.cfdi.revision}-${tax.id}-${tax.impuesto_sat}`} catalog="c_Impuesto" name={`tax-${tax.id}-type`} label="Impuesto SAT" defaultValue={tax.impuesto_sat} disabled={!isEditable} onValueChange={value => updateTax(tax.id, { impuesto_sat: value })}/>
          <CfdiCatalogSelect key={`factor-${document.cfdi.revision}-${tax.id}-${tax.tipo_factor_sat}`} catalog="c_TipoFactor" name={`tax-${tax.id}-factor`} label="Tipo factor" defaultValue={tax.tipo_factor_sat} disabled={!isEditable} onValueChange={value => updateTax(tax.id, { tipo_factor_sat: value as Tax['tipo_factor_sat'], ...(value === 'Exento' ? { tasa_cuota: null } : {}) })}/>
          <label className="text-xs font-medium text-slate-600">Base<input className={`${input} mt-1`} inputMode="decimal" value={tax.base} onChange={event => updateTax(tax.id, { base: event.target.value })} disabled={!isEditable}/></label>
          {tax.tipo_factor_sat !== 'Exento' && <label className="text-xs font-medium text-slate-600">Tasa o cuota<input className={`${input} mt-1`} inputMode="decimal" value={tax.tasa_cuota || ''} onChange={event => updateTax(tax.id, { tasa_cuota: event.target.value })} disabled={!isEditable}/></label>}
          <div className="self-end text-xs text-slate-600">Importe calculado: <strong>{tax.importe == null ? 'Pendiente' : tax.importe}</strong></div>
          {isEditable && <button type="button" className="self-end text-left text-xs font-semibold text-rose-700" onClick={() => { setTaxes(rows => rows.filter(row => row.id !== tax.id)); if ((document.taxes || []).some(row => row.id === tax.id)) setRemovedTaxes(rows => [...rows, tax.id]); }}>Eliminar impuesto {index + 1}</button>}
        </article>)}
      </div>}
      {isEditable && <button type="button" className={button} disabled={busy} onClick={() => void saveConcepts()}>{busy ? 'Guardando…' : 'Guardar conceptos e impuestos'}</button>}
      <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-5">
        {([['Subtotal', document.cfdi.subtotal], ['Descuento', document.cfdi.descuento], ['Impuestos trasladados', document.cfdi.impuestos_trasladados], ['Impuestos retenidos', document.cfdi.impuestos_retenidos], ['Total', document.cfdi.total]] as const).map(([label, value]) => <p key={label} className="text-slate-600">{label}<br/><strong className="text-slate-900">{value == null ? 'Pendiente' : value}</strong></p>)}
      </div>
    </section>

    <section className="space-y-3 border-t border-slate-100 pt-4">
      <div><h3 className="font-semibold">Validación previa</h3><p className="mt-1 text-xs text-slate-500">Simulación estructural y fiscal local. No cambia el estado, no guarda auditoría y no llama al PAC; no equivale a validar XSD con un proveedor.</p></div>
      <button type="button" className={button} disabled={busy || readOnly} onClick={() => void validate()}>{busy ? 'Validando…' : 'Consultar validación sin guardar'}</button>
      {validation && <div className="space-y-2" aria-live="polite">
        <p className={`text-sm font-semibold ${validation.valid ? 'text-emerald-800' : 'text-rose-800'}`}>{validation.valid ? 'La revisión estructural y fiscal local no encontró errores.' : 'Se encontraron elementos por corregir.'} · Documento {validation.estado} · Revisión {validation.revision}</p>
        {issueList('Errores estructurales', validation.structural_errors || [], 'bg-rose-50 text-rose-900')}
        {issueList('Errores fiscales', validation.fiscal_errors || [], 'bg-orange-50 text-orange-900')}
        {issueList('Advertencias', validation.warnings || [], 'bg-amber-50 text-amber-900')}
        {!!validation.pending_fields?.length && <section className="rounded-lg bg-slate-100 p-3 text-sm"><strong>Campos pendientes</strong><ul className="mt-1 list-disc pl-5 text-xs">{validation.pending_fields.map((field, index) => <li key={`${field}-${index}`}>{field}</li>)}</ul></section>}
      </div>}
    </section>
  </div>;
}
