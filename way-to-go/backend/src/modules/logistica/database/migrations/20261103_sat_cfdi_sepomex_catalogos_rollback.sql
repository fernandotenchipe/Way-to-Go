-- Reversión segura de SOLO esta migración, antes de importar catálogos.
-- NO ejecutada. Abortará completa si hay datos o dependencias nuevas.
-- Conserva pg_trgm: una extensión puede ser compartida por otros módulos.
-- DROP usa RESTRICT (sin CASCADE) y toda la reversión es transaccional.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM tms.sepomex_versiones)
     OR EXISTS (SELECT 1 FROM tms.sepomex_asentamientos)
     OR EXISTS (SELECT 1 FROM tms.cp_sat_claves WHERE clave_contexto <> '{}'::jsonb)
     OR EXISTS (SELECT 1 FROM tms.cp_sat_versiones
                WHERE familia <> 'CARTA_PORTE'
                   OR metadatos <> '{}'::jsonb
                   OR version_complemento IS NULL)
     OR EXISTS (SELECT 1 FROM tms.cfdi
                WHERE cfdi_catalogo_version_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Reversión detenida: hay datos que dependen del esquema nuevo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM tms.cp_sat_versiones
    GROUP BY version_complemento, version_cfdi, revision HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Reversión detenida: no se puede restaurar la unicidad histórica';
  END IF;
  -- Referencias adicionales no contempladas por esta migración.
  IF EXISTS (
    SELECT 1 FROM pg_constraint fk
    WHERE fk.contype = 'f'
      AND fk.confrelid IN ('tms.sepomex_versiones'::regclass,
                           'tms.sepomex_asentamientos'::regclass,
                           'tms.cp_sat_claves'::regclass)
      AND NOT (fk.conrelid = 'tms.sepomex_asentamientos'::regclass
               AND fk.confrelid = 'tms.sepomex_versiones'::regclass)
  ) THEN
    RAISE EXCEPTION 'Reversión detenida: hay claves foráneas adicionales';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    LEFT JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE d.classid = 'pg_rewrite'::regclass
      AND d.refobjid IN ('tms.sepomex_versiones'::regclass,
                         'tms.sepomex_asentamientos'::regclass,
                         'tms.cp_sat_versiones'::regclass,
                         'tms.cp_sat_claves'::regclass,
                         'tms.cfdi'::regclass)
      AND (d.refobjid IN ('tms.sepomex_versiones'::regclass,
                          'tms.sepomex_asentamientos'::regclass)
           OR (d.refobjid = 'tms.cp_sat_versiones'::regclass
               AND a.attname IN ('familia','metadatos'))
           OR (d.refobjid = 'tms.cp_sat_claves'::regclass
               AND a.attname = 'clave_contexto')
           OR (d.refobjid = 'tms.cfdi'::regclass
               AND a.attname = 'cfdi_catalogo_version_id'))
      AND r.ev_class <> d.refobjid
  ) THEN
    RAISE EXCEPTION 'Reversión detenida: hay vistas dependientes de las tablas afectadas';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid IN ('tms.sepomex_versiones'::regclass,
                      'tms.sepomex_asentamientos'::regclass)
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Reversión detenida: hay triggers adicionales en SEPOMEX';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_depend d
    LEFT JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE d.classid = 'pg_proc'::regclass
      AND d.refobjid IN ('tms.sepomex_versiones'::regclass,
                         'tms.sepomex_asentamientos'::regclass,
                         'tms.cp_sat_versiones'::regclass,
                         'tms.cp_sat_claves'::regclass,
                         'tms.cfdi'::regclass)
      AND (d.refobjid IN ('tms.sepomex_versiones'::regclass,
                          'tms.sepomex_asentamientos'::regclass)
           OR a.attname IN ('familia','metadatos','clave_contexto',
                            'cfdi_catalogo_version_id'))
  ) THEN
    RAISE EXCEPTION 'Reversión detenida: hay funciones con dependencia registrada';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_depend d
    JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    JOIN pg_class i ON i.oid = d.objid AND i.relkind IN ('i', 'I')
    WHERE d.classid = 'pg_class'::regclass
      AND a.attname IN ('familia', 'metadatos', 'clave_contexto',
                        'cfdi_catalogo_version_id')
      AND d.refobjid IN ('tms.cp_sat_versiones'::regclass,
                         'tms.cp_sat_claves'::regclass,
                         'tms.cfdi'::regclass)
      AND i.relname NOT IN (
        'cp_sat_versiones_familia_sha256_key',
        'cp_sat_versiones_cp_revision_uidx',
        'cp_sat_versiones_cfdi_revision_uidx',
        'cp_sat_versiones_familia_vigencia_idx',
        'cp_sat_claves_pkey', 'cp_sat_claves_contexto_idx',
        'cfdi_catalogo_version_idx'
      )
  ) THEN
    RAISE EXCEPTION 'Reversión detenida: hay índices adicionales sobre columnas nuevas';
  END IF;
  -- Las restricciones no listadas que dependan de columnas nuevas harán
  -- fallar DROP COLUMN RESTRICT; PostgreSQL revierte entonces toda la transacción.
END
$guard$;

DROP TABLE tms.sepomex_asentamientos;
DROP TABLE tms.sepomex_versiones;

DROP INDEX tms.cfdi_catalogo_version_idx;
ALTER TABLE tms.cfdi DROP COLUMN cfdi_catalogo_version_id;

DROP INDEX tms.cp_sat_claves_clave_trgm_idx;
DROP INDEX tms.cp_sat_claves_descripcion_trgm_idx;
DROP INDEX tms.cp_sat_claves_catalogo_clave_idx;
DROP INDEX tms.cp_sat_claves_contexto_idx;
ALTER TABLE tms.cp_sat_claves DROP CONSTRAINT cp_sat_claves_pkey;
ALTER TABLE tms.cp_sat_claves
  ADD CONSTRAINT cp_sat_claves_pkey PRIMARY KEY (version_id, catalogo, clave);
ALTER TABLE tms.cp_sat_claves DROP COLUMN clave_contexto;

DROP INDEX tms.cp_sat_versiones_familia_vigencia_idx;
DROP INDEX tms.cp_sat_versiones_cp_revision_uidx;
DROP INDEX tms.cp_sat_versiones_cfdi_revision_uidx;
ALTER TABLE tms.cp_sat_versiones
  DROP CONSTRAINT cp_sat_versiones_familia_sha256_key,
  DROP CONSTRAINT cp_sat_versiones_identificadores_check,
  DROP CONSTRAINT cp_sat_versiones_metadatos_check,
  DROP CONSTRAINT cp_sat_versiones_complemento_check,
  DROP CONSTRAINT cp_sat_versiones_familia_check;
ALTER TABLE tms.cp_sat_versiones
  ALTER COLUMN version_complemento SET NOT NULL,
  DROP COLUMN metadatos,
  DROP COLUMN familia;

COMMIT;
