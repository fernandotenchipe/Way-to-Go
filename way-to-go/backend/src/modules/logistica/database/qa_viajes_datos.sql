-- Datos de prueba para verificar creación de viajes. No modifica el esquema.
-- Aplicado con autorización del usuario el 2026-10-20 mediante la conexión del backend.
-- Verificado por API con JWT temporal y permisos reales: viajes QA folios 1 y 2.
-- No crea cuentas de inicio de sesión, contraseñas ni usuarios de Rastreo.
-- El perfil QA debe usarse con autenticación TMS; no corrige el bypass local-dev.
-- Repetible: reutiliza únicamente las identidades QA reservadas y verifica su alcance.
BEGIN;

DO $qa$
DECLARE
  qa_usuario_id uuid;
  qa_rol_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('wtg.qa.creacion_viajes'));

  IF (SELECT count(*) FROM tms.permisos WHERE codigo IN ('viajes.ver', 'viajes.crear')) <> 2 THEN
    RAISE EXCEPTION 'Faltan permisos de viajes en el catálogo. No se aplicaron los datos QA.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tms.usuarios
    WHERE lower(email) = 'qa.viajes@waytogo.invalid'
      AND (nombre <> 'QA - Pruebas de creación de viajes' OR auth_subject IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'La identidad reservada QA ya pertenece a otro perfil. Revisa antes de continuar.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM tms.tipos_servicio WHERE codigo = 'QA_CREACION_VIAJES'
      AND nombre <> 'QA - Prueba de creación de viajes'
  ) THEN
    RAISE EXCEPTION 'El código de servicio QA ya tiene otro uso. No se modificó.';
  END IF;

  INSERT INTO tms.usuarios(nombre, email)
  VALUES ('QA - Pruebas de creación de viajes', 'qa.viajes@waytogo.invalid')
  ON CONFLICT (lower(email)) DO NOTHING;

  SELECT id INTO STRICT qa_usuario_id
  FROM tms.usuarios WHERE lower(email) = 'qa.viajes@waytogo.invalid' AND activo;

  INSERT INTO tms.roles(codigo, descripcion)
  VALUES ('QA_CREACION_VIAJES', 'QA: consultar y crear viajes; sin permisos administrativos ni de Finanzas')
  ON CONFLICT (codigo) DO NOTHING;

  SELECT id INTO STRICT qa_rol_id FROM tms.roles WHERE codigo = 'QA_CREACION_VIAJES';

  IF EXISTS (
    SELECT 1 FROM tms.rol_permisos rp JOIN tms.permisos p ON p.id = rp.permiso_id
    WHERE rp.rol_id = qa_rol_id AND p.codigo NOT IN ('viajes.ver', 'viajes.crear')
  ) OR EXISTS (
    SELECT 1 FROM tms.usuario_roles WHERE usuario_id = qa_usuario_id AND rol_id <> qa_rol_id
  ) OR EXISTS (
    SELECT 1 FROM tms.usuario_roles WHERE rol_id = qa_rol_id AND usuario_id <> qa_usuario_id
  ) THEN
    RAISE EXCEPTION 'El usuario o rol QA tiene otras asignaciones. Revisa su alcance antes de continuar.';
  END IF;

  INSERT INTO tms.rol_permisos(rol_id, permiso_id)
  SELECT qa_rol_id, id FROM tms.permisos WHERE codigo IN ('viajes.ver', 'viajes.crear')
  ON CONFLICT (rol_id, permiso_id) DO NOTHING;

  INSERT INTO tms.usuario_roles(usuario_id, rol_id)
  VALUES (qa_usuario_id, qa_rol_id)
  ON CONFLICT (usuario_id, rol_id) DO NOTHING;

  INSERT INTO tms.tipos_servicio(codigo, nombre)
  VALUES ('QA_CREACION_VIAJES', 'QA - Prueba de creación de viajes')
  ON CONFLICT (codigo) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM tms.tipos_servicio WHERE codigo = 'QA_CREACION_VIAJES' AND activo) THEN
    RAISE EXCEPTION 'El servicio QA está inactivo. Revisa antes de reactivarlo.';
  END IF;
END
$qa$;

SELECT s.codigo AS servicio_qa, s.nombre, s.activo
FROM tms.tipos_servicio s WHERE s.codigo = 'QA_CREACION_VIAJES';

SELECT u.id AS usuario_qa_id, u.nombre, u.activo, r.codigo AS rol, p.codigo AS permiso
FROM tms.usuarios u
JOIN tms.usuario_roles ur ON ur.usuario_id = u.id
JOIN tms.roles r ON r.id = ur.rol_id
JOIN tms.rol_permisos rp ON rp.rol_id = r.id
JOIN tms.permisos p ON p.id = rp.permiso_id
WHERE lower(u.email) = 'qa.viajes@waytogo.invalid'
ORDER BY p.codigo;

COMMIT;
