-- Ejecutar una sola vez sobre un esquema tms existente.
-- Si hay RFC duplicados ignorando mayúsculas/espacios, resuélvelos antes de aplicar.
-- Consulta de diagnóstico:
-- SELECT upper(btrim(rfc)) AS rfc_normalizado, array_agg(id) AS clientes
-- FROM tms.clientes
-- WHERE rfc IS NOT NULL AND btrim(rfc) <> ''
-- GROUP BY upper(btrim(rfc)) HAVING count(*) > 1;

BEGIN;

ALTER TABLE tms.cliente_direcciones
  ADD COLUMN IF NOT EXISTS principal boolean NOT NULL DEFAULT false;

WITH direcciones_activas AS (
  SELECT id, row_number() OVER (
    PARTITION BY cliente_id ORDER BY created_at, id
  ) AS posicion
  FROM tms.cliente_direcciones
  WHERE activo
)
UPDATE tms.cliente_direcciones AS direccion
SET principal = (activas.posicion = 1)
FROM direcciones_activas AS activas
WHERE direccion.id = activas.id;

UPDATE tms.cliente_direcciones SET principal = false WHERE NOT activo;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tms.clientes
    WHERE rfc IS NOT NULL AND btrim(rfc) <> ''
    GROUP BY upper(btrim(rfc))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay RFC duplicados; consulta el diagnóstico al inicio de esta migración y corrígelos antes de reintentar.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS clientes_rfc_ci
  ON tms.clientes (upper(btrim(rfc)))
  WHERE rfc IS NOT NULL AND btrim(rfc) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS cliente_direccion_principal
  ON tms.cliente_direcciones (cliente_id)
  WHERE principal AND activo;

COMMIT;
