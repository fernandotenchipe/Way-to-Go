import type { LogisticsTrip } from './logistics-api';

export interface TripViewApi {
  getTrip(folio: string): Promise<{ data: LogisticsTrip }>;
}

/** Load the trip independently so secondary requests cannot hold the page. */
export async function loadTripViewTrip(folio: string, api: TripViewApi) {
  const trip = await api.getTrip(folio);
  return trip.data;
}
