'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BuildingOffice2Icon, CheckCircleIcon, ChevronRightIcon, MapPinIcon, PencilSquareIcon, PlusIcon, XMarkIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { logisticsApi, type LogisticsAddress, type LogisticsCustomerAgreement, type LogisticsCustomerContact, type LogisticsCustomerDetail, type LogisticsServiceType } from '../services/logistics-api';
import { getDemoLogisticsCustomers, saveDemoLogisticsCustomer, type DemoLogisticsCustomer } from '../services/logistics-demo-customers';
import { hasDuplicateCustomerRfc, isValidContactEmail, isValidMexicanRfc, normalizeCustomerRfc } from '../services/customer-validation';
import { CatalogMetric, CatalogPageHeader, CatalogSearch, CatalogTable } from './LogisticsCatalogComponents';
import ClientRecordDialog, { type ClientEditorModal } from './ClientRecordDialog';

type ClientRow = DemoLogisticsCustomer;
type Mode = 'loading' | 'live' | 'demo';

const demoClients: ClientRow[] = [
  { id: 'demo-client-norte', razon_social: 'DEMO · Comercializadora Norte, S.A. de C.V.', nombre_comercial: 'Norte Demo', rfc: null, activo: true, direcciones_activas: 2, created_at: '', updated_at: '', address_preview: 'Apodaca, Nuevo León', demo_addresses: [
    { id: 'demo-address-n1', cliente_id: 'demo-client-norte', nombre: 'CEDIS Apodaca', calle: 'Av. de Prueba 1200', ciudad: 'Apodaca', estado: 'Nuevo León', pais: 'MX', codigo_postal: '66600', zona_horaria: 'America/Monterrey', horario: 'Lun–Vie 08:00–17:00', instrucciones: null, requiere_cita: true, activo: true, principal: true },
    { id: 'demo-address-n2', cliente_id: 'demo-client-norte', nombre: 'Planta Monterrey', calle: 'Calle Muestra 45', ciudad: 'Monterrey', estado: 'Nuevo León', pais: 'MX', codigo_postal: '64000', zona_horaria: 'America/Monterrey', horario: 'Lun–Vie 07:00–16:00', instrucciones: null, requiere_cita: false, activo: true },
  ] },
  { id: 'demo-client-centro', razon_social: 'DEMO · Alimentos de Prueba, S. de R.L.', nombre_comercial: 'Alimentos Demo', rfc: null, activo: true, direcciones_activas: 1, created_at: '', updated_at: '', address_preview: 'Puebla, Puebla', demo_addresses: [
    { id: 'demo-address-c1', cliente_id: 'demo-client-centro', nombre: 'CEDIS Puebla', calle: 'Blvd. Ejemplo 800', ciudad: 'Puebla', estado: 'Puebla', pais: 'MX', codigo_postal: '72000', zona_horaria: 'America/Mexico_City', horario: 'Lun–Sáb 06:00–18:00', instrucciones: null, requiere_cita: true, activo: true, principal: true },
  ] },
  { id: 'demo-client-bajio', razon_social: 'DEMO · Empaques Modelo del Bajío, S.A.', nombre_comercial: 'Empaques Demo', rfc: null, activo: true, direcciones_activas: 1, created_at: '', updated_at: '', address_preview: 'León, Guanajuato', demo_addresses: [
    { id: 'demo-address-b1', cliente_id: 'demo-client-bajio', nombre: 'Planta León', calle: 'Carretera Ficticia km 4', ciudad: 'León', estado: 'Guanajuato', pais: 'MX', codigo_postal: '37000', zona_horaria: 'America/Mexico_City', horario: 'Lun–Vie 08:00–17:00', instrucciones: null, requiere_cita: false, activo: true, principal: true },
  ] },
];

const card = 'rounded-xl border border-slate-200 bg-white shadow-sm';
const primaryButton = 'inline-flex items-center gap-2 rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183a64]';

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [mode, setMode] = useState<Mode>('loading');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LogisticsCustomerDetail | null>(null);
  const [modal, setModal] = useState<ClientEditorModal | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [detailTab, setDetailTab] = useState<'resumen' | 'contactos' | 'ubicaciones' | 'comercial' | 'facturacion'>('resumen');
  const [services, setServices] = useState<LogisticsServiceType[]>([]);

  const loadClients = useCallback(async (query = '') => {
    setMode((current) => current === 'live' ? 'live' : 'loading');
    try {
      const result = await logisticsApi.getCustomers(query);
      setClients(result.data);
      setMode('live');
      setConnectionMessage('');
    } catch (error) {
      setMode('demo');
      // Stored demo edits should replace their built-in seed row. The same ID
      // can exist in both sources after a client has been edited offline.
      const demoClientsById = new Map(demoClients.map((client) => [client.id, client]));
      for (const client of getDemoLogisticsCustomers()) demoClientsById.set(client.id, client);
      const availableDemoClients = [...demoClientsById.values()];
      setClients(availableDemoClients.filter((client) => `${client.razon_social} ${client.rfc ?? ''} ${client.address_preview ?? ''}`.toLowerCase().includes(query.toLowerCase())));
      setConnectionMessage(error instanceof Error ? error.message : 'No fue posible consultar la base de datos.');
    }
  }, []);

  useEffect(() => { void loadClients(); }, [loadClients]);

  useEffect(() => { logisticsApi.getCatalogs().then(({ data }) => setServices(data.servicios)).catch(() => setServices([])); }, []);

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
    setDetailTab('resumen');
    const client = clients.find((item) => item.id === selectedId);
    if (mode === 'demo') {
      if (client) setDetail({ ...client, direcciones: client.demo_addresses ?? [], contactos: client.demo_contacts ?? [], convenios: client.demo_agreements ?? [] });
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

  function persistDemoCustomer(customer: ClientRow) {
    saveDemoLogisticsCustomer(customer);
    setClients((current) => current.map((item) => item.id === customer.id ? customer : item));
    setDetail((current) => current?.id === customer.id ? {
      ...current,
      ...customer,
      direcciones: customer.demo_addresses ?? current.direcciones,
      contactos: customer.demo_contacts ?? current.contactos,
    } : current);
  }

  async function submitClientEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const customerInput = {
      razon_social: value('razon_social'),
      nombre_comercial: value('nombre_comercial'),
      rfc: value('rfc'),
      uso_cfdi: value('uso_cfdi'),
      forma_pago: value('forma_pago'),
      metodo_pago: value('metodo_pago'),
      condiciones_pago: value('condiciones_pago'),
      domicilio_legal_calle: value('domicilio_legal_calle'),
      domicilio_legal_ciudad: value('domicilio_legal_ciudad'),
      domicilio_legal_estado: value('domicilio_legal_estado'),
      domicilio_legal_pais: value('domicilio_legal_pais'),
      domicilio_legal_codigo_postal: value('domicilio_legal_codigo_postal'),
      canal_registro: value('canal_registro'),
      motivo_registro: value('motivo_registro'),
      servicios_acordados: form.getAll('servicios_acordados').map(String),
      regimen_fiscal: value('regimen_fiscal'),
    };
    const normalizedRfc = normalizeCustomerRfc(customerInput.rfc);
    if (!isValidMexicanRfc(normalizedRfc)) {
      setFormError('Revisa el RFC: debe tener formato de persona moral (12 caracteres) o física (13 caracteres).');
      setSaving(false);
      return;
    }
    if (hasDuplicateCustomerRfc(mode === 'demo' ? [...getDemoLogisticsCustomers(), ...demoClients] : clients, normalizedRfc, detail.id)) {
      setFormError('Ya existe otro cliente registrado con ese RFC.');
      setSaving(false);
      return;
    }
    customerInput.rfc = normalizedRfc;
    try {
      if (mode === 'live') {
        await logisticsApi.updateCustomer(detail.id, customerInput);
        const [customerResponse] = await Promise.all([logisticsApi.getCustomer(detail.id), loadClients(search)]);
        setDetail(customerResponse.data);
      } else {
        const updated: ClientRow = {
          ...(clients.find((client) => client.id === detail.id) ?? detail),
          razon_social: customerInput.razon_social,
          uso_cfdi: customerInput.uso_cfdi || null,
          forma_pago: customerInput.forma_pago || null,
          metodo_pago: customerInput.metodo_pago || null,
          condiciones_pago: customerInput.condiciones_pago || null,
          domicilio_legal_calle: customerInput.domicilio_legal_calle || null,
          domicilio_legal_ciudad: customerInput.domicilio_legal_ciudad || null,
          domicilio_legal_estado: customerInput.domicilio_legal_estado || null,
          domicilio_legal_pais: customerInput.domicilio_legal_pais || null,
          domicilio_legal_codigo_postal: customerInput.domicilio_legal_codigo_postal || null,
          canal_registro: customerInput.canal_registro || null,
          motivo_registro: customerInput.motivo_registro || null,
          servicios_acordados: customerInput.servicios_acordados,
          regimen_fiscal: customerInput.regimen_fiscal || null,
          nombre_comercial: customerInput.nombre_comercial || null,
          rfc: customerInput.rfc || null,
          demo_contacts: detail.contactos,
          demo_addresses: detail.direcciones,
        };
        persistDemoCustomer(updated);
      }
      setNotice(mode === 'live' ? 'Cliente actualizado en la base de datos.' : 'Cliente actualizado en los datos de demostración de este navegador.');
      setModal(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo actualizar el cliente.');
    } finally { setSaving(false); }
  }

  async function submitContact(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || modal?.kind !== 'contact') return;
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    if (!isValidContactEmail(email)) { setFormError('Escribe un correo válido para el contacto.'); setSaving(false); return; }
    const input = {
      nombre: String(form.get('nombre') ?? '').trim(),
      puesto: String(form.get('puesto') ?? '').trim() || null,
      email: email.toLowerCase() || null,
      telefono: String(form.get('telefono') ?? '').trim() || null,
      tipo_contacto: String(form.get('tipo_contacto') ?? 'OPERACIONES'),
      principal: form.get('principal') === 'on',
      para_facturacion: form.get('para_facturacion') === 'on',
    };
    try {
      if (mode === 'live') {
        if (modal.contact) await logisticsApi.updateCustomerContact(modal.contact.id, input);
        else await logisticsApi.addCustomerContact(detail.id, input);
        setDetail((await logisticsApi.getCustomer(detail.id)).data);
      } else {
        let contacts = detail.contactos.map((item) => ({ ...item }));
        const id = modal.contact?.id ?? `demo-contact-${crypto.randomUUID()}`;
        contacts = contacts.map((item) => ({ ...item, principal: input.principal ? item.id === id : item.principal }));
        const contact: LogisticsCustomerContact = { id, cliente_id: detail.id, ...input, activo: true };
        const index = contacts.findIndex((item) => item.id === id);
        if (index >= 0) contacts[index] = contact; else contacts.push(contact);
        const customer = clients.find((item) => item.id === detail.id) ?? detail;
        const updated: ClientRow = { ...customer, contacto_facturacion_id: input.para_facturacion ? id : customer.contacto_facturacion_id === id ? null : customer.contacto_facturacion_id, demo_contacts: contacts, demo_addresses: detail.direcciones };
        persistDemoCustomer(updated);
      }
      setNotice(mode === 'live' ? 'Contacto guardado. El historial se conserva.' : 'Contacto guardado en los datos de demostración.');
      setModal(null);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo guardar el contacto.'); }
    finally { setSaving(false); }
  }

  async function toggleContactActive(contact: LogisticsCustomerContact) {
    if (!detail) return;
    const nextActive = !contact.activo;
    if (!window.confirm(`¿Quieres ${nextActive ? 'reactivar' : 'desactivar'} a ${contact.nombre}?`)) return;
    setSaving(true);
    try {
      if (mode === 'live') {
        await logisticsApi.setCustomerContactActive(contact.id, nextActive);
        setDetail((await logisticsApi.getCustomer(detail.id)).data);
      } else {
        let contacts = detail.contactos.map((item) => item.id === contact.id ? { ...item, activo: nextActive, principal: nextActive ? item.principal : false } : item);
        if (nextActive && !contacts.some((item) => item.activo && item.principal)) contacts = contacts.map((item) => ({ ...item, principal: item.id === contact.id }));
        const customer = clients.find((item) => item.id === detail.id) ?? detail;
        persistDemoCustomer({ ...customer, contacto_facturacion_id: !nextActive && customer.contacto_facturacion_id === contact.id ? null : customer.contacto_facturacion_id, demo_contacts: contacts, demo_addresses: detail.direcciones });
      }
      setNotice(nextActive ? 'Contacto reactivado.' : 'Contacto desactivado; se conserva su historial.');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo cambiar el estado del contacto.'); }
    finally { setSaving(false); }
  }

  async function submitAgreement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || modal?.kind !== 'agreement') return;
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const numberOrNull = (key: string) => value(key) ? Number(value(key)) : null;
    const input = {
      nombre: value('nombre'), origen_id: value('origen_id') || null, destino_id: value('destino_id') || null,
      tipo_servicio_id: value('tipo_servicio_id') || null, tipo_unidad: value('tipo_unidad') || null, tipo_carga: value('tipo_carga') || null,
      tarifa_base: Number(value('tarifa_base')), moneda: value('moneda') || 'MXN',
      horas_libres_carga: numberOrNull('horas_libres_carga'), horas_libres_descarga: numberOrNull('horas_libres_descarga'),
      tarifa_estadia_hora: numberOrNull('tarifa_estadia_hora'), vigente_desde: value('vigente_desde'), vigente_hasta: value('vigente_hasta') || null,
      condiciones: value('condiciones') || null,
    };
    try {
      if (mode === 'live') {
        if (modal.agreement) await logisticsApi.updateCustomerAgreement(modal.agreement.id, input);
        else await logisticsApi.addCustomerAgreement(detail.id, input);
        setDetail((await logisticsApi.getCustomer(detail.id)).data);
      } else {
        const agreement: LogisticsCustomerAgreement = { id: modal.agreement?.id ?? `demo-agreement-${crypto.randomUUID()}`, cliente_id: detail.id, ...input, tipo_servicio: services.find((item) => item.id === input.tipo_servicio_id)?.nombre ?? null, activo: true };
        const agreements = [...detail.convenios.filter((item) => item.id !== agreement.id), agreement];
        const customer = clients.find((item) => item.id === detail.id) ?? detail;
        persistDemoCustomer({ ...customer, demo_agreements: agreements, demo_contacts: detail.contactos, demo_addresses: detail.direcciones });
        setDetail((current) => current ? { ...current, convenios: agreements } : current);
      }
      setNotice(mode === 'live' ? 'Convenio guardado.' : 'Convenio guardado en datos de demostración.');
      setModal(null);
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo guardar el convenio.'); }
    finally { setSaving(false); }
  }

  async function toggleAgreementActive(agreement: LogisticsCustomerAgreement) {
    if (!detail) return;
    const nextActive = !agreement.activo;
    setSaving(true);
    try {
      if (mode === 'live') {
        await logisticsApi.setCustomerAgreementActive(agreement.id, nextActive);
        setDetail((await logisticsApi.getCustomer(detail.id)).data);
      } else {
        const agreements = detail.convenios.map((item) => item.id === agreement.id ? { ...item, activo: nextActive } : item);
        const customer = clients.find((item) => item.id === detail.id) ?? detail;
        persistDemoCustomer({ ...customer, demo_agreements: agreements, demo_contacts: detail.contactos, demo_addresses: detail.direcciones });
        setDetail((current) => current ? { ...current, convenios: agreements } : current);
      }
      setNotice(nextActive ? 'Convenio reactivado.' : 'Convenio desactivado; se conserva el historial.');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo cambiar el estado del convenio.'); }
    finally { setSaving(false); }
  }

  async function selectBillingContact(contactId: string) {
    if (!detail) return;
    setSaving(true);
    try {
      if (mode === 'live') {
        await logisticsApi.updateCustomer(detail.id, { contacto_facturacion_id: contactId || null });
        setDetail((await logisticsApi.getCustomer(detail.id)).data);
      } else {
        const customer = clients.find((item) => item.id === detail.id) ?? detail;
        persistDemoCustomer({ ...customer, contacto_facturacion_id: contactId || null, demo_contacts: detail.contactos, demo_addresses: detail.direcciones });
      }
      setNotice('Contacto de facturación actualizado.');
    } catch (error) { setFormError(error instanceof Error ? error.message : 'No se pudo actualizar el contacto de facturación.'); }
    finally { setSaving(false); }
  }

  async function submitAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || modal?.kind !== 'address') return;
    setSaving(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const input = {
      nombre: String(form.get('nombre') ?? '').trim(),
      calle: String(form.get('calle') ?? '').trim(),
      ciudad: String(form.get('ciudad') ?? '').trim(),
      estado: String(form.get('estado') ?? '').trim(),
      pais: 'MX',
      codigo_postal: String(form.get('codigo_postal') ?? '').trim() || null,
      zona_horaria: String(form.get('zona_horaria') || 'America/Mexico_City'),
      tipo_ubicacion: String(form.get('tipo_ubicacion') ?? '').trim() || null,
      tipo_zona: String(form.get('tipo_zona') ?? '').trim() || null,
      horario: String(form.get('horario') ?? '').trim() || null,
      instrucciones: String(form.get('instrucciones') ?? '').trim() || null,
      requiere_cita: form.get('requiere_cita') === 'on',
      principal: form.get('principal') === 'on',
    };
    const editingAddress = modal.address;
    try {
      if (mode === 'live') {
        if (editingAddress) await logisticsApi.updateCustomerAddress(editingAddress.id, input);
        else await logisticsApi.addCustomerAddress(selectedId, input);
        const [customerResponse] = await Promise.all([logisticsApi.getCustomer(selectedId), loadClients(search)]);
        setDetail(customerResponse.data);
      } else {
        const customer = clients.find((client) => client.id === selectedId);
        if (!customer) throw new Error('No se encontró el cliente seleccionado.');
        const address: LogisticsAddress = editingAddress
          ? { ...editingAddress, ...input }
          : { id: `demo-${crypto.randomUUID()}`, cliente_id: selectedId, activo: true, ...input };
        let addresses = editingAddress
          ? (customer.demo_addresses ?? detail?.direcciones ?? []).map((item) => item.id === address.id ? address : item)
          : [...(customer.demo_addresses ?? detail?.direcciones ?? []), address];
        if (input.principal) {
          addresses = addresses.map((item) => ({ ...item, principal: item.id === address.id }));
        } else if (editingAddress?.principal && address.activo) {
          const promoted = addresses.find((item) => item.id !== address.id && item.activo);
          if (promoted) addresses = addresses.map((item) => ({ ...item, principal: item.id === promoted.id }));
        } else if (!addresses.some((item) => item.principal && item.activo)) {
          const firstActive = addresses.find((item) => item.activo);
          if (firstActive) addresses = addresses.map((item) => ({ ...item, principal: item.id === firstActive.id }));
        }
        const updated: ClientRow = {
          ...customer,
          direcciones_activas: addresses.filter((item) => item.activo).length,
          demo_addresses: addresses,
          address_preview: addresses.find((item) => item.activo)?.ciudad
            ? `${addresses.find((item) => item.activo)?.ciudad}, ${addresses.find((item) => item.activo)?.estado}`
            : null,
        };
        persistDemoCustomer(updated);
      }
      setNotice(editingAddress
        ? (mode === 'live' ? 'Dirección actualizada en la base de datos.' : 'Dirección actualizada en los datos de demostración.')
        : (mode === 'live' ? 'Dirección guardada en la base de datos.' : 'Dirección agregada a los datos de demostración de este navegador.'));
      setModal(null);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar la dirección.');
    } finally { setSaving(false); }
  }

  async function toggleCustomerActive() {
    if (!detail) return;
    const nextActive = !detail.activo;
    const action = nextActive ? 'reactivar' : 'desactivar';
    if (!window.confirm(`¿Quieres ${action} a ${detail.nombre_comercial || detail.razon_social}?`)) return;
    setSaving(true);
    setFormError('');
    try {
      if (mode === 'live') {
        const response = await logisticsApi.setCustomerActive(detail.id, nextActive);
        setDetail((current) => current ? { ...current, ...response.data } : current);
        setClients((current) => current.map((client) => client.id === detail.id ? { ...client, ...response.data } : client));
      } else {
        const updated = { ...(clients.find((client) => client.id === detail.id) ?? detail), activo: nextActive, demo_addresses: detail.direcciones, demo_contacts: detail.contactos };
        persistDemoCustomer(updated);
      }
      setNotice(nextActive ? 'Cliente reactivado.' : 'Cliente desactivado; su historial se conserva.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : `No se pudo ${action} al cliente.`);
    } finally { setSaving(false); }
  }

  async function toggleAddressActive(address: LogisticsAddress) {
    if (!detail) return;
    const nextActive = !address.activo;
    const action = nextActive ? 'reactivar' : 'desactivar';
    if (!window.confirm(`¿Quieres ${action} la dirección “${address.nombre}”?`)) return;
    setSaving(true);
    setFormError('');
    try {
      if (mode === 'live') {
        await logisticsApi.setCustomerAddressActive(address.id, nextActive);
        const [customerResponse] = await Promise.all([logisticsApi.getCustomer(detail.id), loadClients(search)]);
        setDetail(customerResponse.data);
      } else {
        const customer = clients.find((client) => client.id === detail.id);
        if (!customer) throw new Error('No se encontró el cliente seleccionado.');
        let addresses = (customer.demo_addresses ?? detail.direcciones).map((item) => item.id === address.id ? { ...item, activo: nextActive } : item);
        if (!nextActive && address.principal) {
          const promoted = addresses.find((item) => item.activo);
          addresses = addresses.map((item) => ({ ...item, principal: item.id === promoted?.id }));
        } else if (nextActive && !addresses.some((item) => item.activo && item.principal)) {
          addresses = addresses.map((item) => ({ ...item, principal: item.id === address.id }));
        }
        const activeAddress = addresses.find((item) => item.activo && item.principal) ?? addresses.find((item) => item.activo);
        persistDemoCustomer({
          ...customer,
          direcciones_activas: addresses.filter((item) => item.activo).length,
          address_preview: activeAddress ? `${activeAddress.ciudad}, ${activeAddress.estado}` : null,
          demo_addresses: addresses,
          demo_contacts: detail.contactos,
        });
      }
      setNotice(nextActive ? 'Dirección reactivada.' : 'Dirección desactivada; los viajes existentes conservan su historial.');
    } catch (error) {
      setFormError(error instanceof Error ? error.message : `No se pudo ${action} la dirección.`);
    } finally { setSaving(false); }
  }

  async function markAddressPrimary(address: LogisticsAddress) {
    if (!detail || address.principal || !address.activo) return;
    setSaving(true);
    setFormError('');
    try {
      if (mode === 'live') {
        await logisticsApi.updateCustomerAddress(address.id, { principal: true });
        const response = await logisticsApi.getCustomer(detail.id);
        setDetail(response.data);
      } else {
        const customer = clients.find((client) => client.id === detail.id);
        if (!customer) throw new Error('No se encontró el cliente seleccionado.');
        const addresses = (customer.demo_addresses ?? detail.direcciones).map((item) => ({ ...item, principal: item.id === address.id }));
        const updated = { ...customer, demo_addresses: addresses, direcciones_activas: addresses.filter((item) => item.activo).length };
        persistDemoCustomer(updated);
      }
      setNotice(`“${address.nombre}” ahora es la dirección principal.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo cambiar la dirección principal.');
    } finally { setSaving(false); }
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

      <section className={`${card} max-h-[calc(100vh-2rem)] overflow-y-auto`}>
        {detail ? <>
          <div className="border-b border-slate-100 p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-[#0b1f3b]"><BuildingOffice2Icon className="h-5 w-5"/></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ficha del cliente</p><h2 className="mt-0.5 truncate font-bold text-[#0b1f3b]">{detail.nombre_comercial || detail.razon_social}</h2></div></div><button onClick={() => setSelectedId(null)} aria-label="Cerrar detalle" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><XMarkIcon className="h-4 w-4"/></button></div><p className="mt-3 text-xs text-slate-500">{detail.razon_social}</p><p className="mt-1 text-xs text-slate-400">RFC · {detail.rfc || 'Sin capturar'}</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${detail.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{detail.activo ? 'Activo' : 'Inactivo'}</span><button onClick={() => { setFormError(''); setModal({ kind: 'client' }); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><PencilSquareIcon className="h-3.5 w-3.5"/>Editar cliente</button><button disabled={saving} onClick={() => void toggleCustomerActive()} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{detail.activo ? 'Desactivar' : 'Reactivar'}</button></div></div>
          <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-slate-100 bg-white p-2" aria-label="Secciones de la ficha">{(['resumen', 'contactos', 'ubicaciones', 'comercial', 'facturacion'] as const).map((tab) => <button key={tab} onClick={() => setDetailTab(tab)} className={`whitespace-nowrap rounded-md px-2.5 py-2 text-xs font-semibold capitalize ${detailTab === tab ? 'bg-blue-50 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}>{tab === 'ubicaciones' ? 'Ubicaciones' : tab === 'facturacion' ? 'Facturación' : tab === 'comercial' ? 'Comercial' : tab === 'contactos' ? 'Contactos' : 'Resumen'}</button>)}</nav>
          {detailTab === 'contactos' && <div className="p-5"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold text-[#0b1f3b]">Contactos</h3><p className="mt-0.5 text-xs text-slate-500">Principal, operaciones, facturación y alta del cliente</p></div>{detail.activo && <button onClick={() => { setFormError(''); setModal({ kind: 'contact' }); }} aria-label="Agregar contacto" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-amber-300 hover:bg-amber-50"><PlusIcon className="h-4 w-4"/></button>}</div>{detail.contactos.length ? detail.contactos.map((contact) => <article key={contact.id} className={`mt-3 rounded-lg border p-3 ${contact.activo ? 'border-slate-100 bg-slate-50' : 'border-slate-200 bg-slate-100 opacity-70'}`}><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-700">{contact.nombre}{contact.puesto ? ` · ${contact.puesto}` : ''}</p><p className="mt-1 text-xs text-slate-500">{contact.email || 'Sin correo'}{contact.telefono ? ` · ${contact.telefono}` : ''}</p><p className="mt-1 text-[11px] uppercase tracking-wide text-slate-400">{contact.tipo_contacto || 'Contacto'}{contact.principal ? ' · Principal' : ''}{detail.contacto_facturacion_id === contact.id ? ' · Facturación' : ''}</p></div><span className="text-[10px] text-slate-500">{contact.activo ? 'Activo' : 'Inactivo'}</span></div><div className="mt-3 flex gap-2"><button onClick={() => { setFormError(''); setModal({ kind: 'contact', contact }); }} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold">Editar</button><button disabled={saving} onClick={() => void toggleContactActive(contact)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold disabled:opacity-50">{contact.activo ? 'Desactivar' : 'Reactivar'}</button></div></article>) : <p className="py-6 text-center text-sm text-slate-500">Aún no hay contactos.</p>}</div>}
          {detailTab === 'ubicaciones' && <div className="p-5"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold text-[#0b1f3b]">Ubicaciones operativas</h3><p className="mt-0.5 text-xs text-slate-500">Cada ubicación puede seleccionarse según el servicio.</p></div>{detail.activo && <button onClick={() => { setFormError(''); setModal({ kind: 'address' }); }} aria-label="Agregar ubicación" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-amber-300 hover:bg-amber-50"><PlusIcon className="h-4 w-4"/></button>}</div>
            <div className="space-y-3">{detail.direcciones.length ? detail.direcciones.map((address) => <article key={address.id} className={`rounded-lg border p-3 ${address.activo ? 'border-slate-100 bg-slate-50/70' : 'border-slate-200 bg-slate-100/70 opacity-75'}`}><div className="flex items-start gap-2.5"><MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#b28b00]"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-slate-800">{address.nombre}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${address.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{address.activo ? 'Activa' : 'Inactiva'}</span>{address.principal && address.activo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Principal</span>}</div>{(address.tipo_ubicacion || address.tipo_zona) && <p className="mt-1 text-[11px] font-medium text-slate-500">{address.tipo_ubicacion || 'Ubicación'}{address.tipo_zona ? ` · Zona ${address.tipo_zona}` : ''}</p>}<p className="mt-1 text-xs leading-5 text-slate-500">{address.calle}<br/>{address.ciudad}, {address.estado}{address.codigo_postal ? ` · C.P. ${address.codigo_postal}` : ''}</p><p className="mt-2 text-[11px] text-slate-400">{address.requiere_cita ? 'Requiere cita' : 'Sin cita requerida'}{address.horario ? ` · ${address.horario}` : ''}</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => { setFormError(''); setModal({ kind: 'address', address }); }} className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"><PencilSquareIcon className="h-3.5 w-3.5"/>Editar</button>{address.activo && !address.principal && <button disabled={saving} onClick={() => void markAddressPrimary(address)} className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50">Hacer principal</button>}<button disabled={saving} onClick={() => void toggleAddressActive(address)} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{address.activo ? 'Desactivar' : 'Reactivar'}</button></div></div></div></article>) : <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center"><MapPinIcon className="mx-auto h-6 w-6 text-slate-300"/><p className="mt-2 text-sm font-medium text-slate-600">Aún no hay direcciones</p><p className="mt-1 text-xs text-slate-400">Agrega un punto de carga o entrega.</p></div>}</div>
            {detail.activo ? <button onClick={() => { setFormError(''); setModal({ kind: 'address' }); }} className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"><PlusIcon className="mr-1.5 inline h-4 w-4"/>Agregar dirección</button> : <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Reactiva al cliente para agregar direcciones nuevas.</p>}
          </div>}
          {detailTab === 'resumen' && <div className="space-y-3 p-5"><article className="rounded-lg bg-slate-50 p-3"><h3 className="text-sm font-bold text-[#0b1f3b]">Domicilio legal o matriz</h3><p className="mt-2 text-xs leading-5 text-slate-600">{detail.domicilio_legal_calle ? `${detail.domicilio_legal_calle}, ${detail.domicilio_legal_ciudad ?? ''}, ${detail.domicilio_legal_estado ?? ''} ${detail.domicilio_legal_codigo_postal ?? ''}` : 'Sin domicilio legal capturado'}</p></article><p className="text-xs text-slate-500">{detail.contactos.filter((item) => item.activo).length} contactos activos · {detail.direcciones.filter((item) => item.activo).length} ubicaciones activas · {detail.convenios.filter((item) => item.activo).length} convenios vigentes</p><button onClick={() => { setDetailTab('ubicaciones'); }} className="text-xs font-semibold text-blue-800">Ver ubicaciones →</button></div>}
          {detailTab === 'comercial' && <div className="p-5"><div className="flex items-start justify-between gap-2"><div><h3 className="text-sm font-bold text-[#0b1f3b]">Convenios y rutas frecuentes</h3><p className="mt-1 text-xs text-slate-500">Las ubicaciones no tienen un rol fijo; cada convenio guarda su par habitual.</p></div>{detail.activo && <button onClick={() => { setFormError(''); setModal({ kind: 'agreement' }); }} aria-label="Agregar convenio" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-amber-50"><PlusIcon className="h-4 w-4"/></button>}</div>{detail.convenios.length ? detail.convenios.map((agreement) => <article key={agreement.id} className="mt-3 rounded-lg border border-slate-200 p-3"><div className="flex justify-between gap-2"><div><h4 className="text-sm font-semibold text-slate-800">{agreement.nombre}</h4><p className="mt-1 text-xs text-slate-500">{detail.direcciones.find((item) => item.id === agreement.origen_id)?.nombre ?? 'Origen abierto'} → {detail.direcciones.find((item) => item.id === agreement.destino_id)?.nombre ?? 'Destino abierto'}</p><p className="mt-1 text-xs text-slate-500">{agreement.tipo_servicio ?? 'Servicio por definir'} · {agreement.moneda} {Number(agreement.tarifa_base).toLocaleString('es-MX')}</p><p className="mt-1 text-[11px] text-slate-400">Vigente desde {agreement.vigente_desde?.slice(0, 10)}{agreement.vigente_hasta ? ` hasta ${agreement.vigente_hasta.slice(0, 10)}` : ''} · {agreement.activo ? 'Activo' : 'Inactivo'}</p></div><button onClick={() => { setFormError(''); setModal({ kind: 'agreement', agreement }); }} className="h-fit rounded border border-slate-200 px-2 py-1 text-xs">Editar</button></div><button disabled={saving} onClick={() => void toggleAgreementActive(agreement)} className="mt-2 text-xs font-semibold text-slate-600">{agreement.activo ? 'Desactivar convenio' : 'Reactivar convenio'}</button></article>) : <p className="mt-6 text-center text-sm text-slate-500">Aún no hay convenios registrados.</p>}</div>}
          {detailTab === 'facturacion' && <div className="space-y-3 p-5"><div><h3 className="text-sm font-bold text-[#0b1f3b]">Datos fiscales y de pago</h3><p className="mt-1 text-xs text-slate-500">Régimen fiscal: {detail.regimen_fiscal || 'Pendiente'} · Uso CFDI: {detail.uso_cfdi || 'Pendiente'}</p><p className="mt-1 text-xs text-slate-500">Forma: {detail.forma_pago || 'Pendiente'} · Método: {detail.metodo_pago || 'Pendiente'}</p><p className="mt-1 text-xs text-slate-500">Condiciones: {detail.condiciones_pago || 'Pendiente'}</p><label className="mt-3 block text-xs font-semibold text-slate-600">Contacto para comunicaciones de facturación<select disabled={saving || !detail.activo} value={detail.contacto_facturacion_id ?? ''} onChange={(event) => void selectBillingContact(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option value="">Sin seleccionar</option>{detail.contactos.filter((item) => item.activo).map((contact) => <option key={contact.id} value={contact.id}>{contact.nombre}{contact.email ? ` · ${contact.email}` : ''}</option>)}</select></label></div><div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><div className="flex items-center gap-2 text-sm font-semibold text-amber-900"><DocumentTextIcon className="h-4 w-4"/>Datos por cotejar con documento real</div><p className="mt-1 text-xs leading-5 text-amber-900/80">Para el CFDI 4.0 del cliente se deben cotejar RFC, razón social, régimen fiscal, código postal del domicilio fiscal y uso CFDI con su constancia. Falta revisar una Carta Porte real aplicable a la operación para definir qué más debe capturarse. En esta etapa no se cargan ni envían documentos.</p></div></div>}
        </> : <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><MapPinIcon className="h-6 w-6"/></div><h2 className="mt-4 font-bold text-[#0b1f3b]">Detalle del cliente</h2><p className="mt-1 max-w-xs text-sm text-slate-500">Selecciona un registro para ver sus direcciones y horarios de atención.</p></div>}
      </section>
    </div>

    {modal && detail && <ClientRecordDialog
      modal={modal}
      customer={detail}
      services={services}
      demo={mode === 'demo'}
      saving={saving}
      error={formError}
      onClose={() => setModal(null)}
      onSubmit={modal.kind === 'client' ? submitClientEdit : modal.kind === 'address' ? submitAddress : modal.kind === 'contact' ? submitContact : submitAgreement}
    />}
  </div>;
}
