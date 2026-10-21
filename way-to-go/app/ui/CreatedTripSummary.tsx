'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { logisticsApi, type LogisticsTrip } from '../services/logistics-api';
import { getDemoTrips } from '../services/logistics-demo-trips';

export default function CreatedTripSummary({ folio }: { folio: string }) {
  const [trip, setTrip] = useState<LogisticsTrip | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const request = folio.startsWith('DEMO-')
      ? Promise.resolve(getDemoTrips().find((row) => row.folio === folio))
      : logisticsApi.getTrip(folio).then((response) => response.data);
    request.then((value) => { if (active) { if (value) setTrip(value); else setError('Este viaje de demostración no está guardado en este navegador.'); } })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'No se pudo consultar el viaje.'); });
    return () => { active = false; };
  }, [folio]);
  const address = (value: LogisticsTrip['origen_snapshot']) => value ? [value.nombre, value.calle, value.ciudad, value.estado, value.pais].filter(Boolean).join(', ') : 'Sin ubicación';
  const date = (value: string | null | undefined, snapshot: LogisticsTrip['origen_snapshot']) => value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: String(snapshot?.zona_horaria || 'America/Mexico_City') }).format(new Date(value)) + ` (${snapshot?.zona_horaria || 'America/Mexico_City'})` : 'Pendiente';
  return <div className="mx-auto max-w-5xl space-y-5 p-6 lg:p-8">
    <Link href="/logistica/viajes" className="text-sm font-semibold text-blue-800">← Volver a viajes</Link>
    <h1 className="text-2xl font-bold text-[#0b1f3b]">Viaje {folio}</h1>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-4 text-rose-800">{error}</p>}
    {!trip && !error && <p role="status">Consultando viaje…</p>}
    {trip && <>
      <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950">{folio.startsWith('DEMO-') ? 'Demostración: guardado únicamente en este navegador. No se envió a la base.' : 'Registro consultado en el servicio de Logística.'} Estado: {trip.estado_operativo === 'BORRADOR' ? 'Borrador; pendiente de asignar recursos y confirmar programación.' : trip.estado_operativo}</p>
      <dl className="grid gap-5 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        {Object.entries({ Cliente: trip.cliente, Servicio: trip.tipo_servicio || 'Pendiente', 'Recoger en': address(trip.origen_snapshot), 'Entregar en': address(trip.destino_snapshot), 'Recolección programada': date(trip.cita_carga_at, trip.origen_snapshot), 'Salida prevista': date(trip.salida_programada_at, trip.origen_snapshot), 'Llegada estimada': date(trip.entrega_estimada_at, trip.destino_snapshot), 'Descarga programada': date(trip.descarga_programada_at, trip.destino_snapshot), Carga: trip.tipo_carga || 'Pendiente', Instrucciones: trip.instrucciones || 'Sin indicaciones adicionales' }).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{value}</dd></div>)}
      </dl>
      <Link href="/logistica/viajes/nuevo" className="inline-flex rounded-lg bg-[#0b1f3b] px-4 py-2 text-sm font-semibold text-white">Crear otro viaje</Link>
    </>}
  </div>;
}
