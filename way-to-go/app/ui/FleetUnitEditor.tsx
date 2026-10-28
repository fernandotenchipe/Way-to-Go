'use client';

import { useEffect, useRef, type FormEvent } from 'react';
import { type LogisticsFleetInsurance, type LogisticsFleetUnit, type LogisticsFleetUnitInput } from '../services/logistics-api';
import { LogisticsFormField as Field, LogisticsFormSection as Section, logisticsFieldClassName as field } from './LogisticsCatalogComponents';

const types: Array<{ key: LogisticsFleetInsurance['tipo']; label: string }> = [
  { key: 'RESPONSABILIDAD_CIVIL', label: 'Responsabilidad civil' },
  { key: 'AMBIENTAL', label: 'Ambiental' },
  { key: 'CARGA', label: 'Carga' },
];
const secondary = 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50';
const primary = 'rounded-lg bg-[#0b1f3b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50';

export default function FleetUnitEditor({ unit, providers, busy, error, demoFleetOnly, onClose, onSave }: {
  unit: LogisticsFleetUnit | null;
  providers: Array<{ id: string; razon_social: string }>;
  busy: boolean;
  error: string;
  demoFleetOnly: boolean;
  onClose: () => void;
  onSave: (input: LogisticsFleetUnitInput) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  const insurance = (type: LogisticsFleetInsurance['tipo']) => unit?.seguros?.find(item => item.tipo === type);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || '').trim();
    const text = (key: string) => value(key) || null;
    const number = (key: string) => value(key) ? Number(value(key)) : null;
    const seguros = types.map(({ key }) => ({
      tipo: key,
      aseguradora: text(`${key}_aseguradora`),
      poliza: text(`${key}_poliza`),
      vigente_desde: text(`${key}_vigente_desde`),
      vigente_hasta: text(`${key}_vigente_hasta`),
    }));
    void onSave({
      numero_economico: value('numero_economico'), tipo_unidad: value('tipo_unidad'), placas: text('placas'),
      proveedor_id: text('proveedor_id'), marca: text('marca'), modelo: text('modelo'), anio: number('anio'),
      capacidad_kg: number('capacidad_kg'), capacidad_pallets: number('capacidad_pallets'),
      hazmat: form.get('hazmat') === 'on', refrigerada: form.get('refrigerada') === 'on',
      configuracion_vehicular_sat: text('configuracion_vehicular_sat'), permiso_sict_sat: text('permiso_sict_sat'),
      numero_permiso_sict: text('numero_permiso_sict'), peso_vacio_kg: number('peso_vacio_kg'),
      peso_bruto_permitido_t: number('peso_bruto_permitido_t'), vin: text('vin'),
      largo_m: number('largo_m'), ancho_m: number('ancho_m'), alto_m: number('alto_m'), seguros,
    });
  };
  return <dialog ref={dialog} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} className="m-auto max-h-[94vh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-2xl border-0 p-0 shadow-2xl backdrop:bg-slate-950/50">
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white p-6"><div><h2 className="text-xl font-bold text-[#0b1f3b]">{unit ? `Editar ${unit.numero_economico}` : 'Agregar unidad'}</h2><p className="mt-1 text-sm text-slate-500">Puedes guardar la unidad y completar sus datos para Carta Porte después.</p></div><button type="button" disabled={busy} onClick={onClose} className={secondary}>Cerrar</button></header>
    <form onSubmit={submit} className="space-y-6 p-6">
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {demoFleetOnly && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Modo local: solo se pueden guardar unidades cuyo número comience con DEMO-.</p>}
      <fieldset disabled={busy} className="space-y-6">
        <Section title="Datos de flota" description="Identifica la unidad propia o del proveedor que podrá asignarse a un viaje.">
          <Field label="Número económico *"><input name="numero_economico" required maxLength={80} defaultValue={unit?.numero_economico || ''} className={field} /></Field>
          <Field label="Tipo de unidad *"><input name="tipo_unidad" required maxLength={100} defaultValue={unit?.tipo_unidad || ''} className={field} /></Field>
          <Field label="Proveedor"><select name="proveedor_id" defaultValue={unit?.proveedor_id || ''} className={field}><option value="">Flota propia</option>{unit?.proveedor_id && !providers.some(p => p.id === unit.proveedor_id) && <option value={unit.proveedor_id}>{unit.proveedor || 'Proveedor actual'}</option>}{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.razon_social}</option>)}</select></Field>
          <Field label="Marca"><input name="marca" maxLength={80} defaultValue={unit?.marca || ''} className={field} /></Field>
          <Field label="Modelo"><input name="modelo" maxLength={80} defaultValue={unit?.modelo || ''} className={field} /></Field>
          <Field label="VIN / número de serie"><input name="vin" maxLength={100} defaultValue={unit?.vin || ''} className={field} /></Field>
          <Field label="Capacidad (kg)"><input name="capacidad_kg" type="number" min="0.001" step="0.001" defaultValue={unit?.capacidad_kg ?? ''} className={field} /></Field>
          <Field label="Capacidad (pallets)"><input name="capacidad_pallets" type="number" min="1" step="1" defaultValue={unit?.capacidad_pallets ?? ''} className={field} /></Field>
          <Field label="Peso vacío (kg)"><input name="peso_vacio_kg" type="number" min="0" step="0.001" defaultValue={unit?.peso_vacio_kg ?? ''} className={field} /></Field>
          <Field label="Largo (m)"><input name="largo_m" type="number" min="0.001" step="0.001" defaultValue={unit?.largo_m ?? ''} className={field} /></Field>
          <Field label="Ancho (m)"><input name="ancho_m" type="number" min="0.001" step="0.001" defaultValue={unit?.ancho_m ?? ''} className={field} /></Field>
          <Field label="Alto (m)"><input name="alto_m" type="number" min="0.001" step="0.001" defaultValue={unit?.alto_m ?? ''} className={field} /></Field>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input name="hazmat" type="checkbox" defaultChecked={unit?.hazmat || false} /> Habilitada para materiales peligrosos</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input name="refrigerada" type="checkbox" defaultChecked={unit?.refrigerada || false} /> Refrigerada</label>
        </Section>
        <Section title="Datos para Carta Porte" description="Datos reutilizables de esta unidad. El peso real del traslado se completa en el viaje.">
          <Field label="Placas"><input name="placas" maxLength={30} defaultValue={unit?.placas || ''} className={field} /></Field>
          <Field label="Año modelo"><input name="anio" type="number" min="1900" max="2200" defaultValue={unit?.anio ?? ''} className={field} /></Field>
          <Field label="Configuración vehicular · clave SAT"><input name="configuracion_vehicular_sat" maxLength={30} defaultValue={unit?.configuracion_vehicular_sat || ''} className={field} /></Field>
          <Field label="Tipo de permiso SICT · clave SAT"><input name="permiso_sict_sat" maxLength={30} defaultValue={unit?.permiso_sict_sat || ''} className={field} /></Field>
          <Field label="Número de permiso SICT"><input name="numero_permiso_sict" maxLength={100} defaultValue={unit?.numero_permiso_sict || ''} className={field} /></Field>
          <Field label="Peso bruto permitido (t)"><input name="peso_bruto_permitido_t" type="number" min="0.001" step="0.001" defaultValue={unit?.peso_bruto_permitido_t ?? ''} className={field} /></Field>
        </Section>
        <Section title="Seguros" description="Guarda las pólizas de la unidad. Se podrán consultar al preparar la Carta Porte del viaje.">
          {types.map(({ key, label }) => <div key={key} className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:col-span-2 sm:grid-cols-2"><h3 className="font-semibold text-[#0b1f3b] sm:col-span-2">{label}</h3><Field label="Aseguradora"><input name={`${key}_aseguradora`} maxLength={180} defaultValue={insurance(key)?.aseguradora || ''} className={field} /></Field><Field label="Número de póliza"><input name={`${key}_poliza`} maxLength={100} defaultValue={insurance(key)?.poliza || ''} className={field} /></Field><Field label="Vigente desde"><input name={`${key}_vigente_desde`} type="date" defaultValue={insurance(key)?.vigente_desde?.slice(0, 10) || ''} className={field} /></Field><Field label="Vigente hasta"><input name={`${key}_vigente_hasta`} type="date" defaultValue={insurance(key)?.vigente_hasta?.slice(0, 10) || ''} className={field} /></Field></div>)}
        </Section>
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className={secondary}>Cancelar</button><button className={primary}>{busy ? 'Guardando…' : 'Guardar unidad'}</button></div>
      </fieldset>
    </form>
  </dialog>;
}
