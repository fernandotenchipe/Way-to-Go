-- Datos ficticios para mostrar la pantalla Clientes y direcciones.
-- Ejecución repetible: crea solo los registros marcados DEMO que aún no existan.
-- No contiene datos de clientes reales.
BEGIN;

INSERT INTO tms.clientes (razon_social, nombre_comercial)
SELECT demo.razon_social, demo.nombre_comercial
FROM (VALUES
  ('DEMO · Comercializadora Norte, S.A. de C.V.', 'Norte Demo'),
  ('DEMO · Alimentos de Prueba, S. de R.L.', 'Alimentos Demo'),
  ('DEMO · Empaques Modelo del Bajío, S.A.', 'Empaques Demo')
) AS demo(razon_social, nombre_comercial)
WHERE NOT EXISTS (
  SELECT 1 FROM tms.clientes c WHERE c.razon_social = demo.razon_social
);

INSERT INTO tms.cliente_direcciones
  (cliente_id, nombre, calle, ciudad, estado, pais, codigo_postal, zona_horaria, horario, requiere_cita)
SELECT c.id, demo.nombre, demo.calle, demo.ciudad, demo.estado, 'MX', demo.codigo_postal,
  demo.zona_horaria, demo.horario, demo.requiere_cita
FROM (VALUES
  ('DEMO · Comercializadora Norte, S.A. de C.V.', 'CEDIS Apodaca', 'Av. de Prueba 1200', 'Apodaca', 'Nuevo León', '66600', 'America/Monterrey', 'Lun–Vie 08:00–17:00', true),
  ('DEMO · Comercializadora Norte, S.A. de C.V.', 'Planta Monterrey', 'Calle Muestra 45', 'Monterrey', 'Nuevo León', '64000', 'America/Monterrey', 'Lun–Vie 07:00–16:00', false),
  ('DEMO · Alimentos de Prueba, S. de R.L.', 'CEDIS Puebla', 'Blvd. Ejemplo 800', 'Puebla', 'Puebla', '72000', 'America/Mexico_City', 'Lun–Sáb 06:00–18:00', true),
  ('DEMO · Empaques Modelo del Bajío, S.A.', 'Planta León', 'Carretera Ficticia km 4', 'León', 'Guanajuato', '37000', 'America/Mexico_City', 'Lun–Vie 08:00–17:00', false)
) AS demo(razon_social, nombre, calle, ciudad, estado, codigo_postal, zona_horaria, horario, requiere_cita)
JOIN tms.clientes c ON c.razon_social = demo.razon_social
WHERE NOT EXISTS (
  SELECT 1 FROM tms.cliente_direcciones d WHERE d.cliente_id=c.id AND d.nombre=demo.nombre
);

COMMIT;
