import DashboardLayout from '../../../ui/DashboardLayout';
import ClientCreateScreen from '../../../ui/ClientCreateScreen';

export default function NewCustomerPage() {
  return (
    <DashboardLayout module="logistica" title="Agregar cliente" subtitle="Datos base y condiciones del cliente">
      <ClientCreateScreen />
    </DashboardLayout>
  );
}
