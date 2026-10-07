'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeftIcon, BanknotesIcon, BellAlertIcon, ChartBarIcon, ChevronDownIcon, ClipboardDocumentCheckIcon, ClockIcon, DocumentTextIcon, HomeIcon, MapIcon, MapPinIcon, TruckIcon, UserGroupIcon, BuildingOffice2Icon, CurrencyDollarIcon, UserCircleIcon } from '@heroicons/react/24/outline';

export type PortalModule = 'rastreo' | 'logistica' | 'finanzas';
type NavItem = { name: string; href: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; badge?: string };
const menus: Record<PortalModule, NavItem[]> = {
  rastreo: [
    { name: 'Resumen GPS', href: '/rastreo/dashboard', icon: HomeIcon },
    { name: 'Unidades en mapa', href: '/rastreo/en-vivo', icon: MapPinIcon },
    { name: 'Órdenes GPS', href: '/rastreo/ordenes', icon: ClipboardDocumentCheckIcon },
    { name: 'Alertas GPS', href: '/rastreo/alertas', icon: BellAlertIcon, badge: '3' },
  ],
  logistica: [
    { name: 'Dashboard TMS', href: '/logistica/dashboard', icon: HomeIcon },
    { name: 'Viajes', href: '/logistica/viajes', icon: MapIcon },
    { name: 'Evidencias y POD', href: '/logistica/evidencias', icon: DocumentTextIcon },
    { name: 'Facturación operativa', href: '/logistica/facturacion', icon: BanknotesIcon },
    { name: 'Costos y extras', href: '/logistica/costos', icon: CurrencyDollarIcon },
    { name: 'Clientes y convenios', href: '/logistica/clientes', icon: BuildingOffice2Icon },
    { name: 'Flota', href: '/logistica/flota', icon: TruckIcon },
    { name: 'Operadores', href: '/logistica/operadores', icon: UserGroupIcon },
    { name: 'Reportes', href: '/logistica/reportes', icon: ChartBarIcon },
    { name: 'Portal de cliente', href: '/portal/cliente', icon: UserCircleIcon },
    { name: 'Portal de operador', href: '/portal/operador', icon: UserCircleIcon },
  ],
  finanzas: [
    { name: 'Dashboard', href: '/finanzas/dashboard', icon: HomeIcon }, { name: 'Ventas / Cuentas por cobrar', href: '/finanzas/ventas', icon: ChartBarIcon }, { name: 'Órdenes de venta', href: '/finanzas/ordenes-venta', icon: ClipboardDocumentCheckIcon }, { name: 'Facturas de clientes', href: '/finanzas/facturas-clientes', icon: DocumentTextIcon, badge: '8' }, { name: 'Pagos recibidos', href: '/finanzas/pagos-recibidos', icon: BanknotesIcon }, { name: 'Compras / Cuentas por pagar', href: '/finanzas/compras', icon: ChartBarIcon }, { name: 'Órdenes de compra', href: '/finanzas/ordenes-compra', icon: ClipboardDocumentCheckIcon }, { name: 'Facturas de proveedores', href: '/finanzas/facturas-proveedor', icon: DocumentTextIcon, badge: '5' }, { name: 'Pagos realizados', href: '/finanzas/pagos-realizados', icon: BanknotesIcon }, { name: 'Expediente digital', href: '/finanzas/expediente', icon: UserGroupIcon },
  ],
};
const moduleLabels: Record<PortalModule, string> = { rastreo: 'Rastreo GPS', logistica: 'Logística / TMS', finanzas: 'Finanzas' };
const moduleRoutes: Record<PortalModule, string> = { rastreo: '/rastreo/dashboard', logistica: '/logistica/dashboard', finanzas: '/finanzas/dashboard' };
export default function Sidebar({ module }: { module: PortalModule }) {
  const pathname = usePathname(); const router = useRouter(); const [open, setOpen] = useState(false);
  const accent = module === 'finanzas' ? 'violet' : module === 'logistica' ? 'blue' : 'gold';
  const activeClasses = accent === 'violet' ? 'bg-violet-50 text-violet-700' : accent === 'blue' ? 'bg-blue-50 text-blue-800' : 'bg-pink-50 text-pink-700';
  return <aside className="fixed inset-y-0 left-0 z-30 flex w-72 flex-col border-r border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-6 pb-5 pt-6"><Link href="/" className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 text-white shadow-sm"><TruckIcon className="h-6 w-6" /></div><div><p className="text-base font-bold tracking-tight text-slate-950">Way to Go</p><p className="text-xs text-slate-500">Portal interno</p></div></Link>
      <div className="relative mt-6"><button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left transition hover:border-slate-300 hover:bg-white"><div><p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Módulo actual</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{moduleLabels[module]}</p></div><ChevronDownIcon className={`h-4 w-4 text-slate-500 transition ${open ? 'rotate-180' : ''}`} /></button>
        {open && <div className="absolute left-0 right-0 top-full z-40 mt-2 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"><p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Cambiar módulo</p>{(['rastreo','logistica','finanzas'] as PortalModule[]).map((key)=><button key={key} onClick={()=>router.push(moduleRoutes[key])} className={`flex w-full rounded-lg px-2 py-2 text-left text-sm ${module===key?`${activeClasses} font-semibold`:'text-slate-600 hover:bg-slate-50'}`}>{moduleLabels[key]}</button>)}<div className="my-2 border-t border-slate-100"/><button onClick={()=>router.push('/')} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-600 hover:bg-slate-50"><ArrowLeftIcon className="h-4 w-4"/>Volver al inicio</button></div>}
      </div></div>
    <nav className="flex-1 overflow-y-auto px-4 py-5"><p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">{module==='rastreo'?'Monitoreo GPS':module==='logistica'?'Operación logística':'Gestión financiera'}</p><div className="space-y-1">{menus[module].map((item)=>{const active=pathname===item.href||(item.href==='/logistica/viajes'&&pathname.startsWith('/logistica/viajes/'));return <Link key={item.href} href={item.href} className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${active?`${activeClasses} font-semibold`:'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><span className="flex items-center gap-3"><item.icon className="h-5 w-5"/>{item.name}</span>{item.badge&&<span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${activeClasses}`}>{item.badge}</span>}</Link>})}</div></nav>
    <div className="border-t border-slate-100 p-4"><Link href="/" className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800"><ClockIcon className="h-4 w-4"/>Selector de módulos</Link><div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600">GD</div><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">George Davidson</p><p className="truncate text-[11px] text-slate-500">Administrador</p></div></div></div>
  </aside>;
}
