import DashboardLayout from '../../ui/DashboardLayout';
import ClientsScreen from '../../ui/ClientsScreen';

export default function Page() {
  return <DashboardLayout module="logistica" title="Clientes y direcciones"><ClientsScreen /></DashboardLayout>;
}
