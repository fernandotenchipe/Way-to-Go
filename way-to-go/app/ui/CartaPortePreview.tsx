'use client';

import type { CartaPorteAddressSnapshot, CartaPorteDocument } from '../services/logistics-api';
import { formatMetricTonnes } from '../services/weight-units';
import { useRef, useState } from 'react';

const panel = 'rounded-lg border border-slate-200 bg-white p-3';
const missing = (value: unknown) => value === null || value === undefined || value === '' ? 'Pendiente' : String(value);
const show = (value: unknown) => value === true ? 'Sí' : value === false ? 'No' : missing(value);
const dateTime = (value?: string | null) => {
  if (!value) return missing(value);
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? `Fecha no interpretable: ${value}` : date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
};

function Field({ label, value, boolean = false }: { label: string; value: unknown; boolean?: boolean }) {
  const text = boolean ? show(value) : missing(value);
  const absent = text === 'Faltante' || text === 'Pendiente · NULL';
  return <div className="min-w-0"><dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className={`mt-0.5 break-words text-[11px] leading-snug ${absent ? 'italic text-amber-800' : 'text-slate-900'}`}>{text}</dd></div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 border-b border-slate-200 pb-1.5 text-[12px] font-bold uppercase tracking-wide text-slate-900">{children}</h3>;
}

function AddressFields({ address }: { address?: CartaPorteAddressSnapshot | null }) {
  return <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
    <Field label="Calle" value={address?.calle}/><Field label="Núm. exterior" value={address?.numero_exterior}/>
    <Field label="Núm. interior" value={address?.numero_interior}/><Field label="Colonia" value={address?.colonia}/>
    <Field label="Localidad" value={address?.localidad}/><Field label="Municipio" value={address?.municipio}/>
    <Field label="Estado" value={address?.estado}/><Field label="País" value={address?.pais}/>
    <Field label="Código postal" value={address?.codigo_postal}/>
  </dl>;
}

function Party({ title, party }: { title: string; party: CartaPorteDocument['cfdi']['emisor_snapshot'] }) {
  return <section className={`${panel} carta-porte-card`}>
    <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-900">{title}</h3>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
      <Field label="Nombre / razón social" value={party?.nombre}/><Field label="RFC" value={party?.rfc}/>
      <Field label="Régimen fiscal SAT" value={party?.regimen_fiscal_sat}/><Field label="Código postal fiscal" value={party?.domicilio_fiscal_cp}/>
    </dl>
    {party?.domicilio && <div className="mt-2 border-t border-slate-100 pt-2"><h4 className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Domicilio fiscal</h4><AddressFields address={party.domicilio}/></div>}
  </section>;
}

function LocationCard({ location }: { location: CartaPorteDocument['locations'][number] }) {
  return <article className="carta-porte-card rounded-lg border border-slate-200 p-2.5">
    <div className="flex flex-wrap items-baseline justify-between gap-x-2 border-b border-slate-100 pb-1.5"><h4 className="text-[11px] font-bold text-slate-900">{location.tipo} · posición {location.posicion}</h4><span className="text-[9px] text-slate-500">{location.identificador_sat || 'Identificador faltante'}</span></div>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
      <Field label="Participante" value={location.participante_snapshot?.nombre}/><Field label="RFC participante" value={location.participante_snapshot?.rfc}/>
      <Field label="Fecha y hora" value={dateTime(location.fecha_hora)}/><Field label="Zona horaria" value={location.zona_horaria}/>
      <Field label="Distancia recorrida (km)" value={location.distancia_recorrida_km}/>
    </dl>
    <div className="mt-2 border-t border-slate-100 pt-2"><h5 className="mb-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">Domicilio guardado</h5><AddressFields address={location.domicilio_snapshot}/></div>
  </article>;
}

function ConceptTable({ document }: { document: CartaPorteDocument }) {
  const rows = document.concepts || [];
  if (!rows.length) return <p className="text-[11px] italic text-amber-800">No hay conceptos CFDI guardados. No se generan a partir de las mercancías.</p>;
  return <div className="overflow-x-auto"><table className="carta-porte-table w-full border-collapse text-left text-[9px]"><thead><tr>{['#','Descripción','Clave SAT','Unidad','Objeto imp.','Cantidad','Valor unit.','Descuento','Importe'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.slice().sort((a,b)=>a.posicion-b.posicion).map(row => <tr key={row.id}><td>{row.posicion}</td><td>{missing(row.descripcion)}</td><td>{missing(row.clave_producto_servicio_sat)}</td><td>{missing(row.clave_unidad_sat)}{row.unidad ? ` · ${row.unidad}` : ''}</td><td>{missing(row.objeto_impuesto_sat)}</td><td>{missing(row.cantidad)}</td><td>{missing(row.valor_unitario)}</td><td>{missing(row.descuento)}</td><td>{missing(row.importe)}</td></tr>)}</tbody></table></div>;
}

function TaxTable({ document }: { document: CartaPorteDocument }) {
  const rows = document.taxes || [];
  if (!rows.length) return <p className="mt-2 text-[10px] italic text-slate-500">No hay impuestos por concepto guardados.</p>;
  return <div className="mt-2 overflow-x-auto"><table className="carta-porte-table w-full border-collapse text-left text-[9px]"><thead><tr>{['Concepto','Movimiento','Impuesto','Factor','Base','Tasa/cuota','Importe calculado'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{missing(row.concepto_id)}</td><td>{missing(row.movimiento)}</td><td>{missing(row.impuesto_sat)}</td><td>{missing(row.tipo_factor_sat)}</td><td>{missing(row.base)}</td><td>{missing(row.tasa_cuota)}</td><td>{missing(row.importe)}</td></tr>)}</tbody></table></div>;
}

function MerchandiseTable({ document }: { document: CartaPorteDocument }) {
  const rows = document.merchandise || [];
  if (!rows.length) return <p className="text-[11px] italic text-amber-800">No hay mercancías guardadas.</p>;
  return <div className="overflow-x-auto"><table className="carta-porte-table w-full border-collapse text-left text-[9px]"><thead><tr>{['#','Descripción','Clave producto CP','Cantidad','Unidad','Peso kg','Peligroso','Clave / embalaje'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{rows.slice().sort((a,b)=>a.posicion-b.posicion).map(row => <tr key={row.id}>
    <td>{row.posicion}</td><td>{missing(row.descripcion)}</td><td>{missing(row.bienes_transp_sat)}</td><td>{missing(row.cantidad)}</td><td>{missing(row.clave_unidad_sat)}{row.unidad ? ` · ${row.unidad}` : ''}</td><td>{missing(row.peso_kg)}</td>
    <td>{show(row.material_peligroso)}</td><td>{row.material_peligroso ? `${missing(row.clave_material_peligroso_sat)} · ${missing(row.embalaje_sat)}` : row.material_peligroso === false ? '—' : `${missing(row.clave_material_peligroso_sat)} · ${missing(row.embalaje_sat)}`}</td>
  </tr>)}</tbody></table></div>;
}

export function CartaPortePreviewDocument({ document, unitNumber, approvedTransportConditions = [] }: { document: CartaPorteDocument; unitNumber?: string | null; approvedTransportConditions?: string[] }) {
  const invoice = document.cfdi;
  const transport = document.transport?.[0];
  const insurance = [
    ['Responsabilidad civil', transport?.aseguradora_rc, transport?.poliza_rc],
    ['Ambiental', transport?.aseguradora_ambiental, transport?.poliza_ambiental],
    ['Carga', transport?.aseguradora_carga, transport?.poliza_carga],
  ] as const;
  const locations = (document.locations || []).slice().sort((a,b)=>a.posicion-b.posicion);
  const hasServiceReferences = Boolean(document.referencia_cliente || document.orden_compra || document.descripcion_carga);
  return <article data-carta-porte-pdf-document className="carta-porte-document mx-auto max-w-5xl bg-white p-4 text-slate-900 sm:p-6">
    <div className="carta-porte-pdf-running-banner">BORRADOR — SIN VALIDEZ FISCAL</div>
    <section className="carta-porte-sheet carta-porte-invoice-sheet">
      <header className="carta-porte-brand border-b-2 border-slate-900 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3"><span aria-hidden="true" className="h-10 w-1.5 rounded-full bg-[#f4c430]"/><div><p className="text-[10px] font-bold uppercase tracking-[.22em] text-slate-600">Way To Go</p><h2 className="mt-0.5 text-lg font-extrabold leading-tight text-slate-950">CFDI con complemento Carta Porte 3.1</h2><p className="mt-1 text-[10px] text-slate-500">Representación de datos guardados · Sin validez fiscal</p></div></div>
          <div className="rounded border border-amber-500 px-2.5 py-1.5 text-right"><p className="text-[10px] font-extrabold uppercase text-amber-800">{invoice.estado}</p><p className="text-[9px] font-semibold text-slate-600">TIPO {invoice.tipo_comprobante} · REV. {invoice.revision}</p></div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-200 pt-2 sm:grid-cols-4">
          <Field label="ID CFDI" value={invoice.id}/><Field label="ID Carta Porte" value={document.id}/><Field label="Versión complemento" value={document.sat_version_id}/><Field label="Escenario fiscal auditado" value={document.escenario_fiscal}/>
        </dl>
      </header>

      <section className="mt-3 grid gap-2 md:grid-cols-2 carta-porte-parties">
        <Party title="Emisor" party={invoice.emisor_snapshot}/><Party title="Receptor" party={invoice.receptor_snapshot}/>
      </section>

      <section className={`${panel} mt-3 carta-porte-card`}>
        <SectionTitle>Información fiscal del CFDI</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Field label="Fecha de expedición" value={dateTime(invoice.fecha_expedicion)}/><Field label="Lugar de expedición CP" value={invoice.lugar_expedicion_cp}/>
          <Field label="Moneda" value={invoice.moneda}/><Field label="Tipo de cambio" value={invoice.tipo_cambio}/>
          <Field label="Exportación SAT" value={invoice.exportacion_sat}/><Field label="Uso CFDI" value={invoice.uso_cfdi_sat}/>
          {invoice.tipo_comprobante === 'I' && <><Field label="Forma de pago" value={invoice.forma_pago_sat}/><Field label="Método de pago" value={invoice.metodo_pago_sat}/></>}
          <Field label="UUID fiscal" value={invoice.uuid_fiscal}/>
        </dl>
      </section>

      <section className={`${panel} mt-3 carta-porte-card`}>
        <SectionTitle>Conceptos de facturación</SectionTitle>
        {invoice.tipo_comprobante === 'T' && <p className="mb-2 text-[10px] text-slate-600">CFDI de traslado. Se muestran los conceptos guardados para este tipo de comprobante; no se completan importes automáticamente.</p>}
        <ConceptTable document={document}/><TaxTable document={document}/>
      </section>

      <section className="mt-3 rounded-lg border border-slate-300 carta-porte-totals">
        <h3 className="sr-only">Totales del CFDI</h3><dl className="grid grid-cols-2 sm:grid-cols-5">
          <div className="border-b border-slate-200 p-2 sm:border-b-0 sm:border-r"><Field label="Subtotal" value={invoice.subtotal}/></div>
          <div className="border-b border-slate-200 p-2 sm:border-b-0 sm:border-r"><Field label="Descuento" value={invoice.descuento}/></div>
          <div className="border-b border-slate-200 p-2 sm:border-b-0 sm:border-r"><Field label="Impuestos trasladados" value={invoice.impuestos_trasladados}/></div>
          <div className="border-b border-slate-200 p-2 sm:border-b-0 sm:border-r"><Field label="Impuestos retenidos" value={invoice.impuestos_retenidos}/></div>
          <div className="bg-slate-50 p-2"><Field label="Total" value={invoice.total}/></div>
        </dl>
      </section>
      {hasServiceReferences && <section className={`${panel} mt-3 carta-porte-card`}><SectionTitle>Referencias del servicio</SectionTitle><dl className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Field label="Referencia del cliente" value={document.referencia_cliente}/><Field label="Orden de compra" value={document.orden_compra}/><Field label="Descripción de carga" value={document.descripcion_carga}/></dl></section>}
    </section>

    <section className="carta-porte-sheet carta-porte-complement-sheet mt-5">
      <header className="mb-3 border-b-2 border-[#f4c430] pb-2">
        <p className="text-[9px] font-bold uppercase tracking-[.2em] text-slate-500">Way To Go · Documento de transporte</p>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-extrabold text-slate-950">Complemento Carta Porte 3.1</h2><span className="text-[9px] font-semibold text-slate-500">CFDI tipo {invoice.tipo_comprobante} · revisión {invoice.revision}</span></div>
      </header>

      <section className={`${panel} carta-porte-card`}>
        <SectionTitle>Identificación y transporte internacional</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Field label="Identificador Carta Porte" value={document.id}/><Field label="Versión SAT" value={document.sat_version_id}/><Field label="Transporte internacional" value={document.transporte_internacional} boolean/><Field label="Entrada / salida" value={document.entrada_salida}/>
          <Field label="País origen / destino" value={document.pais_origen_destino_sat}/><Field label="Vía de entrada / salida" value={document.via_entrada_salida_sat}/><Field label="Unidad de peso" value={document.unidad_peso_sat}/><Field label="Distancia total (km)" value={document.distancia_total_km}/>
          <Field label="Polo de origen" value={document.polo_origen_sat}/><Field label="Polo de destino" value={document.polo_destino_sat}/><Field label="Logística inversa" value={document.logistica_inversa} boolean/><Field label="Registro Istmo" value={document.registro_istmo} boolean/>
        </dl>
      </section>

      <section className={`${panel} mt-3 carta-porte-card`}>
        <SectionTitle>Origen y destino</SectionTitle>
        {locations.length ? <div className="grid gap-2 md:grid-cols-2">{locations.map(location => <LocationCard key={location.id} location={location}/>)}</div> : <p className="text-[11px] italic text-amber-800">No hay ubicaciones guardadas.</p>}
      </section>

      <section className={`${panel} mt-3 carta-porte-card`}>
        <div className="carta-porte-merchandise-block">
          <SectionTitle>Mercancías transportadas</SectionTitle>
          <MerchandiseTable document={document}/>
          <dl className="carta-porte-merchandise-summary mt-2 grid grid-cols-2 gap-3 border-t border-slate-200 pt-2 sm:grid-cols-4"><Field label="Total de mercancías" value={document.numero_total_mercancias}/><Field label="Peso bruto total" value={document.peso_bruto_total}/></dl>
          {!!document.merchandise?.some(row => row.valor_mercancia != null || row.moneda_sat || row.fraccion_arancelaria || row.uuid_comercio_exterior) && <div className="mt-2 border-t border-slate-100 pt-2"><h4 className="mb-1 text-[9px] font-bold uppercase text-slate-500">Datos de comercio exterior guardados</h4><dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">{document.merchandise.filter(row => row.valor_mercancia != null || row.moneda_sat || row.fraccion_arancelaria || row.uuid_comercio_exterior).map(row => <div key={row.id} className="contents"><Field label={`Fracción · mercancía ${row.posicion}`} value={row.fraccion_arancelaria}/><Field label={`Valor · mercancía ${row.posicion}`} value={row.valor_mercancia}/><Field label={`Moneda · mercancía ${row.posicion}`} value={row.moneda_sat}/><Field label={`UUID comercio exterior · mercancía ${row.posicion}`} value={row.uuid_comercio_exterior}/></div>)}</dl></div>}
        </div>
      </section>

      <section className={`${panel} mt-3 carta-porte-card`}>
        <SectionTitle>Autotransporte federal</SectionTitle>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Field label="Número económico" value={unitNumber}/><Field label="Placas" value={transport?.placas}/><Field label="Configuración vehicular SAT" value={transport?.configuracion_vehicular_sat}/>
          <Field label="Permiso SICT" value={transport?.permiso_sict_sat}/><Field label="Número de permiso" value={transport?.numero_permiso_sict}/><Field label="Peso bruto vehicular" value={transport?.peso_bruto_vehicular_t == null ? null : formatMetricTonnes(transport.peso_bruto_vehicular_t)}/>
          <Field label="ID interno de unidad" value={transport?.unidad_id}/>
        </dl>
        <div className="mt-3 border-t border-slate-100 pt-2"><h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide">Figuras de transporte</h4>
          {document.figures?.length ? <div className="grid gap-2 sm:grid-cols-2">{document.figures.map((figure, index) => <article key={figure.id || `${figure.tipo_figura_sat}-${index}`} className="carta-porte-card rounded border border-slate-200 p-2"><p className="mb-1 text-[10px] font-bold">Figura {missing(figure.tipo_figura_sat)}</p><dl className="grid grid-cols-2 gap-2"><Field label="Nombre" value={figure.nombre}/><Field label="RFC" value={figure.rfc}/><Field label="Licencia" value={figure.numero_licencia}/><Field label="Residencia fiscal" value={figure.residencia_fiscal_sat}/><Field label="Registro tributario" value={figure.numero_registro_tributario}/></dl>{figure.domicilio_snapshot && <div className="mt-2 border-t border-slate-100 pt-2"><AddressFields address={figure.domicilio_snapshot}/></div>}</article>)}</div> : <p className="text-[10px] italic text-amber-800">No hay figuras de transporte guardadas.</p>}
        </div>
        <div className="mt-3 border-t border-slate-100 pt-2"><h4 className="mb-2 text-[10px] font-bold uppercase tracking-wide">Seguros</h4><div className="grid gap-2 sm:grid-cols-3">{insurance.map(([kind, provider, policy]) => <div key={kind} className="rounded bg-slate-50 p-2 text-[10px]"><p className="font-bold">{kind}</p><dl className="mt-1 space-y-1"><Field label="Aseguradora" value={provider}/><Field label="Póliza" value={policy}/></dl></div>)}</div></div>
      </section>
      {!!approvedTransportConditions.length && <section className={`${panel} mt-3 carta-porte-conditions carta-porte-card`}><SectionTitle>Condiciones de transporte</SectionTitle><ol className="list-decimal space-y-1 pl-4 text-[10px]">{approvedTransportConditions.map((condition, index) => <li key={`${index}-${condition}`}>{condition}</li>)}</ol></section>}
    </section>
    <footer className="carta-porte-document-footer mt-3 border-t border-slate-200 pt-2 text-center text-[9px] text-slate-500">Documento de trabajo basado en datos guardados · No genera XML, sellos, UUID fiscal ni QR</footer>
  </article>;
}

const printStyles = `
  @page {
    size: letter;
    margin: 0.88in 0.48in 0.82in;
    @top-center { content: "BORRADOR — SIN VALIDEZ FISCAL"; color: #111827; background: #fff; border-bottom: 2px solid #f4c430; padding: 0 0 5px; font: 800 8pt Arial, Helvetica, sans-serif; letter-spacing: .08em; }
    @bottom-center { content: "WAY TO GO · PÁGINA " counter(page); color: #64748b; font: 8pt Arial, Helvetica, sans-serif; }
  }
  html, body { margin: 0; padding: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-size: 8pt; line-height: 1.28; overflow-wrap: anywhere; }
  .carta-porte-document { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; color: #111827 !important; }
  .carta-porte-pdf-running-banner { display: none; }
  .carta-porte-document-footer { display: none; }
  .carta-porte-sheet { display: block; }
  .carta-porte-complement-sheet { break-before: auto; page-break-before: auto; margin-top: 0 !important; }
  .carta-porte-card { break-inside: auto; box-shadow: none !important; }
  .carta-porte-brand, .carta-porte-parties > *, .carta-porte-card > article { break-inside: avoid; page-break-inside: avoid; }
  .carta-porte-card h3, .carta-porte-card h4 { break-after: avoid-page; page-break-after: avoid; }
  .carta-porte-merchandise-block { break-inside: auto; page-break-inside: auto; }
  .carta-porte-merchandise-summary { break-inside: avoid; page-break-inside: avoid; }
  .carta-porte-conditions { break-before: auto; page-break-before: auto; }
  .carta-porte-parties { grid-template-columns: repeat(2,minmax(0,1fr)) !important; }
  .carta-porte-table { min-width: 0 !important; table-layout: fixed; font-size: 7pt !important; }
  .carta-porte-table thead { display: table-header-group; }
  .carta-porte-table tfoot { display: table-footer-group; }
  .carta-porte-table tr { break-inside: avoid; page-break-inside: avoid; }
  .carta-porte-table th { background: #f3f4f6; color: #111827; font-weight: 700; }
  .carta-porte-table th, .carta-porte-table td { border: 1px solid #d1d5db; padding: 4px 3px; vertical-align: top; overflow-wrap: anywhere; }
  .carta-porte-document .overflow-x-auto { overflow: visible !important; }
  .carta-porte-document .bg-slate-50 { background: #f3f4f6 !important; }
  .carta-porte-document .text-amber-800 { color: #854d0e !important; }
  .carta-porte-document .border-slate-200, .carta-porte-document .border-slate-300 { border-color: #d1d5db !important; }
  .carta-porte-document .text-slate-500 { color: #4b5563 !important; }
  .carta-porte-document h2, .carta-porte-document h3, .carta-porte-document h4 { orphans: 3; widows: 3; }
  .carta-porte-pdf-running-banner { display: none !important; }
  @media screen {
    .carta-porte-complement-sheet { border-top: 2px solid #f4c430; padding-top: 18px; }
    .carta-porte-pdf-running-banner { display: none; }
  }
`;

type PreviewProps = {
  document: CartaPorteDocument;
  unitNumber?: string | null;
  onClose: () => void;
  loadLatest: () => Promise<CartaPorteDocument>;
  onLatestLoaded: (document: CartaPorteDocument) => void;
  fileName: string;
};

export default function CartaPortePreview({ document, unitNumber, onClose, loadLatest, onLatestLoaded, fileName }: PreviewProps) {
  const [activeDocument, setActiveDocument] = useState(document);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const printContent = useRef<HTMLDivElement>(null);

  async function downloadPdf() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { setError('Permite ventanas emergentes para abrir el diálogo de impresión.'); return; }
    setGenerating(true); setError('');
    try {
      const latest = await loadLatest();
      if (latest.cfdi.estado !== 'BORRADOR' || latest.cfdi.uuid_fiscal) throw new Error('El documento ya no está en estado BORRADOR sin UUID fiscal. Recarga la Carta Porte antes de imprimir.');
      setActiveDocument(latest);
      onLatestLoaded(latest);
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const documentElement = printContent.current?.querySelector<HTMLElement>('[data-carta-porte-pdf-document]');
      if (!documentElement) throw new Error('No se pudo preparar el documento para imprimir.');
      const stylesheets = Array.from(window.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(link => `<link rel="stylesheet" href="${link.href}">`).join('');
      const inlineStyles = Array.from(window.document.querySelectorAll<HTMLStyleElement>('style')).map(style => `<style>${style.textContent || ''}</style>`).join('');
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const title = `${safeName}-r${latest.cfdi.revision}`;
      printWindow.document.open();
      printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>${stylesheets}${inlineStyles}<style>${printStyles}</style></head><body><main>${documentElement.outerHTML}</main></body></html>`);
      printWindow.document.close();
      if (printWindow.document.fonts?.ready) await printWindow.document.fonts.ready;
      await new Promise<void>(resolve => setTimeout(resolve, 250));
      printWindow.focus();
      printWindow.addEventListener('afterprint', () => printWindow.close(), { once: true });
      printWindow.print();
    } catch (reason) {
      printWindow.close();
      setError(reason instanceof Error ? reason.message : 'No se pudo preparar el documento para imprimir.');
    } finally { setGenerating(false); }
  }

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-2 sm:p-5" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="Vista previa Carta Porte" className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-slate-100 shadow-2xl">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3"><p className="text-sm font-semibold text-[#0b1f3b]">Vista previa · revisión {activeDocument.cfdi.revision}</p><div className="flex items-center gap-2"><button type="button" onClick={() => void downloadPdf()} disabled={generating} className="rounded-lg bg-[#0b1f3b] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{generating ? 'Preparando PDF…' : 'Descargar PDF'}</button><button type="button" autoFocus onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cerrar</button></div></div>
      {error && <p role="alert" className="shrink-0 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</p>}
      <p className="shrink-0 bg-slate-50 px-4 py-2 text-xs text-slate-500">El navegador abrirá el diálogo de impresión. Selecciona «Guardar como PDF» para descargarlo.</p>
      <div ref={printContent} className="overflow-y-auto"><CartaPortePreviewDocument document={activeDocument} unitNumber={unitNumber}/></div>
    </section>
  </div>;
}
