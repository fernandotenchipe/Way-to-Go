import type { LogisticsAddress, LogisticsCustomer, LogisticsCustomerDetail } from './logistics-api';

export type DemoLogisticsCustomer = LogisticsCustomer & {
  address_preview?: string | null;
  demo_addresses?: LogisticsAddress[];
  demo_contacts?: LogisticsCustomerDetail['contactos'];
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
      if (addresses.some((address) => address.principal && address.activo)) return customer;
      const firstActiveAddress = addresses.find((address) => address.activo);
      return firstActiveAddress
        ? { ...customer, demo_addresses: addresses.map((address) => ({ ...address, principal: address.id === firstActiveAddress.id })) }
        : customer;
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
