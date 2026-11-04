-- Propuesta para revisión. NO ejecutada.
-- Requiere la migración histórica 20261021_carta_porte_catalogos_documentos.sql.
-- No importa archivos ni modifica filas existentes mediante DML.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = tms, public, extensions;

-- Detenerse antes de cambiar el esquema si hay dependencias externas o datos
-- que impedirían la nueva unicidad. La transacción protege el estado anterior.
DO $preflight$
BEGIN
  IF to_regclass('tms.cp_sat_versiones') IS NULL
     OR to_regclass('tms.cp_sat_claves') IS NULL
     OR to_regclass('tms.cfdi') IS NULL THEN
    RAISE EXCEPTION 'Falta la migración histórica de Carta Porte';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint fk
    WHERE fk.contype = 'f' AND fk.confrelid = 'tms.cp_sat_claves'::regclass
  ) THEN
    RAISE EXCEPTION 'Hay claves foráneas hacia cp_sat_claves; revisar antes de cambiar su PK';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    WHERE d.refobjid = 'tms.cp_sat_claves'::regclass
      AND d.classid = 'pg_rewrite'::regclass
      AND r.ev_class <> 'tms.cp_sat_claves'::regclass
  ) THEN
    RAISE EXCEPTION 'Hay vistas dependientes de cp_sat_claves; revisar antes de cambiar su PK';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm'
  ) OR (NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')
        AND to_regnamespace('extensions') IS NULL
  ) THEN
    RAISE EXCEPTION 'Se requiere pg_trgm disponible y, si falta instalarlo, esquema extensions';
  END IF;
END
$preflight$;

-- Supabase ofrece pg_trgm; si la instalación no está permitida en este
-- proyecto, el error se propaga y aborta esta misma transacción. No hay
-- manejador EXCEPTION que oculte el fallo. No ejecutar este bloque aislado.
DO $extension$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE EXTENSION pg_trgm WITH SCHEMA extensions';
  END IF;
END
$extension$;

-- Cada archivo oficial tiene su propia versión. Las versiones históricas de
-- Carta Porte conservan sus IDs, fechas y referencias desde cartas_porte.
ALTER TABLE tms.cp_sat_versiones
  ADD COLUMN familia text NOT NULL DEFAULT 'CARTA_PORTE',
  ADD COLUMN metadatos jsonb NOT NULL DEFAULT '{}'::jsonb;
-- La comparación usa exactamente las columnas y expresiones de las futuras
-- restricciones. En el esquema anterior todas las filas pasan a CARTA_PORTE.
DO $version_checks$
BEGIN
  IF EXISTS (
    SELECT 1 FROM tms.cp_sat_versiones
    GROUP BY familia, sha256 HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay versiones SAT duplicadas para (familia, sha256)';
  END IF;
  IF EXISTS (
    SELECT 1 FROM tms.cp_sat_versiones WHERE familia = 'CARTA_PORTE'
    GROUP BY lower(btrim(version_complemento)), lower(btrim(version_cfdi)),
             lower(btrim(revision)) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay revisiones Carta Porte lógicamente duplicadas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM tms.cp_sat_versiones WHERE familia = 'CFDI'
    GROUP BY lower(btrim(version_cfdi)), lower(btrim(revision))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay revisiones CFDI lógicamente duplicadas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM tms.cp_sat_versiones
    WHERE btrim(version_cfdi) = '' OR btrim(revision) = ''
       OR (familia = 'CARTA_PORTE' AND
           (version_complemento IS NULL OR btrim(version_complemento) = ''))
       OR (familia = 'CFDI' AND version_complemento IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Hay identificadores de versión incompatibles con su familia';
  END IF;
END
$version_checks$;
ALTER TABLE tms.cp_sat_versiones
  ALTER COLUMN version_complemento DROP NOT NULL,
  ADD CONSTRAINT cp_sat_versiones_familia_check
    CHECK (familia IN ('CARTA_PORTE', 'CFDI')),
  ADD CONSTRAINT cp_sat_versiones_complemento_check
    CHECK ((familia = 'CARTA_PORTE' AND version_complemento IS NOT NULL)
        OR (familia = 'CFDI' AND version_complemento IS NULL)),
  ADD CONSTRAINT cp_sat_versiones_metadatos_check
    CHECK (jsonb_typeof(metadatos) = 'object'),
  ADD CONSTRAINT cp_sat_versiones_identificadores_check
    CHECK (btrim(version_cfdi) <> '' AND btrim(revision) <> ''
           AND (version_complemento IS NULL OR btrim(version_complemento) <> ''));
-- Se conserva la UNIQUE histórica (version_complemento,version_cfdi,revision).
-- Las dos siguientes cierran también diferencias de mayúsculas/espacios y el
-- caso CFDI, donde version_complemento es NULL.
CREATE UNIQUE INDEX cp_sat_versiones_cp_revision_uidx
  ON tms.cp_sat_versiones
  (lower(btrim(version_complemento)), lower(btrim(version_cfdi)), lower(btrim(revision)))
  WHERE familia = 'CARTA_PORTE';
CREATE UNIQUE INDEX cp_sat_versiones_cfdi_revision_uidx
  ON tms.cp_sat_versiones
  (lower(btrim(version_cfdi)), lower(btrim(revision)))
  WHERE familia = 'CFDI';
ALTER TABLE tms.cp_sat_versiones
  ADD CONSTRAINT cp_sat_versiones_familia_sha256_key UNIQUE (familia, sha256);
CREATE INDEX cp_sat_versiones_familia_vigencia_idx
  ON tms.cp_sat_versiones (familia, vigente_desde DESC, vigente_hasta);

-- La clave oficial puede repetirse en distintos estados, países, tasas u
-- otras variantes dentro del mismo Excel. Para claves simples se usa {}.
-- El contrato de construcción por catálogo está en docs/sat-catalogos-contexto.md.
-- jsonb normaliza el orden de atributos y evita contextos textuales equivalentes.
-- Los demás atributos originales se conservan en reglas (jsonb).
ALTER TABLE tms.cp_sat_claves
  ADD COLUMN clave_contexto jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(clave_contexto) = 'object');
ALTER TABLE tms.cp_sat_claves DROP CONSTRAINT cp_sat_claves_pkey;
ALTER TABLE tms.cp_sat_claves
  ADD CONSTRAINT cp_sat_claves_pkey
  PRIMARY KEY (version_id, catalogo, clave, clave_contexto);
CREATE INDEX cp_sat_claves_contexto_idx
  ON tms.cp_sat_claves (version_id, catalogo, clave_contexto, clave);
CREATE INDEX cp_sat_claves_catalogo_clave_idx
  ON tms.cp_sat_claves (lower(catalogo), clave, version_id);

-- Búsquedas ILIKE '%texto%' usadas por Carta Porte, Flota y mercancías.
-- pg_trgm se instala en extensions solo si falta; si ya está instalado en otro
-- esquema, se usa su operator class allí sin mover la extensión.
DO $trgm$
DECLARE trgm_schema text;
BEGIN
  SELECT n.nspname INTO trgm_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  IF trgm_schema IS NULL THEN RAISE EXCEPTION 'pg_trgm no está disponible'; END IF;
  EXECUTE format('CREATE INDEX cp_sat_claves_descripcion_trgm_idx ON tms.cp_sat_claves USING gin (descripcion %I.gin_trgm_ops)', trgm_schema);
  EXECUTE format('CREATE INDEX cp_sat_claves_clave_trgm_idx ON tms.cp_sat_claves USING gin (clave %I.gin_trgm_ops)', trgm_schema);
END
$trgm$;

-- CFDI 4.0 tiene un archivo de catálogo distinto al de Carta Porte 3.1.
-- La columna es opcional para los CFDI anteriores; no altera el timbrado.
ALTER TABLE tms.cfdi
  ADD COLUMN cfdi_catalogo_version_id uuid
    REFERENCES tms.cp_sat_versiones(id);
CREATE INDEX cfdi_catalogo_version_idx
  ON tms.cfdi (cfdi_catalogo_version_id)
  WHERE cfdi_catalogo_version_id IS NOT NULL;

-- SEPOMEX permanece separado de los catálogos fiscales SAT. Cada importación
-- conserva el archivo completo bajo una versión y su huella SHA-256.
CREATE TABLE tms.sepomex_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente_url text NOT NULL CHECK (btrim(fuente_url) <> ''),
  sha256 text NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  fecha_fuente date NOT NULL,
  publicado_at timestamptz,
  metadatos jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadatos) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Una fila por asentamiento tal como aparece en SEPOMEX. La clave compuesta
-- fue comprobada en el archivo de 19/10/2026. Si cambia en una versión futura,
-- la importación debe detenerse y revisarse; nunca sobrescribir filas.
CREATE TABLE tms.sepomex_asentamientos (
  version_id uuid NOT NULL REFERENCES tms.sepomex_versiones(id),
  codigo_postal text NOT NULL CHECK (codigo_postal ~ '^[0-9]{5}$'), -- d_codigo
  asentamiento text NOT NULL,                                  -- d_asenta
  tipo_asentamiento text,                                      -- d_tipo_asenta
  municipio text NOT NULL,                                     -- D_mnpio
  estado text NOT NULL,                                        -- d_estado
  ciudad text,                                                 -- d_ciudad
  codigo_postal_oficina text,                                  -- d_CP
  clave_estado text NOT NULL,                                  -- c_estado
  oficina text,                                                -- c_oficina
  clave_codigo_postal text,                                    -- c_CP
  clave_tipo_asentamiento text,                                -- c_tipo_asenta
  clave_municipio text NOT NULL,                               -- c_mnpio
  id_asentamiento_cpcons text NOT NULL,                         -- id_asenta_cpcons
  zona text,                                                   -- d_zona
  clave_ciudad text,                                           -- c_cve_ciudad
  PRIMARY KEY (version_id, clave_estado, clave_municipio, id_asentamiento_cpcons),
  CHECK (btrim(asentamiento) <> ''),
  CHECK (btrim(clave_estado) <> '' AND btrim(clave_municipio) <> ''
         AND btrim(id_asentamiento_cpcons) <> ''),
  CHECK (codigo_postal_oficina IS NULL OR codigo_postal_oficina ~ '^[0-9]{5}$')
);
CREATE INDEX sepomex_asentamientos_cp_idx
  ON tms.sepomex_asentamientos (version_id, codigo_postal, asentamiento);
CREATE INDEX sepomex_asentamientos_municipio_idx
  ON tms.sepomex_asentamientos (version_id, clave_estado, clave_municipio, codigo_postal);
DO $trgm$
DECLARE trgm_schema text;
BEGIN
  SELECT n.nspname INTO trgm_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';
  EXECUTE format('CREATE INDEX sepomex_asentamientos_colonia_trgm_idx ON tms.sepomex_asentamientos USING gin (asentamiento %I.gin_trgm_ops)', trgm_schema);
  EXECUTE format('CREATE INDEX sepomex_asentamientos_municipio_trgm_idx ON tms.sepomex_asentamientos USING gin (municipio %I.gin_trgm_ops)', trgm_schema);
END
$trgm$;

ALTER TABLE tms.sepomex_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms.sepomex_asentamientos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE tms.sepomex_versiones, tms.sepomex_asentamientos FROM PUBLIC;

COMMIT;
