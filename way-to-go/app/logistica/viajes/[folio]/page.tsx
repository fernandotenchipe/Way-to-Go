import DashboardLayout from '../../../ui/DashboardLayout';
import { TripDetail } from '../../../ui/LogisticsScreens';
export default async function Page({params}:{params:Promise<{folio:string}>}){const {folio}=await params;return <DashboardLayout module="logistica" title="Expediente del viaje" subtitle="Seguimiento, documentos y cierre"><TripDetail folio={decodeURIComponent(folio)}/></DashboardLayout>;}
