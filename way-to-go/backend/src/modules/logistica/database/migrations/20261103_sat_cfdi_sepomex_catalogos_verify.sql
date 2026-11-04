-- Solo lectura. Ejecutar manualmente DESPUÉS de aplicar la migración.
-- Comparar los cuatro conteos iniciales con los del preflight: deben coincidir.
SELECT 'cp_sat_versiones' AS tabla, count(*) AS filas FROM tms.cp_sat_versiones
UNION ALL SELECT 'cp_sat_claves', count(*) FROM tms.cp_sat_claves
UNION ALL SELECT 'cfdi', count(*) FROM tms.cfdi
UNION ALL SELECT 'cartas_porte', count(*) FROM tms.cartas_porte
UNION ALL SELECT 'sepomex_versiones', count(*) FROM tms.sepomex_versiones
UNION ALL SELECT 'sepomex_asentamientos', count(*) FROM tms.sepomex_asentamientos;

SELECT conrelid::regclass AS tabla, conname AS restriccion,
       pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN ('tms.cp_sat_versiones'::regclass,
                   'tms.cp_sat_claves'::regclass,
                   'tms.sepomex_versiones'::regclass,
                   'tms.sepomex_asentamientos'::regclass)
  AND contype IN ('p', 'u', 'f', 'c')
ORDER BY 1, 2;

SELECT n.nspname AS esquema, c.relname AS tabla,
       c.relrowsecurity AS rls_habilitado
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'tms'
  AND c.relname IN ('cp_sat_versiones', 'cp_sat_claves',
                    'sepomex_versiones', 'sepomex_asentamientos')
ORDER BY c.relname;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'tms'
  AND tablename IN ('cp_sat_versiones', 'cp_sat_claves',
                    'sepomex_versiones', 'sepomex_asentamientos', 'cfdi')
ORDER BY tablename, indexname;

SELECT count(*) AS claves_historicas_con_contexto_inesperado
FROM tms.cp_sat_claves WHERE clave_contexto <> '{}'::jsonb;

SELECT count(*) AS versiones_historicas_con_familia_inesperada
FROM tms.cp_sat_versiones WHERE familia <> 'CARTA_PORTE';

SELECT count(*) AS cartas_porte_con_version_huerfana
FROM tms.cartas_porte cp
LEFT JOIN tms.cp_sat_versiones v ON v.id = cp.sat_version_id
WHERE cp.sat_version_id IS NOT NULL AND v.id IS NULL;

-- Estos controles deben devolver TRUE. También confirman que la restricción
-- histórica de revisión no se eliminó y que la nueva FK de CFDI es opcional.
SELECT
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'tms.cp_sat_versiones'::regclass
            AND conname = 'cp_sat_versiones_version_complemento_version_cfdi_revision_key')
    AS revision_historica_preservada,
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'tms.cp_sat_versiones'::regclass
            AND conname = 'cp_sat_versiones_familia_sha256_key')
    AS hash_por_familia_unico,
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname = 'tms' AND indexname = 'cp_sat_versiones_cp_revision_uidx'
            AND indexdef ILIKE '%UNIQUE%') AS revision_cp_unica,
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname = 'tms' AND indexname = 'cp_sat_versiones_cfdi_revision_uidx'
            AND indexdef ILIKE '%UNIQUE%') AS revision_cfdi_unica,
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'tms.cp_sat_claves'::regclass AND contype = 'p'
            AND pg_get_constraintdef(oid) =
              'PRIMARY KEY (version_id, catalogo, clave, clave_contexto)')
    AS clave_compuesta_correcta,
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'tms.cartas_porte'::regclass
            AND confrelid = 'tms.cp_sat_versiones'::regclass AND contype = 'f')
    AS carta_porte_conserva_fk,
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'tms.cfdi'::regclass
            AND confrelid = 'tms.cp_sat_versiones'::regclass AND contype = 'f')
    AS cfdi_tiene_fk_catalogo,
  EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'tms.sepomex_asentamientos'::regclass
            AND confrelid = 'tms.sepomex_versiones'::regclass AND contype = 'f')
    AS sepomex_tiene_fk,
  NOT EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid IN ('tms.cp_sat_versiones'::regclass,
                                  'tms.cp_sat_claves'::regclass,
                                  'tms.sepomex_versiones'::regclass,
                                  'tms.sepomex_asentamientos'::regclass,
                                  'tms.cfdi'::regclass)
                AND NOT convalidated) AS restricciones_validadas,
  (SELECT bool_and(relrowsecurity) FROM pg_class
   WHERE oid IN ('tms.sepomex_versiones'::regclass,
                 'tms.sepomex_asentamientos'::regclass)) AS sepomex_rls_activa,
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')
    AS pg_trgm_instalado,
  (SELECT count(*) = 4 FROM pg_indexes WHERE schemaname = 'tms'
    AND indexname IN ('cp_sat_claves_descripcion_trgm_idx',
                      'cp_sat_claves_clave_trgm_idx',
                      'sepomex_asentamientos_colonia_trgm_idx',
                      'sepomex_asentamientos_municipio_trgm_idx'))
    AS cuatro_indices_trigrama_presentes;

-- Todos estos conteos deben ser cero. Son verificaciones de integridad,
-- incluidas las referencias opcionales y la exclusión de familias.
SELECT
  (SELECT count(*) FROM (
     SELECT familia, sha256 FROM tms.cp_sat_versiones
     GROUP BY 1, 2 HAVING count(*) > 1) x) AS hash_duplicado,
  (SELECT count(*) FROM (
     SELECT lower(btrim(version_complemento)), lower(btrim(version_cfdi)),
            lower(btrim(revision)) FROM tms.cp_sat_versiones
     WHERE familia = 'CARTA_PORTE' GROUP BY 1, 2, 3 HAVING count(*) > 1) x)
    AS revision_cp_duplicada,
  (SELECT count(*) FROM (
     SELECT lower(btrim(version_cfdi)), lower(btrim(revision))
     FROM tms.cp_sat_versiones WHERE familia = 'CFDI'
     GROUP BY 1, 2 HAVING count(*) > 1) x) AS revision_cfdi_duplicada,
  (SELECT count(*) FROM (
     SELECT version_id, catalogo, clave, clave_contexto
     FROM tms.cp_sat_claves GROUP BY 1, 2, 3, 4 HAVING count(*) > 1) x)
    AS claves_sat_duplicadas,
  (SELECT count(*) FROM (
     SELECT version_id, clave_estado, clave_municipio, id_asentamiento_cpcons
     FROM tms.sepomex_asentamientos GROUP BY 1, 2, 3, 4 HAVING count(*) > 1) x)
    AS asentamientos_duplicados,
  (SELECT count(*) FROM tms.cp_sat_claves c
     LEFT JOIN tms.cp_sat_versiones v ON v.id = c.version_id
     WHERE v.id IS NULL) AS claves_sin_version,
  (SELECT count(*) FROM tms.cfdi c
     LEFT JOIN tms.cp_sat_versiones v ON v.id = c.cfdi_catalogo_version_id
     WHERE c.cfdi_catalogo_version_id IS NOT NULL AND v.id IS NULL)
    AS cfdi_con_version_huerfana,
  (SELECT count(*) FROM tms.sepomex_asentamientos a
     LEFT JOIN tms.sepomex_versiones v ON v.id = a.version_id
     WHERE v.id IS NULL) AS asentamientos_sin_version,
  (SELECT count(*) FROM tms.cartas_porte cp
     JOIN tms.cp_sat_versiones v ON v.id = cp.sat_version_id
     WHERE v.familia <> 'CARTA_PORTE') AS cartas_con_familia_incorrecta,
  (SELECT count(*) FROM tms.cfdi c
     JOIN tms.cp_sat_versiones v ON v.id = c.cfdi_catalogo_version_id
     WHERE v.familia <> 'CFDI') AS cfdi_con_familia_incorrecta;

-- Compilación de las proyecciones y filtros de las consultas actuales.
-- LIMIT 0 comprueba columnas y SQL; no prueba una respuesta con datos reales.
SELECT DISTINCT ON (c.clave) c.clave, c.descripcion
FROM tms.cp_sat_claves c JOIN tms.cp_sat_versiones v ON v.id = c.version_id
WHERE lower(c.catalogo) IN ('c_subtiporem', 'subtiporem')
  AND v.vigente_desde <= current_date
  AND (v.vigente_hasta IS NULL OR v.vigente_hasta >= current_date)
  AND (c.vigente_desde IS NULL OR c.vigente_desde <= current_date)
  AND (c.vigente_hasta IS NULL OR c.vigente_hasta >= current_date)
  AND (c.clave ILIKE '%%' OR c.descripcion ILIKE '%%')
ORDER BY c.clave, v.vigente_desde DESC LIMIT 0;

SELECT catalogo, clave, descripcion, reglas
FROM tms.cp_sat_claves
WHERE version_id = '00000000-0000-0000-0000-000000000000'::uuid
  AND catalogo = 'c_SubTipoRem'
  AND (vigente_desde IS NULL OR vigente_desde <= current_date)
  AND (vigente_hasta IS NULL OR vigente_hasta >= current_date)
  AND (descripcion ILIKE '%%' OR clave ILIKE '%%')
ORDER BY clave LIMIT 0;

-- Antes de importar, ambos conteos SEPOMEX y los dos conteos "inesperados"
-- deben ser cero. Comparar conteos históricos con el preflight.
