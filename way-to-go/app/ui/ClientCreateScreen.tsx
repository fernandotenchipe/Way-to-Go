'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { logisticsApi, type LogisticsAddress, type LogisticsCustomer, type LogisticsCustomerCreateInput } from '../services/logistics-api';
import { getDemoLogisticsCustomers, saveDemoLogisticsCustomer, type DemoLogisticsCustomer } from '../services/logistics-demo-customers';
import { hasDuplicateCustomerRfc, isValidContactEmail, isValidMexicanRfc, normalizeCustomerRfc } from '../services/customer-validation';
import { CatalogPageHeader, LogisticsFormField, LogisticsFormSection, logisticsFieldClassName } from './LogisticsCatalogComponents';

import LogisticsAddressFields, { readAddress, isAddressStarted, isAddressComplete } from './LogisticsAddressFields';

type ConnectionMode = 'checking' | 'live' | 'demo';

const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg bg-[#0b1f3b] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183a64] disabled:cursor-wait disabled:opacity-60';
const secondaryButton = 'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50';
const field = logisticsFieldClassName;

export default function ClientCreateScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<ConnectionMode>('checking');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [existingCustomers, setExistingCustomers] = useState<LogisticsCustomer[]>([]);
  const [contactRows, setContactRows] = useState([0]);
  const [addressRows, setAddressRows] = useState([0]);
  const [primaryRow, setPrimaryRow] = useState(0);

  useEffect(() => {
    logisticsApi.getCustomers()
      .then((response) => { setExistingCustomers(response.data); setMode('live'); })
      .catch((error: unknown) => {
        setExistingCustomers(getDemoLogisticsCustomers());
        setMode('demo');
        setConnectionMessage(error instanceof Error ? error.message : 'No fue posible consultar la base de datos.');
      });
  }, []);

  async function submitClient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError('');

    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '').trim();
    const contacts = contactRows.map((row) => ({
      nombre: value(`contacto_${row}_nombre`),
      puesto: value(`contacto_${row}_puesto`),
      tipo_contacto: value(`contacto_${row}_tipo`) || 'OPERACIONES',
      email: value(`contacto_${row}_email`),
      telefono: value(`contacto_${row}_telefono`),
      principal: form.get(`contacto_${row}_principal`) === 'on',
      para_facturacion: form.get(`contacto_${row}_facturacion`) === 'on',
    })).filter((contact) => [contact.nombre, contact.puesto, contact.email, contact.telefono].some(Boolean));
    const addresses = addressRows.map((row) => ({ ...readAddress(form, `direccion_${row}`), principal: row === primaryRow })).filter(isAddressStarted);
    if (addresses.length && !addresses.some((address) => address.principal)) addresses[0].principal = true;

    if (contacts.some((contact) => !contact.nombre)) {
      setFormError('Escribe el nombre de cada contacto que empezaste a capturar.');
      setSaving(false);
      return;
    }
    if (contacts.filter((contact) => contact.principal).length > 1 || contacts.filter((contact) => contact.para_facturacion).length > 1) {
      setFormError('Selecciona un solo contacto principal y un solo contacto para facturación.');
      setSaving(false);
      return;
    }
    const rfc = normalizeCustomerRfc(value('rfc'));
    if (!isValidMexicanRfc(rfc)) {
      setFormError('Revisa el RFC: debe tener formato de persona moral (12 caracteres) o física (13 caracteres).');
      setSaving(false);
      return;
    }
    if (hasDuplicateCustomerRfc(existingCustomers, rfc)) {
      setFormError('Ya existe un cliente registrado con ese RFC.');
      setSaving(false);
      return;
    }
    if (contacts.some((contact) => !isValidContactEmail(contact.email))) {
      setFormError('Revisa los correos: cada uno debe tener un formato válido.');
      setSaving(false);
      return;
    }
    if (addresses.some((address) => !isAddressComplete(address))) {
      setFormError('Para guardar la ubicación necesitamos nombre, calle, ciudad y estado.');
      setSaving(false);
      return;
    }

    const input: LogisticsCustomerCreateInput = {
      razon_social: value('razon_social'),
      nombre_comercial: value('nombre_comercial'),
      rfc,
      uso_cfdi: value('uso_cfdi'),
      forma_pago: value('forma_pago'),
      metodo_pago: value('metodo_pago'),
      condiciones_pago: value('condiciones_pago'),
      domicilio_legal_calle: value('domicilio_legal_calle'),
      domicilio_legal_ciudad: value('domicilio_legal_ciudad'),
      domicilio_legal_estado: value('domicilio_legal_estado'),
      domicilio_legal_pais: value('domicilio_legal_pais') || 'MX',
      domicilio_legal_codigo_postal: value('domicilio_legal_codigo_postal'),
      canal_registro: value('canal_registro'),
      motivo_registro: value('motivo_registro'),
      servicios_acordados: form.getAll('servicios_acordados').map(String),
      regimen_fiscal: value('regimen_fiscal'),
      contactos: contacts,
      direcciones: addresses,
    };

    try {
      let customerId: string;
      if (mode === 'live') {
        const response = await logisticsApi.createCustomer(input);
        customerId = response.data.id;
      } else {
        customerId = `demo-${crypto.randomUUID()}`;
        const demoAddresses: LogisticsAddress[] = addresses.map((address) => ({ ...address, id: `demo-address-${crypto.randomUUID()}`, cliente_id: customerId, activo: true }));
        const demoAddress = demoAddresses.find((address) => address.principal);
        const demoContacts = contacts.map((contact) => ({
          id: `demo-contact-${crypto.randomUUID()}`,
          cliente_id: customerId,
          nombre: contact.nombre,
          puesto: contact.puesto || null,
          email: contact.email.toLowerCase() || null,
          telefono: contact.telefono || null,
          tipo_contacto: contact.tipo_contacto,
          principal: contact.principal,
          activo: true,
        }));
        const created: DemoLogisticsCustomer = {
          id: customerId,
          razon_social: input.razon_social,
          nombre_comercial: input.nombre_comercial || null,
          rfc: input.rfc || null,
          uso_cfdi: input.uso_cfdi || null,
          forma_pago: input.forma_pago || null,
          metodo_pago: input.metodo_pago || null,
          condiciones_pago: input.condiciones_pago || null,
          domicilio_legal_calle: input.domicilio_legal_calle || null,
          domicilio_legal_ciudad: input.domicilio_legal_ciudad || null,
          domicilio_legal_estado: input.domicilio_legal_estado || null,
          domicilio_legal_pais: input.domicilio_legal_pais || null,
          domicilio_legal_codigo_postal: input.domicilio_legal_codigo_postal || null,
          canal_registro: input.canal_registro || null,
          motivo_registro: input.motivo_registro || null,
          servicios_acordados: input.servicios_acordados,
          regimen_fiscal: input.regimen_fiscal || null,
          contacto_facturacion_id: demoContacts.find((_, index) => contacts[index]?.para_facturacion)?.id ?? null,
          activo: true,
          direcciones_activas: demoAddresses.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          address_preview: demoAddress ? `${demoAddress.ciudad}, ${demoAddress.estado}` : null,
          demo_addresses: demoAddresses,
          demo_contacts: demoContacts,
        };
        saveDemoLogisticsCustomer(created);
      }

      router.push(`/logistica/clientes?created=${encodeURIComponent(customerId)}`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No se pudo guardar el cliente.');
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 lg:p-8">
      <CatalogPageHeader
        eyebrow="Datos base · Logística"
        title="Agregar cliente"
        description="Registra la empresa y captura ahora los datos que ya tengas. Podrás completar lo demás después."
        action={<Link href="/logistica/clientes" className={secondaryButton}><ArrowLeftIcon className="h-4 w-4"/>Volver a clientes</Link>}
      />

      {mode === 'checking' && <p role="status" className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Comprobando conexión para guardar el cliente…</p>}
      {mode === 'demo' && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><p className="font-semibold">Captura en modo de demostración</p><p className="mt-1 text-amber-900/80">La base no está disponible ({connectionMessage}). El registro se conservará en este navegador, pero no se enviará a Supabase.</p></div>}

      <form onSubmit={submitClient} className="space-y-5">
        <LogisticsFormSection title="Datos de la empresa" description="La razón social es el único dato obligatorio para crear el registro.">
          <LogisticsFormField label="Razón social *"><input name="razon_social" required maxLength={180} className={field} placeholder="Empresa, S.A. de C.V."/></LogisticsFormField>
          <LogisticsFormField label="Nombre comercial"><input name="nombre_comercial" maxLength={180} className={field} placeholder="Nombre con el que la identifican"/></LogisticsFormField>
          <LogisticsFormField label="RFC"><input name="rfc" maxLength={13} autoCapitalize="characters" className={field} placeholder="RFC de la empresa"/><span className="mt-1 block text-xs text-slate-400">Se valida formato y que no esté registrado.</span></LogisticsFormField>
        </LogisticsFormSection>

        <LogisticsFormSection title="Contactos" description="Puedes registrar a la persona principal, operaciones, facturación o quien dio de alta al cliente.">
          {contactRows.map((row, index) => <div key={row} className="col-span-full grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-3">
            <LogisticsFormField label={`Contacto ${index + 1} · nombre`}><input name={`contacto_${row}_nombre`} maxLength={160} className={field} placeholder="Nombre completo"/></LogisticsFormField>
            <LogisticsFormField label="Función"><select name={`contacto_${row}_tipo`} className={field}><option value="OPERACIONES">Operaciones</option><option value="FACTURACION_CXP">Facturación / cuentas por pagar</option><option value="ALTA_CLIENTE">Persona que dio de alta</option><option value="OTRO">Otro</option></select></LogisticsFormField>
            <LogisticsFormField label="Puesto"><input name={`contacto_${row}_puesto`} maxLength={100} className={field} placeholder="Coordinación logística"/></LogisticsFormField>
            <LogisticsFormField label="Teléfono"><input name={`contacto_${row}_telefono`} type="tel" maxLength={30} className={field} placeholder="Teléfono directo"/></LogisticsFormField>
            <LogisticsFormField label="Correo"><input name={`contacto_${row}_email`} type="email" maxLength={180} className={field} placeholder="nombre@empresa.com"/></LogisticsFormField>
            <div className="flex flex-wrap items-end gap-4 pb-2 text-sm text-slate-600"><label className="flex items-center gap-2"><input name={`contacto_${row}_principal`} type="checkbox" defaultChecked={index === 0} className="accent-[#0b1f3b]"/>Principal</label><label className="flex items-center gap-2"><input name={`contacto_${row}_facturacion`} type="checkbox" className="accent-[#0b1f3b]"/>Facturación</label>{contactRows.length > 1 && <button type="button" aria-label="Quitar contacto" onClick={() => setContactRows((rows) => rows.filter((item) => item !== row))} className="text-rose-700"><TrashIcon className="h-4 w-4"/></button>}</div>
          </div>)}
          <button type="button" onClick={() => setContactRows((rows) => [...rows, Math.max(...rows) + 1])} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b1f3b]"><PlusIcon className="h-4 w-4"/>Agregar contacto</button>
        </LogisticsFormSection>

        <LogisticsFormSection title="Domicilio de facturación" description="Separado de los lugares donde se recoge o entrega carga. La matriz puede tener otra dirección.">
          <LogisticsFormField label="Calle y número"><input name="domicilio_legal_calle" maxLength={200} className={field}/></LogisticsFormField>
          <LogisticsFormField label="Ciudad"><input name="domicilio_legal_ciudad" maxLength={100} className={field}/></LogisticsFormField>
          <LogisticsFormField label="Estado"><input name="domicilio_legal_estado" maxLength={100} className={field}/></LogisticsFormField>
          <LogisticsFormField label="País"><input name="domicilio_legal_pais" maxLength={2} defaultValue="MX" className={field}/></LogisticsFormField>
          <LogisticsFormField label="Código postal"><input name="domicilio_legal_codigo_postal" maxLength={12} className={field}/></LogisticsFormField>
        </LogisticsFormSection>

        <LogisticsFormSection title="Ubicaciones de operación" description="Agrega plantas, sucursales o almacenes. En cada viaje elegirás dónde recoger y entregar; principal solo identifica la ubicación habitual.">
          {addressRows.map((row, index) => <div key={row} className="col-span-full grid gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="col-span-full flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Ubicación {index + 1}</h3>
              <label className="flex items-center gap-2 text-sm"><input type="radio" name="ubicacion_principal" checked={primaryRow === row} onChange={() => setPrimaryRow(row)} />Principal</label>
              {addressRows.length > 1 && <button type="button" className="text-sm text-rose-700" onClick={() => { setAddressRows((rows) => rows.filter((item) => item !== row)); if (primaryRow === row) setPrimaryRow(addressRows.find((item) => item !== row)!); }}>Quitar ubicación</button>}
            </div>
            <LogisticsAddressFields prefix={`direccion_${row}`} />
            <button type="button" className="col-span-full text-left text-sm font-semibold text-blue-800" onClick={(event) => {
              const form = event.currentTarget.form!;
              for (const [target, source] of [['calle', 'calle'], ['ciudad', 'ciudad'], ['estado', 'estado'], ['pais', 'pais'], ['cp', 'codigo_postal']]) {
                const input = form.elements.namedItem(`direccion_${row}_${target}`) as HTMLInputElement;
                input.value = (form.elements.namedItem(`domicilio_legal_${source}`) as HTMLInputElement).value;
              }
            }}>Copiar domicilio de facturación a esta ubicación</button>
          </div>)}
          <button type="button" disabled={addressRows.length >= 30} onClick={() => setAddressRows((rows) => [...rows, Math.max(...rows) + 1])} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b1f3b]"><PlusIcon className="h-4 w-4" />Agregar ubicación</button>
        </LogisticsFormSection>

        <LogisticsFormSection title="Perfil comercial" description="Información de adquisición y servicios acordados.">
          <LogisticsFormField label="Canal de registro"><input name="canal_registro" maxLength={100} className={field} placeholder="Recomendación, prospección…"/></LogisticsFormField>
          <LogisticsFormField label="Motivo de registro"><input name="motivo_registro" maxLength={300} className={field} placeholder="Necesidad o referencia de alta"/></LogisticsFormField>
          <div className="flex flex-wrap items-center gap-4 pb-2 text-sm text-slate-700"><span className="font-medium">Servicios acordados</span><label className="flex items-center gap-2"><input type="checkbox" name="servicios_acordados" value="IMPORTACION" className="accent-[#0b1f3b]"/>Importación</label><label className="flex items-center gap-2"><input type="checkbox" name="servicios_acordados" value="EXPORTACION" className="accent-[#0b1f3b]"/>Exportación</label></div>
        </LogisticsFormSection>

        <LogisticsFormSection title="Datos de facturación y pago" description="Opcionales; puedes agregarlos cuando el cliente confirme sus condiciones.">
          <LogisticsFormField label="Régimen fiscal receptor"><input name="regimen_fiscal" maxLength={80} className={field} placeholder="Según constancia de situación fiscal"/></LogisticsFormField>
          <LogisticsFormField label="Uso CFDI"><input name="uso_cfdi" maxLength={40} className={field} placeholder="Clave o descripción"/></LogisticsFormField>
          <LogisticsFormField label="Forma de pago"><input name="forma_pago" maxLength={60} className={field} placeholder="Forma acordada"/></LogisticsFormField>
          <LogisticsFormField label="Método de pago"><input name="metodo_pago" maxLength={60} className={field} placeholder="Método acordado"/></LogisticsFormField>
          <LogisticsFormField label="Condiciones de pago"><input name="condiciones_pago" maxLength={500} className={field} placeholder="Plazo o notas de crédito"/></LogisticsFormField>
        </LogisticsFormSection>

        {formError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{formError}</p>}
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-slate-50/95 py-4 backdrop-blur">
          <Link href="/logistica/clientes" className={secondaryButton}>Cancelar</Link>
          <button type="submit" disabled={mode === 'checking' || saving} className={primaryButton}>
            {saving ? 'Guardando…' : mode === 'demo' ? 'Guardar en esta demo' : <><CheckCircleIcon className="h-4 w-4"/>Guardar cliente</>}
          </button>
        </div>
      </form>
    </div>
  );
}
