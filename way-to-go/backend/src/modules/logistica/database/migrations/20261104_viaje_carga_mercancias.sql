-- Propuesta aditiva: conserva viaje_carga como resumen operativo de una fila
-- por viaje y agrega partidas Carta Porte en una tabla hija.
-- Revisar y ejecutar manualmente en Supabase. Esta migración no actualiza,
-- elimina ni cambia claves de las filas históricas de tms.viaje_carga.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $preflight$
BEGIN
  IF to_regclass('tms.viaje_carga') IS NULL THEN
    RAISE EXCEPTION 'No existe tms.viaje_carga; revisa el esquema antes de continuar.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='tms.viaje_carga'::regclass AND contype='p'
      AND pg_get_constraintdef(oid)='PRIMARY KEY (viaje_id)'
  ) THEN
    RAISE EXCEPTION 'La clave primaria de tms.viaje_carga no coincide con PRIMARY KEY (viaje_id); revisa el esquema antes de continuar.';
  END IF;
  IF to_regclass('tms.viaje_carga_mercancias') IS NOT NULL THEN
    RAISE EXCEPTION 'tms.viaje_carga_mercancias ya existe; coteja su definición antes de aplicar la migración.';
  END IF;
END
$preflight$;

CREATE TABLE tms.viaje_carga_mercancias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viaje_id uuid NOT NULL REFERENCES tms.viaje_carga(viaje_id),
  posicion integer NOT NULL CHECK (posicion > 0),
  descripcion text,
  mercancia text,
  cantidad numeric(20,6) CHECK (cantidad IS NULL OR cantidad > 0),
  bienes_transp_sat text,
  clave_unidad_sat text,
  unidad text,
  peso_kg numeric(12,3) CHECK (peso_kg IS NULL OR peso_kg >= 0),
  hazmat boolean,
  clave_material_peligroso_sat text,
  embalaje text,
  embalaje_sat text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (viaje_id, posicion)
);

-- Copia exacta de la línea histórica a la nueva representación. La fila de
-- resumen original permanece intacta y las claves fiscales nuevas quedan NULL.
INSERT INTO tms.viaje_carga_mercancias
  (viaje_id,posicion,descripcion,mercancia,peso_kg,hazmat,embalaje,created_at,updated_at)
SELECT viaje_id,1,descripcion,mercancia,peso_kg,hazmat,embalaje,created_at,updated_at
FROM tms.viaje_carga
WHERE descripcion IS NOT NULL OR mercancia IS NOT NULL OR peso_kg IS NOT NULL
   OR hazmat IS TRUE OR embalaje IS NOT NULL;

CREATE INDEX viaje_carga_mercancias_viaje
  ON tms.viaje_carga_mercancias(viaje_id,posicion,id);
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_carga_mercancias
  FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_carga_mercancias ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tms.viaje_carga_mercancias FROM PUBLIC;

COMMENT ON TABLE tms.viaje_carga_mercancias IS
  'Partidas de mercancía de un viaje; viaje_carga conserva el resumen operativo histórico.';
COMMENT ON COLUMN tms.viaje_carga_mercancias.peso_kg IS
  'Peso bruto de la partida en kilogramos.';
COMMENT ON COLUMN tms.viaje_carga_mercancias.bienes_transp_sat IS
  'Clave c_ClaveProdServCP; se valida contra el catálogo Carta Porte 3.1 seleccionado.';
COMMENT ON COLUMN tms.viaje_carga_mercancias.clave_unidad_sat IS
  'Clave c_ClaveUnidad; no se infiere desde unidad.';
COMMENT ON COLUMN tms.viaje_carga_mercancias.clave_material_peligroso_sat IS
  'Clave c_MaterialPeligroso cuando aplica.';
COMMENT ON COLUMN tms.viaje_carga_mercancias.embalaje_sat IS
  'Clave c_TipoEmbalaje cuando aplica; embalaje conserva el texto histórico.';

COMMIT;
