'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { logisticsApi, type LogisticsFleetBox, type LogisticsFleetBoxDetail, type LogisticsFleetBoxInput } from '../services/logistics-api';
import { CatalogPageHeader, CatalogSearch, CatalogTable, LogisticsFormField as Field, LogisticsFormSection as Section, logisticsFieldClassName as field } from './LogisticsCatalogComponents';

const primary = 'rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const secondary = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50';
const card = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const statusNames = { ACTIVA: 'Activo', MANTENIMIENTO: 'Mantenimiento', BAJA: 'Inactivo' };
const availabilityNames = { DISPONIBLE: 'Disponible', ASIGNADA: 'Asignado', RESERVADA: 'Reservado', NO_DISPONIBLE: 'No disponible' };
const date = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Sin fecha';
const value = (item: string | number | null | undefined) => item === null || item === undefined || item === '' ? 'Pendiente' : String(item);
type DetailTab = 'Datos generales' | 'Datos técnicos' | 'Datos para Carta Porte' | 'Documentos';
const detailTabs: DetailTab[] = ['Datos generales', 'Datos técnicos', 'Datos para Carta Porte', 'Documentos'];

function Info({ label, content }: { label: string; content: string | number | null | undefined }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-[#0b1f3b]">{value(content)}</dd></div>;
}

export default function FleetBoxesScreen({ onUnits }: { onUnits: () => void }) {
  const [boxes, setBoxes] = useState<LogisticsFleetBox[]>([]);
  const [detail, setDetail] = useState<LogisticsFleetBoxDetail | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState<DetailTab>('Datos generales');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [owner, setOwner] = useState('all');
  const [availability, setAvailability] = useState('all');
  const [providers, setProviders] = useState<Array<{ id: string; razon_social: string; activo: boolean }>>([]);
  const [satTypes, setSatTypes] = useState<Array<{ clave: string; descripcion: string }>>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [demoOnly, setDemoOnly] = useState(false);
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [formOwner, setFormOwner] = useState<'own' | 'provider'>('own');
  const [formSat, setFormSat] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await logisticsApi.getFleetBoxes({ q: query, status, owner, availability });
      setBoxes(result.data);
      setSelectedId(current => current && !result.data.some(box => box.id === current) ? '' : current);
      setDetail(current => current && !result.data.some(box => box.id === current.id) ? null : current);
      setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudieron consultar las cajas.'); }
    finally { setLoading(false); }
  }, [query, status, owner, availability]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    void Promise.all([logisticsApi.getTripSession(), logisticsApi.getFleetProviders(), logisticsApi.getTrailerTypes()])
      .then(([session, providerRows, types]) => { setCanEdit(session.data.canEditFleet); setDemoOnly(session.data.demoFleetOnly === true); setProviders(providerRows.data); setSatTypes(types.data); })
      .catch(reason => setError(reason instanceof Error ? reason.message : 'No se pudieron consultar los catálogos de Flota.'));
  }, []);
  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id); setTab('Datos generales');
    try { const result = await logisticsApi.getFleetBox(id); setDetail(result.data); setError(''); }
    catch (reason) { setSelectedId(''); setDetail(null); setError(reason instanceof Error ? reason.message : 'No se pudo abrir la ficha.'); }
  }, []);
  const refreshDetail = async (id: string) => { const result = await logisticsApi.getFleetBox(id); setDetail(result.data); };
  const satLabel = (key: string | null) => key ? satTypes.find(item => item.clave === key)?.descripcion || 'Descripción no disponible en el catálogo cargado' : null;
  const canEditDetail = canEdit && detail && (!demoOnly || detail.numero_caja.toUpperCase().startsWith('DEMO-'));

  function startEditor(mode: 'new' | 'edit') {
    setFormError(''); setFormOwner(mode === 'edit' && detail?.proveedor_id ? 'provider' : 'own');
    setFormSat(mode === 'edit' ? detail?.subtipo_remolque_sat || '' : ''); setEditor(mode);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    const get = (key: string) => String(form.get(key) || '').trim();
    const nullable = (key: string) => get(key) || null;
    const numeric = (key: string) => get(key) ? Number(get(key)) : null;
    const input: LogisticsFleetBoxInput = {
      numero_caja: get('numero_caja'), tipo_caja: get('tipo_caja'), placas: nullable('placas'),
      proveedor_id: formOwner === 'provider' ? nullable('proveedor_id') : null,
      estatus: get('estatus') as LogisticsFleetBoxInput['estatus'], subtipo_remolque_sat: formSat || null,
      capacidad_kg: numeric('capacidad_kg'), peso_vacio_kg: numeric('peso_vacio_kg'),
      largo_m: numeric('largo_m'), ancho_m: numeric('ancho_m'), alto_m: numeric('alto_m'),
      hazmat: form.get('hazmat') === 'on', refrigerada: form.get('refrigerada') === 'on',
    };
    if (formOwner === 'provider' && !input.proveedor_id) { setFormError('Selecciona un proveedor.'); return; }
    if (demoOnly && !input.numero_caja.toUpperCase().startsWith('DEMO-')) { setFormError('En modo local usa un número que comience con DEMO-.'); return; }
    setBusy(true); setFormError('');
    try {
      const result = editor === 'edit' && detail
        ? await logisticsApi.updateFleetBox(detail.id, input, detail.updated_at)
        : await logisticsApi.saveFleetBox(input);
      setEditor(null); setNotice(`Equipo ${result.data.numero_caja} guardado.`); await load(); await openDetail(result.data.id);
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : 'No se pudo guardar la ficha.'); }
    finally { setBusy(false); }
  }
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!detail || busy) return;
    const form = event.currentTarget;
    setBusy(true); setError('');
    try {
      await logisticsApi.addFleetBoxDocument(detail.id, new FormData(form));
      await refreshDetail(detail.id); setNotice('Documento adjuntado.'); form.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo adjuntar el documento.'); }
    finally { setBusy(false); }
  }
  async function download(documentId: string, name: string) {
    if (!detail) return;
    try { const blob = await logisticsApi.getFleetBoxDocument(detail.id, documentId); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo descargar el documento.'); }
  }

  return <div className="space-y-6 p-6 lg:p-8">
    <CatalogPageHeader eyebrow="Recursos operativos" title="Flota y disponibilidad" description="Administra unidades motrices, cajas y remolques para asignarlos a tus viajes." action={<button className={secondary} onClick={() => void load()}>Actualizar</button>} />
    <div className="flex gap-5 border-b border-slate-200"><button className="pb-3 text-sm text-slate-600" onClick={onUnits}>Unidades motrices</button><button className="border-b-2 border-amber-500 pb-3 text-sm font-bold text-[#0b1f3b]" aria-current="page">Cajas y remolques</button></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {demoOnly && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Modo local: puedes guardar equipos cuyo número comience con DEMO-. Los documentos requieren una sesión TMS válida.</p>}
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="font-bold text-[#0b1f3b]">Cajas y remolques</h2><p className="text-xs text-slate-500">El estado se guarda en Flota. La disponibilidad se calcula con las reservas y asignaciones de Viajes.</p></div>{canEdit && <button className={primary} onClick={() => startEditor('new')}>Agregar caja o remolque</button>}</div>
      <div className="grid gap-2 px-5 pb-4 sm:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_160px_160px_170px]"><CatalogSearch value={query} onChange={setQuery} placeholder="Buscar número, placas, tipo o proveedor" /><select aria-label="Propietario" className={field} value={owner} onChange={event => setOwner(event.target.value)}><option value="all">Propietario: todos</option><option value="own">Propios</option><option value="provider">De proveedor</option></select><select aria-label="Estado del equipo" className={field} value={status} onChange={event => setStatus(event.target.value)}><option value="all">Estado: todos</option><option value="ACTIVA">Activo</option><option value="MANTENIMIENTO">Mantenimiento</option><option value="BAJA">Inactivo</option></select><select aria-label="Disponibilidad" className={field} value={availability} onChange={event => setAvailability(event.target.value)}><option value="all">Disponibilidad: todas</option><option value="DISPONIBLE">Disponible</option><option value="ASIGNADA">Asignado</option><option value="RESERVADA">Reservado</option><option value="NO_DISPONIBLE">No disponible</option></select></div>
      <div className="hidden md:block"><CatalogTable minWidth="0" headings={['Equipo', 'Propietario', 'Estado', 'Disponibilidad', 'Acción']}>
        {boxes.map(box => <tr key={box.id} className={selectedId === box.id ? 'bg-blue-50' : ''}><td className="px-4 py-3"><strong>{box.numero_caja} · {box.tipo_caja}</strong><p className="text-xs text-slate-500">{box.placas || 'Sin placas'}</p></td><td className="px-4 py-3 text-sm">{box.proveedor || 'Propia'}</td><td className="px-4 py-3 text-sm">{statusNames[box.estatus]}</td><td className="px-4 py-3 text-sm">{availabilityNames[box.disponibilidad]}{box.viaje_folio && <p className="text-xs text-slate-500">Viaje {box.viaje_folio}</p>}</td><td className="px-4 py-3"><button className={secondary} onClick={() => void openDetail(box.id)}>Ver ficha</button></td></tr>)}
      </CatalogTable></div>
      <div className="divide-y divide-slate-100 md:hidden">{boxes.map(box => <div key={box.id} className="p-4"><strong>{box.numero_caja} · {box.tipo_caja}</strong><p className="mt-1 text-xs text-slate-500">{box.proveedor || 'Propia'} · {box.placas || 'Sin placas'}</p><p className="mt-2 text-sm">Estado: {statusNames[box.estatus]} · Disponibilidad: {availabilityNames[box.disponibilidad]}</p><button className={`${secondary} mt-3`} onClick={() => void openDetail(box.id)}>Ver ficha</button></div>)}</div>
      {!loading && !boxes.length && <p className="p-5 text-sm text-slate-500">{query || status !== 'all' || owner !== 'all' || availability !== 'all' ? 'No hay equipos que coincidan con los filtros.' : 'Aún no hay cajas o remolques registrados.'}</p>}
      {loading && <p className="p-5 text-sm text-slate-500">Consultando cajas y remolques…</p>}
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{boxes.length} equipos mostrados</p>
    </section>
    {detail && <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><p className="text-xs uppercase tracking-wider text-slate-500">Ficha de caja o remolque</p><h2 className="text-lg font-bold text-[#0b1f3b]">{detail.numero_caja} · {detail.tipo_caja}</h2><p className="text-xs text-slate-500">{detail.proveedor || 'Propia'} · Estado: {statusNames[detail.estatus]} · Disponibilidad: {availabilityNames[detail.disponibilidad]}</p></div>{canEditDetail && <button className={secondary} onClick={() => startEditor('edit')}>Editar ficha</button>}</div>
      <div className="flex gap-5 overflow-x-auto border-y border-slate-100 px-5">{detailTabs.map(item => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 py-3 text-sm ${tab === item ? 'border-amber-500 font-bold text-[#0b1f3b]' : 'border-transparent text-slate-500'}`}>{item}</button>)}</div>
      {tab === 'Datos generales' && <dl className="grid gap-5 p-5 sm:grid-cols-3"><Info label="Número" content={detail.numero_caja} /><Info label="Tipo" content={detail.tipo_caja} /><Info label="Proveedor" content={detail.proveedor || 'Flota propia'} /><Info label="Estado" content={statusNames[detail.estatus]} /><Info label="Disponibilidad" content={availabilityNames[detail.disponibilidad]} /><Info label="Viaje" content={detail.viaje_folio} /></dl>}
      {tab === 'Datos técnicos' && <dl className="grid gap-5 p-5 sm:grid-cols-3"><Info label="Capacidad (kg)" content={detail.capacidad_kg} /><Info label="Peso vacío (kg)" content={detail.peso_vacio_kg} /><Info label="Largo (m)" content={detail.largo_m} /><Info label="Ancho (m)" content={detail.ancho_m} /><Info label="Alto (m)" content={detail.alto_m} /><Info label="Refrigerada" content={detail.refrigerada ? 'Sí' : 'No'} /><Info label="Materiales peligrosos" content={detail.hazmat ? 'Sí' : 'No'} /></dl>}
      {tab === 'Datos para Carta Porte' && <div className="p-5"><dl className="grid gap-5 sm:grid-cols-3"><Info label="Placas" content={detail.placas} /><Info label="Clave SAT" content={detail.subtipo_remolque_sat} /><Info label="Descripción SAT" content={satLabel(detail.subtipo_remolque_sat)} /></dl><p className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Estos datos se reutilizan al preparar la Carta Porte dentro del viaje. La ficha conserva la clave; su descripción viene del catálogo SAT.</p></div>}
      {tab === 'Documentos' && <div className="p-5"><div className="space-y-3">{detail.documentos.map(doc => { const expired = Boolean(doc.vence_el && doc.vence_el.slice(0, 10) < new Date().toISOString().slice(0, 10)); return <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3"><div><strong className="text-sm">{doc.tipo}</strong><p className="text-xs text-slate-500">{doc.folio || 'Sin folio'} · Emitido: {date(doc.emitido_el)} · Vence: {date(doc.vence_el)}</p><p className="text-xs text-slate-500">Vigencia: {expired ? 'Vencido' : doc.vence_el ? 'Vigente' : 'Sin vencimiento'} · Validación: {doc.validado_at ? 'Validado' : 'Pendiente'}</p></div><button className={secondary} onClick={() => void download(doc.id, doc.nombre_original)}>Descargar</button></div>; })}{!detail.documentos.length && <p className="text-sm text-slate-500">Sin documentos adjuntos.</p>}</div>
        {canEdit && !demoOnly && <form className="mt-5 border-t border-slate-100 pt-5" onSubmit={upload}><h3 className="font-bold">Adjuntar documento</h3><div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Tipo *"><select name="tipo" required className={field}><option value="TARJETA_CIRCULACION">Tarjeta de circulación</option><option value="CONSTANCIA">Constancia</option><option value="OTRO">Otro</option></select></Field><Field label="Folio"><input name="folio" className={field} maxLength={100} /></Field><Field label="Archivo *"><input name="file" type="file" required accept="application/pdf,image/jpeg,image/png" className={field} /></Field><Field label="Emitido el"><input name="emitido_el" type="date" className={field} /></Field><Field label="Vence el"><input name="vence_el" type="date" className={field} /></Field></div><button disabled={busy} className={`${primary} mt-4`}>Adjuntar documento</button></form>}
      </div>}
    </section>}
    {editor && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3"><section role="dialog" aria-modal="true" aria-label={editor === 'new' ? 'Agregar caja o remolque' : 'Editar caja o remolque'} className="max-h-[95vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white p-5"><div><h2 className="text-xl font-bold text-[#0b1f3b]">{editor === 'new' ? 'Agregar caja o remolque' : `Editar ${detail?.numero_caja}`}</h2><p className="text-xs text-slate-500">* Obligatorio para guardar. Completa los demás datos cuando estén disponibles.</p></div><button className={secondary} disabled={busy} onClick={() => setEditor(null)}>Cerrar</button></div>
      <form key={`${editor}-${detail?.id || 'new'}`} onSubmit={save} className="space-y-5 p-5">
        {formError && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{formError}</p>}
        <Section title="Información general" description="Identifica el equipo y su propietario."><Field label="Número de caja o remolque *"><input name="numero_caja" required maxLength={80} defaultValue={editor === 'edit' ? detail?.numero_caja : ''} className={field} /></Field><Field label="Tipo de caja o remolque *"><input name="tipo_caja" required maxLength={100} defaultValue={editor === 'edit' ? detail?.tipo_caja : ''} className={field} /></Field><Field label="Modalidad"><select value={formOwner} onChange={event => setFormOwner(event.target.value as 'own' | 'provider')} className={field}><option value="own">Propia</option><option value="provider">De proveedor</option></select></Field>{formOwner === 'provider' && <Field label="Proveedor *"><select name="proveedor_id" required defaultValue={editor === 'edit' ? detail?.proveedor_id || '' : ''} className={field}><option value="">Seleccionar</option>{providers.filter(provider => provider.activo || provider.id === detail?.proveedor_id).map(provider => <option key={provider.id} value={provider.id}>{provider.razon_social}</option>)}</select></Field>}<Field label="Estado del equipo"><select name="estatus" defaultValue={editor === 'edit' ? detail?.estatus : 'ACTIVA'} className={field}><option value="ACTIVA">Activo</option><option value="MANTENIMIENTO">Mantenimiento</option><option value="BAJA">Inactivo</option></select></Field><Field label="Disponibilidad"><input readOnly value={editor === 'edit' ? availabilityNames[detail?.disponibilidad || 'DISPONIBLE'] : 'Se calcula con Viajes'} className={field} /></Field></Section>
        <Section title="Datos técnicos" description="Características del equipo independiente."><Field label="Capacidad (kg)"><input name="capacidad_kg" type="number" min="0.001" step="0.001" defaultValue={editor === 'edit' ? detail?.capacidad_kg ?? '' : ''} className={field} /></Field><Field label="Peso vacío (kg)"><input name="peso_vacio_kg" type="number" min="0" step="0.001" defaultValue={editor === 'edit' ? detail?.peso_vacio_kg ?? '' : ''} className={field} /></Field><Field label="Largo (m)"><input name="largo_m" type="number" min="0.001" step="0.001" defaultValue={editor === 'edit' ? detail?.largo_m ?? '' : ''} className={field} /></Field><Field label="Ancho (m)"><input name="ancho_m" type="number" min="0.001" step="0.001" defaultValue={editor === 'edit' ? detail?.ancho_m ?? '' : ''} className={field} /></Field><Field label="Alto (m)"><input name="alto_m" type="number" min="0.001" step="0.001" defaultValue={editor === 'edit' ? detail?.alto_m ?? '' : ''} className={field} /></Field><label className="flex items-center gap-2 text-sm"><input name="refrigerada" type="checkbox" defaultChecked={editor === 'edit' ? detail?.refrigerada : false} /> Refrigerada</label><label className="flex items-center gap-2 text-sm"><input name="hazmat" type="checkbox" defaultChecked={editor === 'edit' ? detail?.hazmat : false} /> Habilitada para materiales peligrosos</label></Section>
        <Section title="Datos para Carta Porte" description="Se reutilizan cuando el equipo se asigna a un viaje."><Field label="Placas"><input name="placas" maxLength={30} defaultValue={editor === 'edit' ? detail?.placas || '' : ''} className={field} /></Field><Field label="Subtipo de remolque · catálogo SAT"><select value={formSat} onChange={event => setFormSat(event.target.value)} className={field}><option value="">Pendiente de selección</option>{formSat && !satTypes.some(item => item.clave === formSat) && <option value={formSat}>{formSat} · descripción no disponible</option>}{satTypes.map(item => <option key={item.clave} value={item.clave}>{item.clave} · {item.descripcion}</option>)}</select></Field><p className="text-xs text-slate-500 sm:col-span-2">{satTypes.length ? 'Selecciona clave y descripción del catálogo SAT cargado.' : 'Aún no hay claves de subtipo de remolque cargadas en el catálogo SAT. Puedes guardar la ficha y completarla después.'}</p></Section>
        <Section title="Documentos" description="Se adjuntan desde la pestaña Documentos de la ficha, después de guardar el equipo."><p className="text-sm text-slate-600 sm:col-span-2">Tipo, folio, archivo, emisión y vencimiento se registran por documento. Su vigencia y validación se muestran en la ficha.</p></Section>
        <div className="flex justify-end gap-2"><button type="button" className={secondary} onClick={() => setEditor(null)}>Cancelar</button><button disabled={busy} className={primary}>{busy ? 'Guardando…' : 'Guardar ficha'}</button></div>
      </form></section></div>}
  </div>;
}
