-- WAY TO GO / TMS: propuesta incremental de Carta Porte y CFDI, 2026-10-21.
-- ARCHIVO GENERADO; NO EJECUTADO. PostgreSQL 15+. Aplicar manualmente UNA vez.
-- Antes: respaldo, ensayo en base aislada, cotejo del esquema instalado y revisión fiscal.
-- Requiere schema.sql y migraciones previas de Clientes. No modifica schema.sql.
-- No instala PAC, credenciales, políticas RLS, roles, certificados ni catálogos SAT.
-- Los campos fiscales se validan con XSD, catálogos y reglas SAT vigentes en el servicio.
-- Los CHECK de aquí protegen estructura y consistencia; no certifican cumplimiento fiscal.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = tms, public, extensions;

DO $preflight$
BEGIN
  IF to_regclass('tms.viajes') IS NULL
     OR to_regclass('tms.clientes') IS NULL
     OR to_regclass('tms.clientes_rfc_ci') IS NULL
     OR to_regprocedure('tms.marcar_actualizacion()') IS NULL
     OR to_regprocedure('tms.impedir_edicion_historial()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema='tms' AND table_name='clientes' AND column_name='regimen_fiscal') THEN
    RAISE EXCEPTION 'Revisar esquema TMS y migraciones previas de Clientes antes de aplicar Carta Porte';
  END IF;
  IF to_regclass('tms.cartas_porte') IS NOT NULL THEN
    RAISE EXCEPTION 'Carta Porte ya existe: no repetir esta migración ni mezclar versiones';
  END IF;
END
$preflight$;

-- 1. Ampliaciones aditivas. No se convierten textos actuales en claves SAT automáticamente.
ALTER TABLE tms.clientes
  ADD COLUMN residencia_fiscal_sat text,
  ADD COLUMN numero_registro_tributario text;

-- XEXX/XAXX pueden representar varias personas: no identifican una entidad por sí solos.
-- Conserva el nombre del índice reconocido por el manejador de errores existente.
DROP INDEX tms.clientes_rfc_ci;
CREATE UNIQUE INDEX clientes_rfc_ci ON tms.clientes(upper(btrim(rfc)))
  WHERE rfc IS NOT NULL AND btrim(rfc) <> ''
    AND upper(btrim(rfc)) NOT IN ('XEXX010101000','XAXX010101000');
CREATE UNIQUE INDEX clientes_identidad_extranjera ON tms.clientes
  (upper(btrim(residencia_fiscal_sat)), upper(btrim(numero_registro_tributario)))
  WHERE nullif(btrim(residencia_fiscal_sat),'') IS NOT NULL
    AND nullif(btrim(numero_registro_tributario),'') IS NOT NULL;

ALTER TABLE tms.cliente_direcciones
  ADD COLUMN numero_exterior text, ADD COLUMN numero_interior text,
  ADD COLUMN colonia text, ADD COLUMN localidad text, ADD COLUMN municipio text,
  ADD COLUMN referencia text, ADD COLUMN pais_sat text,
  ADD COLUMN estado_sat text, ADD COLUMN municipio_sat text,
  ADD COLUMN localidad_sat text, ADD COLUMN colonia_sat text;
ALTER TABLE tms.unidades
  ADD COLUMN configuracion_vehicular_sat text,
  ADD COLUMN permiso_sict_sat text, ADD COLUMN numero_permiso_sict text,
  ADD COLUMN peso_vacio_kg numeric(16,3) CHECK(peso_vacio_kg >= 0),
  ADD COLUMN peso_bruto_permitido_t numeric(12,3) CHECK(peso_bruto_permitido_t > 0),
  ADD COLUMN vin text, ADD COLUMN largo_m numeric(8,3) CHECK(largo_m > 0),
  ADD COLUMN ancho_m numeric(8,3) CHECK(ancho_m > 0),
  ADD COLUMN alto_m numeric(8,3) CHECK(alto_m > 0);
ALTER TABLE tms.cajas
  ADD COLUMN subtipo_remolque_sat text,
  ADD COLUMN peso_vacio_kg numeric(16,3) CHECK(peso_vacio_kg >= 0),
  ADD COLUMN ancho_m numeric(8,3) CHECK(ancho_m > 0),
  ADD COLUMN alto_m numeric(8,3) CHECK(alto_m > 0);
ALTER TABLE tms.operadores
  ADD COLUMN rfc text, ADD COLUMN numero_licencia text,
  ADD COLUMN licencia_vence_el date,
  ADD COLUMN residencia_fiscal_sat text, ADD COLUMN numero_registro_tributario text,
  ADD COLUMN domicilio_fiscal jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK(jsonb_typeof(domicilio_fiscal)='object');
ALTER TABLE tms.tipos_servicio
  ADD COLUMN clave_producto_servicio_sat text,
  ADD COLUMN clave_unidad_sat text, ADD COLUMN objeto_impuesto_sat text;

-- 2. Referencias SAT versionadas. Importación posterior, controlada y sin datos ficticios.
CREATE TABLE tms.cp_sat_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_complemento text NOT NULL, version_cfdi text NOT NULL,
  revision text NOT NULL, fuente_url text NOT NULL,
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  vigente_desde date NOT NULL, vigente_hasta date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  UNIQUE(version_complemento, version_cfdi, revision)
);
CREATE TABLE tms.cp_sat_claves (
  version_id uuid NOT NULL REFERENCES tms.cp_sat_versiones(id),
  catalogo text NOT NULL, clave text NOT NULL, descripcion text NOT NULL,
  vigente_desde date, vigente_hasta date, reglas jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY(version_id, catalogo, clave),
  CHECK(jsonb_typeof(reglas)='object'),
  CHECK(vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde)
);

-- 3. Catálogos propios. Las fichas pueden estar incompletas durante su preparación.
CREATE TABLE tms.empresas_emisoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL CHECK(btrim(nombre)<>''), rfc text, razon_social text,
  regimen_fiscal_sat text, lugar_expedicion_cp text,
  domicilio jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(domicilio)='object'),
  csd_secret_ref text, -- Referencia a gestor de secretos; nunca llave privada o contraseña.
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX empresas_emisoras_rfc ON tms.empresas_emisoras(upper(btrim(rfc)))
  WHERE nullif(btrim(rfc),'') IS NOT NULL;

CREATE TABLE tms.mercancias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES tms.clientes(id), -- NULL = reutilizable sin cliente exclusivo.
  codigo_interno text UNIQUE,
  descripcion text NOT NULL CHECK(btrim(descripcion)<>''),
  bienes_transp_sat text, clave_unidad_sat text, unidad text,
  material_peligroso boolean, clave_material_peligroso_sat text,
  embalaje_sat text, descripcion_embalaje text,
  largo numeric(12,3) CHECK(largo > 0), ancho numeric(12,3) CHECK(ancho > 0),
  alto numeric(12,3) CHECK(alto > 0), unidad_dimensiones text CHECK(unidad_dimensiones IN ('cm','plg')),
  peso_referencia_kg numeric(16,3) CHECK(peso_referencia_kg >= 0),
  fraccion_arancelaria text, tipo_materia_sat text, descripcion_materia text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.cp_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid UNIQUE REFERENCES tms.clientes(id),
  proveedor_id uuid UNIQUE REFERENCES tms.proveedores(id),
  nombre text NOT NULL CHECK(btrim(nombre)<>''), rfc text,
  residencia_fiscal_sat text, numero_registro_tributario text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(num_nonnulls(cliente_id, proveedor_id) <= 1)
);
-- Un participante no es permanentemente origen/destino: su rol se decide por documento.
CREATE TABLE tms.cp_direcciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participante_id uuid NOT NULL REFERENCES tms.cp_participantes(id),
  cliente_direccion_id uuid UNIQUE REFERENCES tms.cliente_direcciones(id),
  nombre text NOT NULL CHECK(btrim(nombre)<>''),
  calle text, numero_exterior text, numero_interior text,
  colonia text, localidad text, municipio text, estado text, pais text, codigo_postal text,
  pais_sat text, estado_sat text, municipio_sat text, localidad_sat text, colonia_sat text,
  referencia text, zona_horaria text NOT NULL DEFAULT 'America/Mexico_City',
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, participante_id)
);

CREATE TABLE tms.unidad_seguros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), unidad_id uuid NOT NULL REFERENCES tms.unidades(id),
  tipo text NOT NULL CHECK(tipo IN ('RESPONSABILIDAD_CIVIL','AMBIENTAL','CARGA')),
  aseguradora text NOT NULL CHECK(btrim(aseguradora)<>''), poliza text NOT NULL CHECK(btrim(poliza)<>''),
  vigente_desde date, vigente_hasta date, archivo_id uuid REFERENCES tms.archivos(id),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(vigente_hasta IS NULL OR vigente_desde IS NULL OR vigente_hasta >= vigente_desde),
  UNIQUE(id, unidad_id)
);

-- 4. CFDI. Un documento puede ser propio o un comprobante recibido de un proveedor.
-- UUID ajeno NO se timbra con el CSD de WTG; origen externo se captura/importa aparte.
CREATE TABLE tms.cfdi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), viaje_id uuid NOT NULL REFERENCES tms.viajes(id),
  origen text NOT NULL DEFAULT 'PROPIO' CHECK(origen IN ('PROPIO','EXTERNO')),
  empresa_emisora_id uuid REFERENCES tms.empresas_emisoras(id),
  cliente_id uuid REFERENCES tms.clientes(id), proveedor_id uuid REFERENCES tms.proveedores(id),
  version_cfdi text NOT NULL DEFAULT '4.0', tipo_comprobante text NOT NULL CHECK(tipo_comprobante IN ('I','T')),
  serie text, folio text, fecha_expedicion timestamptz, lugar_expedicion_cp text,
  emisor_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(emisor_snapshot)='object'),
  receptor_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(receptor_snapshot)='object'),
  uso_cfdi_sat text, forma_pago_sat text, metodo_pago_sat text, exportacion_sat text,
  moneda text, tipo_cambio numeric(20,6) CHECK(tipo_cambio > 0),
  subtotal numeric(20,6) CHECK(subtotal >= 0), descuento numeric(20,6) CHECK(descuento >= 0),
  impuestos_trasladados numeric(20,6) CHECK(impuestos_trasladados >= 0),
  impuestos_retenidos numeric(20,6) CHECK(impuestos_retenidos >= 0),
  total numeric(20,6) CHECK(total >= 0),
  estado text NOT NULL DEFAULT 'BORRADOR' CHECK(estado IN
    ('BORRADOR','VALIDADO','TIMBRANDO','POR_CONCILIAR','RECHAZADO','TIMBRADO','CANCELACION_PENDIENTE','CANCELADO')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
  uuid_fiscal uuid UNIQUE, timbrado_at timestamptz, congelado_at timestamptz,
  solicitud_snapshot jsonb CHECK(solicitud_snapshot IS NULL OR jsonb_typeof(solicitud_snapshot)='object'),
  solicitud_sha256 text CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
  xml_archivo_id uuid REFERENCES tms.archivos(id), pdf_archivo_id uuid REFERENCES tms.archivos(id),
  acuse_cancelacion_archivo_id uuid REFERENCES tms.archivos(id),
  numero_certificado_emisor text, numero_certificado_sat text, rfc_pac text,
  sello_cfdi text, sello_sat text, cadena_original_tfd text,
  motivo_cancelacion_sat text, cancelado_at timestamptz, observaciones text,
  creado_por uuid NOT NULL REFERENCES tms.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, viaje_id),
  CHECK(origen <> 'PROPIO' OR empresa_emisora_id IS NOT NULL),
  CHECK(estado NOT IN ('TIMBRADO','CANCELACION_PENDIENTE','CANCELADO') OR
    (uuid_fiscal IS NOT NULL AND timbrado_at IS NOT NULL AND congelado_at IS NOT NULL AND xml_archivo_id IS NOT NULL)),
  CHECK(estado <> 'CANCELADO' OR (cancelado_at IS NOT NULL AND motivo_cancelacion_sat IS NOT NULL))
);
CREATE UNIQUE INDEX cfdi_serie_folio_propio ON tms.cfdi(empresa_emisora_id, serie, folio)
  WHERE origen='PROPIO' AND serie IS NOT NULL AND folio IS NOT NULL;
CREATE INDEX cfdi_viaje ON tms.cfdi(viaje_id);

CREATE TABLE tms.cfdi_conceptos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cfdi_id uuid NOT NULL REFERENCES tms.cfdi(id),
  posicion integer NOT NULL CHECK(posicion > 0), tipo_servicio_id uuid REFERENCES tms.tipos_servicio(id),
  descripcion text NOT NULL CHECK(btrim(descripcion)<>''), identificador text,
  clave_producto_servicio_sat text, clave_unidad_sat text, unidad text, objeto_impuesto_sat text,
  cantidad numeric(20,6) CHECK(cantidad > 0), valor_unitario numeric(20,6) CHECK(valor_unitario >= 0),
  importe numeric(20,6) CHECK(importe >= 0), descuento numeric(20,6) CHECK(descuento >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, cfdi_id), UNIQUE(cfdi_id, posicion)
);
CREATE TABLE tms.cfdi_impuestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cfdi_id uuid NOT NULL REFERENCES tms.cfdi(id),
  concepto_id uuid NOT NULL,
  movimiento text NOT NULL CHECK(movimiento IN ('TRASLADO','RETENCION')),
  impuesto_sat text NOT NULL, tipo_factor_sat text NOT NULL,
  base numeric(20,6) NOT NULL CHECK(base >= 0), tasa_cuota numeric(20,6) CHECK(tasa_cuota >= 0),
  importe numeric(20,6) CHECK(importe >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(concepto_id, cfdi_id) REFERENCES tms.cfdi_conceptos(id, cfdi_id),
  CHECK(tipo_factor_sat <> 'Exento' OR (tasa_cuota IS NULL AND importe IS NULL))
);
CREATE INDEX cfdi_impuestos_documento ON tms.cfdi_impuestos(cfdi_id, concepto_id);
CREATE TABLE tms.cfdi_relaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cfdi_id uuid NOT NULL REFERENCES tms.cfdi(id),
  tipo_relacion_sat text NOT NULL, uuid_relacionado uuid NOT NULL,
  cfdi_relacionado_id uuid REFERENCES tms.cfdi(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cfdi_id, tipo_relacion_sat, uuid_relacionado),
  CHECK(cfdi_relacionado_id IS NULL OR cfdi_relacionado_id <> cfdi_id)
);

-- 5. Carta Porte del viaje. Estado y revisión pertenecen al CFDI, sin duplicarlos.
CREATE TABLE tms.cartas_porte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cfdi_id uuid NOT NULL UNIQUE,
  viaje_id uuid NOT NULL REFERENCES tms.viajes(id),
  sat_version_id uuid REFERENCES tms.cp_sat_versiones(id),
  version_complemento text NOT NULL DEFAULT '3.1',
  id_ccp uuid NOT NULL UNIQUE DEFAULT
    (('ccc' || substr(gen_random_uuid()::text,4))::uuid),
  transporte_internacional boolean, entrada_salida text CHECK(entrada_salida IN ('Entrada','Salida')),
  pais_origen_destino_sat text, via_entrada_salida_sat text,
  distancia_total_km numeric(16,2) CHECK(distancia_total_km >= 0),
  peso_bruto_total numeric(20,3) CHECK(peso_bruto_total >= 0),
  peso_neto_total numeric(20,3) CHECK(peso_neto_total >= 0), unidad_peso_sat text,
  numero_total_mercancias integer CHECK(numero_total_mercancias > 0),
  cargo_tasacion numeric(20,6) CHECK(cargo_tasacion >= 0),
  logistica_inversa boolean, registro_istmo boolean,
  polo_origen_sat text, polo_destino_sat text,
  referencia_cliente text, orden_compra text, descripcion_carga text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(cfdi_id, viaje_id) REFERENCES tms.cfdi(id, viaje_id),
  CHECK(id_ccp::text ~ '^ccc'),
  CHECK(transporte_internacional IS DISTINCT FROM false OR
    (entrada_salida IS NULL AND pais_origen_destino_sat IS NULL AND via_entrada_salida_sat IS NULL))
);
CREATE INDEX cartas_porte_viaje ON tms.cartas_porte(viaje_id);

CREATE TABLE tms.cp_ubicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id),
  posicion integer NOT NULL CHECK(posicion > 0), tipo text NOT NULL CHECK(tipo IN ('Origen','Destino')),
  identificador_sat text NOT NULL CHECK(identificador_sat ~ '^(OR|DE)[0-9]{6}$'),
  participante_id uuid REFERENCES tms.cp_participantes(id), direccion_id uuid,
  participante_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(participante_snapshot)='object'),
  domicilio_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(domicilio_snapshot)='object'),
  fecha_hora timestamptz, zona_horaria text,
  distancia_recorrida_km numeric(16,2) CHECK(distancia_recorrida_km >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, carta_porte_id), UNIQUE(carta_porte_id, posicion), UNIQUE(carta_porte_id, identificador_sat),
  FOREIGN KEY(direccion_id, participante_id) REFERENCES tms.cp_direcciones(id, participante_id),
  CHECK(direccion_id IS NULL OR participante_id IS NOT NULL),
  CHECK((tipo='Origen' AND identificador_sat LIKE 'OR%') OR (tipo='Destino' AND identificador_sat LIKE 'DE%'))
);

CREATE TABLE tms.cp_mercancias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id),
  posicion integer NOT NULL CHECK(posicion > 0), mercancia_id uuid REFERENCES tms.mercancias(id),
  descripcion text NOT NULL CHECK(btrim(descripcion)<>''), bienes_transp_sat text,
  cantidad numeric(20,6) CHECK(cantidad > 0), clave_unidad_sat text, unidad text,
  dimensiones text, material_peligroso boolean, clave_material_peligroso_sat text,
  embalaje_sat text, descripcion_embalaje text,
  peso_kg numeric(20,3) CHECK(peso_kg > 0),
  valor_mercancia numeric(20,6) CHECK(valor_mercancia >= 0), moneda_sat text,
  fraccion_arancelaria text, uuid_comercio_exterior uuid,
  tipo_materia_sat text, descripcion_materia text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, carta_porte_id), UNIQUE(carta_porte_id, posicion)
);
-- Datos sanitarios aplicables al lote real, nunca se copian caducidad/lote de otro viaje.
CREATE TABLE tms.cp_mercancias_sanitarias (
  mercancia_id uuid PRIMARY KEY, carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id),
  sector_cofepris_sat text, ingrediente_activo text, nombre_quimico text,
  denominacion_generica text, denominacion_distintiva text, fabricante text,
  fecha_caducidad date, lote text, forma_farmaceutica_sat text,
  condiciones_transporte_sat text, registro_sanitario_autorizacion text,
  permiso_importacion text, folio_importacion_vucem text, numero_cas text,
  razon_social_importador text, registro_plaguicida text,
  datos_fabricante text, datos_formulador text, datos_maquilador text, uso_autorizado text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(mercancia_id, carta_porte_id) REFERENCES tms.cp_mercancias(id, carta_porte_id)
);

CREATE TABLE tms.cp_autotransporte (
  carta_porte_id uuid PRIMARY KEY REFERENCES tms.cartas_porte(id),
  unidad_id uuid REFERENCES tms.unidades(id),
  permiso_sict_sat text, numero_permiso_sict text, configuracion_vehicular_sat text,
  placas text, anio_modelo smallint CHECK(anio_modelo BETWEEN 1900 AND 2200),
  peso_bruto_vehicular_t numeric(16,3) CHECK(peso_bruto_vehicular_t > 0),
  seguro_rc_id uuid, aseguradora_rc text, poliza_rc text,
  seguro_ambiental_id uuid, aseguradora_ambiental text, poliza_ambiental text,
  seguro_carga_id uuid, aseguradora_carga text, poliza_carga text,
  prima_seguro numeric(20,6) CHECK(prima_seguro >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(seguro_rc_id, unidad_id) REFERENCES tms.unidad_seguros(id, unidad_id),
  FOREIGN KEY(seguro_ambiental_id, unidad_id) REFERENCES tms.unidad_seguros(id, unidad_id),
  FOREIGN KEY(seguro_carga_id, unidad_id) REFERENCES tms.unidad_seguros(id, unidad_id),
  CHECK(num_nonnulls(seguro_rc_id, seguro_ambiental_id, seguro_carga_id)=0 OR unidad_id IS NOT NULL)
);
CREATE TABLE tms.cp_remolques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id),
  posicion smallint NOT NULL CHECK(posicion BETWEEN 1 AND 2), caja_id uuid REFERENCES tms.cajas(id),
  subtipo_remolque_sat text, placas text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(carta_porte_id, posicion), UNIQUE(carta_porte_id, caja_id)
);
CREATE TABLE tms.cp_figuras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id),
  operador_id uuid REFERENCES tms.operadores(id), participante_id uuid REFERENCES tms.cp_participantes(id),
  tipo_figura_sat text NOT NULL, nombre text, rfc text, numero_licencia text,
  residencia_fiscal_sat text, numero_registro_tributario text,
  domicilio_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(domicilio_snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, carta_porte_id), CHECK(num_nonnulls(operador_id, participante_id)<=1)
);
CREATE TABLE tms.cp_figura_partes (
  carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id), figura_id uuid NOT NULL,
  parte_transporte_sat text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(figura_id, parte_transporte_sat),
  FOREIGN KEY(figura_id, carta_porte_id) REFERENCES tms.cp_figuras(id, carta_porte_id)
);

-- Múltiples regímenes, documentos y relaciones muchos-a-muchos por partida.
CREATE TABLE tms.cp_regimenes_aduaneros (
  carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id), regimen_aduanero_sat text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(carta_porte_id, regimen_aduanero_sat)
);
CREATE TABLE tms.cp_documentos_aduaneros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id),
  tipo_documento_sat text NOT NULL, numero_pedimento text, identificador_documento text,
  rfc_importador text, aduana_referencia text, fecha_referencia date,
  archivo_id uuid REFERENCES tms.archivos(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, carta_porte_id)
);
CREATE TABLE tms.cp_mercancia_documentos (
  carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id), mercancia_id uuid NOT NULL, documento_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(mercancia_id, documento_id),
  FOREIGN KEY(mercancia_id, carta_porte_id) REFERENCES tms.cp_mercancias(id, carta_porte_id),
  FOREIGN KEY(documento_id, carta_porte_id) REFERENCES tms.cp_documentos_aduaneros(id, carta_porte_id)
);
CREATE TABLE tms.cp_cantidades_transportadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id),
  mercancia_id uuid NOT NULL, origen_id uuid NOT NULL, destino_id uuid NOT NULL,
  cantidad numeric(20,6) NOT NULL CHECK(cantidad > 0), claves_transporte_sat text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(mercancia_id, carta_porte_id) REFERENCES tms.cp_mercancias(id, carta_porte_id),
  FOREIGN KEY(origen_id, carta_porte_id) REFERENCES tms.cp_ubicaciones(id, carta_porte_id),
  FOREIGN KEY(destino_id, carta_porte_id) REFERENCES tms.cp_ubicaciones(id, carta_porte_id),
  UNIQUE(mercancia_id, origen_id, destino_id), CHECK(origen_id <> destino_id)
);
CREATE TABLE tms.cp_guias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carta_porte_id uuid NOT NULL REFERENCES tms.cartas_porte(id),
  mercancia_id uuid NOT NULL, numero text NOT NULL, descripcion text NOT NULL,
  peso_kg numeric(20,3) NOT NULL CHECK(peso_kg > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(mercancia_id, carta_porte_id) REFERENCES tms.cp_mercancias(id, carta_porte_id),
  UNIQUE(mercancia_id, numero)
);

-- 6. Operaciones externas. Un timeout se concilia antes de volver a enviar.
CREATE TABLE tms.cp_timbrado_intentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cfdi_id uuid NOT NULL REFERENCES tms.cfdi(id),
  operacion text NOT NULL CHECK(operacion IN ('TIMBRAR','CANCELAR','CONSULTAR')),
  idempotency_key uuid NOT NULL UNIQUE, proveedor text NOT NULL,
  ambiente text NOT NULL CHECK(ambiente IN ('PRUEBAS','PRODUCCION')),
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN
    ('PENDIENTE','ENVIADO','POR_CONCILIAR','ACEPTADO','RECHAZADO')),
  revision_solicitada bigint NOT NULL CHECK(revision_solicitada>0),
  solicitud_snapshot jsonb NOT NULL CHECK(jsonb_typeof(solicitud_snapshot)='object'),
  solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
  referencia_proveedor text, uuid_respuesta uuid,
  codigo_respuesta text, mensaje_respuesta text,
  respuesta_redactada jsonb, solicitado_por uuid NOT NULL REFERENCES tms.usuarios(id),
  iniciado_at timestamptz, terminado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cp_operacion_externa_abierta ON tms.cp_timbrado_intentos(cfdi_id)
  WHERE operacion IN ('TIMBRAR','CANCELAR') AND estado IN ('PENDIENTE','ENVIADO','POR_CONCILIAR');
CREATE INDEX cp_intentos_documento ON tms.cp_timbrado_intentos(cfdi_id, created_at);

CREATE TABLE tms.cp_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla text NOT NULL, entidad_id text NOT NULL, accion text NOT NULL,
  actor_id uuid REFERENCES tms.usuarios(id), cfdi_id uuid REFERENCES tms.cfdi(id),
  datos jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(datos)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cp_auditoria_entidad ON tms.cp_auditoria(tabla, entidad_id, created_at);
CREATE INDEX cp_auditoria_cfdi ON tms.cp_auditoria(cfdi_id, created_at);

-- Referencias a comprobantes existentes de Finanzas sin crear una segunda factura.
ALTER TABLE tms.viaje_referencias_finanzas ADD COLUMN cfdi_id uuid;
ALTER TABLE tms.viaje_referencias_finanzas ADD CONSTRAINT referencias_finanzas_cfdi_viaje
  FOREIGN KEY(cfdi_id, viaje_id) REFERENCES tms.cfdi(id, viaje_id);
CREATE INDEX referencias_finanzas_cfdi ON tms.viaje_referencias_finanzas(cfdi_id);

-- 7. Bloqueo del documento y sus hijos. Las transiciones fiscales se autorizan en el backend.
CREATE FUNCTION tms.cp_guardar_cfdi() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE campos_operativos text[] := ARRAY['estado','revision','updated_at','uuid_fiscal',
  'timbrado_at','congelado_at','xml_archivo_id','pdf_archivo_id','acuse_cancelacion_archivo_id',
  'numero_certificado_emisor','numero_certificado_sat','rfc_pac','sello_cfdi','sello_sat',
  'cadena_original_tfd','motivo_cancelacion_sat','cancelado_at'];
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.estado<>'BORRADOR' THEN RAISE EXCEPTION 'Crear CFDI como borrador antes de importarlo o emitirlo'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Conservar CFDI e historial; no eliminar documentos'; END IF;
  IF NEW.id<>OLD.id OR NEW.viaje_id<>OLD.viaje_id OR NEW.origen<>OLD.origen THEN
    RAISE EXCEPTION 'No reasignar identidad, viaje u origen del CFDI';
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (
    (OLD.estado='BORRADOR' AND NEW.estado='VALIDADO') OR
    (OLD.estado='BORRADOR' AND NEW.estado='TIMBRADO' AND OLD.origen='EXTERNO') OR
    (OLD.estado='RECHAZADO' AND NEW.estado='BORRADOR') OR
    (OLD.estado='VALIDADO' AND NEW.estado IN ('BORRADOR','TIMBRANDO')) OR
    (OLD.estado='TIMBRANDO' AND NEW.estado IN ('POR_CONCILIAR','TIMBRADO','RECHAZADO')) OR
    (OLD.estado='POR_CONCILIAR' AND NEW.estado IN ('TIMBRADO','RECHAZADO')) OR
    (OLD.estado='TIMBRADO' AND NEW.estado='CANCELACION_PENDIENTE') OR
    (OLD.estado='CANCELACION_PENDIENTE' AND NEW.estado IN ('TIMBRADO','CANCELADO'))
  ) THEN RAISE EXCEPTION 'Transición fiscal no permitida: % -> %', OLD.estado, NEW.estado; END IF;
  IF OLD.estado NOT IN ('BORRADOR','RECHAZADO')
     AND (to_jsonb(NEW)-campos_operativos) IS DISTINCT FROM (to_jsonb(OLD)-campos_operativos) THEN
    RAISE EXCEPTION 'Documento bloqueado: modificar solo borradores o rechazos definitivos';
  END IF;
  IF OLD.congelado_at IS NOT NULL AND
     (NEW.congelado_at IS DISTINCT FROM OLD.congelado_at OR NEW.uuid_fiscal IS DISTINCT FROM OLD.uuid_fiscal
       OR NEW.timbrado_at IS DISTINCT FROM OLD.timbrado_at) THEN
    RAISE EXCEPTION 'No alterar identidad fiscal de un documento emitido';
  END IF;
  IF OLD.congelado_at IS NOT NULL AND
    (to_jsonb(NEW)-ARRAY['estado','revision','updated_at','pdf_archivo_id',
      'acuse_cancelacion_archivo_id','motivo_cancelacion_sat','cancelado_at'])
    IS DISTINCT FROM
    (to_jsonb(OLD)-ARRAY['estado','revision','updated_at','pdf_archivo_id',
      'acuse_cancelacion_archivo_id','motivo_cancelacion_sat','cancelado_at']) THEN
    RAISE EXCEPTION 'Conservar datos, XML y sellos del documento emitido';
  END IF;
  IF OLD.uuid_fiscal IS NOT NULL AND NEW.estado IN ('BORRADOR','VALIDADO','TIMBRANDO','RECHAZADO') THEN
    RAISE EXCEPTION 'Un CFDI emitido no vuelve a borrador';
  END IF;
  NEW.revision := OLD.revision+1;
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;
CREATE TRIGGER cp_guardar_cfdi BEFORE INSERT OR UPDATE OR DELETE ON tms.cfdi
  FOR EACH ROW EXECUTE FUNCTION tms.cp_guardar_cfdi();

CREATE FUNCTION tms.cp_guardar_detalle() RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE fila jsonb; documento_id uuid; padre_id uuid; documento_estado text;
BEGIN
  IF TG_OP='DELETE' THEN fila:=to_jsonb(OLD); ELSE fila:=to_jsonb(NEW); END IF;
  IF TG_OP='UPDATE' THEN
    IF TG_ARGV[0]='CFDI' AND (to_jsonb(NEW)->>'cfdi_id') IS DISTINCT FROM (to_jsonb(OLD)->>'cfdi_id') THEN
      RAISE EXCEPTION 'No mover detalles entre comprobantes';
    ELSIF TG_ARGV[0]='CP' AND (to_jsonb(NEW)->>'carta_porte_id') IS DISTINCT FROM (to_jsonb(OLD)->>'carta_porte_id') THEN
      RAISE EXCEPTION 'No mover detalles entre Cartas Porte';
    END IF;
  END IF;
  IF TG_ARGV[0]='CFDI' THEN documento_id:=(fila->>'cfdi_id')::uuid;
  ELSE
    padre_id:=(fila->>'carta_porte_id')::uuid;
    SELECT cfdi_id INTO documento_id FROM tms.cartas_porte WHERE id=padre_id;
  END IF;
  SELECT estado INTO documento_estado FROM tms.cfdi WHERE id=documento_id FOR UPDATE;
  IF documento_estado IS NULL OR documento_estado NOT IN ('BORRADOR','RECHAZADO') THEN
    RAISE EXCEPTION 'El CFDI no admite cambios en sus detalles';
  END IF;
  -- Cada cambio invalida la revisión previamente leída y la validación anterior.
  UPDATE tms.cfdi SET estado='BORRADOR', solicitud_snapshot=NULL, solicitud_sha256=NULL
    WHERE id=documento_id;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION tms.cp_proteger_intento() RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Conservar intentos de timbrado'; END IF;
  IF (to_jsonb(NEW)-ARRAY['estado','referencia_proveedor','uuid_respuesta','codigo_respuesta',
    'mensaje_respuesta','respuesta_redactada','iniciado_at','terminado_at','updated_at'])
    IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['estado','referencia_proveedor','uuid_respuesta','codigo_respuesta',
    'mensaje_respuesta','respuesta_redactada','iniciado_at','terminado_at','updated_at']) THEN
    RAISE EXCEPTION 'La solicitud de un intento es inmutable';
  END IF;
  IF OLD.estado IN ('ACEPTADO','RECHAZADO') AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    RAISE EXCEPTION 'Un intento final no se reabre';
  END IF;
  IF OLD.estado IN ('ACEPTADO','RECHAZADO') AND
     (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
    RAISE EXCEPTION 'Un resultado final se conserva; registrar aclaración en auditoría';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER cp_intento_inmutable BEFORE UPDATE OR DELETE ON tms.cp_timbrado_intentos
  FOR EACH ROW EXECUTE FUNCTION tms.cp_proteger_intento();

-- Defensa de auditoría y generación de RLS/triggers para las tablas nuevas.
CREATE TRIGGER cp_auditoria_inmutable BEFORE UPDATE OR DELETE ON tms.cp_auditoria
  FOR EACH ROW EXECUTE FUNCTION tms.impedir_edicion_historial();
DO $triggers$
DECLARE tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['cfdi_conceptos','cfdi_impuestos','cfdi_relaciones','cartas_porte'] LOOP
    EXECUTE format('CREATE TRIGGER cp_detalle_bloqueo BEFORE INSERT OR UPDATE OR DELETE ON tms.%I FOR EACH ROW EXECUTE FUNCTION tms.cp_guardar_detalle(''CFDI'')', tabla);
  END LOOP;
  FOREACH tabla IN ARRAY ARRAY['cp_ubicaciones','cp_mercancias','cp_mercancias_sanitarias',
    'cp_autotransporte','cp_remolques','cp_figuras','cp_figura_partes','cp_regimenes_aduaneros',
    'cp_documentos_aduaneros','cp_mercancia_documentos','cp_cantidades_transportadas','cp_guias'] LOOP
    EXECUTE format('CREATE TRIGGER cp_detalle_bloqueo BEFORE INSERT OR UPDATE OR DELETE ON tms.%I FOR EACH ROW EXECUTE FUNCTION tms.cp_guardar_detalle(''CP'')', tabla);
  END LOOP;
  FOREACH tabla IN ARRAY ARRAY['cp_sat_versiones','cp_sat_claves','empresas_emisoras','mercancias',
    'cp_participantes','cp_direcciones','unidad_seguros','cfdi','cfdi_conceptos','cfdi_impuestos',
    'cfdi_relaciones','cartas_porte','cp_ubicaciones','cp_mercancias','cp_mercancias_sanitarias',
    'cp_autotransporte','cp_remolques','cp_figuras','cp_figura_partes','cp_regimenes_aduaneros',
    'cp_documentos_aduaneros','cp_mercancia_documentos','cp_cantidades_transportadas','cp_guias',
    'cp_timbrado_intentos','cp_auditoria'] LOOP
    EXECUTE format('ALTER TABLE tms.%I ENABLE ROW LEVEL SECURITY', tabla);
    EXECUTE format('REVOKE ALL ON TABLE tms.%I FROM PUBLIC', tabla);
    IF tabla NOT IN ('cp_sat_versiones','cp_sat_claves','cfdi','cp_auditoria') THEN
      EXECUTE format('CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.%I FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion()', tabla);
    END IF;
  END LOOP;
END
$triggers$;
REVOKE ALL ON FUNCTION tms.cp_guardar_cfdi() FROM PUBLIC;
REVOKE ALL ON FUNCTION tms.cp_guardar_detalle() FROM PUBLIC;
REVOKE ALL ON FUNCTION tms.cp_proteger_intento() FROM PUBLIC;

-- Índices de lectura y claves foráneas de uso habitual.
CREATE INDEX mercancias_cliente ON tms.mercancias(cliente_id);
CREATE INDEX cp_direcciones_participante ON tms.cp_direcciones(participante_id);
CREATE INDEX unidad_seguros_unidad ON tms.unidad_seguros(unidad_id, tipo);
CREATE INDEX cp_figuras_documento ON tms.cp_figuras(carta_porte_id);
CREATE INDEX cp_documentos_documento ON tms.cp_documentos_aduaneros(carta_porte_id);
CREATE INDEX cp_mercancia_documentos_documento ON tms.cp_mercancia_documentos(documento_id);
CREATE INDEX cp_cantidades_documento ON tms.cp_cantidades_transportadas(carta_porte_id);
CREATE INDEX cp_guias_documento ON tms.cp_guias(carta_porte_id);

INSERT INTO tms.permisos(codigo, descripcion) VALUES
  ('carta_porte.catalogos.ver','Consultar catálogos de Carta Porte'),
  ('carta_porte.catalogos.editar','Capturar y editar catálogos de Carta Porte'),
  ('carta_porte.ver','Consultar Cartas Porte y sus documentos'),
  ('carta_porte.editar','Preparar borradores de Carta Porte'),
  ('carta_porte.validar','Validar CFDI y Carta Porte'),
  ('carta_porte.timbrar','Solicitar timbrado y conciliación'),
  ('carta_porte.cancelar','Solicitar cancelación fiscal'),
  ('carta_porte.importar','Importar comprobantes recibidos de proveedores')
ON CONFLICT(codigo) DO NOTHING;
-- No asigna permisos a roles ni concede acceso a anon/authenticated.

COMMENT ON COLUMN tms.cp_autotransporte.peso_bruto_vehicular_t IS
  'Valor fiscal en toneladas. Validar la interpretación con XSD, instructivo y PAC vigentes; no copiar capacidad_kg ni mezclar kg con toneladas.';
COMMENT ON TABLE tms.cp_mercancias IS 'Partidas del documento; viaje_carga conserva el resumen operativo, no duplica las partidas.';
COMMENT ON TABLE tms.cp_mercancia_documentos IS 'Permite varios pedimentos por mercancía y un pedimento compartido por varias partidas del mismo documento.';
COMMENT ON TABLE tms.cp_auditoria IS 'Append-only. El backend inserta actor, cambios redactados y documento dentro de la transacción.';
COMMIT;
