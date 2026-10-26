export function mexicoToday() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function operatorLicenseStatus(expiry: string | null, today = mexicoToday()) {
  if (!expiry) return { label: 'Vigencia pendiente', tone: 'amber' as const };
  const days = (Date.parse(expiry.slice(0, 10) + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000;
  if (!Number.isFinite(days)) return { label: 'Fecha inválida', tone: 'amber' as const };
  return days < 0 ? { label: 'Vencida', tone: 'red' as const } : days <= 30 ? { label: 'Por vencer', tone: 'amber' as const } : { label: 'Vigente', tone: 'green' as const };
}
export function operatorCartaPorteReady(operator: { nombre: string; rfc: string | null; numero_licencia: string | null; residencia_fiscal_sat: string | null; numero_registro_tributario: string | null }) {
  const foreign = Boolean(operator.residencia_fiscal_sat && operator.residencia_fiscal_sat !== 'MEX');
  return Boolean(operator.nombre && operator.numero_licencia && (foreign ? operator.numero_registro_tributario && operator.residencia_fiscal_sat : operator.rfc && /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/.test(operator.rfc) && !['XAXX010101000', 'XEXX010101000'].includes(operator.rfc)));
}
