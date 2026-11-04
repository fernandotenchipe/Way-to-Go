-- Diagnóstico previo de solo lectura: una fila, una columna JSON.
-- query_to_xml ejecuta exclusivamente los SELECT fijos indicados aquí.
-- Permite contar filas sin fallar si alguna tabla histórica todavía no existe.
WITH tablas_esperadas(nombre, relacion) AS (
  VALUES
    ('cp_sat_versiones', to_regclass('tms.cp_sat_versiones')),
    ('cp_sat_claves', to_regclass('tms.cp_sat_claves')),
    ('cfdi', to_regclass('tms.cfdi')),
    ('cartas_porte', to_regclass('tms.cartas_porte'))
),
tablas AS (
  SELECT t.nombre, t.relacion IS NOT NULL AS existe, conteo.filas
  FROM tablas_esperadas t
  LEFT JOIN LATERAL XMLTABLE(
    '/table/row'
    PASSING CASE WHEN t.relacion IS NOT NULL THEN
      query_to_xml(format('SELECT count(*) AS filas FROM %s', t.relacion::regclass),
                   false, false, '')
    END
    COLUMNS filas bigint PATH 'filas'
  ) conteo ON true
),
versiones AS (
  SELECT COALESCE(detalle.datos::jsonb,
    jsonb_build_object('sha256_duplicados', '[]'::jsonb,
                       'revisiones_duplicadas', '[]'::jsonb,
                       'identificadores_vacios', NULL)) AS datos
  FROM tablas_esperadas t
  LEFT JOIN LATERAL XMLTABLE(
    '/table/row'
    PASSING CASE WHEN t.relacion IS NOT NULL THEN query_to_xml($consulta$
      SELECT jsonb_build_object(
        'sha256_duplicados', (
          SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
          FROM (SELECT sha256, count(*) AS cantidad
                FROM tms.cp_sat_versiones GROUP BY sha256 HAVING count(*) > 1) x
        ),
        'revisiones_duplicadas', (
          SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
          FROM (SELECT lower(btrim(version_complemento)) AS complemento,
                       lower(btrim(version_cfdi)) AS cfdi,
                       lower(btrim(revision)) AS revision,
                       count(*) AS cantidad
                FROM tms.cp_sat_versiones GROUP BY 1, 2, 3
                HAVING count(*) > 1) x
        ),
        'identificadores_vacios', (
          SELECT count(*) FROM tms.cp_sat_versiones
          WHERE btrim(version_complemento) = '' OR btrim(version_cfdi) = ''
             OR btrim(revision) = ''
        )
      )::text AS datos
    $consulta$, false, false, '') END
    COLUMNS datos text PATH 'datos'
  ) detalle ON true
  WHERE t.nombre = 'cp_sat_versiones'
),
restricciones AS (
  SELECT c.conrelid AS tabla_oid, c.confrelid AS destino_oid,
         c.conrelid::regclass::text AS tabla, c.conname AS nombre,
         c.contype::text AS tipo, pg_get_constraintdef(c.oid) AS definicion,
         CASE WHEN c.contype = 'f' THEN c.confrelid::regclass::text END AS destino
  FROM pg_constraint c
  WHERE c.conrelid IN (SELECT relacion FROM tablas_esperadas)
     OR c.confrelid IN (
       SELECT relacion FROM tablas_esperadas
       WHERE nombre IN ('cp_sat_versiones', 'cp_sat_claves')
     )
),
indices AS (
  SELECT i.schemaname AS esquema, i.tablename AS tabla,
         i.indexname AS nombre, i.indexdef AS definicion
  FROM pg_indexes i
  WHERE i.schemaname = 'tms'
    AND i.tablename IN (SELECT nombre FROM tablas_esperadas)
),
dependencias AS (
  SELECT DISTINCT 'vista_registrada'::text AS tipo,
         n.nspname || '.' || v.relname AS objeto,
         d.refobjid::regclass::text AS tabla_referenciada,
         d.refobjid AS referencia_oid
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid
  JOIN pg_class v ON v.oid = r.ev_class
  JOIN pg_namespace n ON n.oid = v.relnamespace
  WHERE d.classid = 'pg_rewrite'::regclass
    AND d.refobjid IN (SELECT relacion FROM tablas_esperadas)
    AND r.ev_class <> d.refobjid
  UNION ALL
  SELECT DISTINCT 'funcion_registrada'::text,
         p.oid::regprocedure::text, d.refobjid::regclass::text,
         d.refobjid
  FROM pg_depend d JOIN pg_proc p ON p.oid = d.objid
  WHERE d.classid = 'pg_proc'::regclass
    AND d.refobjid IN (SELECT relacion FROM tablas_esperadas)
  UNION ALL
  SELECT 'trigger'::text, t.tgname::text,
         t.tgrelid::regclass::text, t.tgrelid
  FROM pg_trigger t
  WHERE t.tgrelid IN (SELECT relacion FROM tablas_esperadas)
    AND NOT t.tgisinternal
  UNION ALL
  SELECT 'vista_por_texto'::text,
         v.schemaname || '.' || v.viewname,
         'cp_sat_versiones o cp_sat_claves'::text,
         NULL::oid
  FROM pg_views v
  WHERE v.definition ILIKE '%cp_sat_claves%'
     OR v.definition ILIKE '%cp_sat_versiones%'
),
extension AS (
  SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_trgm')
           AS pg_trgm_disponible,
         EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')
           AS pg_trgm_instalado,
         (SELECT n.nspname FROM pg_extension e
          JOIN pg_namespace n ON n.oid = e.extnamespace
          WHERE e.extname = 'pg_trgm') AS pg_trgm_esquema,
         to_regnamespace('extensions') IS NOT NULL AS esquema_extensions_presente,
         (SELECT default_version FROM pg_available_extensions
          WHERE name = 'pg_trgm') AS version_disponible,
         (SELECT installed_version FROM pg_available_extensions
          WHERE name = 'pg_trgm') AS version_instalada
),
problemas AS (
  SELECT 'Falta tms.' || nombre AS detalle FROM tablas WHERE NOT existe
  UNION ALL
  SELECT 'Hay SHA-256 duplicados en cp_sat_versiones'
  FROM versiones WHERE jsonb_array_length(datos->'sha256_duplicados') > 0
  UNION ALL
  SELECT 'Hay revisiones lógicamente duplicadas en cp_sat_versiones'
  FROM versiones WHERE jsonb_array_length(datos->'revisiones_duplicadas') > 0
  UNION ALL
  SELECT 'Hay identificadores de versión vacíos'
  FROM versiones WHERE (datos->>'identificadores_vacios')::bigint > 0
  UNION ALL
  SELECT 'Hay FK adicionales hacia cp_sat_claves: ' || nombre
  FROM restricciones WHERE tipo = 'f'
    AND destino_oid = to_regclass('tms.cp_sat_claves')
  UNION ALL
  SELECT 'Hay vistas dependientes de cp_sat_claves: ' || objeto
  FROM dependencias
  WHERE tipo = 'vista_registrada'
    AND referencia_oid = to_regclass('tms.cp_sat_claves')
  UNION ALL
  SELECT 'pg_trgm no está disponible' FROM extension WHERE NOT pg_trgm_disponible
  UNION ALL
  SELECT 'Falta el esquema extensions para instalar pg_trgm'
  FROM extension WHERE NOT pg_trgm_instalado AND NOT esquema_extensions_presente
  UNION ALL
  SELECT 'Falta la PK histórica de cp_sat_claves'
  WHERE EXISTS (SELECT 1 FROM tablas WHERE nombre = 'cp_sat_claves' AND existe)
    AND NOT EXISTS (SELECT 1 FROM restricciones
                    WHERE tabla_oid = to_regclass('tms.cp_sat_claves') AND tipo = 'p'
                      AND definicion = 'PRIMARY KEY (version_id, catalogo, clave)')
  UNION ALL
  SELECT 'Falta la unicidad histórica de cp_sat_versiones'
  WHERE EXISTS (SELECT 1 FROM tablas WHERE nombre = 'cp_sat_versiones' AND existe)
    AND NOT EXISTS (SELECT 1 FROM restricciones
                    WHERE tabla_oid = to_regclass('tms.cp_sat_versiones') AND tipo = 'u'
                      AND definicion =
                        'UNIQUE (version_complemento, version_cfdi, revision)')
)
SELECT jsonb_build_object(
  'tablas', (SELECT jsonb_object_agg(nombre,
              jsonb_build_object('existe', existe, 'filas', filas)) FROM tablas),
  'versiones', (SELECT datos FROM versiones),
  'restricciones', (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY tabla, nombre),
                                    '[]'::jsonb) FROM restricciones r),
  'claves_foraneas', (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY tabla, nombre),
                                      '[]'::jsonb) FROM restricciones r WHERE tipo = 'f'),
  'indices', (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY tabla, nombre),
                              '[]'::jsonb) FROM indices i),
  'dependencias', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY tipo, objeto),
                                   '[]'::jsonb) FROM dependencias d),
  'extensiones', (SELECT to_jsonb(e) FROM extension e),
  'posibles_problemas', (SELECT COALESCE(jsonb_agg(detalle ORDER BY detalle),
                                         '[]'::jsonb) FROM problemas),
  'apto_para_revisar_migracion', NOT EXISTS (SELECT 1 FROM problemas)
) AS diagnostico_preflight;
