'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logisticsApi, type LogisticsAddress, type LogisticsCustomer, type LogisticsServiceType, type LogisticsTrip, type LogisticsTripCreateInput } from '../services/logistics-api';
import { getDemoLogisticsCustomers, saveDemoLogisticsCustomer, type DemoLogisticsCustomer } from '../services/logistics-demo-customers';
import { demoClients } from '../services/logistics-demo-seeds';
import { saveDemoTrip } from '../services/logistics-demo-trips';
import { tripDateToIso } from '../services/trip-dates';
import LogisticsAddressFields, { readAddress } from './LogisticsAddressFields';
import { CatalogPageHeader, LogisticsFormField as Field, LogisticsFormSection as Section, logisticsFieldClassName as field } from './LogisticsCatalogComponents';

const button = 'rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const demoServices: LogisticsServiceType[] = [{ id: 'demo-service-general', nombre: 'DEMO · Servicio general', activo: true }];

export default function TripCreateScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'checking' | 'live' | 'demo'>('checking');
  const [quick, setQuick] = useState(false);
  const [customers, setCustomers] = useState<LogisticsCustomer[]>([]);
  const [customer, setCustomer] = useState<LogisticsCustomer | null>(null);
  const [services, setServices] = useState<LogisticsServiceType[]>([]);
  const [addresses, setAddresses] = useState<LogisticsAddress[]>([]);
  const [originId, setOriginId] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [step, setStep] = useState(0);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    Promise.all([logisticsApi.getCustomers(), logisticsApi.getCatalogs()]).then(([clients, catalogs]) => {
      if (!active) return;
      setCustomers(clients.data.filter((row) => row.activo));
      setServices(catalogs.data.servicios.filter((row) => row.activo));
      setMode('live');
    }).catch((reason: unknown) => {
      if (!active) return;
      const merged = new Map([...demoClients, ...getDemoLogisticsCustomers()].map((row) => [row.id, row]));
      setCustomers([...merged.values()].filter((row) => row.activo));
      setServices(demoServices);
      setConnectionMessage(reason instanceof Error ? reason.message : 'No se pudo consultar el servicio.');
      setMode('demo');
    });
    return () => { active = false; mounted.current = false; };
  }, []);

  async function chooseCustomer(id: string) {
    const currentRequest = ++requestId.current;
    setCustomer(customers.find((row) => row.id === id) || null);
    setAddresses([]); setOriginId(''); setDestinationId(''); setError('');
    setLoadingAddresses(Boolean(id));
    if (!id) return;
    try {
      const detail = mode === 'demo'
        ? customers.find((row) => row.id === id) as DemoLogisticsCustomer
        : (await logisticsApi.getCustomer(id)).data;
      if (!mounted.current || currentRequest !== requestId.current) return;
      const rows = 'direcciones' in detail ? detail.direcciones : detail.demo_addresses || [];
      setCustomer(detail);
      setAddresses(rows.filter((row) => row.activo).sort((a, b) => Number(Boolean(b.principal)) - Number(Boolean(a.principal)) || a.nombre.localeCompare(b.nombre)));
    } catch (reason) { if (mounted.current && currentRequest === requestId.current) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las ubicaciones.'); }
    finally { if (mounted.current && currentRequest === requestId.current) setLoadingAddresses(false); }
  }

  function validateStep(index: number) {
    const controls = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[data-step="${index}"] input, [data-step="${index}"] select, [data-step="${index}"] textarea`);
    return Array.from(controls || []).every((control) => control.reportValidity());
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || mode === 'checking') return;
    if (step < 2) { if (validateStep(step)) setStep(step + 1); return; }
    for (let index = 0; index < 3; index++) {
      if (!validateStep(index)) { setStep(index); return; }
    }
    setSaving(true); setError('');
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    try {
      const quickAddresses = quick ? [readAddress(form, 'origen'), readAddress(form, 'destino')] : [];
      const origin = quick ? quickAddresses[0] : addresses.find((row) => row.id === originId);
      const destination = quick ? quickAddresses[1] : addresses.find((row) => row.id === destinationId);
      if (!origin || !destination || (!quick && originId === destinationId)) throw new Error('Selecciona ubicaciones diferentes para recoger y entregar.');
      const loading = tripDateToIso(value('cita_carga_at'), origin.zona_horaria);
      const departure = tripDateToIso(value('salida_programada_at'), origin.zona_horaria);
      const arrival = tripDateToIso(value('entrega_estimada_at'), destination.zona_horaria);
      const unloading = value('descarga_programada_at') ? tripDateToIso(value('descarga_programada_at'), destination.zona_horaria) : undefined;
      if (departure < loading || arrival <= departure || (unloading && unloading < arrival)) throw new Error('Revisa el orden de recolección, salida, llegada y descarga, considerando las zonas horarias.');
      const input: LogisticsTripCreateInput = {
        ...(quick ? { cliente_nuevo: { razon_social: value('nuevo_cliente'), direcciones: quickAddresses } } : { cliente_id: customer!.id, origen_id: originId, destino_id: destinationId }),
        estado_operativo: 'BORRADOR', tipo_servicio_id: value('servicio'), tipo_carga: value('tipo_carga'), descripcion_carga: value('descripcion_carga'),
        cita_carga_at: loading, salida_programada_at: departure, entrega_estimada_at: arrival, descarga_programada_at: unloading,
        reserva_desde: loading, reserva_hasta: unloading || arrival, flete_base: value('flete_base') ? Number(value('flete_base')) : undefined,
        moneda: value('moneda'), instrucciones: value('instrucciones'),
      };
      let folio: string;
      if (mode === 'live') {
        folio = (await logisticsApi.createTrip(input)).data.folio;
      } else {
        if (quick && customers.some((row) => row.razon_social.trim().toLowerCase() === value('nuevo_cliente').toLowerCase())) throw new Error('Ya existe un cliente con ese nombre. Selecciónalo en Cliente registrado.');
        const customerId = quick ? `demo-${crypto.randomUUID()}` : customer!.id;
        const snapshots = quick ? quickAddresses.map((row, index) => ({ ...row, id: `demo-address-${crypto.randomUUID()}`, cliente_id: customerId, activo: true, principal: index === 0 })) : [origin, destination];
        const now = new Date().toISOString();
        folio = `DEMO-${crypto.randomUUID()}`;
        const trip: LogisticsTrip = {
          id: folio, folio, cliente_id: customerId, cliente: quick ? value('nuevo_cliente') : customer!.razon_social,
          estado_operativo: 'BORRADOR', tipo_servicio_id: input.tipo_servicio_id, tipo_servicio: services.find((row) => row.id === input.tipo_servicio_id)?.nombre || null,
          tipo_carga: input.tipo_carga, cita_carga_at: loading, salida_programada_at: departure, entrega_estimada_at: arrival, descarga_programada_at: unloading,
          origen_snapshot: { ...snapshots[0] }, destino_snapshot: { ...snapshots[1] }, instrucciones: input.instrucciones,
          unidad_id: null, unidad: null, operador_id: null, operador: null, created_at: now, updated_at: now,
        };
        // El modo demo siempre escribe únicamente en el navegador.
        saveDemoTrip(trip);
        if (quick) saveDemoLogisticsCustomer({ id: customerId, razon_social: trip.cliente, nombre_comercial: null, rfc: null, activo: true, created_at: now, updated_at: now, demo_addresses: snapshots as LogisticsAddress[], direcciones_activas: 2, address_preview: `${snapshots[0].ciudad}, ${snapshots[0].estado}` });
      }
      router.push(`/logistica/viajes/${encodeURIComponent(folio)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'No se pudo guardar el viaje.'); setSaving(false); }
  }

  const label = (row: LogisticsAddress) => `${row.nombre} · ${row.ciudad}, ${row.estado}${row.principal ? ' · Principal' : ''}`;
  const originZone = addresses.find((row) => row.id === originId)?.zona_horaria;
  const destinationZone = addresses.find((row) => row.id === destinationId)?.zona_horaria;
  return <div className="mx-auto max-w-5xl space-y-5 p-6 lg:p-8">
    <CatalogPageHeader eyebrow="Operación · TMS" title="Crear viaje" description="Selecciona un cliente o captura uno nuevo sin salir de este servicio." action={<Link href="/logistica/viajes" className="text-sm font-semibold text-blue-800">Volver a viajes</Link>} />
    {mode === 'demo' && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Modo demostración.</strong> {connectionMessage} Clientes y viajes se guardarán solo en este navegador; no se enviarán a la base.</p>}
    {mode === 'live' && <p className="text-sm text-slate-500">Conectado al servicio de Logística. Guardar enviará el registro a la base configurada.</p>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {mode === 'checking' ? <p role="status">Consultando clientes y servicios…</p> : <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
      <ol className="flex flex-wrap gap-3 text-sm">{['Cliente y servicio', 'Recoger y entregar', 'Fechas y confirmación'].map((title, index) => <li key={title} aria-current={step === index ? 'step' : undefined} className={`rounded-lg px-3 py-2 ${step === index ? 'bg-[#0b1f3b] text-white' : 'bg-slate-100 text-slate-600'}`}>{index + 1}. {title}</li>)}</ol>
      <fieldset disabled={saving} className="space-y-5">
        <div data-step="0" hidden={step !== 0}>
          <Section title="Cliente y servicio" description="El alta rápida guarda un cliente con datos mínimos. Su facturación se completa después.">
            <div className="col-span-full flex gap-5 text-sm">{[false, true].map((value) => <label key={String(value)} className="flex items-center gap-2"><input type="radio" name="modo_cliente" checked={quick === value} onChange={() => { setQuick(value); setError(''); }} />{value ? 'Cliente nuevo / captura rápida' : 'Cliente registrado'}</label>)}</div>
            {quick ? <Field label="Nombre o razón social del cliente *"><input name="nuevo_cliente" required maxLength={180} className={field} placeholder="Identificación del cliente; completa su ficha después" /></Field> : <Field label="Cliente activo *"><select required value={customer?.id || ''} onChange={(event) => void chooseCustomer(event.target.value)} className={field}><option value="">Seleccionar cliente</option>{customers.map((row) => <option key={row.id} value={row.id}>{row.nombre_comercial || row.razon_social}</option>)}</select></Field>}
            <Field label="Tipo de servicio *"><select name="servicio" required className={field}><option value="">Seleccionar servicio</option>{services.map((row) => <option key={row.id} value={row.id}>{row.nombre}</option>)}</select></Field>
            <Field label="Tipo de carga *"><input name="tipo_carga" required maxLength={160} className={field} placeholder="Ej. autopartes" /></Field>
            <Field label="Descripción de la carga"><input name="descripcion_carga" maxLength={500} className={field} /></Field>
            {!quick && customer && <div className="col-span-full rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><strong>Facturación del cliente:</strong> {customer.razon_social} · RFC: {customer.rfc || 'Pendiente'}<p>{[customer.domicilio_legal_calle, customer.domicilio_legal_ciudad, customer.domicilio_legal_estado, customer.domicilio_legal_codigo_postal].filter(Boolean).join(', ') || 'Domicilio de facturación pendiente'}</p></div>}
          </Section>
        </div>
        <div data-step="1" hidden={step !== 1}>
          {quick ? <div className="space-y-4">{[['origen', 'Recoger en'], ['destino', 'Entregar en']].map(([prefix, title]) => <Section key={prefix} title={title} description="Esta ubicación quedará disponible en la ficha del cliente para futuros servicios."><LogisticsAddressFields prefix={prefix} required compact /></Section>)}</div> : <Section title="Ruta del servicio" description="Elige cada lugar; la ubicación principal no determina la ruta.">
            <Field label="Recoger en *"><select required disabled={loadingAddresses} value={originId} onChange={(event) => setOriginId(event.target.value)} className={field}><option value="">Seleccionar ubicación de recolección</option>{addresses.map((row) => <option key={row.id} value={row.id} disabled={row.id === destinationId}>{label(row)}</option>)}</select></Field>
            <Field label="Entregar en *"><select required disabled={loadingAddresses} value={destinationId} onChange={(event) => setDestinationId(event.target.value)} className={field}><option value="">Seleccionar ubicación de entrega</option>{addresses.map((row) => <option key={row.id} value={row.id} disabled={row.id === originId}>{label(row)}</option>)}</select></Field>
            {loadingAddresses && <p role="status">Cargando ubicaciones…</p>}
            {!loadingAddresses && addresses.length < 2 && <p className="col-span-full text-sm text-amber-800">Necesitas al menos dos ubicaciones activas. <Link href="/logistica/clientes" className="underline">Completa las ubicaciones en Clientes</Link>.</p>}
            {[originId, destinationId].map((id, index) => { const row = addresses.find((item) => item.id === id); return row && <p key={index} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{index ? 'Entrega' : 'Recolección'}: {row.calle}, {row.ciudad}, {row.estado}, {row.pais}. {row.horario && `Horario: ${row.horario}. `}{row.requiere_cita && 'Requiere cita. '}{row.instrucciones}</p>; })}
          </Section>}
        </div>
        <div data-step="2" hidden={step !== 2}>
          <Section title="Fechas y horas previstas" description="Captura los horarios del lugar de origen o destino. Las horas reales se registran durante la operación.">
            <p className="col-span-full text-xs text-slate-500">Origen: {quick ? 'zona elegida en Recoger en' : originZone || 'Selecciona origen'}. Destino: {quick ? 'zona elegida en Entregar en' : destinationZone || 'Selecciona destino'}.</p>
            <Field label="Recolección / cita de carga *"><input name="cita_carga_at" required type="datetime-local" className={field} /></Field>
            <Field label="Salida prevista del origen *"><input name="salida_programada_at" required type="datetime-local" className={field} /></Field>
            <Field label="Llegada estimada a destino *"><input name="entrega_estimada_at" required type="datetime-local" className={field} /></Field>
            <Field label="Inicio de descarga programado (opcional)"><input name="descarga_programada_at" type="datetime-local" className={field} /></Field>
          </Section>
          <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">Flete e instrucciones (opcionales)</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Flete base"><input name="flete_base" type="number" min="0" step="0.01" className={field} placeholder="Pendiente de cotizar" /></Field><Field label="Moneda"><select name="moneda" className={field}><option>MXN</option><option>USD</option></select></Field><Field label="Instrucciones del servicio"><textarea name="instrucciones" maxLength={2000} className={field} /></Field></div></details>
          <p className="mt-4 rounded-lg bg-slate-100 p-4 text-sm text-slate-700">Se guardará como <strong>borrador</strong>, pendiente de asignar recursos y confirmar programación. Si omites el flete, quedará pendiente de cotizar con cero provisional.</p>
        </div>
      </fieldset>
      {!services.length && <p role="alert" className="text-sm text-amber-800">No hay tipos de servicio activos configurados.</p>}
      <div className="flex justify-between gap-3"><Link href="/logistica/viajes" className="px-3 py-2 text-sm text-slate-600">Cancelar</Link><div className="flex gap-3">{step > 0 && <button type="button" disabled={saving} onClick={() => setStep(step - 1)} className="px-3 py-2 text-sm font-semibold">Anterior</button>}<button type="submit" disabled={saving || loadingAddresses || !services.length} className={button}>{saving ? 'Guardando…' : step < 2 ? 'Continuar' : mode === 'demo' ? 'Guardar borrador en demo' : 'Guardar borrador de viaje'}</button></div></div>
    </form>}
  </div>;
}
