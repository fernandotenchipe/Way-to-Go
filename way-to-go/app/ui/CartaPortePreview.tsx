'use client';

import type { CartaPorteAddressSnapshot, CartaPorteDocument } from '../services/logistics-api';

const panel = 'rounded-xl border border-slate-200 bg-white p-4';
const missing = (value: unknown) => value === null ? 'Pendiente · NULL' : value === undefined || value === '' ? 'Faltante' : String(value);
const show = (value: unknown) => value === true ? 'Sí' : value === false ? 'No' : missing(value);
const dateTime = (value?: string | null) => {
  if (!value) return missing(value);
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? `Fecha no interpretable: ${value}` : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

function Field({ label, value, boolean = false }: { label: string; value: unknown; boolean?: boolean }) {
  const text = boolean ? show(value) : missing(value);
  const absent = text === 'Faltante' || text === 'Pendiente · NULL';
  return <div className="min-w-0"><dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt><dd className={`mt-0.5 break-words text-sm ${absent ? 'italic text-amber-800' : 'text-slate-900'}`}>{text}</dd></div>;
}

function AddressFields({ address }: { address?: CartaPorteAddressSnapshot | null }) {
  return <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <Field label="Calle" value={address?.calle}/><Field label="Número exterior" value={address?.numero_exterior}/>
    <Field label="Número interior" value={address?.numero_interior}/><Field label="Colonia" value={address?.colonia}/>
    <Field label="Localidad" value={address?.localidad}/><Field label="Municipio" value={address?.municipio}/>
    <Field label="Estado" value={address?.estado}/><Field label="País" value={address?.pais}/>
    <Field label="Código postal" value={address?.codigo_postal}/>
  </dl>;
}

function Party({ title, party }: { title: string; party: CartaPorteDocument['cfdi']['emisor_snapshot'] }) {
  return <section className={panel}>
    <h3 className="font-semibold text-[#0b1f3b]">{title}</h3>
    <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Nombre / razón social" value={party?.nombre}/><Field label="RFC" value={party?.rfc}/>
      <Field label="Régimen fiscal SAT" value={party?.regimen_fiscal_sat}/><Field label="Código postal fiscal" value={party?.domicilio_fiscal_cp}/>
    </dl>
    {party?.domicilio && <div className="mt-4 border-t border-slate-100 pt-3"><h4 className="mb-3 text-xs font-semibold text-slate-600">Domicilio fiscal</h4><AddressFields address={party.domicilio}/></div>}
  </section>;
}

function LocationCard({ location }: { location: CartaPorteDocument['locations'][number] }) {
  return <article className="rounded-lg border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{location.tipo} · posición {location.posicion}</h4><span className="text-xs text-slate-500">{location.identificador_sat || 'Identificador faltante'}</span></div>
    <dl className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Participante" value={location.participante_snapshot?.nombre}/><Field label="RFC participante" value={location.participante_snapshot?.rfc}/><Field label="Fecha y hora" value={dateTime(location.fecha_hora)}/><Field label="Zona horaria" value={location.zona_horaria}/><Field label="Distancia recorrida (km)" value={location.distancia_recorrida_km}/></dl>
    <div className="mt-4 border-t border-slate-100 pt-3"><h5 className="mb-3 text-xs font-semibold text-slate-600">Domicilio guardado</h5><AddressFields address={location.domicilio_snapshot}/></div>
  </article>;
}

function MerchandiseTable({ document }: { document: CartaPorteDocument }) {
  const rows = document.merchandise || [];
  if (!rows.length) return <p className="mt-3 text-sm italic text-amber-800">No hay mercancías guardadas.</p>;
  return <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500">{['Posición','Descripción','Clave producto CP','Cantidad','Unidad','Peso kg','Material peligroso','Clave peligroso','Embalaje'].map(label => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{rows.slice().sort((a,b)=>a.posicion-b.posicion).map(row => <tr key={row.id} className="border-b border-slate-100"><td className="px-2 py-2">{row.posicion}</td><td className="px-2 py-2">{missing(row.descripcion)}</td><td className="px-2 py-2">{missing(row.bienes_transp_sat)}</td><td className="px-2 py-2">{missing(row.cantidad)}</td><td className="px-2 py-2">{missing(row.clave_unidad_sat)}{row.unidad ? ` · ${row.unidad}` : ''}</td><td className="px-2 py-2">{missing(row.peso_kg)}</td><td className="px-2 py-2">{show(row.material_peligroso)}</td><td className="px-2 py-2">{missing(row.clave_material_peligroso_sat)}</td><td className="px-2 py-2">{missing(row.embalaje_sat)}</td></tr>)}</tbody></table></div>;
}

function ConceptTable({ document }: { document: CartaPorteDocument }) {
  const rows = document.concepts || [];
  if (!rows.length) return <p className="mt-3 text-sm italic text-amber-800">No hay conceptos CFDI guardados. No se generan a partir de las mercancías.</p>;
  return <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[750px] border-collapse text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500">{['Posición','Descripción','Clave SAT','Unidad','Objeto impuesto','Cantidad','Valor unitario','Descuento','Importe'].map(label => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{rows.slice().sort((a,b)=>a.posicion-b.posicion).map(row => <tr key={row.id} className="border-b border-slate-100"><td className="px-2 py-2">{row.posicion}</td><td className="px-2 py-2">{missing(row.descripcion)}</td><td className="px-2 py-2">{missing(row.clave_producto_servicio_sat)}</td><td className="px-2 py-2">{missing(row.clave_unidad_sat)}{row.unidad ? ` · ${row.unidad}` : ''}</td><td className="px-2 py-2">{missing(row.objeto_impuesto_sat)}</td><td className="px-2 py-2">{missing(row.cantidad)}</td><td className="px-2 py-2">{missing(row.valor_unitario)}</td><td className="px-2 py-2">{missing(row.descuento)}</td><td className="px-2 py-2">{missing(row.importe)}</td></tr>)}</tbody></table></div>;
}

function TaxTable({ document }: { document: CartaPorteDocument }) {
  const rows = document.taxes || [];
  if (!rows.length) return <p className="mt-3 text-sm italic text-slate-500">No hay impuestos por concepto guardados.</p>;
  return <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] border-collapse text-left text-xs"><thead><tr className="border-b border-slate-200 text-slate-500">{['Concepto','Movimiento','Impuesto','Factor','Base','Tasa/cuota','Importe calculado'].map(label => <th key={label} className="px-2 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-slate-100"><td className="px-2 py-2">{missing(row.concepto_id)}</td><td className="px-2 py-2">{missing(row.movimiento)}</td><td className="px-2 py-2">{missing(row.impuesto_sat)}</td><td className="px-2 py-2">{missing(row.tipo_factor_sat)}</td><td className="px-2 py-2">{missing(row.base)}</td><td className="px-2 py-2">{missing(row.tasa_cuota)}</td><td className="px-2 py-2">{missing(row.importe)}</td></tr>)}</tbody></table></div>;
}

export function CartaPortePreviewDocument({ document }: { document: CartaPorteDocument }) {
  const invoice = document.cfdi;
  const transport = document.transport?.[0];
  const operator = document.figures?.find(row => row.tipo_figura_sat === '01');
  const insurance = [
    ['Responsabilidad civil', transport?.aseguradora_rc, transport?.poliza_rc],
    ['Ambiental', transport?.aseguradora_ambiental, transport?.poliza_ambiental],
    ['Carga', transport?.aseguradora_carga, transport?.poliza_carga],
  ] as const;
  const locations = (document.locations || []).slice().sort((a,b)=>a.posicion-b.posicion);
  return <article className="mx-auto max-w-5xl space-y-5 bg-white p-5 text-slate-900 sm:p-8">
    <header className="border-b-2 border-[#0b1f3b] pb-4">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#b28b00]">Way To Go · Vista previa de documento</p><h2 className="mt-2 text-xl font-bold text-[#0b1f3b]">CFDI con complemento Carta Porte 3.1</h2><p className="mt-1 text-xs text-slate-500">Representación de los datos guardados en este borrador. No es XML ni comprobante fiscal.</p></div><span className="rounded-md border-2 border-amber-500 px-3 py-2 text-center text-xs font-extrabold text-amber-800">BORRADOR — SIN VALIDEZ FISCAL</span></div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Field label="ID Carta Porte" value={document.id}/><Field label="ID CFDI" value={document.cfdi_id}/><Field label="Versión SAT 3.1" value={document.sat_version_id}/><Field label="Tipo" value={invoice.tipo_comprobante}/><Field label="Revisión" value={invoice.revision}/></dl>
    </header>
    <section className="grid gap-4 md:grid-cols-2"><Party title="Emisor" party={invoice.emisor_snapshot}/><Party title="Receptor" party={invoice.receptor_snapshot}/></section>
    <section className={panel}>
      <h3 className="font-semibold text-[#0b1f3b]">Información fiscal del CFDI</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Estado" value={invoice.estado}/><Field label="Escenario fiscal" value={document.escenario_fiscal}/>
        <Field label="Fecha de expedición" value={dateTime(invoice.fecha_expedicion)}/><Field label="Lugar de expedición CP" value={invoice.lugar_expedicion_cp}/>
        <Field label="Moneda" value={invoice.moneda}/><Field label="Tipo de cambio" value={invoice.tipo_cambio}/>
        <Field label="Exportación SAT" value={invoice.exportacion_sat}/><Field label="Uso CFDI" value={invoice.uso_cfdi_sat}/>
        {invoice.tipo_comprobante === 'I' && <><Field label="Forma de pago" value={invoice.forma_pago_sat}/><Field label="Método de pago" value={invoice.metodo_pago_sat}/></>}
        <Field label="Transporte internacional" value={document.transporte_internacional} boolean/>
        <Field label="UUID fiscal" value={invoice.uuid_fiscal}/>
      </dl>
      <dl className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-5">
        <Field label="Subtotal" value={invoice.subtotal}/><Field label="Descuento" value={invoice.descuento}/>
        <Field label="Impuestos trasladados" value={invoice.impuestos_trasladados}/><Field label="Impuestos retenidos" value={invoice.impuestos_retenidos}/><Field label="Total" value={invoice.total}/>
      </dl>
    </section>
    <section className={panel}><h3 className="font-semibold text-[#0b1f3b]">Conceptos e impuestos</h3><ConceptTable document={document}/><TaxTable document={document}/></section>
    <section className={panel}><h3 className="font-semibold text-[#0b1f3b]">Ubicaciones</h3>{locations.length ? <div className="mt-3 grid gap-3 md:grid-cols-2">{locations.map(location => <LocationCard key={location.id} location={location}/>)}</div> : <p className="mt-3 text-sm italic text-amber-800">No hay ubicaciones guardadas.</p>}</section>
    <section className={panel}><h3 className="font-semibold text-[#0b1f3b]">Mercancías transportadas</h3><MerchandiseTable document={document}/><dl className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Total de mercancías" value={document.numero_total_mercancias}/><Field label="Peso bruto total" value={document.peso_bruto_total}/></dl></section>
    <section className={panel}>
      <h3 className="font-semibold text-[#0b1f3b]">Autotransporte, operador y seguros</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Unidad ID" value={transport?.unidad_id}/><Field label="Placas" value={transport?.placas}/><Field label="Configuración vehicular SAT" value={transport?.configuracion_vehicular_sat}/><Field label="Permiso SICT" value={transport?.permiso_sict_sat}/><Field label="Número de permiso" value={transport?.numero_permiso_sict}/><Field label="Peso bruto vehicular (t)" value={transport?.peso_bruto_vehicular_t}/></dl>
      <div className="mt-4 border-t border-slate-100 pt-3"><h4 className="text-xs font-semibold text-slate-600">Figura 01 · Operador</h4><dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Field label="Nombre" value={operator?.nombre}/><Field label="RFC" value={operator?.rfc}/><Field label="Licencia" value={operator?.numero_licencia}/><Field label="Residencia fiscal" value={operator?.residencia_fiscal_sat}/></dl></div>
      <div className="mt-4 border-t border-slate-100 pt-3"><h4 className="text-xs font-semibold text-slate-600">Seguros guardados</h4><div className="mt-2 grid gap-2 md:grid-cols-3">{insurance.map(([kind, provider, policy]) => <div key={kind} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-semibold">{kind}</p><p className="mt-1">Aseguradora: {missing(provider)}</p><p>Póliza: {missing(policy)}</p></div>)}</div></div>
    </section>
    {!!document.precarga?.faltantes?.length && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4"><h3 className="font-semibold text-amber-950">Campos pendientes reportados</h3><ul className="mt-2 list-disc pl-5 text-sm text-amber-900">{document.precarga.faltantes.map((item,index)=><li key={`${item}-${index}`}>{item}</li>)}</ul></section>}
    <footer className="border-t border-slate-200 pt-3 text-center text-[11px] text-slate-500">Vista previa de datos guardados · Esta vista no genera XML, UUID fiscal ni QR</footer>
  </article>;
}

export default function CartaPortePreview({ document, onClose }: { document: CartaPorteDocument; onClose: () => void }) {
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-2 sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Vista previa Carta Porte" className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-slate-100 shadow-2xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3"><p className="text-sm font-semibold text-[#0b1f3b]">Vista previa · revisión {document.cfdi.revision}</p><button type="button" autoFocus onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cerrar</button></div>
      <div className="overflow-y-auto"><CartaPortePreviewDocument document={document}/></div>
    </section>
  </div>;
}
