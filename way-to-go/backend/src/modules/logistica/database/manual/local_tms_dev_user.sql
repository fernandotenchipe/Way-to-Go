-- Ejecutar manualmente en Supabase SQL Editor. No crea tablas ni cuentas en auth.users.
-- Usar el mismo correo en LOGISTICA_LOCAL_TMS_USER_EMAIL del backend local.
-- Rol exclusivo de pruebas: no concede permisos a roles de operación existentes.
-- No incluye carta_porte.timbrar ni carta_porte.cancelar.
BEGIN;

DO $setup$
DECLARE
  dev_email constant text := 'dev.tms.local@example.invalid';
  dev_name constant text := 'Desarrollo local TMS';
  dev_role constant text := 'LOCAL_TMS_DEV';
  required_permissions constant text[] := ARRAY[
    'flota.ver', 'flota.editar',
    'viajes.ver', 'viajes.crear', 'viajes.editar', 'viajes.estatus',
    'carta_porte.catalogos.ver', 'carta_porte.catalogos.editar',
    'carta_porte.ver', 'carta_porte.editar', 'carta_porte.validar',
    'carta_porte.importar'
  ];
  missing_permissions text[];
  dev_user_id uuid;
  dev_role_id uuid;
BEGIN
  SELECT array_agg(required.code ORDER BY required.code)
    INTO missing_permissions
    FROM unnest(required_permissions) AS required(code)
    LEFT JOIN tms.permisos p ON p.codigo = required.code
   WHERE p.id IS NULL;
  IF missing_permissions IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan permisos TMS en el esquema existente: %', missing_permissions;
  END IF;

  INSERT INTO tms.roles (codigo, descripcion)
  VALUES (dev_role, 'Acceso temporal de desarrollo local TMS')
  ON CONFLICT (codigo) DO NOTHING;
  SELECT id INTO STRICT dev_role_id FROM tms.roles WHERE codigo = dev_role;

  INSERT INTO tms.usuarios (nombre, email, activo)
  VALUES (dev_name, dev_email, true)
  ON CONFLICT DO NOTHING;
  SELECT id INTO STRICT dev_user_id FROM tms.usuarios WHERE lower(email) = lower(dev_email);
  UPDATE tms.usuarios SET nombre = dev_name, activo = true
   WHERE id = dev_user_id AND (nombre IS DISTINCT FROM dev_name OR activo IS DISTINCT FROM true);

  INSERT INTO tms.usuario_roles (usuario_id, rol_id)
  VALUES (dev_user_id, dev_role_id)
  ON CONFLICT (usuario_id, rol_id) DO NOTHING;

  INSERT INTO tms.rol_permisos (rol_id, permiso_id)
  SELECT dev_role_id, p.id FROM tms.permisos p
   WHERE p.codigo = ANY(required_permissions)
  ON CONFLICT (rol_id, permiso_id) DO NOTHING;
END;
$setup$;

COMMIT;

-- Comprobación de lectura al finalizar la ejecución manual.
SELECT u.email, u.activo, r.codigo AS rol, array_agg(p.codigo ORDER BY p.codigo) AS permisos
  FROM tms.usuarios u
  JOIN tms.usuario_roles ur ON ur.usuario_id = u.id
  JOIN tms.roles r ON r.id = ur.rol_id
  JOIN tms.rol_permisos rp ON rp.rol_id = r.id
  JOIN tms.permisos p ON p.id = rp.permiso_id
 WHERE lower(u.email) = lower('dev.tms.local@example.invalid') AND r.codigo = 'LOCAL_TMS_DEV'
 GROUP BY u.email, u.activo, r.codigo;
