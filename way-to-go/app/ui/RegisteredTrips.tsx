'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { logisticsApi, type LogisticsTrip } from '../services/logistics-api';
import { getDemoTrips } from '../services/logistics-demo-trips';

// Mantiene accesibles los registros creados aunque el listado histórico sea demo.
export default function RegisteredTrips() {
  const [trips, setTrips] = useState<LogisticsTrip[]>([]);
  const [localTrips, setLocalTrips] = useState<LogisticsTrip[]>([]);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    let active = true;
    const local = getDemoTrips();
    logisticsApi.getTrips().then((response) => { if (active) setTrips(response.data); })
      .catch(() => { if (active) setDemo(true); })
      .finally(() => { if (active) setLocalTrips(local); });
    return () => { active = false; };
  }, []);
  const groups = [{ title: 'Viajes registrados en Logística', note: 'Últimos registros consultados en el servicio.', rows: trips }, { title: 'Viajes guardados en esta demo', note: 'Solo en este navegador; no se enviaron a la base.', rows: localTrips }];
  return <>{demo && <p className="text-sm text-amber-800">No se pudo consultar el listado conectado.</p>}{groups.filter((group) => group.rows.length).map((group) => <section key={group.title} className="rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="font-bold text-[#0b1f3b]">{group.title}</h2>
    <p className="mt-1 text-xs text-slate-500">{group.note}</p>
    <ul className="mt-3 divide-y divide-slate-100">{group.rows.map((trip) => <li key={trip.id} className="py-3 text-sm"><Link href={`/logistica/viajes/${encodeURIComponent(trip.folio)}`} className="font-semibold text-blue-800">{trip.folio} · {trip.cliente}</Link><p className="mt-1 text-xs text-slate-500">{String(trip.origen_snapshot?.nombre || 'Origen pendiente')} → {String(trip.destino_snapshot?.nombre || 'Destino pendiente')} · {trip.estado_operativo === 'BORRADOR' ? 'Borrador' : trip.estado_operativo}</p></li>)}</ul>
  </section>)}</>;
}
