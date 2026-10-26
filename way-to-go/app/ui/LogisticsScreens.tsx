'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowUpTrayIcon, ChevronRightIcon, DocumentTextIcon, MagnifyingGlassIcon, PlusIcon, TruckIcon } from '@heroicons/react/24/outline';
import { CatalogMetric, CatalogPageHeader, CatalogSearch, CatalogTable } from './LogisticsCatalogComponents';
import CreatedTripSummary from './CreatedTripSummary';
import { logisticsApi, type LogisticsDashboardData, type LogisticsDashboardTrip, type LogisticsTrip } from '../services/logistics-api';
import { tripStatusLabels } from '../services/trip-record';
import { filterTrips, toTripRow, type TripRow } from '../services/trip-list';

type Trip = TripRow;
const portalDemoTrips: Trip[] = [
  { folio: 'VJ-1058', client: 'Automotriz del Norte', route: 'Monterrey → Querétaro', unit: 'WTG-12 · CX-04', driver: 'A. Ramírez', status: 'En ruta', update: 'Hace 18 min', eta: '18:30', cargo: '', evidence: '2 / 3', amount: '$28,500' },
  { folio: 'VJ-1057', client: 'Alimentos Sierra', route: 'Puebla → CDMX', unit: 'WTG-07 · RB-02', driver: 'J. Molina', status: 'En descarga', update: 'Hace 6 min', eta: '12:20', cargo: '', evidence: '4 / 4', amount: '$16,800' },
  { folio: 'VJ-1056', client: 'Empaques del Bajío', route: 'Toluca → León', unit: 'Proveedor · TR-18', driver: 'M. Torres', status: 'Incidencia', update: 'Hace 52 min', eta: '14:05', cargo: '', evidence: '1 / 3', amount: '$22,400' },
];
const cls = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const button = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183a64]';
const subtle = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50';

function Title({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#b28b00]">{eyebrow}</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0b1f3b]">{title}</h1><p className="mt-1 text-sm text-slate-500">{description}</p></div>{action}</div>;
}
function Pill({ children }: { children: string }) {
  const tone = children === 'En ruta' || children === 'Listo para facturar' || children === 'Validada' ? 'bg-emerald-50 text-emerald-700' : children === 'Incidencia' || children === 'Pendiente' ? 'bg-amber-50 text-amber-700' : children === 'En descarga' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{children}</span>;
}
function Kpi({ label, value, note }: { label: string; value: string; note: string }) { return <div className={`${cls} p-5`}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-[#0b1f3b]">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></div>; }
function Table({ rows, headings, children }: { rows?: Trip[]; headings: string[]; children?: ReactNode }) { return <div className={`${cls} overflow-hidden`}><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500"><tr>{headings.map(h => <th key={h} className="px-5 py-3.5">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{children ?? rows?.map(t => <tr key={t.folio} className="hover:bg-slate-50/80"><td className="px-5 py-4"><Link className="font-bold text-[#0b1f3b] hover:underline" href={`/logistica/viajes/${t.folio}`}>{t.folio}</Link><p className="mt-1 text-xs text-slate-400">{t.client}</p></td><td className="px-5 py-4 text-slate-700">{t.route}</td><td className="px-5 py-4"><span className="font-medium text-slate-700">{t.unit}</span><p className="mt-1 text-xs text-slate-400">{t.driver}</p></td><td className="px-5 py-4"><Pill>{t.status}</Pill></td><td className="px-5 py-4 text-slate-500">{t.update}</td><td className="px-5 py-4 text-slate-600">{t.eta}</td><td className="px-5 py-4"><Link aria-label={`Abrir ${t.folio}`} href={`/logistica/viajes/${t.folio}`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ChevronRightIcon className="h-5 w-5" /></Link></td></tr>)}</tbody></table></div></div>; }
function RecentTripList({ rows }: { rows: Trip[] }) { return <div className={`${cls} divide-y divide-slate-100 overflow-hidden`}>{rows.map(t => <Link key={t.folio} href={`/logistica/viajes/${t.folio}`} className="group grid gap-3 px-4 py-4 transition hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-[#0b1f3b] group-hover:underline">{t.folio}</span><span className="text-slate-300">·</span><span className="truncate text-sm text-slate-600">{t.client}</span></div><p className="mt-1 truncate text-sm text-slate-700">{t.route}</p></div><div className="flex items-center gap-3"><Pill>{t.status}</Pill><ChevronRightIcon className="h-4 w-4 text-slate-400"/></div><div className="flex gap-4 text-xs text-slate-500 sm:justify-end"><span>{t.update}</span><span>ETA: {t.eta}</span></div></Link>)}</div>; }

export function TripsScreen() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Todos');
  const [trips, setTrips] = useState<LogisticsTrip[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const load = useCallback(async (nextOffset = 0, append = false) => {
    const version = ++requestVersion.current;
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const selectedStatus = Object.entries(tripStatusLabels).find(([, label]) => label === status)?.[0] as LogisticsTrip['estado_operativo'] | undefined;
      const response = await logisticsApi.getTrips({ limit: 50, offset: nextOffset, ...(query.trim() ? { q: query.trim() } : {}), ...(selectedStatus ? { estado: selectedStatus } : {}) });
      if (version !== requestVersion.current) return;
      setTrips(current => append ? [...current, ...response.data] : response.data);
      setOffset(nextOffset + response.data.length);
      setHasMore(response.data.length === 50);
    } catch (reason) {
      if (version !== requestVersion.current) return;
      setTrips([]); setHasMore(false);
      setError(reason instanceof Error ? reason.message : 'No se pudieron consultar los viajes.');
    } finally { if (version === requestVersion.current) { setLoading(false); setLoadingMore(false); } }
  }, [query, status]);
  useEffect(() => { const timer = window.setTimeout(() => { void load(0); }, query ? 250 : 0); return () => window.clearTimeout(timer); }, [load, query]);
  const rows = useMemo(() => trips.map(toTripRow), [trips]);
  const filtered = useMemo(() => filterTrips(rows, query, status), [rows, query, status]);
  return <div className="space-y-6 p-6 lg:p-8">
    <Title eyebrow="Operación · TMS" title="Viajes" description="Administra cada servicio desde la programación hasta el cierre." action={<Link href="/logistica/viajes/nuevo" className={button}><PlusIcon className="h-4 w-4"/>Crear viaje</Link>}/>
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>No se pudieron cargar viajes reales: {error}</span><button className={subtle} onClick={() => void load(0)}>Reintentar</button></div>}
    <div className="flex flex-col gap-3 sm:flex-row"><label className="relative flex-1"><MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar folio, cliente, ruta, operador o carga" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#c79d00]"/></label><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700"><option value="Todos">Todos los estados</option>{Object.values(tripStatusLabels).map(label=><option key={label}>{label}</option>)}</select></div>
    {loading && !trips.length ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Cargando viajes de la base…</p> : filtered.length ? <><Table rows={filtered} headings={['Viaje / cliente','Ruta','Unidad / operador','Estatus','Actualización','ETA','']}/><p className="text-xs text-slate-500">Mostrando {filtered.length} viaje{filtered.length === 1 ? '' : 's'}{hasMore ? ' de los registros consultados' : ''}.</p></> : !error && <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">{query || status !== 'Todos' ? 'Ningún viaje coincide con la búsqueda o el estado.' : 'Todavía no hay viajes registrados.'}</p>}
    {hasMore && <div className="flex justify-center"><button disabled={loadingMore} className={subtle} onClick={() => void load(offset, true)}>{loadingMore ? 'Cargando…' : 'Cargar más viajes'}</button></div>}
  </div>;
}

export { default as TripForm } from './TripCreateScreen';
export function TripDetail({ folio }: { folio: string }) { return <CreatedTripSummary folio={folio} />; }
function Info({label,value}:{label:string;value:string}) {return <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-sm font-semibold text-slate-800">{value}</p></div>}

export function LogisticsDashboard() {
 const [dashboard, setDashboard] = useState<LogisticsDashboardData | null>(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');
 const loadDashboard = useCallback(() => {
  return Promise.all([logisticsApi.getDashboard(), logisticsApi.getTrips({ limit: 20 })]).then(([dashboardResponse, tripsResponse]) => {
   const recentTrips = tripsResponse.data.filter(trip => !['ENTREGADO', 'CANCELADO'].includes(trip.estado_operativo)).slice(0, 5);
   setDashboard({ summary: dashboardResponse.data.summary, recent_trips: recentTrips });
   setError('');
  }).catch((reason: unknown) => { setDashboard(null); setError(reason instanceof Error ? reason.message : 'No se pudo consultar el dashboard.'); })
    .finally(() => setLoading(false));
 }, []);
 useEffect(() => { void loadDashboard(); }, [loadDashboard]);

 const rows = (dashboard?.recent_trips || []).map(toDashboardTrip);
 const summary = dashboard?.summary;
 return <div className="space-y-6 p-6 lg:p-8"><Title eyebrow="Centro de control TMS" title="Operación logística" description="Sigue los servicios desde su programación hasta el expediente listo para facturar." action={<Link href="/logistica/viajes/nuevo" className={button}><PlusIcon className="h-4 w-4"/>Crear viaje</Link>}/>
  {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>No se pudieron cargar los datos reales: {error}</span><button type="button" className={subtle} onClick={() => { setLoading(true); setError(''); void loadDashboard(); }}>Reintentar</button></div>}
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
   <Kpi label="Viajes activos" value={summary ? String(summary.viajes_activos) : loading ? '…' : '—'} note="Confirmados, programados y en curso"/>
   <Kpi label="En operación" value={summary ? String(summary.en_operacion) : loading ? '…' : '—'} note="Programados o con avance iniciado"/>
   <Kpi label="Sin actualización" value={summary ? String(summary.sin_actualizacion) : loading ? '…' : '—'} note="Requieren seguimiento"/>
   <Kpi label="Listos para facturar" value={summary ? String(summary.listos_para_facturar) : loading ? '…' : '—'} note="Según el expediente operativo"/>
  </div>
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><QuickCard href="/logistica/viajes" title="Viajes" detail="Programación, asignaciones y estatus"/><QuickCard href="/logistica/evidencias" title="Expedientes" detail="POD y documentos requeridos"/><QuickCard href="/logistica/clientes" title="Clientes y tarifas" detail="Direcciones y convenios vigentes"/><QuickCard href="/logistica/costos" title="Costos y extras" detail="Validación de costos por viaje"/></div>
  <div className="flex items-end justify-between gap-4"><div><h2 className="text-lg font-bold text-[#0b1f3b]">Seguimiento reciente</h2><p className="mt-1 text-sm text-slate-500">Hasta 5 viajes activos para revisar rápidamente.</p></div><Link href="/logistica/viajes" className="shrink-0 text-sm font-semibold text-[#0b1f3b] hover:underline">Ver todos →</Link></div>
  {loading && !dashboard ? <p role="status" className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Cargando resumen operativo…</p> : dashboard && rows.length ? <RecentTripList rows={rows}/> : !error && <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">No hay viajes activos para mostrar.</p>}
 </div>;
}

function toDashboardTrip(trip: LogisticsDashboardTrip | LogisticsTrip): Trip {
 const locationName = (value: Record<string, unknown> | null) => value ? String(value.nombre || value.ciudad || '') : '';
 const route = [locationName(trip.origen_snapshot), locationName(trip.destino_snapshot)].filter(Boolean).join(' → ') || 'Ruta pendiente';
 return {
  folio: trip.folio, client: trip.cliente, route, unit: trip.unidad || 'Sin asignar', driver: trip.operador || 'Sin asignar',
  status: tripStatusLabels[trip.estado_operativo] || trip.estado_operativo, update: formatDashboardUpdate(trip.updated_at),
  eta: trip.entrega_estimada_at ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(trip.entrega_estimada_at)) : 'Pendiente',
  cargo: 'tipo_carga' in trip ? trip.tipo_carga || '' : '', evidence: '', amount: '',
 };
}

function formatDashboardUpdate(value: string) {
 const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
 if (!Number.isFinite(minutes)) return 'Sin fecha';
 if (minutes < 1) return 'Ahora';
 if (minutes < 60) return `Hace ${minutes} min`;
 if (minutes < 1440) return `Hace ${Math.floor(minutes / 60)} h`;
 return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
function QuickCard({href,title,detail}:{href:string;title:string;detail:string}) {return <Link href={href} className={`${cls} p-4 transition hover:border-[#d5b23f] hover:shadow-md`}><h3 className="text-sm font-bold text-[#0b1f3b]">{title}</h3><p className="mt-1 text-xs text-slate-500">{detail}</p></Link>}

const pageData: Record<string,{eyebrow:string;title:string;desc:string;headings:string[];rows:string[][]}> = {
  clientes:{eyebrow:'CRM operativo',title:'Clientes y convenios',desc:'Direcciones, contactos y tarifas para programar sin volver a capturar condiciones.',headings:['Cliente / RFC','Dirección frecuente','Convenio','Tarifa base','Estatus'],rows:[['Automotriz del Norte','Planta Apodaca · Monterrey','MTY → QRO / 3.5 HAZMAT','$28,500','Activo'],['Alimentos Sierra','CEDIS Puebla','PUE → CDMX / Refrigerado','$16,800','Activo'],['Empaques del Bajío','Planta Toluca','TLC → León / Caja seca','$22,400','Activo']]},
  flota:{eyebrow:'Recursos operativos',title:'Flota y disponibilidad',desc:'Unidades, cajas y vigencia documental para asignar cada viaje con confianza.',headings:['Unidad / tipo','Caja','Capacidad','Documentos','Estatus','Próximo viaje'],rows:[['WTG-12 · 3.5 HAZMAT','CX-04 · Seca 53′','10 pallets','Vigentes','Disponible','VJ-1058'],['WTG-07 · Rabón','RB-02 · 24′','8 toneladas','Seguro por vencer','En viaje','VJ-1057'],['WTG-09 · Tractocamión','CX-11 · Seca 53′','28 toneladas','Vigentes','Disponible','—']]},
  operadores:{eyebrow:'Recursos operativos',title:'Operadores y proveedores',desc:'Consulta disponibilidad, permisos y documentos antes de confirmar una asignación.',headings:['Operador / proveedor','Tipo','Licencia / seguro','Clasificación','Estatus','Asignación'],rows:[['A. Ramírez','Propio','Federal B · vigente','HAZMAT','En viaje','VJ-1058'],['J. Molina','Propio','Federal B · vigente','General','Disponible','—'],['Transportes del Norte','Proveedor','Póliza vigente','Caja seca','Activo','VJ-1056']]},
  costos:{eyebrow:'Rentabilidad del viaje',title:'Costos y extras',desc:'Mantén separados los costos internos y los cargos que requieren autorización del cliente.',headings:['Viaje','Concepto','Monto','Comprobante','Cobro al cliente','Estatus'],rows:[['VJ-1058','Diesel','$7,450','Ticket adjunto','No','Validado'],['VJ-1058','Casetas','$3,600','Comprobantes','No','Validado'],['VJ-1058','Estadía','$2,500','Pendiente','Sí','Por validar'],['VJ-1057','Maniobra','$800','Factura adjunta','Sí','Aprobado']]},
  facturacion:{eyebrow:'Operación → Finanzas',title:'Facturación operativa',desc:'Prepara expedientes completos para que Finanzas pueda facturar cada servicio.',headings:['Viaje / cliente','Flete base','Extras','Expediente','Estatus','Acción'],rows:[['VJ-1055 · Automotriz del Norte','$14,800','$0','Completo','Listo para facturar','Enviar a Finanzas'],['VJ-1058 · Automotriz del Norte','$28,500','$2,500','Falta POD','Pendiente','Completar'],['VJ-1051 · Alimentos Sierra','$16,800','$800','Completo','Enviado a Finanzas','Ver envío']]},
  evidencias:{eyebrow:'Expediente digital',title:'Evidencias y POD',desc:'Revisa los documentos requeridos por viaje y detecta lo que bloquea el cierre.',headings:['Viaje','Cliente','Requeridas','Recibidas','Pendiente','Actualización'],rows:[['VJ-1058','Automotriz del Norte','3','2','POD firmado','Hace 18 min'],['VJ-1056','Empaques del Bajío','3','1','Foto de carga · POD','Hace 52 min'],['VJ-1055','Automotriz del Norte','5','5','Ninguna','Hoy, 09:42']]},
  reportes:{eyebrow:'Análisis operativo',title:'Reportes',desc:'Consulta actividad, cumplimiento de evidencias y pendientes de facturación.',headings:['Reporte','Periodo','Registros','Indicador','Última actualización',''],rows:[['Viajes por cliente','Este mes','86','$1.42 M MXN','Hoy, 10:32','Ver'],['Pendientes de POD','Esta semana','6','2 con entrega hoy','Hoy, 10:32','Ver'],['Extras cobrables','Este mes','14','$32,400 MXN','Hoy, 10:32','Ver'],['Incidencias por ruta','Este mes','8','MTY → QRO · 3','Hoy, 10:32','Ver']]},
};
export function CatalogScreen({ kind }: {kind:keyof typeof pageData}) {
 const data=pageData[kind]; const [query,setQuery]=useState(''); const [notice,setNotice]=useState(''); const rows=data.rows.filter(r=>r.join(' ').toLowerCase().includes(query.toLowerCase()));
 const metrics = [
  { label: kind==='facturacion'?'Listos para facturar':kind==='evidencias'?'Expedientes completos':'Registros activos', value: kind==='facturacion'?'9':kind==='evidencias'?'24':'18', note: kind==='facturacion'?'$184,600 MXN estimados':'Actualizado hoy' },
  { label: kind==='facturacion'?'Expedientes pendientes':'Requieren atención', value: kind==='facturacion'?'6':'3', note: 'Revisión recomendada' },
  { label: 'En operación', value: '12', note: 'Sin bloqueo activo' },
 ];
 return <div className="space-y-6 p-6 lg:p-8">
  <CatalogPageHeader eyebrow={data.eyebrow} title={data.title} description={data.desc} action={<button onClick={()=>setNotice(kind==='reportes'?'Reporte listo para descargar.':`Formulario de ${data.title.toLowerCase()} disponible en esta demo.`)} className={button}><PlusIcon className="h-4 w-4"/>{kind==='reportes'?'Exportar reporte':'Agregar registro'}</button>}/>
  {notice&&<div role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}
  <div className="grid gap-4 sm:grid-cols-3">{metrics.map(metric=><CatalogMetric key={metric.label} {...metric}/>)}</div>
  <CatalogSearch value={query} onChange={setQuery} placeholder={`Buscar en ${data.title.toLowerCase()}`}/>
  <div className={`${cls} overflow-hidden`}><CatalogTable headings={data.headings}>{rows.map((r,i)=><tr key={`${r[0]}-${i}`} className="hover:bg-slate-50/80">{r.map((v,j)=><td key={j} className="px-5 py-4 text-sm text-slate-600">{j===0?<span className="font-bold text-[#0b1f3b]">{v}</span>:j===data.headings.length-2&&kind==='facturacion'?<Pill>{v}</Pill>:v}</td>)}</tr>)}</CatalogTable></div>
  {kind==='evidencias'&&<section className={`${cls} flex flex-col items-center border-dashed p-8 text-center`}><DocumentTextIcon className="h-8 w-8 text-slate-400"/><p className="mt-3 font-semibold text-[#0b1f3b]">Carga una evidencia al expediente</p><p className="mt-1 text-sm text-slate-500">POD, fotos de carga, tickets o comprobantes.</p><label className={`${subtle} mt-4 cursor-pointer`}><ArrowUpTrayIcon className="h-4 w-4"/>Seleccionar archivo<input type="file" className="sr-only" onChange={e=>e.target.files?.[0]&&setNotice(`${e.target.files[0].name} listo para adjuntar a un viaje.`)}/></label></section>}
  <p className="text-xs text-slate-400">Información de demostración para navegación del módulo TMS.</p>
 </div>;
}

export function ExternalPortal({ role }: {role:'cliente'|'operador'}) {
 const isClient=role==='cliente'; const [status,setStatus]=useState('En ruta'); const [message,setMessage]=useState('');
 const title=isClient?'Portal de cliente':'Portal de operador';
 return <main className="min-h-screen bg-slate-50 text-slate-900"><header className="flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-10"><Link href="/" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#f4c430] text-[#0b1f3b]"><TruckIcon className="h-5 w-5"/></span><span><b className="block text-sm tracking-[.12em] text-[#0b1f3b]">WAY TO GO</b><span className="text-xs text-slate-400">{title}</span></span></Link><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{isClient?'Automotriz del Norte':'A. Ramírez · Operador'}</span></header><div className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#b28b00]">{isClient?'Seguimiento de servicios':'Mis asignaciones'}</p><h1 className="mt-1 text-3xl font-bold text-[#0b1f3b]">{isClient?'Tus viajes':'Viajes asignados'}</h1><p className="mt-1 text-sm text-slate-500">{isClient?'Consulta avances y documentos compartidos por WAYTOGO.':'Actualiza el avance del viaje y carga evidencias al expediente.'}</p></div>{message&&<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}<div className="grid gap-4 sm:grid-cols-3"><Kpi label={isClient?'En operación':'Asignados a ti'} value={isClient?'3':'2'} note="Actualizado hoy"/><Kpi label={isClient?'Entregados este mes':'Pendiente de POD'} value={isClient?'12':'1'} note="Consulta el detalle del servicio"/><Kpi label="Evidencias disponibles" value={isClient?'8':'4'} note="En el expediente digital"/></div>{(isClient?portalDemoTrips.filter(t=>t.client==='Automotriz del Norte').slice(0,3):portalDemoTrips.slice(0,2)).map(t=><section key={t.folio} className={`${cls} p-5 sm:p-6`}><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="flex items-center gap-3"><Link href={`/logistica/viajes/${t.folio}`} className="text-lg font-bold text-[#0b1f3b]">{t.folio}</Link><Pill>{isClient?t.status:status}</Pill></div><p className="mt-1 text-sm text-slate-500">{isClient?t.client:t.driver} · {t.route}</p></div><p className="text-sm text-slate-500">ETA {t.eta}</p></div><div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-3"><Info label="Último evento" value="Unidad cargada y salió a ruta"/><Info label={isClient?'Evidencias visibles':'Unidad asignada'} value={isClient?'2 documentos disponibles':t.unit}/><Info label="Actualización" value={t.update}/></div>{!isClient&&<div className="mt-5 flex flex-wrap gap-2"><select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option>En ruta</option><option>En descarga</option><option>Entregado</option><option>POD recibido</option></select><button className={button} onClick={()=>setMessage(`Actualización de ${t.folio} guardada en esta demo.`)}>Registrar avance</button><label className={`${subtle} cursor-pointer`}><ArrowUpTrayIcon className="h-4 w-4"/>Subir evidencia<input type="file" className="sr-only" onChange={e=>e.target.files?.[0]&&setMessage(`${e.target.files[0].name} listo para adjuntar a ${t.folio}.`)}/></label><button className={subtle} onClick={()=>setMessage(`Incidencia de ${t.folio} registrada en esta demo.`)}>Reportar incidencia</button></div>}</section>)}{isClient&&<section className={`${cls} p-5`}><h2 className="font-bold text-[#0b1f3b]">Documentos compartidos</h2><div className="mt-3 flex items-center justify-between border-t border-slate-100 py-3 text-sm"><span>POD firmado · VJ-1055</span><button className="font-semibold text-[#0b1f3b]" onClick={()=>setMessage('Vista previa del POD disponible al conectar el almacenamiento.')}>Ver documento</button></div></section>}<p className="text-xs text-slate-400">Portal de demostración con datos de ejemplo. Accesos y permisos reales se habilitarán al conectar autenticación y base de datos.</p></div></main>;
}
