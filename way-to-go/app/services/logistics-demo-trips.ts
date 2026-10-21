import type { LogisticsTrip } from './logistics-api';

const key = 'wtg-logistics-demo-trips';
export function getDemoTrips(): LogisticsTrip[] {
  try {
    const rows: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch { return []; }
}
export function saveDemoTrip(trip: LogisticsTrip) {
  localStorage.setItem(key, JSON.stringify([trip, ...getDemoTrips().filter((row) => row.id !== trip.id)]));
}
