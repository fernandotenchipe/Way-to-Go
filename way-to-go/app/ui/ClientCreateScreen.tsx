'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { logisticsApi, type LogisticsAddress, type LogisticsCustomerCreateInput } from '../services/logistics-api';
import { saveDemoLogisticsCustomer, type DemoLogisticsCustomer } from '../services/logistics-demo-customers';
import { CatalogPageHeader, LogisticsFormField, LogisticsFormSection, logisticsFieldClassName } from './LogisticsCatalogComponents';

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

  useEffect(() => {
    logisticsApi.getCustomers()
      .then(() => setMode('live'))
      .catch((error: unknown) => {
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
    const contact = {
      nombre: value('contacto_nombre'),
      puesto: value('contacto_puesto'),
      tipo_contacto: value('contacto_tipo') || 'OPERACIONES',
      email: value('contacto_email'),
      telefono: value('contacto_telefono'),
    };
    const address = {
      nombre: value('direccion_nombre'),
      calle: value('direccion_calle'),
      ciudad: value('direccion_ciudad'),
      estado: value('direccion_estado'),
      pais: 'MX',
      codigo_postal: value('direccion_cp'),
      zona_horaria: value('direccion_zona') || 'America/Mexico_City',
      horario: value('direccion_horario'),
      instrucciones: value('direccion_instrucciones'),
      requiere_cita: form.get('direccion_cita') === 'on',
    };
    const hasContact = [contact.nombre, contact.puesto, contact.email, contact.telefono].some(Boolean);
    const hasAddress = [address.nombre, address.calle, address.ciudad, address.estado, address.codigo_postal, address.horario, address.instrucciones].some(Boolean);

    if (hasContact && !contact.nombre) {
      setFormError('Escribe el nombre del contacto o deja vacía toda esa sección.');
      setSaving(false);
      return;
    }
    if (hasAddress && ![address.nombre, address.calle, address.ciudad, address.estado].every(Boolean)) {
      setFormError('Para guardar la ubicación necesitamos nombre, calle, ciudad y estado.');
      setSaving(false);
      return;
    }

    const input: LogisticsCustomerCreateInput = {
      razon_social: value('razon_social'),
      nombre_comercial: value('nombre_comercial'),
      rfc: value('rfc'),
      uso_cfdi: value('uso_cfdi'),
      forma_pago: value('forma_pago'),
      metodo_pago: value('metodo_pago'),
      condiciones_pago: value('condiciones_pago'),
      contacto: hasContact ? contact : undefined,
      direccion: hasAddress ? address as Omit<LogisticsAddress, 'id' | 'cliente_id' | 'activo'> : undefined,
    };

    try {
      let customerId: string;
      if (mode === 'live') {
        const response = await logisticsApi.createCustomer(input);
        customerId = response.data.id;
      } else {
        customerId = `demo-${crypto.randomUUID()}`;
        const demoAddress: LogisticsAddress | undefined = hasAddress ? {
          id: `demo-address-${crypto.randomUUID()}`,
          cliente_id: customerId,
          nombre: address.nombre,
          calle: address.calle,
          ciudad: address.ciudad,
          estado: address.estado,
          pais: address.pais,
          codigo_postal: address.codigo_postal || null,
          zona_horaria: address.zona_horaria,
          horario: address.horario || null,
          instrucciones: address.instrucciones || null,
          requiere_cita: address.requiere_cita,
          activo: true,
        } : undefined;
        const created: DemoLogisticsCustomer = {
          id: customerId,
          razon_social: input.razon_social,
          nombre_comercial: input.nombre_comercial || null,
          rfc: input.rfc || null,
          uso_cfdi: input.uso_cfdi || null,
          forma_pago: input.forma_pago || null,
          metodo_pago: input.metodo_pago || null,
          condiciones_pago: input.condiciones_pago || null,
          activo: true,
          direcciones_activas: demoAddress ? 1 : 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          address_preview: demoAddress ? `${demoAddress.ciudad}, ${demoAddress.estado}` : null,
          demo_addresses: demoAddress ? [demoAddress] : [],
          demo_contacts: hasContact ? [{
            id: `demo-contact-${crypto.randomUUID()}`,
            nombre: contact.nombre,
            puesto: contact.puesto || null,
            email: contact.email || null,
            telefono: contact.telefono || null,
            tipo_contacto: contact.tipo_contacto,
            principal: true,
          }] : [],
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
          <LogisticsFormField label="RFC"><input name="rfc" maxLength={13} className={field} placeholder="RFC de la empresa"/></LogisticsFormField>
        </LogisticsFormSection>

        <LogisticsFormSection title="Contacto principal" description="Opcional. Si agregas algún dato, necesitamos al menos el nombre.">
          <LogisticsFormField label="Nombre"><input name="contacto_nombre" maxLength={160} className={field} placeholder="Persona responsable"/></LogisticsFormField>
          <LogisticsFormField label="Área"><select name="contacto_tipo" className={field}><option value="OPERACIONES">Operaciones</option><option value="FACTURACION">Facturación</option><option value="COMPRAS">Compras</option><option value="OTRO">Otro</option></select></LogisticsFormField>
          <LogisticsFormField label="Puesto"><input name="contacto_puesto" maxLength={100} className={field} placeholder="Coordinación logística"/></LogisticsFormField>
          <LogisticsFormField label="Teléfono"><input name="contacto_telefono" type="tel" maxLength={30} className={field} placeholder="Teléfono directo"/></LogisticsFormField>
          <LogisticsFormField label="Correo"><input name="contacto_email" type="email" maxLength={180} className={field} placeholder="nombre@empresa.com"/></LogisticsFormField>
        </LogisticsFormSection>

        <LogisticsFormSection title="Primera ubicación" description="Opcional. Si agregas una ubicación, completa nombre, calle, ciudad y estado.">
          <LogisticsFormField label="Nombre de la ubicación"><input name="direccion_nombre" maxLength={120} className={field} placeholder="Planta Apodaca"/></LogisticsFormField>
          <LogisticsFormField label="Calle y número"><input name="direccion_calle" maxLength={200} className={field} placeholder="Av. Industrial 100"/></LogisticsFormField>
          <LogisticsFormField label="Ciudad"><input name="direccion_ciudad" maxLength={100} className={field} placeholder="Monterrey"/></LogisticsFormField>
          <LogisticsFormField label="Estado"><input name="direccion_estado" maxLength={100} className={field} placeholder="Nuevo León"/></LogisticsFormField>
          <LogisticsFormField label="Código postal"><input name="direccion_cp" maxLength={12} className={field} placeholder="64000"/></LogisticsFormField>
          <LogisticsFormField label="Horario de atención"><input name="direccion_horario" maxLength={120} className={field} placeholder="Lun–Vie 08:00–17:00"/></LogisticsFormField>
          <LogisticsFormField label="Zona horaria"><select name="direccion_zona" className={field}><option value="America/Mexico_City">Centro · Ciudad de México</option><option value="America/Monterrey">Norte · Monterrey</option><option value="America/Tijuana">Pacífico · Tijuana</option></select></LogisticsFormField>
          <LogisticsFormField label="Instrucciones de acceso"><input name="direccion_instrucciones" maxLength={500} className={field} placeholder="Andén, acceso o indicaciones"/></LogisticsFormField>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600"><input name="direccion_cita" type="checkbox" className="accent-[#0b1f3b]"/>Requiere cita</label>
        </LogisticsFormSection>

        <LogisticsFormSection title="Datos de facturación y pago" description="Opcionales; puedes agregarlos cuando el cliente confirme sus condiciones.">
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
