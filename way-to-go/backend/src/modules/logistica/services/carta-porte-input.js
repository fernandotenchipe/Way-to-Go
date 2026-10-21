export class CartaPorteError extends Error {
  constructor(status, code, message, fields = []) { super(message); this.status = status; this.code = code; this.fields = fields; }
}
export const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const reject = (status, code, message, fields) => { throw new CartaPorteError(status, code, message, fields); };
export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(400, 'INVALID_INPUT', 'Envía un objeto válido');
  return value;
}
export function only(value, keys) {
  object(value);
  const extra = Object.keys(value).filter(key => !keys.includes(key));
  if (extra.length) reject(400, 'UNKNOWN_FIELDS', `Campos no permitidos: ${extra.join(', ')}`);
}
export function revision(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || String(value).length > 18) reject(400, 'INVALID_REVISION', 'Envía expected_revision');
  return String(value);
}
const addressKeys = ['calle','numero_exterior','numero_interior','colonia','localidad','municipio','estado','pais','codigo_postal','referencia','pais_sat','estado_sat','municipio_sat','localidad_sat','colonia_sat'];
export function address(value) {
  only(value, addressKeys);
  for (const entry of Object.values(value)) if (entry !== null && (typeof entry !== 'string' || entry.length > 1000)) reject(400, 'INVALID_ADDRESS', 'Domicilio inválido');
  return value;
}
export function fields(input, spec, required = []) {
  only(input, Object.keys(spec));
  const result = {};
  for (const key of required) if (input[key] == null || (typeof input[key]==='string'&&!input[key].trim())) reject(400, 'REQUIRED', `Falta ${key}`);
  for (const [key, value] of Object.entries(input)) {
    if (value === null) { if (required.includes(key)) reject(400, 'REQUIRED', `Falta ${key}`); result[key] = null; continue; }
    const type = spec[key];
    let valid = false;
    if (type === 'text') valid = typeof value === 'string' && value.length <= 2000 && !value.includes('\u0000');
    if (type === 'uuid') valid = uuid(value);
    if (type === 'boolean') valid = typeof value === 'boolean';
    if (type === 'decimal') valid = typeof value === 'string' && /^\d{1,14}(\.\d{1,6})?$/.test(value);
    if (type === 'integer') valid = Number.isSafeInteger(value) && value >= 0 && value <= 2147483647;
    if (type === 'date') valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
    if (type === 'timestamp') valid = typeof value === 'string' && /T.*(Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
    if (type === 'address') { address(value); valid = true; }
    if (!valid) reject(400, 'INVALID_FIELD', `Valor inválido en ${key}; tipo esperado: ${type}`);
    result[key] = typeof value === 'string' ? value.trim() : value;
  }
  return result;
}
// Dinero decimal fijo, sin aritmética binaria de punto flotante.
export function decimal(value) {
  if (typeof value !== 'string' || !/^\d{1,14}(\.\d{1,6})?$/.test(value)) reject(400, 'INVALID_DECIMAL', 'Los decimales se envían como cadenas, con hasta seis posiciones');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
}
export function formatDecimal(value) {
  const sign = value < 0n ? '-' : ''; const n = value < 0n ? -value : value;
  return `${sign}${n / 1000000n}.${String(n % 1000000n).padStart(6, '0')}`;
}
export const multiplyDecimal = (a, b) => (decimal(a) * decimal(b) + 500000n) / 1000000n;
