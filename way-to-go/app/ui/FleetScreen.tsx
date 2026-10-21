'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { logisticsApi, type LogisticsFleetEvent, type LogisticsFleetLocation, type LogisticsFleetUnit } from '../services/logistics-api';
import { CatalogMetric, CatalogPageHeader, CatalogSearch, CatalogTable, LogisticsFormField } from './LogisticsCatalogComponents';

const card = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const primary = 'rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const subtle = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50';
const field = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800';
const dateText = (value: string | null) => value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registro';

function LocationMap({ point, onChange }: { point: { latitud: number; longitud: number }; onChange: (point: { latitud: number; longitud: number }) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<import('leaflet').Map | null>(null);
  const marker = useRef<import('leaflet').Marker | null>(null);
  const initialPoint = useRef(point);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    let alive = true;
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([L]) => {
      if (!alive || !element.current || map.current) return;
      map.current = L.map(element.current).setView([initialPoint.current.latitud, initialPoint.current.longitud], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map.current);
      map.current.on('click', (event: { latlng: { lat: number; lng: number } }) => onChangeRef.current({ latitud: Number(event.latlng.lat.toFixed(6)), longitud: Number(event.latlng.lng.toFixed(6)) }));
      marker.current = L.marker([initialPoint.current.latitud, initialPoint.current.longitud], { draggable: true }).addTo(map.current);
      marker.current.on('dragend', (event: { target: { getLatLng: () => { lat: number; lng: number } } }) => { const pos = event.target.getLatLng(); onChangeRef.current({ latitud: Number(pos.lat.toFixed(6)), longitud: Number(pos.lng.toFixed(6)) }); });
    });
    return () => { alive = false; map.current?.remove(); map.current = null; marker.current = null; };
  }, []);
  useEffect(() => { if (!map.current || !marker.current) return; marker.current.setLatLng([point.latitud, point.longitud]); map.current.panTo([point.latitud, point.longitud]); }, [point.latitud, point.longitud]);
  return <div><div ref={element} className="h-72 rounded-lg border border-slate-200"/><p className="mt-2 text-xs text-slate-500">Haz clic en el mapa o arrastra el marcador para fijar la ubicación de WTG.</p></div>;
}

export default function FleetScreen() {
  const [units, setUnits] = useState<LogisticsFleetUnit[]>([]);
  const [location, setLocation] = useState<LogisticsFleetLocation | null>(null);
  const [calendar, setCalendar] = useState<LogisticsFleetEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [demoFleetOnly, setDemoFleetOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [providers, setProviders] = useState<Array<{ id: string; razon_social: string }>>([]);
  const [editingLocation, setEditingLocation] = useState(false);
  const [address, setAddress] = useState('');
  const [point, setPoint] = useState({ latitud: 19.4326, longitud: -99.1332 });
  const [blockTarget, setBlockTarget] = useState<LogisticsFleetUnit | null>(null);
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [filterStatus, setFilterStatus] = useState('TODAS');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { const result = await logisticsApi.getFleet(); setUnits(result.data.units); setLocation(result.data.location); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo consultar la flota.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void logisticsApi.getTripSession().then(({ data }) => { setCanEdit(data.canEditFleet); setDemoFleetOnly(data.demoFleetOnly === true); }).catch(() => setCanEdit(false)); void logisticsApi.getFleetProviders().then(({ data }) => setProviders(data)).catch(() => setProviders([])); }, []);
  const loadCalendar = useCallback(async () => {
    const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const until = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    try { setCalendar((await logisticsApi.getFleetCalendar(from, until)).data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo consultar el calendario.'); }
  }, [month]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadCalendar(); }, [loadCalendar]);
  useEffect(() => { if (location) { setAddress(location.direccion); setPoint({ latitud: Number(location.latitud), longitud: Number(location.longitud) }); } }, [location]);

  const visible = useMemo(() => units.filter(unit => {
    const textMatch = [unit.numero_economico, unit.placas, unit.tipo_unidad, unit.marca, unit.modelo, unit.proveedor].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase());
    const statusMatch = filterStatus === 'TODAS' || unit.estatus === filterStatus;
    return textMatch && statusMatch;
  }), [units, query, filterStatus]);
  const counts = { total: units.filter(unit => unit.estatus !== 'BAJA').length, active: units.filter(unit => unit.estatus === 'ACTIVA').length, blocked: units.filter(unit => unit.bloqueo_id).length, reservations: calendar.filter(item => item.tipo === 'VIAJE').length };

  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); await load(); await loadCalendar(); setBlockTarget(null); setNotice(message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el cambio.'); }
    finally { setBusy(false); }
  }
  const monthLabel = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' }).format(month);
  const locationEdit = () => { setAddress(location?.direccion || ''); setPoint(location ? { latitud: Number(location.latitud), longitud: Number(location.longitud) } : { latitud: 19.4326, longitud: -99.1332 }); setEditingLocation(true); };

  return <div className="space-y-6 p-6 lg:p-8">
    <CatalogPageHeader eyebrow="Recursos operativos" title="Flota y disponibilidad" description="Consulta reservas, registra llegadas y administra bloqueos de atención en las instalaciones de WTG." action={<button className={subtle} onClick={() => void load()}>Actualizar</button>}/>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>{error}</span><button className={subtle} onClick={() => { void load(); void loadCalendar(); }}>Reintentar</button></div>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><CatalogMetric label="Unidades activas" value={String(counts.total)} note="Unidades que no están dadas de baja"/><CatalogMetric label="Disponibles" value={String(counts.active)} note="Sin bloqueo de mantenimiento"/><CatalogMetric label="Bloqueadas" value={String(counts.blocked)} note="Requieren liberación manual"/><CatalogMetric label="Reservas del mes" value={String(counts.reservations)} note="Viajes con unidad reservada"/></div>

    <section className={`${card} p-5`}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold text-[#0b1f3b]">Instalaciones de WTG</h2><p className="mt-1 text-sm text-slate-500">Define la dirección y marca el punto en el mapa. La llegada se confirma manualmente.</p></div><button className={primary} onClick={locationEdit}>{location ? 'Editar ubicación' : 'Configurar ubicación'}</button></div>{location && !editingLocation && <div className="mt-3 text-sm text-slate-700"><p>{location.direccion}</p><p className="mt-1 text-xs text-slate-500">Punto: {Number(location.latitud).toFixed(6)}, {Number(location.longitud).toFixed(6)}</p></div>}{editingLocation && <form className="mt-5 grid gap-5 lg:grid-cols-2" onSubmit={event => { event.preventDefault(); void act(() => logisticsApi.saveFleetLocation({ direccion: address, ...point }), 'Ubicación de WTG guardada.'); setEditingLocation(false); }}><div className="space-y-4"><LogisticsFormField label="Dirección"><input required maxLength={500} value={address} onChange={event => setAddress(event.target.value)} className={field} placeholder="Dirección de las instalaciones"/></LogisticsFormField><div className="grid grid-cols-2 gap-3"><LogisticsFormField label="Latitud"><input required type="number" step="0.000001" min="-90" max="90" value={point.latitud} onChange={event => setPoint(previous => ({ ...previous, latitud: Number(event.target.value) }))} className={field}/></LogisticsFormField><LogisticsFormField label="Longitud"><input required type="number" step="0.000001" min="-180" max="180" value={point.longitud} onChange={event => setPoint(previous => ({ ...previous, longitud: Number(event.target.value) }))} className={field}/></LogisticsFormField></div><div className="flex gap-2"><button disabled={busy} className={primary}>{busy ? 'Guardando…' : 'Guardar ubicación'}</button><button type="button" className={subtle} onClick={() => setEditingLocation(false)}>Cancelar</button></div></div><LocationMap point={point} onChange={setPoint}/></form>}</section>

    <section className={`${card} p-5`}><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-bold text-[#0b1f3b]">Unidades y estado</h2><p className="mt-1 text-sm text-slate-500">Consulta disponibilidad y administra las unidades de la flota.</p></div><div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">{canEdit && <button className={`${primary} whitespace-nowrap`} onClick={() => setShowCreate(true)}>Agregar flota</button>}<select aria-label="Filtrar por estado" value={filterStatus} onChange={event => setFilterStatus(event.target.value)} className="mt-0 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#c79d00] focus:ring-2 focus:ring-amber-100 sm:w-56"><option value="TODAS">Todos los estados</option><option value="ACTIVA">Activa</option><option value="MANTENIMIENTO">En atención</option><option value="BAJA">Baja</option></select></div></div><CatalogSearch value={query} onChange={setQuery} placeholder="Buscar número, placas, tipo o proveedor" className="mt-4"/><div className="mt-4"><CatalogTable minWidth="1100px" headings={['Unidad','Proveedor','Documentos','Estado / reserva','Llegada a WTG','Acciones']}>{visible.map(unit => <tr key={unit.id}><td className="px-5 py-4"><p className="font-bold text-[#0b1f3b]">{unit.numero_economico} · {unit.tipo_unidad}</p><p className="mt-1 text-xs text-slate-500">{[unit.marca,unit.modelo,unit.anio,unit.placas].filter(Boolean).join(' · ') || 'Sin detalle adicional'}</p><p className="mt-1 text-xs text-slate-500">{unit.capacidad_kg ? `${Number(unit.capacidad_kg).toLocaleString('es-MX')} kg` : ''}{unit.capacidad_pallets ? ` · ${unit.capacidad_pallets} pallets` : ''}{unit.hazmat ? ' · HAZMAT' : ''}{unit.refrigerada ? ' · Refrigerada' : ''}</p></td><td className="px-5 py-4 text-sm text-slate-600">{unit.proveedor || 'Flota propia'}</td><td className="px-5 py-4 text-sm"><span className={Number(unit.vencidos) ? 'text-rose-700' : 'text-emerald-700'}>{unit.vencidos ? `${unit.vencidos} vencido(s)` : `${unit.vigentes || 0} vigentes`}</span></td><td className="px-5 py-4 text-sm"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${unit.bloqueo_id ? 'bg-amber-100 text-amber-900' : unit.estatus === 'BAJA' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-50 text-emerald-800'}`}>{unit.bloqueo_id ? 'Bloqueada' : unit.estatus === 'MANTENIMIENTO' ? 'En atención' : unit.estatus === 'BAJA' ? 'Baja' : unit.proximo_folio ? 'Reservada' : 'Disponible'}</span>{unit.bloqueo_id && <p className="mt-2 max-w-48 text-xs text-slate-500">{unit.bloqueo_motivo}</p>}{unit.proximo_folio && <p className="mt-2 text-xs text-slate-500"><Link className="underline" href={`/logistica/viajes/${unit.proximo_folio}`}>{unit.proximo_folio}</Link><br/>{dateText(unit.proxima_reserva_desde)} – {dateText(unit.proxima_reserva_hasta)}</p>}</td><td className="px-5 py-4 text-xs text-slate-600">{dateText(unit.ultima_llegada_at)}{unit.llegada_por && <p className="mt-1">por {unit.llegada_por}</p>}</td><td className="px-5 py-4"><div className="flex min-w-44 flex-col items-start gap-2">{unit.bloqueo_id ? <button disabled={busy} className={primary} onClick={() => void act(() => logisticsApi.releaseFleetUnit(unit.id), `Unidad ${unit.numero_economico} liberada.`)}>Liberar unidad</button> : (unit.estatus !== 'BAJA' && <><button disabled={busy} className={subtle} onClick={() => void act(() => logisticsApi.registerFleetArrival(unit.id), `Llegada de ${unit.numero_economico} registrada.`)}>Registrar llegada</button>{unit.estatus === 'ACTIVA' && <button className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100" onClick={() => setBlockTarget(unit)}>Bloquear por atención</button>}</>)}</div></td></tr>)}</CatalogTable>{!visible.length && <p className="p-5 text-sm text-slate-500">No hay unidades que coincidan con esos filtros.</p>}</div></section>

    <section className={`${card} p-5`}><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-[#0b1f3b]">Calendario de disponibilidad</h2><p className="mt-1 text-sm capitalize text-slate-500">{monthLabel}</p></div><div className="flex gap-2"><button className={subtle} aria-label="Mes anterior" onClick={() => setMonth(value => new Date(value.getFullYear(), value.getMonth()-1, 1))}>←</button><button className={subtle} onClick={() => setMonth(new Date())}>Hoy</button><button className={subtle} aria-label="Mes siguiente" onClick={() => setMonth(value => new Date(value.getFullYear(), value.getMonth()+1, 1))}>→</button></div></div><div className="mt-4 overflow-x-auto"><CatalogTable minWidth="760px" headings={['Unidad','Tipo de evento','Desde','Hasta','Detalle','Responsable']}>{calendar.map((item,index)=><tr key={`${item.unidad_id}-${item.tipo}-${item.desde}-${index}`}><td className="px-5 py-3 font-semibold text-[#0b1f3b]">{item.numero_economico}</td><td className="px-5 py-3 text-sm">{item.tipo === 'BLOQUEO' ? 'Bloqueo por atención' : 'Reserva de viaje'}</td><td className="px-5 py-3 text-sm">{dateText(item.desde)}</td><td className="px-5 py-3 text-sm">{dateText(item.hasta)}</td><td className="px-5 py-3 text-sm">{item.folio ? <Link href={`/logistica/viajes/${item.folio}`} className="underline">{item.folio}</Link> : item.motivo}</td><td className="px-5 py-3 text-sm">{item.responsable || '—'}</td></tr>)}</CatalogTable>{!calendar.length && <p className="p-5 text-sm text-slate-500">Sin reservas ni bloqueos para este mes.</p>}</div></section>

    {showCreate && <div role="dialog" aria-modal="true" aria-labelledby="fleet-create-title" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4"><form className={`${card} my-auto w-full max-w-2xl space-y-4 p-6`} onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); const optionalNumber = (key: string) => String(form.get(key) || '') ? Number(form.get(key)) : null; const input = { numero_economico: String(form.get('numero_economico') || '').trim(), placas: String(form.get('placas') || '').trim() || null, tipo_unidad: String(form.get('tipo_unidad') || '').trim(), marca: String(form.get('marca') || '').trim() || null, modelo: String(form.get('modelo') || '').trim() || null, anio: optionalNumber('anio'), capacidad_kg: optionalNumber('capacidad_kg'), capacidad_pallets: optionalNumber('capacidad_pallets'), hazmat: form.get('hazmat') === 'on', refrigerada: form.get('refrigerada') === 'on', proveedor_id: String(form.get('proveedor_id') || '') || null }; void (async () => { setBusy(true); setError(''); setNotice(''); try { const result = await logisticsApi.createFleetUnit(input); if (!result.created) { setError('Ya existe una unidad con ese número económico.'); return; } setShowCreate(false); await load(); await loadCalendar(); setNotice(`Flota ${input.numero_economico} registrada y disponible.`); } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo registrar la flota.'); } finally { setBusy(false); } })(); }}><div><h2 id="fleet-create-title" className="text-lg font-bold text-[#0b1f3b]">Agregar flota</h2><p className="mt-1 text-sm text-slate-600">Registra una unidad completa. Quedará activa y disponible.</p>{demoFleetOnly && <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">Modo local de demostración: usa un número económico que comience con DEMO-.</p>}</div><div className="grid gap-4 sm:grid-cols-2"><LogisticsFormField label="Número económico"><input name="numero_economico" required maxLength={80} className={field} placeholder={demoFleetOnly ? 'Ej. DEMO-WTG-04' : 'Ej. WTG-024'}/></LogisticsFormField><LogisticsFormField label="Tipo de unidad"><input name="tipo_unidad" required maxLength={100} className={field} placeholder="Ej. Tractocamión"/></LogisticsFormField><LogisticsFormField label="Placas"><input name="placas" maxLength={30} className={field}/></LogisticsFormField><LogisticsFormField label="Proveedor"><select name="proveedor_id" className={field}><option value="">Flota propia / sin proveedor</option>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.razon_social}</option>)}</select></LogisticsFormField><LogisticsFormField label="Marca"><input name="marca" maxLength={80} className={field}/></LogisticsFormField><LogisticsFormField label="Modelo"><input name="modelo" maxLength={80} className={field}/></LogisticsFormField><LogisticsFormField label="Año"><input name="anio" type="number" min="1900" max="2200" className={field}/></LogisticsFormField><LogisticsFormField label="Capacidad (kg)"><input name="capacidad_kg" type="number" min="1" step="0.001" className={field}/></LogisticsFormField><LogisticsFormField label="Capacidad (pallets)"><input name="capacidad_pallets" type="number" min="1" step="1" className={field}/></LogisticsFormField><div className="flex flex-wrap items-center gap-5 sm:col-span-2"><label className="flex items-center gap-2 text-sm text-slate-700"><input name="hazmat" type="checkbox" className="rounded border-slate-300"/> HAZMAT</label><label className="flex items-center gap-2 text-sm text-slate-700"><input name="refrigerada" type="checkbox" className="rounded border-slate-300"/> Refrigerada</label></div></div><div className="flex justify-end gap-2"><button type="button" className={subtle} onClick={() => setShowCreate(false)}>Cancelar</button><button disabled={busy} className={primary}>{busy ? 'Guardando…' : 'Registrar flota'}</button></div></form></div>}
    {blockTarget && <div role="dialog" aria-modal="true" aria-labelledby="fleet-block-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><form className={`${card} w-full max-w-lg space-y-4 p-6`} onSubmit={event => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason') || ''); void act(() => logisticsApi.blockFleetUnit(blockTarget.id, reason), `Unidad ${blockTarget.numero_economico} bloqueada.`); }}><h2 id="fleet-block-title" className="text-lg font-bold text-[#0b1f3b]">Bloquear {blockTarget.numero_economico}</h2><p className="text-sm text-slate-600">Solo puedes bloquearla después de registrar su llegada a WTG. El bloqueo la quitará de las asignaciones disponibles.</p><LogisticsFormField label="Motivo"><textarea name="reason" required maxLength={1000} className={field} placeholder="Describe por qué requiere atención"/></LogisticsFormField><div className="flex justify-end gap-2"><button type="button" className={subtle} onClick={() => setBlockTarget(null)}>Cancelar</button><button disabled={busy} className={primary}>{busy ? 'Guardando…' : 'Confirmar bloqueo'}</button></div></form></div>}
    {loading && !units.length && !error && <p role="status" className="text-sm text-slate-500">Consultando unidades desde el servicio de Logística…</p>}
    {!loading && !units.length && !error && <p className="text-sm text-slate-500">La API respondió correctamente, pero todavía no hay unidades registradas para mostrar.</p>}
  </div>;
}
