'use client';

import { type LogisticsFleetUnit } from '../services/logistics-api';

type Tab = 'Datos de flota' | 'Datos para Carta Porte' | 'Seguros y documentos';
const tabs: Tab[] = ['Datos de flota', 'Datos para Carta Porte', 'Seguros y documentos'];
const label = (value: string | number | null | undefined) => value == null || value === '' ? 'Pendiente' : String(value);
const date = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('/') : 'Pendiente';
const names = { RESPONSABILIDAD_CIVIL: 'Responsabilidad civil', AMBIENTAL: 'Ambiental', CARGA: 'Carga' };
function Info({ name, value }: { name: string; value: string | number | null | undefined }) { return <div><dt className="text-xs text-slate-500">{name}</dt><dd className="mt-1 break-words text-sm font-medium text-[#0b1f3b]">{label(value)}</dd></div>; }

export default function FleetUnitDetail({ unit, tab, onTab, canEdit, onEdit }: { unit: LogisticsFleetUnit; tab: Tab; onTab: (tab: Tab) => void; canEdit: boolean; onEdit: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const rc = unit.seguros?.find(item => item.tipo === 'RESPONSABILIDAD_CIVIL');
  const validRc = rc && (!rc.vigente_desde || rc.vigente_desde.slice(0, 10) <= today) && (!rc.vigente_hasta || rc.vigente_hasta.slice(0, 10) >= today);
  const missing = [
    !unit.placas && 'placas', !unit.anio && 'año modelo', !unit.configuracion_vehicular_sat && 'configuración vehicular',
    !unit.permiso_sict_sat && 'tipo de permiso SICT', !unit.numero_permiso_sict && 'número de permiso SICT',
    !validRc && 'seguro vigente de responsabilidad civil',
  ].filter(Boolean);
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label={`Ficha de ${unit.numero_economico}`}>
    <div className="flex flex-wrap items-center justify-between gap-4 p-5"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ficha de flota</p><h2 className="mt-1 text-xl font-bold text-[#0b1f3b]">{unit.numero_economico} · {unit.tipo_unidad}</h2><p className="mt-1 text-sm text-slate-600">{unit.proveedor ? `Proveedor: ${unit.proveedor}` : 'Flota propia'} · {unit.estatus === 'ACTIVA' ? 'Activa' : unit.estatus === 'BAJA' ? 'Baja' : 'En atención'}</p></div>{canEdit && <button type="button" onClick={onEdit} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-[#0b1f3b]">Editar unidad</button>}</div>
    <div role="tablist" aria-label="Datos de la unidad" className="flex gap-1 overflow-x-auto border-y border-slate-200 px-4">{tabs.map(item => <button key={item} type="button" role="tab" aria-selected={item === tab} onClick={() => onTab(item)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm ${item === tab ? 'border-amber-500 font-semibold text-[#0b1f3b]' : 'border-transparent text-slate-600'}`}>{item}</button>)}</div>
    <div role="tabpanel" className="p-5">
      {tab === 'Datos de flota' && <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info name="Modalidad" value={unit.proveedor ? 'De proveedor' : 'Propia'}/><Info name="Proveedor" value={unit.proveedor || 'Way to Go'}/><Info name="Marca" value={unit.marca}/><Info name="Modelo" value={unit.modelo}/><Info name="VIN / número de serie" value={unit.vin}/><Info name="Capacidad (kg)" value={unit.capacidad_kg}/><Info name="Capacidad (pallets)" value={unit.capacidad_pallets}/><Info name="Peso vacío (kg)" value={unit.peso_vacio_kg}/><Info name="Largo (m)" value={unit.largo_m}/><Info name="Ancho (m)" value={unit.ancho_m}/><Info name="Alto (m)" value={unit.alto_m}/><Info name="Materiales peligrosos" value={unit.hazmat ? 'Sí' : 'No'}/><Info name="Refrigerada" value={unit.refrigerada ? 'Sí' : 'No'}/></dl>}
      {tab === 'Datos para Carta Porte' && <>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><Info name="Placas" value={unit.placas}/><Info name="Año modelo" value={unit.anio}/><Info name="Configuración vehicular SAT" value={unit.configuracion_vehicular_sat}/><Info name="Tipo de permiso SICT" value={unit.permiso_sict_sat}/><Info name="Número de permiso SICT" value={unit.numero_permiso_sict}/><Info name="Peso bruto permitido (t)" value={unit.peso_bruto_permitido_t}/>{(['RESPONSABILIDAD_CIVIL', 'AMBIENTAL', 'CARGA'] as const).map(type => { const policy = unit.seguros?.find(item => item.tipo === type); return <Info key={type} name={`Seguro ${names[type].toLowerCase()}`} value={policy ? `${policy.aseguradora} · ${policy.poliza}` : null}/>; })}</dl>
        <p className={`mt-6 rounded-lg p-3 text-sm ${missing.length ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>{missing.length ? `Datos pendientes de la unidad: ${missing.join(', ')}.` : 'Datos base de la unidad capturados.'} El peso real y la Carta Porte se completan desde el viaje.</p>
      </>}
      {tab === 'Seguros y documentos' && <><div className="grid gap-4 lg:grid-cols-3">{(['RESPONSABILIDAD_CIVIL', 'AMBIENTAL', 'CARGA'] as const).map(type => { const policy = unit.seguros?.find(item => item.tipo === type); return <div key={type} className="rounded-lg border border-slate-200 p-4"><h3 className="font-semibold text-[#0b1f3b]">{names[type]}</h3><dl className="mt-4 space-y-3"><Info name="Aseguradora" value={policy?.aseguradora}/><Info name="Póliza" value={policy?.poliza}/><Info name="Vigente desde" value={date(policy?.vigente_desde || null)}/><Info name="Vigente hasta" value={date(policy?.vigente_hasta || null)}/></dl></div>; })}</div><p className="mt-5 text-sm text-slate-600">Documentos registrados: {unit.vigentes || 0} vigentes · {unit.vencidos || 0} vencidos.</p></>}
    </div>
  </section>;
}
