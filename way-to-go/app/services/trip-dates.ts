// Convierte la hora del lugar, independientemente de la zona horaria del navegador.
export function tripDateToIso(value: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Captura una fecha y hora válida.');
  const wall = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 16) !== value) throw new Error('La fecha no es válida.');
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const localMillis = (stamp: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(stamp).map((part) => [part.type, part.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
  };
  const offsets = new Set([-36, 0, 36].map((hours) => { const stamp = wall + hours * 3600000; return localMillis(stamp) - stamp; }));
  const matches = [...offsets].map((offset) => wall - offset).filter((stamp) => localMillis(stamp) === wall);
  if (matches.length !== 1) throw new Error(`La hora ${value.replace('T', ' ')} no existe o se repite por un cambio de horario en ${timeZone}. Elige otra hora.`);
  return new Date(matches[0]).toISOString();
}
