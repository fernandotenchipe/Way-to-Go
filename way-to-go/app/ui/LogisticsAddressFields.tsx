import type { LogisticsAddressInput } from '../services/logistics-api';
import { LogisticsFormField as Field, logisticsFieldClassName as field } from './LogisticsCatalogComponents';

export function readAddress(form: FormData, prefix: string): LogisticsAddressInput {
  const value = (key: string) => String(form.get(`${prefix}_${key}`) ?? '').trim();
  return {
    nombre: value('nombre'), calle: value('calle'), ciudad: value('ciudad'), estado: value('estado'),
    pais: value('pais').toUpperCase() || 'MX', codigo_postal: value('cp'),
    zona_horaria: value('zona') || 'America/Mexico_City', horario: value('horario'),
    instrucciones: value('instrucciones'), requiere_cita: form.get(`${prefix}_cita`) === 'on',
    tipo_ubicacion: value('tipo_ubicacion'), tipo_zona: value('tipo_zona'),
  };
}

export function isAddressStarted(address: LogisticsAddressInput) {
  return [address.nombre, address.calle, address.ciudad, address.estado, address.codigo_postal, address.horario, address.instrucciones, address.tipo_ubicacion, address.tipo_zona].some(Boolean) || address.requiere_cita;
}

export function isAddressComplete(address: LogisticsAddressInput) {
  return [address.nombre, address.calle, address.ciudad, address.estado].every(Boolean);
}

export default function LogisticsAddressFields({ prefix, required = false, compact = false }: { prefix: string; required?: boolean; compact?: boolean }) {
  return <>
    <Field label="Nombre de la ubicación"><input name={`${prefix}_nombre`} required={required} maxLength={120} className={field} placeholder="Planta, sucursal o almacén" /></Field>
    <Field label="Calle y número"><input name={`${prefix}_calle`} required={required} maxLength={200} className={field} /></Field>
    <Field label="Ciudad"><input name={`${prefix}_ciudad`} required={required} maxLength={100} className={field} /></Field>
    <Field label="Estado"><input name={`${prefix}_estado`} required={required} maxLength={100} className={field} /></Field>
    <Field label="País"><input name={`${prefix}_pais`} defaultValue="MX" required minLength={2} maxLength={2} className={field} /></Field>
    <Field label="Código postal"><input name={`${prefix}_cp`} maxLength={12} className={field} /></Field>
    <Field label="Zona horaria del lugar"><select name={`${prefix}_zona`} className={field}><option value="America/Mexico_City">Centro · Ciudad de México</option><option value="America/Monterrey">Norte · Monterrey</option><option value="America/Tijuana">Pacífico · Tijuana</option><option value="America/Cancun">Quintana Roo · Cancún</option><option value="America/Hermosillo">Sonora · Hermosillo</option></select></Field>
    {!compact && <>
      <Field label="Tipo de ubicación"><input name={`${prefix}_tipo_ubicacion`} maxLength={80} className={field} placeholder="Sucursal, planta, almacén…" /></Field>
      <Field label="Tipo de zona"><input name={`${prefix}_tipo_zona`} maxLength={80} className={field} placeholder="Industrial, urbana…" /></Field>
      <Field label="Horario de atención"><input name={`${prefix}_horario`} maxLength={120} className={field} /></Field>
    </>}
    <Field label="Instrucciones de acceso"><input name={`${prefix}_instrucciones`} maxLength={500} className={field} placeholder="Andén, acceso o indicaciones" /></Field>
    <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-600"><input name={`${prefix}_cita`} type="checkbox" />Requiere cita</label>
  </>;
}
