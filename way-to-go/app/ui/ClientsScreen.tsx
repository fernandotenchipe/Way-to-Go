'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BuildingOffice2Icon, CheckCircleIcon, ChevronRightIcon, MapPinIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { logisticsApi, type LogisticsAddress, type LogisticsCustomerDetail } from '../services/logistics-api';
import { getDemoLogisticsCustomers, type DemoLogisticsCustomer } from '../services/logistics-demo-customers';
import { CatalogMetric, CatalogPageHeader, CatalogSearch, CatalogTable, LogisticsFormField, LogisticsFormSection, logisticsFieldClassName } from './LogisticsCatalogComponents';

type ClientRow = DemoLogisticsCustomer;
type Mode = 'loading' | 'live' | 'demo';

const demoClients: ClientRow[] = [
  { id: 'demo-client-norte', razon_social: 'DEMO · Comercializadora Norte, S.A. de C.V.', nombre_comercial: 'Norte Demo', rfc: null, activo: true, direcciones_activas: 2, created_at: '', updated_at: '', address_preview: 'Apodaca, Nuevo León', demo_addresses: [
    { id: 'demo-address-n1', cliente_id: 'demo-client-norte', nombre: 'CEDIS Apodaca', calle: 'Av. de Prueba 1200', ciudad: 'Apodaca', estado: 'Nuevo León', pais: 'MX', codigo_postal: '66600', zona_horaria: 'America/Monterrey', horario: 'Lun–Vie 08:00–17:00', instrucciones: null, requiere_cita: true, activo: true },
    { id: 'demo-address-n2', cliente_id: 'demo-client-norte', nombre: 'Planta Monterrey', calle: 'Calle Muestra 45', ciudad: 'Monterrey', estado: 'Nuevo León', pais: 'MX', codigo_postal: '64000', zona_horaria: 'America/Monterrey', horario: 'Lun–Vie 07:00–16:00', instrucciones: null, requiere_cita: false, activo: true },
  ] },
  { id: 'demo-client-centro', razon_social: 'DEMO · Alimentos de Prueba, S. de R.L.', nombre_comercial: 'Alimentos Demo', rfc: null, activo: true, direcciones_activas: 1, created_at: '', updated_at: '', address_preview: 'Puebla, Puebla', demo_addresses: [
    { id: 'demo-address-c1', cliente_id: 'demo-client-centro', nombre: 'CEDIS Puebla', calle: 'Blvd. Ejemplo 800', ciudad: 'Puebla', estado: 'Puebla', pais: 'MX', codigo_postal: '72000', zona_horaria: 'America/Mexico_City', horario: 'Lun–Sáb 06:00–18:00', instrucciones: null, requiere_cita: true, activo: true },
  ] },
  { id: 'demo-client-bajio', razon_social: 'DEMO · Empaques Modelo del Bajío, S.A.', nombre_comercial: 'Empaques Demo', rfc: null, activo: true, direcciones_activas: 1, created_at: '', updated_at: '', address_preview: 'León, Guanajuato', demo_addresses: [
    { id: 'demo-address-b1', cliente_id: 'demo-client-bajio', nombre: 'Planta León', calle: 'Carretera Ficticia km 4', ciudad: 'León', estado: 'Guanajuato', pais: 'MX', codigo_postal: '37000', zona_horaria: 'America/Mexico_City', horario: 'Lun–Vie 08:00–17:00', instrucciones: null, requiere_cita: false, activo: true },
  ] },
];

const card = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const primaryButton = 'inline-flex items-center gap-2 rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183a64]';
const field = logisticsFieldClassName;

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [mode, setMode] = useState<Mode>('loading');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogisticsCustomerDetail | null>(null);
  const [modal, setModal] = useState<'address' | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const loadClients = useCallback(async (query = '') => {
    setMode((current) => current === 'live' ? 'live' : 'loading');
    try {
      const result = await logisticsApi.getCustomers(query);
      setClients(result.data);
      setMode('live');
      setConnectionMessage('');
    } catch (error) {
      setMode('demo');
      const availableDemoClients = [...getDemoLogisticsCustomers(), ...demoClients];
      setClients(availableDemoClients.filter((client) => `${client.razon_social} ${client.rfc ?? ''} ${client.address_preview ?? ''}`.toLowerCase().includes(query.toLowerCase())));
      setConnectionMessage(error instanceof Error ? error.message : 'No fue posible consultar la base de datos.');
    }
  }, []);

  useEffect(() => { void loadClients(); }, [loadClients]);

  useEffect(() => {
    if (mode === 'loading' || typeof window === 'undefined') return;
    const createdId = new URLSearchParams(window.location.search).get('created');
    if (!createdId) return;
    setSelectedId(createdId);
    setNotice('Cliente registrado. Puedes revisar su ficha y completar sus direcciones.');
    router.replace('/logistica/clientes', { scroll: false });
  }, [mode, clients, router]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    const client = clients.find((item) => item.id === selectedId);
    if (mode === 'demo') {
      if (client) setDetail({ ...client, direcciones: client.demo_addresses ?? [], contactos: client.demo_contacts ?? [] });
      return;
    }
    logisticsApi.getCustomer(selectedId).then((response) => setDetail(response.data)).catch(() => setDetail(null));
  }, [selectedId, clients, mode]);

  const filtered = useMemo(
    () => clients.filter((client) => `${client.razon_social} ${client.nombre_comercial ?? ''} ${client.rfc ?? ''} ${client.address_preview ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [clients, search],
  );
  const activeCount = clients.filter((client) => client.activo).length;
  const locationsCount = clients.reduce((total, client) => total + Number(client.direcciones_activas ?? client.demo_addresses?.length ?? 0), 0);

  async function submitAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedId) return;
    setSaving(true); setFormError('');
    const form = new FormData(event.currentTarget);
    const input = {
      nombre: String(form.get('nombre')).trim(), calle: String(form.get('calle')).trim(),
      ciudad: String(form.get('ciudad')).trim(), estado: String(form.get('estado')).trim(),
      pais: 'MX', codigo_postal: String(form.get('codigo_postal')).trim() || null,
      zona_horaria: String(form.get('zona_horaria') || 'America/Mexico_City'),
      horario: String(form.get('horario')).trim() || null, instrucciones: String(form.get('instrucciones')).trim() || null,
      requiere_cita: form.get('requiere_cita') === 'on',
    };
    try {
      if (mode === 'live') {
        await logisticsApi.addCustomerAddress(selectedId, input);
        const response = await logisticsApi.getCustomer(selectedId); setDetail(response.data);
        await loadClients(search);
        setNotice('Dirección guardada en la base de datos.');
      } else {
        const address: LogisticsAddress = { id: `demo-${crypto.randomUUID()}`, cliente_id: selectedId, activo: true, ...input };
        setClients((current) => current.map((client) => client.id === selectedId ? { ...client, direcciones_activas: Number(client.direcciones_activas ?? 0) + 1, demo_addresses: [...(client.demo_addresses ?? []), address], address_preview: `${address.ciudad}, ${address.estado}` } : client));
        setNotice('Dirección agregada solo a esta vista de demostración; no se guardó en la base.');
      }
      setModal(null);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo guardar la dirección.'); }
    finally { setSaving(false); }
  }

  return <div className="space-y-6 p-6 lg:p-8">
    <CatalogPageHeader
      eyebrow="Datos base · Logística"
      title="Clientes y direcciones"
      description="Mantén los clientes y sus puntos de carga o entrega listos para programar viajes."
      action={<Link href="/logistica/clientes/nuevo" className={primaryButton}><PlusIcon className="h-4 w-4"/>Agregar cliente</Link>}
    />

    {mode === 'demo' && <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><BuildingOffice2Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"/><div><p className="font-semibold">Vista de demostración · sin conexión a la base</p><p className="mt-0.5 text-amber-900/80">{connectionMessage}. Los registros DEMO y los cambios de esta vista son locales y no se guardan.</p></div></div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircleIcon className="h-5 w-5"/>{notice}</div>}

    <div className="grid gap-4 sm:grid-cols-3">
      <CatalogMetric label="Clientes registrados" value={mode === 'loading' ? '—' : String(clients.length)} note="En el módulo de Logística"/>
      <CatalogMetric label="Clientes activos" value={mode === 'loading' ? '—' : String(activeCount)} note="Disponibles para programar"/>
      <CatalogMetric label="Direcciones" value={mode === 'loading' ? '—' : String(locationsCount)} note="Puntos activos de carga y entrega"/>
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-[#0b1f3b]">Cartera de clientes</h2><p className="mt-0.5 text-xs text-slate-500">Selecciona un cliente para consultar sus direcciones.</p></div><CatalogSearch value={search} onChange={(value) => { setSearch(value); if (mode === 'live') void loadClients(value); }} placeholder="Buscar cliente, RFC o ciudad" className="sm:w-72"/></div>
        <CatalogTable headings={['Cliente / RFC', 'Ubicación principal', 'Direcciones', 'Estado', '']} minWidth="620px">
          {mode === 'loading' && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">Consultando clientes…</td></tr>}
          {mode !== 'loading' && filtered.map((client) => <tr key={client.id} onClick={() => setSelectedId(client.id)} className={`cursor-pointer transition hover:bg-slate-50 ${selectedId === client.id ? 'bg-amber-50/70' : ''}`}><td className="px-5 py-4"><p className="font-semibold text-[#0b1f3b]">{client.razon_social}</p><p className="mt-1 text-xs text-slate-400">{client.rfc || 'RFC sin capturar'}</p></td><td className="px-5 py-4 text-slate-600">{client.address_preview || 'Sin dirección registrada'}</td><td className="px-5 py-4 text-slate-600">{client.direcciones_activas ?? client.demo_addresses?.length ?? 0}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${client.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{client.activo ? 'Activo' : 'Inactivo'}</span></td><td className="px-3 py-4 text-right"><ChevronRightIcon className="ml-auto h-4 w-4 text-slate-400"/></td></tr>)}
          {mode !== 'loading' && filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">No hay clientes que coincidan con la búsqueda.</td></tr>}
        </CatalogTable>
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">{filtered.length} {filtered.length === 1 ? 'cliente' : 'clientes'}</div>
      </section>

      <section className={`${card} overflow-hidden`}>
        {detail ? <>
          <div className="border-b border-slate-100 p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-[#0b1f3b]"><BuildingOffice2Icon className="h-5 w-5"/></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ficha del cliente</p><h2 className="mt-0.5 truncate font-bold text-[#0b1f3b]">{detail.nombre_comercial || detail.razon_social}</h2></div></div><button onClick={() => setSelectedId(null)} aria-label="Cerrar detalle" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><XMarkIcon className="h-4 w-4"/></button></div><p className="mt-3 text-xs text-slate-500">{detail.razon_social}</p><p className="mt-1 text-xs text-slate-400">RFC · {detail.rfc || 'Sin capturar'}</p></div>
          <div className="border-b border-slate-100 p-5"><h3 className="text-sm font-bold text-[#0b1f3b]">Contacto principal</h3>{detail.contactos.length ? detail.contactos.map((contact) => <div key={contact.id} className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-sm font-semibold text-slate-700">{contact.nombre}{contact.puesto ? ` · ${contact.puesto}` : ''}</p><p className="mt-1 text-xs text-slate-500">{contact.email || 'Sin correo'}{contact.telefono ? ` · ${contact.telefono}` : ''}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{contact.tipo_contacto || 'Contacto'}</p></div>) : <p className="mt-2 text-xs text-slate-500">Aún no hay contactos registrados.</p>}</div>
          <div className="p-5"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold text-[#0b1f3b]">Direcciones</h3><p className="mt-0.5 text-xs text-slate-500">Puntos de operación del cliente</p></div><button onClick={() => { setFormError(''); setModal('address'); }} aria-label="Agregar dirección" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-amber-300 hover:bg-amber-50"><PlusIcon className="h-4 w-4"/></button></div>
            <div className="space-y-3">{detail.direcciones.length ? detail.direcciones.map((address) => <article key={address.id} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3"><div className="flex items-start gap-2.5"><MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#b28b00]"/><div className="min-w-0"><p className="text-sm font-semibold text-slate-800">{address.nombre}</p><p className="mt-1 text-xs leading-5 text-slate-500">{address.calle}<br/>{address.ciudad}, {address.estado}{address.codigo_postal ? ` · C.P. ${address.codigo_postal}` : ''}</p><p className="mt-2 text-[11px] text-slate-400">{address.requiere_cita ? 'Requiere cita' : 'Sin cita requerida'}{address.horario ? ` · ${address.horario}` : ''}</p></div></div></article>) : <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center"><MapPinIcon className="mx-auto h-6 w-6 text-slate-300"/><p className="mt-2 text-sm font-medium text-slate-600">Aún no hay direcciones</p><p className="mt-1 text-xs text-slate-400">Agrega un punto de carga o entrega.</p></div>}</div>
            <button onClick={() => { setFormError(''); setModal('address'); }} className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><PlusIcon className="mr-1.5 inline h-4 w-4"/>Agregar dirección</button>
          </div>
        </> : <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><MapPinIcon className="h-6 w-6"/></div><h2 className="mt-4 font-bold text-[#0b1f3b]">Detalle del cliente</h2><p className="mt-1 max-w-xs text-sm text-slate-500">Selecciona un registro para ver sus direcciones y horarios de atención.</p></div>}
      </section>
    </div>

    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}><section role="dialog" aria-modal="true" aria-labelledby="address-modal-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-6 py-5"><div><h2 id="address-modal-title" className="text-xl font-bold text-[#0b1f3b]">Agregar dirección</h2><p className="mt-1 text-sm text-slate-500">Nueva ubicación para {detail?.nombre_comercial || detail?.razon_social || 'el cliente'}.</p></div><button onClick={() => setModal(null)} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><XMarkIcon className="h-5 w-5"/></button></div>
      <form onSubmit={submitAddress} className="space-y-4 px-6 py-5">
        <LogisticsFormSection title="Datos de la ubicación" description="Captura el lugar de carga o entrega y sus instrucciones de acceso.">
          <LogisticsFormField label="Nombre de la ubicación *"><input name="nombre" required maxLength={120} className={field} placeholder="Planta, CEDIS o sucursal"/></LogisticsFormField>
          <LogisticsFormField label="Calle y número *"><input name="calle" required maxLength={200} className={field} placeholder="Av. Industrial 100"/></LogisticsFormField>
          <LogisticsFormField label="Ciudad *"><input name="ciudad" required maxLength={100} className={field} placeholder="Monterrey"/></LogisticsFormField>
          <LogisticsFormField label="Estado *"><input name="estado" required maxLength={100} className={field} placeholder="Nuevo León"/></LogisticsFormField>
          <LogisticsFormField label="Código postal"><input name="codigo_postal" maxLength={12} className={field} placeholder="64000"/></LogisticsFormField>
          <LogisticsFormField label="Horario de atención"><input name="horario" maxLength={120} className={field} placeholder="Lun–Vie 08:00–17:00"/></LogisticsFormField>
          <LogisticsFormField label="Zona horaria"><select name="zona_horaria" className={field}><option value="America/Mexico_City">Centro · Ciudad de México</option><option value="America/Monterrey">Norte · Monterrey</option><option value="America/Tijuana">Pacífico · Tijuana</option></select></LogisticsFormField>
          <LogisticsFormField label="Instrucciones"><input name="instrucciones" maxLength={500} className={field} placeholder="Acceso, andén o indicaciones especiales"/></LogisticsFormField>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600"><input name="requiere_cita" type="checkbox" className="accent-[#0b1f3b]"/>Esta ubicación requiere cita</label>
        </LogisticsFormSection>
        {mode === 'demo' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Modo demo: la dirección solo estará disponible en esta vista.</p>}
        {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white pt-4"><button type="button" onClick={() => setModal(null)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button><button disabled={saving} type="submit" className={`${primaryButton} disabled:cursor-wait disabled:opacity-60`}>{saving ? 'Guardando…' : 'Guardar dirección'}</button></div>
      </form>
    </section></div>}
  </div>;
}
