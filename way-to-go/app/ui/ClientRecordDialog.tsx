'use client';

import type { FormEvent } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { LogisticsAddress, LogisticsCustomerAgreement, LogisticsCustomerContact, LogisticsCustomerDetail, LogisticsServiceType } from '../services/logistics-api';
import { LogisticsFormField, LogisticsFormSection, logisticsFieldClassName } from './LogisticsCatalogComponents';

export type ClientEditorModal = { kind: 'client' } | { kind: 'address'; address?: LogisticsAddress } | { kind: 'contact'; contact?: LogisticsCustomerContact } | { kind: 'agreement'; agreement?: LogisticsCustomerAgreement };

export default function ClientRecordDialog({
  modal,
  customer,
  services = [],
  addresses = customer.direcciones,
  demo,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  modal: ClientEditorModal;
  customer: LogisticsCustomerDetail;
  services?: LogisticsServiceType[];
  addresses?: LogisticsAddress[];
  demo: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const editingClient = modal.kind === 'client';
  const editingContact = modal.kind === 'contact';
  const editingAgreement = modal.kind === 'agreement';
  const address = modal.kind === 'address' ? modal.address : undefined;
  const contact = modal.kind === 'contact' ? modal.contact : undefined;
  const agreement = modal.kind === 'agreement' ? modal.agreement : undefined;
  const title = editingClient ? 'Editar cliente' : editingContact ? contact ? 'Editar contacto' : 'Agregar contacto' : editingAgreement ? agreement ? 'Editar convenio' : 'Agregar convenio' : address ? 'Editar ubicación' : 'Agregar ubicación';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="client-record-dialog-title" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white px-6 py-5">
          <div>
            <h2 id="client-record-dialog-title" className="text-xl font-bold text-[#0b1f3b]">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{editingClient ? 'Actualiza el perfil y los requisitos de facturación.' : editingContact ? 'Guarda el historial de contactos sin reemplazar a otras personas.' : editingAgreement ? 'Registra una ruta frecuente y sus condiciones comerciales.' : `Ubicación de ${customer.nombre_comercial || customer.razon_social}.`}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><XMarkIcon className="h-5 w-5"/></button>
        </div>

        <form key={`${modal.kind}-${editingClient ? 'client' : editingContact ? contact?.id ?? 'new' : editingAgreement ? agreement?.id ?? 'new' : address?.id ?? 'new'}`} onSubmit={onSubmit} className="space-y-5 px-6 py-5">
          {editingClient ? <>
            <LogisticsFormSection title="Datos de la empresa" description="La razón social es necesaria para identificar al cliente.">
              <LogisticsFormField label="Razón social *"><input name="razon_social" required maxLength={180} defaultValue={customer.razon_social} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Nombre comercial"><input name="nombre_comercial" maxLength={180} defaultValue={customer.nombre_comercial ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="RFC"><input name="rfc" maxLength={13} autoCapitalize="characters" defaultValue={customer.rfc ?? ''} className={logisticsFieldClassName} /><span className="mt-1 block text-xs text-slate-400">Formato mexicano y RFC no repetido.</span></LogisticsFormField>
            </LogisticsFormSection>
            <LogisticsFormSection title="Domicilio legal o matriz" description="Se conserva aparte de las ubicaciones operativas.">
              <LogisticsFormField label="Calle y número"><input name="domicilio_legal_calle" maxLength={200} defaultValue={customer.domicilio_legal_calle ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Ciudad"><input name="domicilio_legal_ciudad" maxLength={100} defaultValue={customer.domicilio_legal_ciudad ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Estado"><input name="domicilio_legal_estado" maxLength={100} defaultValue={customer.domicilio_legal_estado ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="País"><input name="domicilio_legal_pais" maxLength={2} defaultValue={customer.domicilio_legal_pais ?? 'MX'} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Código postal"><input name="domicilio_legal_codigo_postal" maxLength={12} defaultValue={customer.domicilio_legal_codigo_postal ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            </LogisticsFormSection>
            <LogisticsFormSection title="Perfil comercial" description="Canal, motivo y servicios acordados.">
              <LogisticsFormField label="Canal de registro"><input name="canal_registro" maxLength={100} defaultValue={customer.canal_registro ?? ''} className={logisticsFieldClassName} placeholder="Recomendación, prospección…" /></LogisticsFormField>
              <LogisticsFormField label="Motivo de registro"><input name="motivo_registro" maxLength={300} defaultValue={customer.motivo_registro ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <div className="flex flex-wrap gap-4 pb-2 text-sm text-slate-700"><label className="flex items-center gap-2"><input type="checkbox" name="servicios_acordados" value="IMPORTACION" defaultChecked={customer.servicios_acordados?.includes('IMPORTACION')} className="accent-[#0b1f3b]"/>Importación</label><label className="flex items-center gap-2"><input type="checkbox" name="servicios_acordados" value="EXPORTACION" defaultChecked={customer.servicios_acordados?.includes('EXPORTACION')} className="accent-[#0b1f3b]"/>Exportación</label></div>
            </LogisticsFormSection>
            <LogisticsFormSection title="Facturación y pago" description="Puedes dejar vacíos los datos que aún no estén definidos.">
              <LogisticsFormField label="Régimen fiscal receptor"><input name="regimen_fiscal" maxLength={80} defaultValue={customer.regimen_fiscal ?? ''} className={logisticsFieldClassName} placeholder="Según constancia fiscal" /></LogisticsFormField>
              <LogisticsFormField label="Uso CFDI"><input name="uso_cfdi" maxLength={40} defaultValue={customer.uso_cfdi ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Forma de pago"><input name="forma_pago" maxLength={60} defaultValue={customer.forma_pago ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Método de pago"><input name="metodo_pago" maxLength={60} defaultValue={customer.metodo_pago ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
              <LogisticsFormField label="Condiciones de pago"><input name="condiciones_pago" maxLength={500} defaultValue={customer.condiciones_pago ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            </LogisticsFormSection>
          </> : editingContact ? <LogisticsFormSection title="Datos del contacto" description="La baja es lógica y conserva los datos históricos.">
            <LogisticsFormField label="Nombre *"><input name="nombre" required maxLength={160} defaultValue={contact?.nombre ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Función"><select name="tipo_contacto" defaultValue={contact?.tipo_contacto || 'OPERACIONES'} className={logisticsFieldClassName}><option value="PRINCIPAL">Contacto principal</option><option value="OPERACIONES">Operaciones</option><option value="FACTURACION_CXP">Facturación / cuentas por pagar</option><option value="ALTA_CLIENTE">Persona que dio de alta</option><option value="OTRO">Otro</option></select></LogisticsFormField>
            <LogisticsFormField label="Puesto"><input name="puesto" maxLength={100} defaultValue={contact?.puesto ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Teléfono"><input name="telefono" type="tel" maxLength={30} defaultValue={contact?.telefono ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Correo"><input name="email" type="email" maxLength={180} defaultValue={contact?.email ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-600"><input name="principal" type="checkbox" defaultChecked={contact?.principal ?? !customer.contactos.some((item) => item.activo && item.principal)} className="accent-[#0b1f3b]"/>Contacto principal</label>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-600"><input name="para_facturacion" type="checkbox" defaultChecked={customer.contacto_facturacion_id === contact?.id} className="accent-[#0b1f3b]"/>Contacto de facturación</label>
          </LogisticsFormSection> : editingAgreement ? <LogisticsFormSection title="Ruta frecuente y tarifa" description="El convenio agrupa la ruta, el tipo de servicio y sus condiciones.">
            <LogisticsFormField label="Nombre del convenio *"><input name="nombre" required maxLength={160} defaultValue={agreement?.nombre ?? ''} className={logisticsFieldClassName} placeholder="MTY a Querétaro · caja seca" /></LogisticsFormField>
            <LogisticsFormField label="Origen habitual"><select name="origen_id" defaultValue={agreement?.origen_id ?? ''} className={logisticsFieldClassName}><option value="">Sin especificar</option>{addresses.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.ciudad}</option>)}</select></LogisticsFormField>
            <LogisticsFormField label="Destino habitual"><select name="destino_id" defaultValue={agreement?.destino_id ?? ''} className={logisticsFieldClassName}><option value="">Sin especificar</option>{addresses.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.nombre} · {item.ciudad}</option>)}</select></LogisticsFormField>
            <LogisticsFormField label="Tipo de servicio"><select name="tipo_servicio_id" defaultValue={agreement?.tipo_servicio_id ?? ''} className={logisticsFieldClassName}><option value="">Por definir</option>{services.filter((item) => item.activo).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></LogisticsFormField>
            <LogisticsFormField label="Tipo de unidad"><input name="tipo_unidad" maxLength={80} defaultValue={agreement?.tipo_unidad ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Tipo de carga"><input name="tipo_carga" maxLength={100} defaultValue={agreement?.tipo_carga ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Tarifa base *"><input name="tarifa_base" required type="number" min="0" step="0.01" defaultValue={agreement?.tarifa_base ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Moneda"><select name="moneda" defaultValue={agreement?.moneda ?? 'MXN'} className={logisticsFieldClassName}><option value="MXN">MXN</option><option value="USD">USD</option></select></LogisticsFormField>
            <LogisticsFormField label="Vigente desde *"><input name="vigente_desde" required type="date" defaultValue={agreement?.vigente_desde?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Vigente hasta"><input name="vigente_hasta" type="date" defaultValue={agreement?.vigente_hasta?.slice(0, 10) ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Horas libres de carga"><input name="horas_libres_carga" type="number" min="0" step="0.25" defaultValue={agreement?.horas_libres_carga ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Horas libres de descarga"><input name="horas_libres_descarga" type="number" min="0" step="0.25" defaultValue={agreement?.horas_libres_descarga ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Tarifa por hora de estadía"><input name="tarifa_estadia_hora" type="number" min="0" step="0.01" defaultValue={agreement?.tarifa_estadia_hora ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
            <LogisticsFormField label="Condiciones"><input name="condiciones" maxLength={1000} defaultValue={agreement?.condiciones ?? ''} className={logisticsFieldClassName} /></LogisticsFormField>
          </LogisticsFormSection> : <LogisticsFormSection title="Datos de la ubicación" description="La dirección no tiene un rol fijo; puede elegirse según cada servicio.">
            <LogisticsFormField label="Nombre de la ubicación *"><input name="nombre" required maxLength={120} defaultValue={address?.nombre ?? ''} className={logisticsFieldClassName} placeholder="Planta, CEDIS o sucursal"/></LogisticsFormField>
            <LogisticsFormField label="Tipo de ubicación"><input name="tipo_ubicacion" maxLength={80} defaultValue={address?.tipo_ubicacion ?? ''} className={logisticsFieldClassName} placeholder="Sucursal, planta, almacén…"/></LogisticsFormField>
            <LogisticsFormField label="Tipo de zona"><input name="tipo_zona" maxLength={80} defaultValue={address?.tipo_zona ?? ''} className={logisticsFieldClassName} placeholder="Industrial, urbana…"/></LogisticsFormField>
            <LogisticsFormField label="Calle y número *"><input name="calle" required maxLength={200} defaultValue={address?.calle ?? ''} className={logisticsFieldClassName} placeholder="Av. Industrial 100"/></LogisticsFormField>
            <LogisticsFormField label="Ciudad *"><input name="ciudad" required maxLength={100} defaultValue={address?.ciudad ?? ''} className={logisticsFieldClassName} placeholder="Monterrey"/></LogisticsFormField>
            <LogisticsFormField label="Estado *"><input name="estado" required maxLength={100} defaultValue={address?.estado ?? ''} className={logisticsFieldClassName} placeholder="Nuevo León"/></LogisticsFormField>
            <LogisticsFormField label="Código postal"><input name="codigo_postal" maxLength={12} defaultValue={address?.codigo_postal ?? ''} className={logisticsFieldClassName} placeholder="64000"/></LogisticsFormField>
            <LogisticsFormField label="Horario de atención"><input name="horario" maxLength={120} defaultValue={address?.horario ?? ''} className={logisticsFieldClassName} placeholder="Lun–Vie 08:00–17:00"/></LogisticsFormField>
            <LogisticsFormField label="Zona horaria"><select name="zona_horaria" defaultValue={address?.zona_horaria ?? 'America/Mexico_City'} className={logisticsFieldClassName}><option value="America/Mexico_City">Centro · Ciudad de México</option><option value="America/Monterrey">Norte · Monterrey</option><option value="America/Tijuana">Pacífico · Tijuana</option></select></LogisticsFormField>
            <LogisticsFormField label="Instrucciones"><input name="instrucciones" maxLength={500} defaultValue={address?.instrucciones ?? ''} className={logisticsFieldClassName} placeholder="Acceso, andén o indicaciones especiales"/></LogisticsFormField>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600"><input name="requiere_cita" type="checkbox" defaultChecked={address?.requiere_cita ?? false} className="accent-[#0b1f3b]"/>Requiere cita</label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-slate-700"><input name="principal" type="checkbox" defaultChecked={address?.principal ?? !customer.direcciones.some((item) => item.activo && item.principal)} className="accent-[#0b1f3b]"/>Usar como dirección principal</label>
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
