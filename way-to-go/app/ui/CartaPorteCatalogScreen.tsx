'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from 'react';
import { ArchiveBoxIcon, BuildingOffice2Icon, CubeIcon, IdentificationIcon, MapPinIcon, TruckIcon, UserGroupIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { CatalogPageHeader, CatalogSearch, CatalogTable } from './LogisticsCatalogComponents';

type CatalogRow = { name: string; description: string; values: [string, string]; details?: Array<[string, string]> };
type Catalog = {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  headings: [string, string, string];
  rows: CatalogRow[];
  manage?: { href: string; label: string };
};

// Ejemplos de presentación: no representan registros ni validaciones fiscales reales.
const catalogs: Catalog[] = [
  {
    id: 'mercancias', title: 'Mercancías', icon: CubeIcon,
    description: 'Productos y materiales frecuentes para preparar la información de la carga.',
    headings: ['Mercancía', 'Clave de bienes transportados', 'Unidad'],
    rows: [
      { name: 'Autopartes', description: 'Componentes de ensamble', values: ['Por clasificar', 'Pieza'], details: [['Identificación', 'Descripción y clave de bienes transportados por confirmar.'], ['Unidad', 'Pieza; clave SAT por confirmar.'], ['Características', 'Dimensiones y pesos de referencia pendientes.'], ['Material peligroso y embalaje', 'Aplicabilidad y clasificación pendientes.'], ['Datos especiales', 'Por definir según la mercancía y la operación.']] },
      { name: 'Cajas de cartón', description: 'Empaque corrugado', values: ['Por clasificar', 'Pieza'] },
      { name: 'Tarimas de madera', description: 'Embalaje retornable', values: ['Por clasificar', 'Pieza'] },
      { name: 'Película plástica', description: 'Material de empaque', values: ['Por clasificar', 'Kilogramo'] },
      { name: 'Refacciones', description: 'Componentes mecánicos', values: ['Por clasificar', 'Pieza'] },
    ],
  },
  {
    id: 'clientes', title: 'Clientes', icon: BuildingOffice2Icon,
    description: 'Identificación y datos fiscales de los clientes que reciben el servicio.',
    headings: ['Cliente', 'RFC', 'Régimen fiscal'],
    manage: { href: '/logistica/clientes', label: 'Ir a Clientes' },
    rows: [
      { name: 'Automotriz del Norte', description: 'Cliente de ejemplo', values: ['Por confirmar', 'Por confirmar'] },
      { name: 'Empaques del Bajío', description: 'Cliente de ejemplo', values: ['Por confirmar', 'Por confirmar'] },
      { name: 'Distribuidora Central', description: 'Cliente de ejemplo', values: ['Por confirmar', 'Por confirmar'] },
    ],
  },
  {
    id: 'remitentes', title: 'Remitentes y destinatarios', icon: IdentificationIcon,
    description: 'Personas o empresas que envían y reciben la mercancía en cada traslado.',
    headings: ['Nombre', 'RFC', 'Uso frecuente'],
    rows: [
      { name: 'Planta de ensamble Norte', description: 'Empresa de ejemplo', values: ['Por confirmar', 'Envío'] },
      { name: 'Centro de distribución Bajío', description: 'Empresa de ejemplo', values: ['Por confirmar', 'Recepción'] },
    ],
  },
  {
    id: 'ubicaciones', title: 'Ubicaciones', icon: MapPinIcon,
    description: 'Domicilios reutilizables para elegir los lugares de carga y entrega.',
    headings: ['Ubicación', 'Ciudad / estado', 'Código postal'],
    manage: { href: '/logistica/clientes', label: 'Ir a Clientes y direcciones' },
    rows: [
      { name: 'Planta Norte', description: 'Ubicación de ejemplo', values: ['Monterrey, Nuevo León', 'Por confirmar'] },
      { name: 'Almacén Bajío', description: 'Ubicación de ejemplo', values: ['Silao, Guanajuato', 'Por confirmar'] },
      { name: 'Centro de distribución', description: 'Ubicación de ejemplo', values: ['Querétaro, Querétaro', 'Por confirmar'] },
    ],
  },
  {
    id: 'unidades', title: 'Unidades', icon: TruckIcon,
    description: 'Identificación de los camiones y referencia a sus permisos y seguros.',
    headings: ['Unidad', 'Placas', 'Configuración / permiso'],
    manage: { href: '/logistica/flota', label: 'Ir a Flota' },
    rows: [
      { name: 'DEMO-WTG-024', description: 'Tractocamión · 2023', values: ['Por capturar', 'Por completar'] },
      { name: 'DEMO-WTG-031', description: 'Tractocamión · 2024', values: ['Por capturar', 'Por completar'] },
      { name: 'DEMO-WTG-018', description: 'Camión rígido · 2022', values: ['Por capturar', 'Por completar'] },
    ],
  },
  {
    id: 'remolques', title: 'Remolques', icon: ArchiveBoxIcon,
    description: 'Cajas y remolques que se podrán seleccionar para el traslado.',
    headings: ['Remolque', 'Placas', 'Subtipo SAT'],
    rows: [
      { name: 'DEMO-CJ-042', description: 'Caja seca · 53 pies', values: ['Por capturar', 'Por confirmar'] },
      { name: 'DEMO-CJ-057', description: 'Caja refrigerada', values: ['Por capturar', 'Por confirmar'] },
    ],
  },
  {
    id: 'operadores', title: 'Operadores', icon: UserGroupIcon,
    description: 'Identificación y licencia de quienes realizan el traslado.',
    headings: ['Operador', 'RFC', 'Licencia'],
    manage: { href: '/logistica/operadores', label: 'Ir a Operadores' },
    rows: [
      { name: 'Alejandro Ramírez', description: 'Operador de ejemplo · propio', values: ['Por capturar', 'Por capturar'] },
      { name: 'Jorge Molina', description: 'Operador de ejemplo · propio', values: ['Por capturar', 'Por capturar'] },
    ],
  },
  {
    id: 'emisor', title: 'Empresa emisora', icon: BuildingOffice2Icon,
    description: 'Datos fiscales de la empresa que emitirá el comprobante.',
    headings: ['Empresa', 'RFC', 'Domicilio fiscal'],
    rows: [{ name: 'Empresa transportista', description: 'Emisor de ejemplo', values: ['Por configurar', 'Por configurar'] }],
  },
];

const card = 'rounded-xl border border-slate-200 bg-white shadow-sm';

function CatalogDetail({ catalog, row, onClose }: { catalog: Catalog; row: CatalogRow; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    return () => previous?.focus();
  }, []);

  return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4" onClick={onClose} onKeyDown={(event) => {
    if (event.key === 'Escape') onClose();
    // El botón de cierre es el único control del diálogo.
    if (event.key === 'Tab') { event.preventDefault(); closeButton.current?.focus(); }
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="carta-porte-detail-title" aria-describedby="carta-porte-detail-description" className={`${card} my-auto w-full max-w-2xl p-6`} onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold text-slate-500">{catalog.title} · Ejemplo</p><h2 id="carta-porte-detail-title" className="mt-1 text-xl font-bold text-[#0b1f3b]">{row.name}</h2><p id="carta-porte-detail-description" className="mt-1 text-sm text-slate-500">Vista de consulta. La captura completa se habilitará en una siguiente etapa.</p></div>
        <button ref={closeButton} type="button" onClick={onClose} aria-label="Cerrar ficha" className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><XMarkIcon className="h-5 w-5" /></button>
      </div>
      <dl className="mt-5 divide-y divide-slate-100">{(row.details || [[catalog.headings[0], row.description], [catalog.headings[1], row.values[0]], [catalog.headings[2], row.values[1]]]).map(([label, value]) => <div key={label} className="py-3"><dt className="text-sm font-semibold text-[#0b1f3b]">{label}</dt><dd className="mt-1 text-sm text-slate-500">{value}</dd></div>)}</dl>
      {catalog.id === 'mercancias' && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Las cantidades, los pesos definitivos y la información particular del traslado se completarán dentro del viaje. Esta ficha es una referencia inicial, no una validación fiscal.</p>}
    </section>
  </div>;
}

export default function CartaPorteCatalogScreen() {
  const [selected, setSelected] = useState('mercancias');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<CatalogRow | null>(null);
  const catalog = catalogs.find((item) => item.id === selected)!;
  const rows = catalog.rows.filter((row) => [row.name, row.description, ...row.values].join(' ').toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')));

  return <div className="space-y-6 p-6 lg:p-8">
    <CatalogPageHeader eyebrow="Operación · TMS" title="Catálogo de Carta Porte" description="Prepara y consulta la información que usarás al crear tus viajes." />
    <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Vista de demostración.</strong> Todos los registros de esta pantalla son ejemplos. Todavía no consulta ni guarda datos del catálogo y no realiza timbrado.</p>
    <nav aria-label="Catálogos de Carta Porte" className="flex flex-wrap gap-2">{catalogs.map((item) => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => { setSelected(item.id); setQuery(''); setDetail(null); }} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${selected === item.id ? 'border-[#0b1f3b] bg-[#0b1f3b] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><item.icon className="h-4 w-4" />{item.title}</button>)}</nav>
    <section className={`${card} overflow-hidden`} aria-labelledby="carta-porte-catalog-title">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5"><div><h2 id="carta-porte-catalog-title" className="text-lg font-bold text-[#0b1f3b]">{catalog.title}</h2><p className="mt-1 text-sm text-slate-500">{catalog.description}</p></div>{catalog.manage && <Link href={catalog.manage.href} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">{catalog.manage.label}</Link>}</div>
      <div className="p-5"><CatalogSearch value={query} onChange={setQuery} placeholder={`Buscar en ${catalog.title.toLocaleLowerCase('es')}`} /></div>
      <CatalogTable headings={[...catalog.headings, 'Estado', 'Acción']}>
        {rows.map((row) => <tr key={row.name} className="hover:bg-slate-50/80"><td className="px-5 py-4"><p className="font-bold text-[#0b1f3b]">{row.name}</p><p className="mt-1 text-xs text-slate-500">{row.description}</p></td>{row.values.map((value, index) => <td key={index} className="px-5 py-4 text-slate-600">{value}</td>)}<td className="px-5 py-4"><span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">Por completar</span></td><td className="px-5 py-4"><button type="button" aria-label={`Ver ficha de ${row.name}`} onClick={() => setDetail(row)} className="whitespace-nowrap font-semibold text-blue-800 hover:underline">Ver ficha</button></td></tr>)}
        {!rows.length && <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500">No hay ejemplos que coincidan con la búsqueda.</td></tr>}
      </CatalogTable>
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400" aria-live="polite">{rows.length} de {catalog.rows.length} registros de ejemplo</p>
    </section>
    <section className={`${card} flex items-start gap-3 p-5`}><TruckIcon className="h-5 w-5 shrink-0 text-slate-500" /><div><h2 className="text-sm font-bold text-[#0b1f3b]">La Carta Porte se completará en el viaje</h2><p className="mt-1 text-sm text-slate-500">El catálogo reunirá los datos reutilizables. Dentro del viaje se confirmará la carga, se completará la información pendiente y se realizará el timbrado.</p></div></section>
    {detail && <CatalogDetail catalog={catalog} row={detail} onClose={() => setDetail(null)} />}
  </div>;
}
