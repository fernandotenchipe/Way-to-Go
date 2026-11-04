'use client';

import { useEffect, useState } from 'react';
import { logisticsApi, type CfdiCatalogRow } from '../services/logistics-api';

type Props = {
  catalog: string;
  name: string;
  label: string;
  defaultValue?: string | null;
  placeholder?: string;
  disabled?: boolean;
  allowedKeys?: string[];
  onValueChange?: (value: string) => void;
};

export default function CfdiCatalogSelect({ catalog, name, label, defaultValue, placeholder = 'Busca por clave o descripción', disabled = false, allowedKeys, onValueChange }: Props) {
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CfdiCatalogRow[]>([]);
  const [value, setValue] = useState(defaultValue ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void logisticsApi.searchCfdiCatalog(catalog, { q: query, limit: 40, vigente: true })
        .then((response) => { if (active) setRows(response.data.resultados); })
        .catch(() => { if (active) setError('No se pudo consultar el catálogo SAT.'); })
        .finally(() => { if (active) setLoading(false); });
    }, query ? 220 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [catalog, query]);

  return <div className="min-w-0">
    <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor={`${name}-sat-search`}>{label}</label>
    <input id={`${name}-sat-search`} type="search" value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="mb-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:bg-slate-50" />
    <select name={name} value={value} disabled={disabled} onChange={(event) => { setValue(event.target.value); onValueChange?.(event.target.value); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 focus:border-blue-400 focus:outline-none disabled:bg-slate-50">
      <option value="">Selecciona una clave</option>
      {value && !rows.some((row) => row.clave === value) && <option value={value}>Valor guardado: {value}</option>}
      {rows.filter((row) => !allowedKeys || allowedKeys.includes(row.clave)).map((row) => <option key={`${row.clave}-${JSON.stringify(row.clave_contexto)}`} value={row.clave}>{row.clave} · {row.descripcion}</option>)}
    </select>
    <p className="mt-1 min-h-4 text-[11px] text-slate-400" aria-live="polite">{loading ? 'Buscando…' : error || `${rows.length} opciones${value ? ` · clave seleccionada: ${value}` : ''}`}</p>
  </div>;
}
