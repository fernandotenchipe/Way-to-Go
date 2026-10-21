-- Aplicar manualmente en una base tms existente, antes de usar el alta confirmada.
-- No convierte borradores existentes ni altera folios, recursos o eventos.
BEGIN;
DO $migration$
DECLARE
  constraint_row record;
  matches integer := 0;
BEGIN
  -- Identifica las dos reglas originales por su definición, sin asumir nombres automáticos.
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'tms.viajes'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%estado_operativo%'
      AND pg_get_constraintdef(oid) LIKE '%BORRADOR%'
  LOOP
    matches := matches + 1;
  END LOOP;
  IF matches <> 2 THEN
    RAISE EXCEPTION 'Se esperaban dos reglas de estado/completitud en tms.viajes; revisa la versión instalada antes de aplicar.';
  END IF;
  FOR constraint_row IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'tms.viajes'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%estado_operativo%'
      AND pg_get_constraintdef(oid) LIKE '%BORRADOR%'
  LOOP
    EXECUTE format('ALTER TABLE tms.viajes DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END
$migration$;

ALTER TABLE tms.viajes
  ALTER COLUMN estado_operativo SET DEFAULT 'CONFIRMADO',
  ADD CONSTRAINT viajes_estado_operativo_confirmacion_check CHECK (
    estado_operativo IN ('BORRADOR','CONFIRMADO','PROGRAMADO','EN_CAMINO_A_CARGA',
      'LLEGO_A_CARGA','EN_CARGA','SALIO_CARGADO_EN_RUTA','LLEGO_A_DESTINO',
      'EN_DESCARGA','ENTREGADO','CANCELADO')
  ),
  ADD CONSTRAINT viajes_completitud_confirmacion_check CHECK (
    estado_operativo IN ('BORRADOR','CANCELADO') OR (
      origen_id IS NOT NULL AND destino_id IS NOT NULL
      AND origen_snapshot IS NOT NULL AND destino_snapshot IS NOT NULL
      AND tipo_servicio_id IS NOT NULL AND tipo_carga IS NOT NULL
      AND cita_carga_at IS NOT NULL AND entrega_estimada_at IS NOT NULL
      AND reserva_desde IS NOT NULL AND reserva_hasta IS NOT NULL
      AND (estado_operativo = 'CONFIRMADO' OR unidad_id IS NOT NULL OR proveedor_id IS NOT NULL)
    )
  );

COMMENT ON COLUMN tms.viajes.estado_operativo IS
  'CONFIRMADO identifica un servicio aceptado aunque falte asignar transporte; PROGRAMADO conserva los requisitos operativos previos.';
COMMIT;
