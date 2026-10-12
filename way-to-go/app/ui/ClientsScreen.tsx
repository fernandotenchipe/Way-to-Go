'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BuildingOffice2Icon, CheckCircleIcon, ChevronRightIcon, MapPinIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { logisticsApi, type LogisticsAddress, type LogisticsCustomer, type LogisticsCustomerDetail } from '../services/logistics-api';

type ClientContact = LogisticsCustomerDetail['contactos'][number];
type ClientRow = LogisticsCustomer & { address_preview?: string | null; demo_addresses?: LogisticsAddress[]; demo_contacts?: ClientContact[] };
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
const field = 'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#c79d00] focus:ring-2 focus:ring-amber-100';

export default function ClientsScreen() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [mode, setMode] = useState<Mode>('loading');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogisticsCustomerDetail | null>(null);
  const [modal, setModal] = useState<'client' | 'address' | null>(null);
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
      setClients(demoClients.filter((client) => `${client.razon_social} ${client.rfc ?? ''} ${client.address_preview ?? ''}`.toLowerCase().includes(query.toLowerCase())));
      setConnectionMessage(error instanceof Error ? error.message : 'No fue posible consultar la base de datos.');
    }
  }, []);

  useEffect(() => { void loadClients(); }, [loadClients]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    const client = clients.find((item) => item.id === selectedId);
    if (mode === 'demo') {
      if (client) setDetail({ ...client, direcciones: client.demo_addresses ?? [], contactos: client.demo_contacts ?? [] });
      return;
    }
    logisticsApi.getCustomer(selectedId).then((response) => setDetail(response.data)).catch(() => setDetail(null));
  }, [selectedId, clients, mode]);

  const filtered = useMemo(() => mode === 'demo'
    ? clients
    : clients.filter((client) => `${client.razon_social} ${client.nombre_comercial ?? ''} ${client.rfc ?? ''} ${client.address_preview ?? ''}`.toLowerCase().includes(search.toLowerCase())), [clients, mode, search]);
  const activeCount = clients.filter((client) => client.activo).length;
  const locationsCount = clients.reduce((total, client) => total + Number(client.direcciones_activas ?? client.demo_addresses?.length ?? 0), 0);

  async function submitClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setFormError('');
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const input = {
      razon_social: value('razon_social'), nombre_comercial: value('nombre_comercial'), rfc: value('rfc'),
      uso_cfdi: value('uso_cfdi'), forma_pago: value('forma_pago'), metodo_pago: value('metodo_pago'), condiciones_pago: value('condiciones_pago'),
      contacto: { nombre: value('contacto_nombre'), puesto: value('contacto_puesto'), tipo_contacto: value('contacto_tipo') || 'OPERACIONES', email: value('contacto_email'), telefono: value('contacto_telefono') },
      direccion: {
        nombre: value('direccion_nombre'), calle: value('direccion_calle'), ciudad: value('direccion_ciudad'), estado: value('direccion_estado'), pais: 'MX',
        codigo_postal: value('direccion_cp'), zona_horaria: value('direccion_zona') || 'America/Mexico_City',
        horario: value('direccion_horario'), instrucciones: value('direccion_instrucciones'), requiere_cita: form.get('direccion_cita') === 'on',
      },
    };
    const hasContact = [input.contacto.nombre, input.contacto.puesto, input.contacto.email, input.contacto.telefono].some(Boolean);
    const hasAddress = [input.direccion.nombre, input.direccion.calle, input.direccion.ciudad, input.direccion.estado, input.direccion.codigo_postal, input.direccion.horario, input.direccion.instrucciones].some(Boolean);
    if (hasContact && !input.contacto.nombre) { setFormError('Escribe el nombre del contacto o deja vacía toda esa sección.'); setSaving(false); return; }
    if (hasAddress && ![input.direccion.nombre, input.direccion.calle, input.direccion.ciudad, input.direccion.estado].every(Boolean)) { setFormError('Para guardar la dirección necesitamos nombre, calle, ciudad y estado.'); setSaving(false); return; }
    if (!hasContact) delete (input as { contacto?: typeof input.contacto }).contacto;
    if (!hasAddress) delete (input as { direccion?: typeof input.direccion }).direccion;
    try {
      if (mode === 'live') {
        const response = await logisticsApi.createCustomer(input);
        await loadClients(search);
        setSelectedId(response.data.id);
        setNotice('Cliente y datos proporcionados guardados en la base de datos.');
      } else {
        const id = `demo-${crypto.randomUUID()}`;
        const demoContact: ClientContact | undefined = hasContact ? { id: `demo-${crypto.randomUUID()}`, nombre: input.contacto!.nombre!, puesto: input.contacto!.puesto || null, email: input.contacto!.email || null, telefono: input.contacto!.telefono || null, tipo_contacto: input.contacto!.tipo_contacto || 'OPERACIONES', principal: true } : undefined;
        const demoAddress: LogisticsAddress | undefined = hasAddress ? { id: `demo-${crypto.randomUUID()}`, cliente_id: id, nombre: input.direccion!.nombre, calle: input.direccion!.calle, ciudad: input.direccion!.ciudad, estado: input.direccion!.estado, pais: input.direccion!.pais, codigo_postal: input.direccion!.codigo_postal || null, zona_horaria: input.direccion!.zona_horaria, horario: input.direccion!.horario || null, instrucciones: input.direccion!.instrucciones || null, requiere_cita: input.direccion!.requiere_cita, activo: true } : undefined;
        const created: ClientRow = { id, razon_social: input.razon_social, nombre_comercial: input.nombre_comercial || null, rfc: input.rfc || null, uso_cfdi: input.uso_cfdi || null, forma_pago: input.forma_pago || null, metodo_pago: input.metodo_pago || null, condiciones_pago: input.condiciones_pago || null, activo: true, direcciones_activas: demoAddress ? 1 : 0, created_at: '', updated_at: '', demo_addresses: demoAddress ? [demoAddress] : [], demo_contacts: demoContact ? [demoContact] : [], address_preview: demoAddress ? `${demoAddress.ciudad}, ${demoAddress.estado}` : null };
        setClients((current) => [created, ...current]); setSelectedId(created.id);
        setNotice('Cliente agregado solo a esta vista de demostración; los cambios no se guardaron en la base.');
      }
      setModal(null);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo guardar el cliente.'); }
    finally { setSaving(false); }
  }

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
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#b28b00]">Datos base · Logística</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-[#0b1f3b]">Clientes y direcciones</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Mantén los clientes y sus puntos de carga o entrega listos para programar viajes.</p></div>
      <button onClick={() => { setFormError(''); setModal('client'); }} className={primaryButton}><PlusIcon className="h-4 w-4"/>Agregar cliente</button>
    </header>

    {mode === 'demo' && <div role="status" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><BuildingOffice2Icon className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"/><div><p className="font-semibold">Vista de demostración · sin conexión a la base</p><p className="mt-0.5 text-amber-900/80">{connectionMessage}. Los registros DEMO y los cambios de esta vista son locales y no se guardan.</p></div></div>}
    {notice && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircleIcon className="h-5 w-5"/>{notice}</div>}

    <div className="grid gap-4 sm:grid-cols-3">
      <Metric label="Clientes registrados" value={mode === 'loading' ? '—' : String(clients.length)} note="En el módulo de Logística"/>
      <Metric label="Clientes activos" value={mode === 'loading' ? '—' : String(activeCount)} note="Disponibles para programar"/>
      <Metric label="Direcciones" value={mode === 'loading' ? '—' : String(locationsCount)} note="Puntos activos de carga y entrega"/>
    </div>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className={`${card} overflow-hidden`}>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-[#0b1f3b]">Cartera de clientes</h2><p className="mt-0.5 text-xs text-slate-500">Selecciona un cliente para consultar sus direcciones.</p></div><label className="relative block sm:w-72"><MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={search} onChange={(event) => { setSearch(event.target.value); if (mode === 'live') void loadClients(event.target.value); }} placeholder="Buscar cliente, RFC o ciudad" className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#c79d00]"/></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3.5">Cliente / RFC</th><th className="px-5 py-3.5">Ubicación principal</th><th className="px-5 py-3.5">Direcciones</th><th className="px-5 py-3.5">Estado</th><th className="px-3 py-3.5"/></tr></thead><tbody className="divide-y divide-slate-100">
          {mode === 'loading' && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">Consultando clientes…</td></tr>}
          {mode !== 'loading' && filtered.map((client) => <tr key={client.id} onClick={() => setSelectedId(client.id)} className={`cursor-pointer transition hover:bg-slate-50 ${selectedId === client.id ? 'bg-amber-50/70' : ''}`}><td className="px-5 py-4"><p className="font-semibold text-[#0b1f3b]">{client.razon_social}</p><p className="mt-1 text-xs text-slate-400">{client.rfc || 'RFC sin capturar'}</p></td><td className="px-5 py-4 text-slate-600">{client.address_preview || 'Sin dirección registrada'}</td><td className="px-5 py-4 text-slate-600">{client.direcciones_activas ?? client.demo_addresses?.length ?? 0}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${client.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{client.activo ? 'Activo' : 'Inactivo'}</span></td><td className="px-3 py-4 text-right"><ChevronRightIcon className="ml-auto h-4 w-4 text-slate-400"/></td></tr>)}
          {mode !== 'loading' && filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">No hay clientes que coincidan con la búsqueda.</td></tr>}
        </tbody></table></div>
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

    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}><section role="dialog" aria-modal="true" aria-labelledby="client-modal-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-6 py-5"><div><h2 id="client-modal-title" className="text-xl font-bold text-[#0b1f3b]">{modal === 'client' ? 'Registrar cliente' : 'Agregar dirección'}</h2><p className="mt-1 text-sm text-slate-500">{modal === 'client' ? 'Guarda la empresa y, si ya los tienes, sus datos de contacto y primera ubicación.' : `Nueva ubicación para ${detail?.nombre_comercial || detail?.razon_social || 'el cliente'}.`}</p></div><button onClick={() => setModal(null)} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><XMarkIcon className="h-5 w-5"/></button></div>
      <form onSubmit={modal === 'client' ? submitClient : submitAddress} className="space-y-5 px-6 py-5">
        {modal === 'client' ? <>
          <FormBlock title="Datos de la empresa" description="La razón social es el único dato obligatorio para crear el registro.">
            <FormField label="Razón social *"><input name="razon_social" required maxLength={180} className={field} placeholder="Empresa, S.A. de C.V."/></FormField>
            <FormField label="Nombre comercial"><input name="nombre_comercial" maxLength={180} className={field} placeholder="Nombre con el que la identifican"/></FormField>
            <FormField label="RFC"><input name="rfc" maxLength={13} className={field} placeholder="RFC de la empresa"/></FormField>
          </FormBlock>
          <FormBlock title="Contacto principal" description="Puedes completar esta sección ahora o agregar contactos después.">
            <FormField label="Nombre"><input name="contacto_nombre" maxLength={160} className={field} placeholder="Persona responsable"/></FormField>
            <FormField label="Área"><select name="contacto_tipo" className={field}><option value="OPERACIONES">Operaciones</option><option value="FACTURACION">Facturación</option><option value="COMPRAS">Compras</option><option value="OTRO">Otro</option></select></FormField>
            <FormField label="Puesto"><input name="contacto_puesto" maxLength={100} className={field} placeholder="Coordinación logística"/></FormField>
            <FormField label="Teléfono"><input name="contacto_telefono" type="tel" maxLength={30} className={field} placeholder="Teléfono directo"/></FormField>
            <FormField label="Correo"><input name="contacto_email" type="email" maxLength={180} className={field} placeholder="nombre@empresa.com"/></FormField>
          </FormBlock>
          <FormBlock title="Primera ubicación" description="Agrega una planta, CEDIS o sucursal. Puedes añadir más después.">
            <FormField label="Nombre de la ubicación"><input name="direccion_nombre" maxLength={120} className={field} placeholder="Planta Apodaca"/></FormField>
            <FormField label="Calle y número"><input name="direccion_calle" maxLength={200} className={field} placeholder="Av. Industrial 100"/></FormField>
            <FormField label="Ciudad"><input name="direccion_ciudad" maxLength={100} className={field} placeholder="Monterrey"/></FormField>
            <FormField label="Estado"><input name="direccion_estado" maxLength={100} className={field} placeholder="Nuevo León"/></FormField>
            <FormField label="Código postal"><input name="direccion_cp" maxLength={12} className={field} placeholder="64000"/></FormField>
            <FormField label="Horario de atención"><input name="direccion_horario" maxLength={120} className={field} placeholder="Lun–Vie 08:00–17:00"/></FormField>
            <FormField label="Zona horaria"><select name="direccion_zona" className={field}><option value="America/Mexico_City">Centro · Ciudad de México</option><option value="America/Monterrey">Norte · Monterrey</option><option value="America/Tijuana">Pacífico · Tijuana</option></select></FormField>
            <FormField label="Instrucciones de acceso"><input name="direccion_instrucciones" maxLength={500} className={field} placeholder="Andén, acceso o indicaciones"/></FormField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600"><input name="direccion_cita" type="checkbox" className="accent-[#0b1f3b]"/>Requiere cita</label>
          </FormBlock>
          <FormBlock title="Datos de facturación y pago" description="Opcionales; puedes agregarlos cuando el cliente confirme sus condiciones.">
            <FormField label="Uso CFDI"><input name="uso_cfdi" maxLength={40} className={field} placeholder="Clave o descripción"/></FormField>
            <FormField label="Forma de pago"><input name="forma_pago" maxLength={60} className={field} placeholder="Forma acordada"/></FormField>
            <FormField label="Método de pago"><input name="metodo_pago" maxLength={60} className={field} placeholder="Método acordado"/></FormField>
            <FormField label="Condiciones de pago"><input name="condiciones_pago" maxLength={500} className={field} placeholder="Plazo o notas de crédito"/></FormField>
          </FormBlock>
        </> : <>
          <FormField label="Nombre de la ubicación *"><input name="nombre" required maxLength={120} className={field} placeholder="Planta, CEDIS o sucursal"/></FormField>
          <FormField label="Calle y número *"><input name="calle" required maxLength={200} className={field} placeholder="Av. Industrial 100"/></FormField>
          <div className="grid gap-4 sm:grid-cols-2"><FormField label="Ciudad *"><input name="ciudad" required maxLength={100} className={field} placeholder="Monterrey"/></FormField><FormField label="Estado *"><input name="estado" required maxLength={100} className={field} placeholder="Nuevo León"/></FormField><FormField label="Código postal"><input name="codigo_postal" maxLength={12} className={field} placeholder="64000"/></FormField><FormField label="Horario de atención"><input name="horario" maxLength={120} className={field} placeholder="Lun–Vie 08:00–17:00"/></FormField></div>
          <FormField label="Zona horaria"><select name="zona_horaria" className={field}><option value="America/Mexico_City">Centro · Ciudad de México</option><option value="America/Monterrey">Norte · Monterrey</option><option value="America/Tijuana">Pacífico · Tijuana</option></select></FormField>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input name="requiere_cita" type="checkbox" className="accent-[#0b1f3b]"/>Esta ubicación requiere cita</label>
          <FormField label="Instrucciones"><input name="instrucciones" maxLength={500} className={field} placeholder="Acceso, andén o indicaciones especiales"/></FormField>
        </>}
        {mode === 'demo' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Modo demo: este registro será temporal y no llegará a la base de datos.</p>}
        {formError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white pt-4"><button type="button" onClick={() => setModal(null)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button><button disabled={saving} type="submit" className={`${primaryButton} disabled:cursor-wait disabled:opacity-60`}>{saving ? 'Guardando…' : modal === 'client' ? 'Guardar cliente' : 'Guardar dirección'}</button></div>
      </form>
    </section></div>}
  </div>;
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={`${card} p-5`}><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-[#0b1f3b]">{value}</p><p className="mt-1 text-xs text-slate-400">{note}</p></div>;
}

function FormBlock({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200 p-4 sm:p-5"><div className="mb-4"><h3 className="text-sm font-bold text-[#0b1f3b]">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div><div className="grid gap-4 sm:grid-cols-2">{children}</div></section>;
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-slate-700">{label}{children}</label>;
}
