export function validateAddresses(addresses) {
  if (!Array.isArray(addresses) || addresses.length > 30) return 'Envía hasta 30 ubicaciones por cliente';
  for (const address of addresses) {
    if (!address || !['nombre', 'calle', 'ciudad', 'estado'].every((key) => typeof address[key] === 'string' && address[key].trim())) return 'Cada ubicación requiere nombre, calle, ciudad y estado';
    if (Object.values(address).some((value) => typeof value === 'string' && value.length > 1000)) return 'Los datos de la ubicación son demasiado largos';
    if (address.pais != null && (typeof address.pais !== 'string' || !/^[a-z]{2}$/i.test(address.pais))) return 'El país debe usar dos letras';
    for (const key of ['codigo_postal', 'zona_horaria', 'horario', 'instrucciones', 'tipo_ubicacion', 'tipo_zona']) {
      if (address[key] != null && typeof address[key] !== 'string') return 'Los datos de la ubicación deben ser texto';
    }
    for (const key of ['principal', 'requiere_cita']) {
      if (address[key] != null && typeof address[key] !== 'boolean') return `${key} debe ser verdadero o falso`;
    }
    try { new Intl.DateTimeFormat('es-MX', { timeZone: address.zona_horaria || 'America/Mexico_City' }); }
    catch { return 'Zona horaria no válida'; }
  }
  if (addresses.filter((address) => address.principal).length > 1) return 'Elige una sola ubicación principal';
  return null;
}

// El llamador mantiene la transacción para guardar todas las ubicaciones juntas.
export async function insertCustomerAddresses(client, customerId, addresses, contactId = null) {
  const primaryIndex = Math.max(0, addresses.findIndex((address) => address.principal));
  const saved = [];
  for (const [index, address] of addresses.entries()) {
    const { rows: [row] } = await client.query(`INSERT INTO tms.cliente_direcciones
      (cliente_id,nombre,calle,ciudad,estado,pais,codigo_postal,zona_horaria,horario,instrucciones,requiere_cita,contacto_id,principal,tipo_ubicacion,tipo_zona)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [customerId, address.nombre.trim(), address.calle.trim(), address.ciudad.trim(), address.estado.trim(),
      (address.pais || 'MX').toUpperCase(), address.codigo_postal?.trim() || null,
      address.zona_horaria || 'America/Mexico_City', address.horario?.trim() || null,
      address.instrucciones?.trim() || null, Boolean(address.requiere_cita), contactId, index === primaryIndex,
      address.tipo_ubicacion?.trim() || null, address.tipo_zona?.trim() || null]);
    saved.push(row);
  }
  return saved;
}
