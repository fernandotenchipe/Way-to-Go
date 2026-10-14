'use client';

import type { FormEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { LogisticsAddress, LogisticsCustomerDetail } from '../services/logistics-api';
import { LogisticsFormField, LogisticsFormSection, logisticsFieldClassName } from './LogisticsCatalogComponents';

export type ClientEditorModal = { kind: 'client' } | { kind: 'address'; address?: LogisticsAddress };

export default function ClientRecordDialog({
  modal,
  customer,
  demo,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  modal: ClientEditorModal;
  customer: LogisticsCustomerDetail;
  demo: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const editingClient = modal.kind === 'client';
  const contact = customer.contactos[0];
  const address = modal.kind === 'address' ? modal.address : undefined;
  const title = editingClient ? 'Editar cliente' : address ? 'Editar dirección' : 'Agregar dirección';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="client-record-dialog-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <h2 id="client-record-dialog-title" className="text-xl font-bold text-[#0b1f3b]">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{editingClient ? 'Actualiza los datos comerciales, el contacto y las condiciones del cliente.' : `Ubicación de ${customer.nombre_comercial || customer.razon_social}.`}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><XMarkIcon className="h-5 w-5"/></button>
        </div>

        <form key={editingClient ? 'client' : `address-${address?.id ?? 'new'}`} onSubmit={onSubmit} className="space-y-5 px-6 py-5">
          {editingClient ? <>
            <LogisticsFormSection title="Datos de la empresa" description="La razón social es necesaria para identificar al cliente.">
              <LogisticsFormField label="Razón social *"><input name="razon_social" required maxLength={180} defaultValue={customer.razon_social} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Nombre comercial"><input name="nombre_comercial" maxLength={180} defaultValue={customer.nombre_comercial ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="RFC"><input name="rfc" maxLength={13} defaultValue={customer.rfc ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            </LogisticsFormSection>
            <LogisticsFormSection title="Contacto principal" description="Si capturas cualquier dato, incluye también el nombre.">
              <LogisticsFormField label="Nombre"><input name="contacto_nombre" maxLength={160} defaultValue={contact?.nombre ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Área"><select name="contacto_tipo" defaultValue={contact?.tipo_contacto || 'OPERACIONES'} className={logisticsFieldClassName}><option value="OPERACIONES">Operaciones</option><option value="FACTURACION">Facturación</option><option value="COMPRAS">Compras</option><option value="OTRO">Otro</option></select></LogisticsFormField>
              <LogisticsFormField label="Puesto"><input name="contacto_puesto" maxLength={100} defaultValue={contact?.puesto ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Teléfono"><input name="contacto_telefono" type="tel" maxLength={30} defaultValue={contact?.telefono ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Correo"><input name="contacto_email" type="email" maxLength={180} defaultValue={contact?.email ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            </LogisticsFormSection>
            <LogisticsFormSection title="Facturación y pago" description="Puedes dejar vacíos los datos que aún no estén definidos.">
              <LogisticsFormField label="Uso CFDI"><input name="uso_cfdi" maxLength={40} defaultValue={customer.uso_cfdi ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Forma de pago"><input name="forma_pago" maxLength={60} defaultValue={customer.forma_pago ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Método de pago"><input name="metodo_pago" maxLength={60} defaultValue={customer.metodo_pago ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Condiciones de pago"><input name="condiciones_pago" maxLength={500} defaultValue={customer.condiciones_pago ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            </LogisticsFormSection>
          </> : <LogisticsFormSection title="Datos de la ubicación" description="Edita la dirección, el horario y las instrucciones de acceso.">
            <LogisticsFormField label="Nombre de la ubicación *"><input name="nombre" required maxLength={120} defaultValue={address?.nombre ?? ''} className={logisticsFieldClassName} placeholder="Planta, CEDIS o sucursal"/></LogisticsFormField>
            <LogisticsFormField label="Calle y número *"><input name="calle" required maxLength={200} defaultValue={address?.calle ?? ''} className={logisticsFieldClassName} placeholder="Av. Industrial 100"/></LogisticsFormField>
            <LogisticsFormField label="Ciudad *"><input name="ciudad" required maxLength={100} defaultValue={address?.ciudad ?? ''} className={logisticsFieldClassName} placeholder="Monterrey"/></LogisticsFormField>
            <LogisticsFormField label="Estado *"><input name="estado" required maxLength={100} defaultValue={address?.estado ?? ''} className={logisticsFieldClassName} placeholder="Nuevo León"/></LogisticsFormField>
            <LogisticsFormField label="Código postal"><input name="codigo_postal" maxLength={12} defaultValue={address?.codigo_postal ?? ''} className={logisticsFieldClassName} placeholder="64000"/></LogisticsFormField>
            <LogisticsFormField label="Horario de atención"><input name="horario" maxLength={120} defaultValue={address?.horario ?? ''} className={logisticsFieldClassName} placeholder="Lun–Vie 08:00–17:00"/></LogisticsFormField>
            <LogisticsFormField label="Zona horaria"><select name="zona_horaria" defaultValue={address?.zona_horaria ?? 'America/Mexico_City'} className={logisticsFieldClassName}><option value="America/Mexico_City">Centro · Ciudad de México</option><option value="America/Monterrey">Norte · Monterrey</option><option value="America/Tijuana">Pacífico · Tijuana</option></select></LogisticsFormField>
            <LogisticsFormField label="Instrucciones"><input name="instrucciones" maxLength={500} defaultValue={address?.instrucciones ?? ''} className={logisticsFieldClassName} placeholder="Acceso, andén o indicaciones especiales"/></LogisticsFormField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600"><input name="requiere_cita" type="checkbox" defaultChecked={address?.requiere_cita ?? false} className="accent-[#0b1f3b]"/>Requiere cita</label>
          </LogisticsFormSection>}

          {demo && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Modo demo: los cambios se guardan solo en este navegador, no en la base de datos.</p>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white pt-4">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
            <button disabled={saving} type="submit" className="inline-flex items-center gap-2 rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#183a64] disabled:cursor-wait disabled:opacity-60">{saving ? 'Guardando…' : title}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
