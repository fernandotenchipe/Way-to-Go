'use client';
import { ReactNode } from 'react';
import Header from './Header';
import Sidebar, { PortalModule } from './Sidebar';
export default function DashboardLayout({ children, title, subtitle, module }: { children: ReactNode; title: string; subtitle?: string; module: PortalModule }) { return <div className="min-h-screen bg-slate-50"><Sidebar module={module} /><div className="ml-72 flex min-h-screen flex-col"><Header title={title} subtitle={subtitle} module={module} /><main className="flex-1">{children}</main></div></div>; }
