import type { LogisticsAddress, LogisticsCustomer, LogisticsCustomerAgreement, LogisticsCustomerDetail } from './logistics-api';

export type DemoLogisticsCustomer = LogisticsCustomer & {
  address_preview?: string | null;
  demo_addresses?: LogisticsAddress[];
  demo_contacts?: LogisticsCustomerDetail['contactos'];
  demo_agreements?: LogisticsCustomerAgreement[];
};

const STORAGE_KEY = 'wtg-logistics-demo-customers';

export function getDemoLogisticsCustomers(): DemoLogisticsCustomer[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const customers: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(customers)) return [];
    return (customers as DemoLogisticsCustomer[]).map((customer) => {
      const addresses = customer.demo_addresses ?? [];
      const hasPrimary = addresses.some((address) => address.principal && address.activo);
      const firstActiveAddress = hasPrimary ? undefined : addresses.find((address) => address.activo);
      return {
        ...customer,
        demo_addresses: firstActiveAddress ? addresses.map((address) => ({ ...address, principal: address.id === firstActiveAddress.id })) : addresses,
        demo_contacts: (customer.demo_contacts ?? []).map((contact) => ({ ...contact, activo: contact.activo ?? true })),
        demo_agreements: customer.demo_agreements ?? [],
      };
    });
  } catch {
    return [];
  }
}

export function saveDemoLogisticsCustomer(customer: DemoLogisticsCustomer) {
  if (typeof window === 'undefined') return;
  const customers = getDemoLogisticsCustomers().filter((item) => item.id !== customer.id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([customer, ...customers]));
}
