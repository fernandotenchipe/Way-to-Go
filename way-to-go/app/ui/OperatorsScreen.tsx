'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDownTrayIcon, PencilSquareIcon, PlusIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { logisticsApi, type LogisticsOperator, type LogisticsOperatorDetail, type LogisticsOperatorInput } from '../services/logistics-api';
import { operatorCartaPorteReady, operatorLicenseStatus } from '../services/operator-status';
import { addDemoOperatorDocument, getDemoOperator, getDemoOperatorDocument, getDemoOperatorProviders, listDemoOperators, saveDemoOperator, setDemoOperatorActive } from '../services/logistics-demo-operators';
import { tripStatusLabels } from '../services/trip-record';
import { CatalogPageHeader, CatalogSearch, CatalogTable, LogisticsFormField as Field, LogisticsFormSection as Section, logisticsFieldClassName as field } from './LogisticsCatalogComponents';

const card = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const primary = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183a64] disabled:opacity-50';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const tabs = ['Datos generales', 'Carta Porte', 'Licencia y documentos', 'Viajes', 'Historial'] as const;
const demoMode = process.env.NODE_ENV === 'development';
type Tab = typeof tabs[number];
type Provider = { id: string; razon_social: string; activo?: boolean };
const date = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Pendiente';
const timestamp = (value: string) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(value));
const route = (trip: { origen_snapshot: Record<string, unknown> | null; destino_snapshot: Record<string, unknown> | null }) => `${trip.origen_snapshot?.nombre || 'Origen pendiente'} → ${trip.destino_snapshot?.nombre || 'Destino pendiente'}`;
function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'green' | 'red' }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone === 'green' ? 'bg-emerald-50 text-emerald-800' : tone === 'red' ? 'bg-rose-50 text-rose-800' : tone === 'amber' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{children}</span>;
}
function Info({ label, value }: { label: string; value?: string | null }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm text-slate-800">{value || 'Pendiente'}</dd></div>; }

function OperatorEditor({ operator, providers, busy, error, onClose, onSave }: { operator: LogisticsOperatorDetail | null; providers: Provider[]; busy: boolean; error: string; onClose: () => void; onSave: (input: LogisticsOperatorInput) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState(operator?.tipo || 'PROPIO');
  const [foreign, setForeign] = useState(Boolean(operator?.residencia_fiscal_sat && operator.residencia_fiscal_sat !== 'MEX'));
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const address = operator?.domicilio_fiscal || {};
  return <dialog ref={dialog} onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }} className="m-auto max-h-[92vh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-950/40">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5"><div><h2 className="text-xl font-bold text-[#0b1f3b]">{operator ? 'Editar operador' : 'Agregar operador'}</h2><p className="mt-1 text-sm text-slate-500">Puedes guardar la ficha y completar los datos de Carta Porte después.</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="Cerrar formulario" className={secondary}>Cerrar</button></div>
    <form className="space-y-5 p-6" onSubmit={(event) => {
      event.preventDefault(); if (busy) return;
      const form = new FormData(event.currentTarget); const value = (key: string) => String(form.get(key) || '').trim(); const nullable = (key: string) => value(key) || null;
      const domicilio = { ...operator?.domicilio_fiscal, ...Object.fromEntries(['calle', 'numero_exterior', 'numero_interior', 'colonia', 'municipio', 'localidad', 'estado', 'codigo_postal', 'pais_sat', 'estado_sat', 'municipio_sat', 'localidad_sat', 'colonia_sat', 'referencia'].map(key => [key, nullable(`dom_${key}`)])) };
      void onSave({ nombre: value('nombre'), telefono: nullable('telefono'), email: nullable('email'), tipo: type as LogisticsOperatorInput['tipo'], proveedor_id: type === 'PROVEEDOR' ? value('proveedor_id') : null, rfc: foreign ? null : nullable('rfc')?.toUpperCase() || null, numero_licencia: nullable('numero_licencia'), licencia_vence_el: nullable('licencia_vence_el'), residencia_fiscal_sat: foreign ? nullable('residencia')?.toUpperCase() || null : 'MEX', numero_registro_tributario: foreign ? nullable('numero_registro_tributario') : null, domicilio_fiscal: domicilio });
    }}>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <fieldset disabled={busy} className="space-y-5">
        <Section title="Datos generales" description="Información de contacto y relación con el transportista.">
          <Field label="Nombre completo *"><input autoFocus name="nombre" required maxLength={180} defaultValue={operator?.nombre || ''} className={field} /></Field>
          <Field label="Modalidad *"><select value={type} onChange={e => setType(e.target.value as typeof type)} className={field}><option value="PROPIO">Propio</option><option value="PROVEEDOR">De proveedor</option></select></Field>
          {type === 'PROVEEDOR' && <Field label="Proveedor *"><select name="proveedor_id" required defaultValue={operator?.proveedor_id || ''} className={field}><option value="">Seleccionar proveedor</option>{operator?.proveedor_id && !providers.some(p => p.id === operator.proveedor_id) && <option value={operator.proveedor_id}>{operator.proveedor || 'Proveedor actual'}</option>}{providers.filter(p => p.activo !== false || p.id === operator?.proveedor_id).map(p => <option key={p.id} value={p.id}>{p.razon_social}{p.activo === false ? ' · Inactivo' : ''}</option>)}</select></Field>}
          <Field label="Teléfono"><input name="telefono" type="tel" maxLength={60} defaultValue={operator?.telefono || ''} className={field} /></Field>
          <Field label="Correo"><input name="email" type="email" maxLength={254} defaultValue={operator?.email || ''} className={field} /></Field>
        </Section>
        <Section title="Datos para Carta Porte" description="El tipo de figura será 01 · Operador. La captura de estos datos no equivale a validación fiscal.">
          <Field label="Identificación fiscal"><select value={foreign ? 'foreign' : 'national'} onChange={e => setForeign(e.target.value === 'foreign')} className={field}><option value="national">Nacional</option><option value="foreign">Extranjera</option></select></Field>
          {foreign ? <><Field label="País de residencia fiscal · clave SAT"><input name="residencia" required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" defaultValue={operator?.residencia_fiscal_sat === 'MEX' ? '' : operator?.residencia_fiscal_sat || ''} placeholder="Ej. USA" className={field} /></Field><Field label="Identificación tributaria extranjera"><input name="numero_registro_tributario" maxLength={100} defaultValue={operator?.numero_registro_tributario || ''} className={field} /></Field></> : <Field label="RFC personal"><input name="rfc" minLength={13} maxLength={13} pattern="[A-Za-zÑñ&]{4}[0-9]{6}[A-Za-z0-9]{3}" defaultValue={operator?.rfc || ''} className={field} /></Field>}
          <Field label="Número de licencia"><input name="numero_licencia" maxLength={60} defaultValue={operator?.numero_licencia || ''} className={field} /></Field>
          <Field label="Vencimiento de licencia"><input name="licencia_vence_el" type="date" defaultValue={operator?.licencia_vence_el?.slice(0, 10) || ''} className={field} /></Field>
        </Section>
        <Section title="Domicilio cuando corresponda" description="Los datos se conservan en la ficha. Las claves oficiales se cotejarán al preparar el documento.">
          {([['calle','Calle'],['numero_exterior','Número exterior'],['numero_interior','Número interior'],['colonia','Colonia'],['localidad','Localidad'],['municipio','Municipio'],['estado','Estado'],['codigo_postal','Código postal'],['pais_sat','País · clave SAT'],['estado_sat','Estado · clave SAT'],['municipio_sat','Municipio · clave SAT'],['localidad_sat','Localidad · clave SAT'],['colonia_sat','Colonia · clave SAT'],['referencia','Referencia']] as const).map(([key, label]) => <Field key={key} label={label}><input name={`dom_${key}`} maxLength={key === 'pais_sat' ? 3 : 200} defaultValue={address[key] || ''} className={field} /></Field>)}
        </Section>
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className={secondary}>Cancelar</button><button className={primary}>{busy ? 'Guardando…' : 'Guardar operador'}</button></div>
      </fieldset>
    </form>
  </dialog>;
}

export default function OperatorsScreen() {
  const [operators, setOperators] = useState<LogisticsOperator[]>([]);
  const [detail, setDetail] = useState<LogisticsOperatorDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState(''); const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [offset, setOffset] = useState(0); const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true); const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false); const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState(''); const [detailError, setDetailError] = useState(''); const [formError, setFormError] = useState(''); const [notice, setNotice] = useState('');
  const [providers, setProviders] = useState<Provider[]>([]); const [providersError, setProvidersError] = useState('');
  const [tab, setTab] = useState<Tab>('Datos generales'); const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const listVersion = useRef(0), detailVersion = useRef(0), selected = useRef('');
  const cancelList = useCallback(() => { listVersion.current += 1; }, []);
  const cancelDetail = useCallback(() => { detailVersion.current += 1; }, []);
  const detailPanel = useRef<HTMLElement>(null);
  const load = useCallback(async (from = 0) => {
    const version = ++listVersion.current; setLoading(true); setError('');
    try { const filters = { q: query, status, offset: from, limit: 50 }; const rows = demoMode ? listDemoOperators(filters) : (await logisticsApi.getOperators(filters)).data; if (version !== listVersion.current) return; setOperators(current => from ? [...current, ...rows.filter(row => !current.some(existing => existing.id === row.id))] : rows); setOffset(from + rows.length); setHasMore(rows.length === 50); }
    catch (reason) { if (version === listVersion.current) { setError(reason instanceof Error ? reason.message : 'No se pudieron consultar operadores.'); if (!from) setOperators([]); } }
    finally { if (version === listVersion.current) setLoading(false); }
  }, [query, status]);
  const open = useCallback(async (id: string) => {
    const version = ++detailVersion.current; selected.current = id; setSelectedId(id); setDetail(null); setDetailLoading(true); setDetailError('');
    try { const result = demoMode ? getDemoOperator(id) : (await logisticsApi.getOperator(id)).data; if (!result) throw new Error('Operador no encontrado.'); if (version === detailVersion.current) setDetail(result); }
    catch (reason) { if (version === detailVersion.current) setDetailError(reason instanceof Error ? reason.message : 'No se pudo cargar la ficha.'); }
    finally { if (version === detailVersion.current) setDetailLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 250); return () => { window.clearTimeout(timer); cancelList(); }; }, [load, cancelList]);
  useEffect(() => {
    let alive = true;
    if (demoMode) { setCanEdit(true); setProviders(getDemoOperatorProviders()); }
    else {
      void logisticsApi.getTripSession().then(({ data }) => { if (alive) setCanEdit(data.canEdit); }).catch(() => { if (alive) setCanEdit(false); });
      void logisticsApi.getFleetProviders().then(({ data }) => { if (alive) { setProviders(data); setProvidersError(''); } }).catch(() => { if (alive) setProvidersError('No se pudieron cargar proveedores.'); });
    }
    return () => { alive = false; cancelDetail(); };
  }, [cancelDetail]);
  async function save(input: LogisticsOperatorInput) {
    if (busy) return; setBusy(true); setFormError(''); setNotice('');
    try {
      const result = demoMode ? saveDemoOperator(editor === 'edit' ? detail?.id || null : null, input) : (editor === 'edit' && detail ? (await logisticsApi.updateOperator(detail.id, { ...input, expected_updated_at: detail.updated_at })).data : (await logisticsApi.createOperator(input)).data);
      setEditor(null); setTab('Datos generales'); await load(); await open(result.id); setNotice('Operador guardado.');
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'No se pudo guardar al operador.'); }
    finally { setBusy(false); }
  }
  async function toggleActive() {
    if (!detail || busy || !window.confirm(`${detail.activo ? 'Desactivar' : 'Reactivar'} a ${detail.nombre}? Se conservará su historial.`)) return;
    setBusy(true); setDetailError(''); setNotice('');
    try { if (demoMode) setDemoOperatorActive(detail.id, !detail.activo); else await logisticsApi.setOperatorActive(detail.id, !detail.activo, detail.updated_at); await load(); await open(detail.id); setNotice('Estado del operador actualizado.'); }
    catch (reason) { setDetailError(reason instanceof Error ? reason.message : 'No se pudo cambiar el estado.'); }
    finally { setBusy(false); }
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail || busy) return;
    const formElement = event.currentTarget, form = new FormData(formElement);
    const file = form.get('file'); if (!(file instanceof File) || !file.size || file.size > 8 * 1024 * 1024) { setDetailError('Selecciona un documento de hasta 8 MB.'); return; }
    for (const key of ['folio', 'emitido_el', 'vence_el']) if (!String(form.get(key) || '').trim()) form.delete(key);
    setBusy(true); setDetailError(''); setNotice('');
    form.set('expected_updated_at', detail.updated_at);
    try {
      if (demoMode) await addDemoOperatorDocument(detail.id, file, { tipo: String(form.get('tipo') || 'OTRO'), folio: String(form.get('folio') || '') || null, emitido_el: String(form.get('emitido_el') || '') || null, vence_el: String(form.get('vence_el') || '') || null });
      else await logisticsApi.addOperatorDocument(detail.id, form);
      formElement.reset(); await open(detail.id); await load(); setNotice('Documento adjuntado.');
    }
    catch (reason) { setDetailError(reason instanceof Error ? reason.message : 'No se pudo adjuntar el documento.'); }
    finally { setBusy(false); }
  }
  async function download(documentId: string, name: string) {
    if (!detail || busy) return; setBusy(true); setDetailError('');
    try { const blob = demoMode ? await getDemoOperatorDocument(documentId) : await logisticsApi.getOperatorDocument(detail.id, documentId); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch (reason) { setDetailError(reason instanceof Error ? reason.message : 'No se pudo abrir el documento.'); }
    finally { setBusy(false); }
  }
  const assignments = detail?.viajes.filter(trip => !['ENTREGADO', 'CANCELADO'].includes(trip.estado_operativo) && !trip.recursos_liberados_at) || [];
  const foreign = Boolean(detail?.residencia_fiscal_sat && detail.residencia_fiscal_sat !== 'MEX');
  return <div className="space-y-6 p-6 lg:p-8">
    <CatalogPageHeader eyebrow="Recursos operativos · TMS" title="Operadores" description="Administra sus datos, licencias, documentos y asignaciones." action={<button disabled={busy} className={primary} onClick={() => { setFormError(''); setEditor('new'); }}><PlusIcon className="h-4 w-4" />Agregar operador</button>} />
    {demoMode && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Modo de demostración local.</strong> Esta pantalla usa operadores ficticios y no consulta el backend ni la base. Los cambios y documentos se guardan solo en este navegador.</p>}
    {!canEdit && <p className="text-sm text-slate-500">Vista de consulta. Para guardar necesitas una sesión TMS válida con permiso para editar viajes.</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error} <button className="ml-2 underline" onClick={() => void load()}>Reintentar</button></p>}
    <section className={`${card} overflow-hidden`}>
      <div className="flex flex-wrap gap-3 p-5"><CatalogSearch value={query} onChange={setQuery} placeholder="Buscar nombre, RFC o proveedor" className="min-w-48 flex-1" /><select aria-label="Estado del operador" value={status} onChange={e => setStatus(e.target.value as typeof status)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"><option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option></select></div>
      <CatalogTable headings={['Operador', 'Modalidad', 'Licencia', 'Datos Carta Porte', 'Asignación', 'Acción']}>
        {operators.map(operator => { const license = operatorLicenseStatus(operator.licencia_vence_el), ready = operatorCartaPorteReady(operator); return <tr key={operator.id} className={operator.id === selectedId ? 'bg-blue-50/60' : 'hover:bg-slate-50/80'}><td className="px-5 py-4"><p className="font-bold text-[#0b1f3b]">{operator.nombre}</p><p className="mt-1 text-xs text-slate-500">{operator.activo ? 'Activo' : 'Inactivo'}</p></td><td className="px-5 py-4 text-slate-600">{operator.tipo === 'PROPIO' ? 'Propio' : 'De proveedor'}<p className="mt-1 text-xs text-slate-500">{operator.proveedor || 'Way to Go'}</p></td><td className="px-5 py-4"><Badge tone={license.tone}>{license.label}</Badge><p className="mt-1 text-xs text-slate-500">{date(operator.licencia_vence_el)}</p></td><td className="px-5 py-4"><Badge tone={ready ? 'green' : 'amber'}>{ready ? 'Capturados' : 'Pendientes'}</Badge></td><td className="px-5 py-4">{operator.viaje_folio ? <Link className="font-semibold text-blue-800 hover:underline" href={`/logistica/viajes/${operator.viaje_folio}`}>{operator.viaje_folio}</Link> : <span className="text-slate-500">Sin asignación</span>}</td><td className="px-5 py-4"><button disabled={busy} className="whitespace-nowrap font-semibold text-blue-800 hover:underline disabled:opacity-50" onClick={() => { setTab('Datos generales'); void open(operator.id); detailPanel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Ver ficha</button></td></tr>; })}
        {!operators.length && <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-500">{loading ? 'Consultando operadores…' : error ? 'No se pudo cargar el catálogo.' : 'No hay operadores que coincidan con la búsqueda.'}</td></tr>}
      </CatalogTable>
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3"><p className="text-xs text-slate-500" aria-live="polite">{operators.length} operadores mostrados{loading ? ' · Actualizando…' : ''}</p>{hasMore && <button className={secondary} disabled={loading} onClick={() => void load(offset)}>Cargar más</button>}</div>
    </section>
    <section ref={detailPanel} className={`${card} scroll-mt-5 overflow-hidden`} aria-label="Ficha del operador">
      {detailLoading ? <p role="status" className="p-6 text-sm text-slate-500">Cargando ficha…</p> : detail ? <>
        <header className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-800"><UserGroupIcon className="h-6 w-6" /></div><div><p className="text-xs text-slate-500">Ficha del operador</p><h2 className="text-lg font-bold text-[#0b1f3b]">{detail.nombre}</h2><p className="text-xs text-slate-500">{detail.tipo === 'PROPIO' ? 'Propio' : detail.proveedor || 'De proveedor'} · {detail.activo ? 'Activo' : 'Inactivo'}</p></div></div><div className="flex flex-wrap gap-3"><button className={secondary} disabled={!canEdit || busy} onClick={() => { setFormError(''); setEditor('edit'); }}><PencilSquareIcon className="h-4 w-4" />Editar</button><button className={secondary} disabled={!canEdit || busy || (detail.activo && Boolean(assignments.length))} onClick={() => void toggleActive()}>{detail.activo ? 'Desactivar' : 'Reactivar'}</button></div></header>
        {assignments.length > 0 && <p className="px-5 pb-3 text-xs text-slate-500">Tiene asignaciones pendientes. Cámbialas o libéralas desde Viajes antes de desactivarlo o cambiar su modalidad.</p>}
        <nav aria-label="Secciones del operador" className="flex flex-wrap gap-1 border-y border-slate-100 px-3">{tabs.map(label => <button key={label} type="button" aria-pressed={tab === label} className={`border-b-2 px-3 py-3 text-sm font-semibold ${tab === label ? 'border-[#c79d00] text-[#0b1f3b]' : 'border-transparent text-slate-500'}`} onClick={() => setTab(label)}>{label}</button>)}</nav>
        <div className="space-y-5 p-5">
          {tab === 'Datos generales' && <dl className="grid gap-5 sm:grid-cols-3"><Info label="Nombre" value={detail.nombre} /><Info label="Modalidad" value={detail.tipo === 'PROPIO' ? 'Propio' : 'De proveedor'} /><Info label="Proveedor" value={detail.proveedor || 'No aplica'} /><Info label="Teléfono" value={detail.telefono} /><Info label="Correo" value={detail.email} /><Info label="Estado" value={detail.activo ? 'Activo' : 'Inactivo'} /></dl>}
          {tab === 'Carta Porte' && <><dl className="grid gap-5 sm:grid-cols-3"><Info label="Tipo de figura" value="01 · Operador" /><Info label="Identificación fiscal" value={foreign ? 'Extranjera' : 'Nacional'} /><Info label={foreign ? 'Identificación tributaria' : 'RFC personal'} value={foreign ? detail.numero_registro_tributario : detail.rfc} /><Info label="Número de licencia" value={detail.numero_licencia} /><Info label="País de residencia fiscal" value={detail.residencia_fiscal_sat} /><Info label="Domicilio" value={Object.values(detail.domicilio_fiscal || {}).filter(Boolean).length ? ['calle', 'numero_exterior', 'colonia', 'municipio', 'estado', 'codigo_postal'].map(key => detail.domicilio_fiscal[key]).filter(Boolean).join(', ') : null} /></dl><p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{operatorCartaPorteReady(detail) ? 'Campos principales capturados.' : 'Falta completar los campos principales.'} La validación fiscal final se realiza en la Carta Porte del viaje; la vigencia de licencia se revisa por separado.</p></>}
          {tab === 'Licencia y documentos' && <><dl className="grid gap-5 sm:grid-cols-3"><Info label="Número de licencia" value={detail.numero_licencia} /><Info label="Vencimiento" value={date(detail.licencia_vence_el)} /><div><dt className="text-xs text-slate-500">Vigencia</dt><dd className="mt-1"><Badge tone={operatorLicenseStatus(detail.licencia_vence_el).tone}>{operatorLicenseStatus(detail.licencia_vence_el).label}</Badge></dd></div></dl><div className="divide-y divide-slate-100">{detail.documentos.map(document => <article key={document.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="text-sm font-semibold text-slate-700">{document.nombre_original}</p><p className="mt-1 text-xs text-slate-500">{document.tipo.replaceAll('_', ' ')} · {document.folio || 'Sin folio'} · Vence: {date(document.vence_el)} · {document.validado_at ? 'Validado' : 'Sin validar'}</p></div><button className={secondary} disabled={busy} onClick={() => void download(document.id, document.nombre_original)}><ArrowDownTrayIcon className="h-4 w-4" />Descargar</button></article>)}{!detail.documentos.length && <p className="py-4 text-sm text-slate-500">No hay documentos adjuntos.</p>}</div>{canEdit && detail.activo && <form onSubmit={upload} className="space-y-4 border-t border-slate-100 pt-5"><h3 className="text-sm font-bold text-[#0b1f3b]">Adjuntar documento</h3><fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><Field label="Tipo"><select name="tipo" className={field}><option value="LICENCIA">Licencia</option><option value="IDENTIFICACION">Identificación</option><option value="CONSTANCIA_FISCAL">Constancia fiscal</option><option value="OTRO">Otro</option></select></Field><Field label="Folio"><input name="folio" maxLength={100} defaultValue={detail.numero_licencia || ''} className={field} /></Field><Field label="Emitido el"><input name="emitido_el" type="date" className={field} /></Field><Field label="Vence el"><input name="vence_el" type="date" className={field} /></Field><Field label="PDF, JPG o PNG · máximo 8 MB"><input name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className={field} /></Field><div className="flex items-end"><button className={primary}>{busy ? 'Adjuntando…' : 'Adjuntar documento'}</button></div></fieldset><p className="text-xs text-slate-500">Las fechas del adjunto describen ese archivo. El vencimiento de la licencia del perfil se actualiza desde Editar.</p></form>}</>}
          {tab === 'Viajes' && <><p className="text-xs text-slate-500">Hasta 100 viajes recientes. Las asignaciones se administran desde Viajes.</p><CatalogTable headings={['Viaje', 'Cliente / ruta', 'Estado', 'Reserva desde']} minWidth="600px">{detail.viajes.map(trip => <tr key={trip.id}><td className="px-5 py-3"><Link href={`/logistica/viajes/${trip.folio}`} className="font-semibold text-blue-800">{trip.folio}</Link></td><td className="px-5 py-3 text-slate-600">{trip.cliente}<p className="text-xs text-slate-500">{route(trip)}</p></td><td className="px-5 py-3 text-slate-600">{tripStatusLabels[trip.estado_operativo]}</td><td className="px-5 py-3 text-slate-500">{trip.reserva_desde ? timestamp(trip.reserva_desde) : 'Pendiente'}</td></tr>)}</CatalogTable>{!detail.viajes.length && <p className="text-sm text-slate-500">No hay viajes asociados.</p>}</>}
          {tab === 'Historial' && <div className="divide-y divide-slate-100">{detail.historial.map(event => <article key={event.id} className="py-3"><p className="text-sm font-semibold text-slate-700">{({ CREAR: 'Operador registrado', EDITAR: 'Ficha editada', CAMBIAR_ESTADO: 'Estado actualizado', ADJUNTAR_DOCUMENTO: 'Documento adjuntado' } as Record<string, string>)[event.accion] || event.accion}</p><p className="mt-1 text-xs text-slate-500">{event.actor || 'Usuario TMS'} · {timestamp(event.created_at)}</p>{event.datos.nombre && <p className="mt-1 text-sm text-slate-600">{event.datos.nombre}</p>}{event.datos.despues && <p className="mt-1 text-xs text-slate-500">Campos: {Object.keys(event.datos.despues).join(', ')}</p>}</article>)}{!detail.historial.length && <p className="text-sm text-slate-500">Sin cambios registrados desde la implementación de esta ficha.</p>}</div>}
        </div>
      </> : <p className="p-6 text-sm text-slate-500">Selecciona “Ver ficha” para consultar un operador.</p>}
      {detailError && <p role="alert" className="m-5 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{detailError} <button disabled={busy} className="ml-2 underline" onClick={() => void open(selected.current)}>Recargar ficha</button></p>}
    </section>
    {editor && <>{providersError && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{providersError}</p>}<OperatorEditor key={editor === 'new' ? 'new' : detail?.id} operator={editor === 'edit' ? detail : null} providers={providers} busy={busy} error={formError || providersError} onClose={() => { if (!busy) setEditor(null); }} onSave={save} /></>}
  </div>;
}
