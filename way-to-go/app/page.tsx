'use client';

import Link from 'next/link';
import { ArrowRightIcon, BellAlertIcon, BanknotesIcon, ClipboardDocumentCheckIcon, MapPinIcon, TruckIcon } from '@heroicons/react/24/outline';

const workspaces = [
  {
    href: '/transporte/dashboard',
    name: 'Transporte',
    description: 'Consulta el estado de las unidades, viajes y entregas.',
    icon: TruckIcon,
    accent: 'yellow',
    status: '24 unidades en ruta',
    tasks: [{ label: '3 alertas requieren atención', icon: BellAlertIcon }, { label: '18 viajes activos', icon: MapPinIcon }],
  },
  {
    href: '/finanzas/dashboard',
    name: 'Finanzas',
    description: 'Da seguimiento a documentos, facturas y pagos.',
    icon: BanknotesIcon,
    accent: 'navy',
    status: '12 servicios por facturar',
    tasks: [{ label: '5 documentos rechazados', icon: ClipboardDocumentCheckIcon }, { label: '8 pagos programados', icon: BanknotesIcon }],
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-6 sm:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#f4c430] text-[#0b1f3b]"><TruckIcon className="h-5 w-5" /></span>
          <span><span className="block text-sm font-bold tracking-[0.16em] text-[#0b1f3b]">WAY TO GO</span><span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">Portal interno</span></span>
        </Link>
        <div className="flex items-center gap-3"><button aria-label="Notificaciones" className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-50"><BellAlertIcon className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#f4c430]" /></button><div className="flex items-center gap-2 border-l border-slate-200 pl-4"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0b1f3b] text-xs font-bold text-white">GD</span><span className="hidden text-sm font-semibold text-slate-700 sm:block">George Davidson</span></div></div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12 sm:px-10 lg:py-16">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c79d00]">Centro de trabajo</p><h1 className="mt-3 text-4xl font-bold tracking-tight text-[#0b1f3b] sm:text-5xl">Buenos días, George</h1><p className="mt-4 text-lg leading-7 text-slate-500">Continúa con tus tareas y consulta la operación desde un solo lugar.</p></div>
        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {workspaces.map((workspace) => <WorkspaceCard key={workspace.name} {...workspace} />)}
        </div>
        <div className="mt-8 flex items-center gap-3 border-t border-slate-200 pt-6 text-sm text-slate-500"><span className="h-2 w-2 rounded-full bg-emerald-500" />Última actualización del portal: hoy a las 10:32</div>
      </div>
    </main>
  );
}

function WorkspaceCard({ href, name, description, icon: Icon, accent, status, tasks }: (typeof workspaces)[number]) {
  const yellow = accent === 'yellow';
  return <Link href={href} className="group relative flex min-h-[270px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
    <div className="flex items-start justify-between"><span className={`flex h-12 w-12 items-center justify-center rounded-lg ${yellow ? 'bg-[#fff4c7] text-[#0b1f3b]' : 'bg-[#e8eef4] text-[#0b1f3b]'}`}><Icon className="h-6 w-6" /></span><ArrowRightIcon className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#0b1f3b]" /></div>
    <div className="mt-7"><h2 className="text-2xl font-bold text-[#0b1f3b]">{name}</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p><div className="mt-6 border-t border-slate-100 pt-4"><p className={`text-sm font-bold ${yellow ? 'text-[#0b1f3b]' : 'text-[#0b1f3b]'}`}>{status}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">{tasks.map(({ label, icon: TaskIcon }) => <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500"><TaskIcon className="h-4 w-4 text-slate-400" />{label}</span>)}</div></div></div>
    <span className={`mt-auto pt-5 text-sm font-bold ${yellow ? 'text-[#0b1f3b]' : 'text-[#0b1f3b]'}`}>Abrir {name}<span className="ml-2 inline-block transition group-hover:translate-x-1">→</span></span>
  </Link>;
}
