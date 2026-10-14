import type { LogisticsCustomer } from './logistics-api';

export function normalizeCustomerRfc(value: string) {
  return value.trim().toUpperCase();
}

export function isValidMexicanRfc(value: string) {
  const rfc = normalizeCustomerRfc(value);
  return !rfc || /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc);
}

export function isValidContactEmail(value: string) {
  const email = value.trim();
  return !email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function hasDuplicateCustomerRfc(customers: LogisticsCustomer[], value: string, ignoreId?: string) {
  const rfc = normalizeCustomerRfc(value);
  if (!rfc) return false;
  return customers.some((customer) => customer.id !== ignoreId
    && customer.rfc
    && normalizeCustomerRfc(customer.rfc) === rfc);
}
