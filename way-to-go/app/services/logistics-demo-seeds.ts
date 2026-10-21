import type { DemoLogisticsCustomer } from './logistics-demo-customers';

export const demoClients: DemoLogisticsCustomer[] = [
  { id: 'demo-client-norte', razon_social: 'DEMO · Comercializadora Norte, S.A. de C.V.', nombre_comercial: 'Norte Demo', rfc: null, activo: true, direcciones_activas: 2, created_at: '', updated_at: '', address_preview: 'Apodaca, Nuevo León', demo_addresses: [
    { id: 'demo-address-n1', cliente_id: 'demo-client-norte', nombre: 'CEDIS Apodaca', calle: 'Av. de Prueba 1200', ciudad: 'Apodaca', estado: 'Nuevo León', pais: 'MX', codigo_postal: '66600', zona_horaria: 'America/Monterrey', horario: 'Lun–Vie 08:00–17:00', instrucciones: null, requiere_cita: true, activo: true, principal: true },
    { id: 'demo-address-n2', cliente_id: 'demo-client-norte', nombre: 'Planta Monterrey', calle: 'Calle Muestra 45', ciudad: 'Monterrey', estado: 'Nuevo León', pais: 'MX', codigo_postal: '64000', zona_horaria: 'America/Monterrey', horario: 'Lun–Vie 07:00–16:00', instrucciones: null, requiere_cita: false, activo: true },
  ] },
  { id: 'demo-client-centro', razon_social: 'DEMO · Alimentos de Prueba, S. de R.L.', nombre_comercial: 'Alimentos Demo', rfc: null, activo: true, direcciones_activas: 1, created_at: '', updated_at: '', address_preview: 'Puebla, Puebla', demo_addresses: [
    { id: 'demo-address-c1', cliente_id: 'demo-client-centro', nombre: 'CEDIS Puebla', calle: 'Blvd. Ejemplo 800', ciudad: 'Puebla', estado: 'Puebla', pais: 'MX', codigo_postal: '72000', zona_horaria: 'America/Mexico_City', horario: 'Lun–Sáb 06:00–18:00', instrucciones: null, requiere_cita: true, activo: true, principal: true },
  ] },
  { id: 'demo-client-bajio', razon_social: 'DEMO · Empaques Modelo del Bajío, S.A.', nombre_comercial: 'Empaques Demo', rfc: null, activo: true, direcciones_activas: 1, created_at: '', updated_at: '', address_preview: 'León, Guanajuato', demo_addresses: [
    { id: 'demo-address-b1', cliente_id: 'demo-client-bajio', nombre: 'Planta León', calle: 'Carretera Ficticia km 4', ciudad: 'León', estado: 'Guanajuato', pais: 'MX', codigo_postal: '37000', zona_horaria: 'America/Mexico_City', horario: 'Lun–Vie 08:00–17:00', instrucciones: null, requiere_cita: false, activo: true, principal: true },
  ] },
];
