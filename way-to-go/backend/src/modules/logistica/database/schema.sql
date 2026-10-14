-- WAYTOGO TMS: propuesta de esquema v1, 2026-10-07.
-- PostgreSQL 15+. Instalar UNA VEZ en base nueva / entorno de prueba.
-- No modifica auth.users ni instala politicas de acceso del portal.
-- Requiere permiso para crear extension btree_gist (reservas sin traslapes).
-- Ver DISENO_TABLAS_TMS.txt para supuestos, alcance y reglas del servicio.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA tms;
REVOKE ALL ON SCHEMA tms FROM PUBLIC;
SET LOCAL search_path = tms, public, extensions;

CREATE TABLE tms.usuarios (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
auth_subject uuid UNIQUE,
nombre text NOT NULL CHECK (btrim(nombre) <> ''),
email text NOT NULL CHECK (btrim(email) <> ''),
telefono text,
activo boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.roles (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
codigo text NOT NULL UNIQUE, descripcion text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.permisos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
codigo text NOT NULL UNIQUE, descripcion text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.usuario_roles (
usuario_id uuid NOT NULL REFERENCES tms.usuarios(id),
rol_id uuid NOT NULL REFERENCES tms.roles(id), PRIMARY KEY(usuario_id, rol_id),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.rol_permisos (
rol_id uuid NOT NULL REFERENCES tms.roles(id),
permiso_id uuid NOT NULL REFERENCES tms.permisos(id), PRIMARY KEY(rol_id, permiso_id),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.clientes (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
razon_social text NOT NULL, nombre_comercial text, rfc text,
activo boolean NOT NULL DEFAULT true, uso_cfdi text, forma_pago text, metodo_pago text,
condiciones_pago text,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.cliente_contactos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
cliente_id uuid NOT NULL REFERENCES tms.clientes(id),
nombre text NOT NULL, puesto text, email text, telefono text, tipo_contacto text,
principal boolean NOT NULL DEFAULT false, activo boolean NOT NULL DEFAULT true,
UNIQUE(id, cliente_id),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.cliente_direcciones (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
cliente_id uuid NOT NULL REFERENCES tms.clientes(id),
nombre text NOT NULL, calle text NOT NULL, ciudad text NOT NULL, estado text NOT NULL,
pais char(2) NOT NULL DEFAULT 'MX', codigo_postal text,
latitud numeric(9,6) CHECK(latitud BETWEEN -90 AND 90),
longitud numeric(9,6) CHECK(longitud BETWEEN -180 AND 180),
zona_horaria text NOT NULL DEFAULT 'America/Mexico_City', horario text, instrucciones text,
requiere_cita boolean NOT NULL DEFAULT false, contacto_id uuid,
activo boolean NOT NULL DEFAULT true, principal boolean NOT NULL DEFAULT false, UNIQUE(id, cliente_id),
FOREIGN KEY(contacto_id, cliente_id) REFERENCES tms.cliente_contactos(id, cliente_id),
CHECK ((latitud IS NULL) = (longitud IS NULL)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.tipos_servicio (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
codigo text NOT NULL UNIQUE, nombre text NOT NULL, activo boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.tipos_evidencia (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
codigo text NOT NULL UNIQUE, nombre text NOT NULL, activo boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.tipos_costo (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
codigo text NOT NULL UNIQUE, nombre text NOT NULL, activo boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.tipos_extra (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
codigo text NOT NULL UNIQUE, nombre text NOT NULL, activo boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.cliente_convenios (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
cliente_id uuid NOT NULL REFERENCES tms.clientes(id),
nombre text NOT NULL, origen_id uuid, destino_id uuid,
tipo_servicio_id uuid REFERENCES tms.tipos_servicio(id), tipo_unidad text, tipo_carga text,
tarifa_base numeric(18,2) NOT NULL CHECK(tarifa_base >= 0),
moneda char(3) NOT NULL DEFAULT 'MXN' CHECK(moneda IN ('MXN','USD')),
horas_libres_carga numeric(8,2) CHECK(horas_libres_carga >= 0),
horas_libres_descarga numeric(8,2) CHECK(horas_libres_descarga >= 0),
tarifa_estadia_hora numeric(18,2) CHECK(tarifa_estadia_hora >= 0),
vigente_desde date NOT NULL, vigente_hasta date, condiciones text,
activo boolean NOT NULL DEFAULT true, UNIQUE(id, cliente_id),
FOREIGN KEY(origen_id, cliente_id) REFERENCES tms.cliente_direcciones(id, cliente_id),
FOREIGN KEY(destino_id, cliente_id) REFERENCES tms.cliente_direcciones(id, cliente_id),
CHECK(vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.proveedores (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
razon_social text NOT NULL, nombre_comercial text, rfc text,
tipo text NOT NULL DEFAULT 'TRANSPORTISTA', condiciones_pago text,
activo boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.proveedor_contactos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
proveedor_id uuid NOT NULL REFERENCES tms.proveedores(id),
nombre text NOT NULL, puesto text, email text, telefono text,
principal boolean NOT NULL DEFAULT false, activo boolean NOT NULL DEFAULT true,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.cliente_usuarios (
cliente_id uuid NOT NULL REFERENCES tms.clientes(id),
usuario_id uuid NOT NULL REFERENCES tms.usuarios(id), activo boolean NOT NULL DEFAULT true,
PRIMARY KEY(cliente_id, usuario_id),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.proveedor_usuarios (
proveedor_id uuid NOT NULL REFERENCES tms.proveedores(id),
usuario_id uuid NOT NULL REFERENCES tms.usuarios(id), activo boolean NOT NULL DEFAULT true,
PRIMARY KEY(proveedor_id, usuario_id),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.operadores (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
usuario_id uuid UNIQUE REFERENCES tms.usuarios(id),
proveedor_id uuid REFERENCES tms.proveedores(id), nombre text NOT NULL, telefono text,
email text, tipo text NOT NULL CHECK(tipo IN ('PROPIO','PROVEEDOR')),
activo boolean NOT NULL DEFAULT true,
CHECK((tipo = 'PROPIO' AND proveedor_id IS NULL) OR (tipo = 'PROVEEDOR' AND proveedor_id IS NOT NULL)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.unidades (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
numero_economico text NOT NULL UNIQUE, placas text, tipo_unidad text NOT NULL,
marca text, modelo text, anio smallint CHECK(anio BETWEEN 1900 AND 2200),
capacidad_kg numeric(12,3) CHECK(capacidad_kg > 0), capacidad_pallets integer CHECK(capacidad_pallets > 0),
hazmat boolean NOT NULL DEFAULT false, refrigerada boolean NOT NULL DEFAULT false,
proveedor_id uuid REFERENCES tms.proveedores(id),
estatus text NOT NULL DEFAULT 'ACTIVA' CHECK(estatus IN ('ACTIVA','MANTENIMIENTO','BAJA')),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.cajas (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
numero_caja text NOT NULL UNIQUE, placas text, tipo_caja text NOT NULL,
largo_m numeric(6,2) CHECK(largo_m > 0), capacidad_kg numeric(12,3) CHECK(capacidad_kg > 0),
hazmat boolean NOT NULL DEFAULT false, refrigerada boolean NOT NULL DEFAULT false,
proveedor_id uuid REFERENCES tms.proveedores(id),
estatus text NOT NULL DEFAULT 'ACTIVA' CHECK(estatus IN ('ACTIVA','MANTENIMIENTO','BAJA')),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.archivos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
bucket text NOT NULL, storage_path text NOT NULL,
nombre_original text NOT NULL, mime_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes > 0),
sha256 text CHECK(sha256 ~ '^[0-9a-f]{64}$'),
estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','DISPONIBLE','RECHAZADO')),
subido_por uuid NOT NULL REFERENCES tms.usuarios(id), UNIQUE(bucket, storage_path),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.unidad_documentos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
unidad_id uuid NOT NULL REFERENCES tms.unidades(id),
tipo text NOT NULL, folio text, archivo_id uuid NOT NULL REFERENCES tms.archivos(id),
emitido_el date, vence_el date, validado_por uuid REFERENCES tms.usuarios(id), validado_at timestamptz,
CHECK(emitido_el IS NULL OR vence_el IS NULL OR vence_el >= emitido_el),
CHECK((validado_por IS NULL) = (validado_at IS NULL)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.caja_documentos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
caja_id uuid NOT NULL REFERENCES tms.cajas(id),
tipo text NOT NULL, folio text, archivo_id uuid NOT NULL REFERENCES tms.archivos(id),
emitido_el date, vence_el date, validado_por uuid REFERENCES tms.usuarios(id), validado_at timestamptz,
CHECK(emitido_el IS NULL OR vence_el IS NULL OR vence_el >= emitido_el),
CHECK((validado_por IS NULL) = (validado_at IS NULL)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.operador_documentos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
operador_id uuid NOT NULL REFERENCES tms.operadores(id),
tipo text NOT NULL, folio text, archivo_id uuid NOT NULL REFERENCES tms.archivos(id),
emitido_el date, vence_el date, validado_por uuid REFERENCES tms.usuarios(id), validado_at timestamptz,
CHECK(emitido_el IS NULL OR vence_el IS NULL OR vence_el >= emitido_el),
CHECK((validado_por IS NULL) = (validado_at IS NULL)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viajes (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
folio bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
cliente_id uuid NOT NULL REFERENCES tms.clientes(id), convenio_id uuid,
origen_id uuid, destino_id uuid,
origen_snapshot jsonb, destino_snapshot jsonb,
tipo_servicio_id uuid REFERENCES tms.tipos_servicio(id), tipo_carga text,
unidad_id uuid REFERENCES tms.unidades(id), caja_id uuid REFERENCES tms.cajas(id),
operador_id uuid REFERENCES tms.operadores(id), proveedor_id uuid REFERENCES tms.proveedores(id),
estado_operativo text NOT NULL DEFAULT 'BORRADOR' CHECK(estado_operativo IN
('BORRADOR','PROGRAMADO','EN_CAMINO_A_CARGA','LLEGO_A_CARGA','EN_CARGA',
'SALIO_CARGADO_EN_RUTA','LLEGO_A_DESTINO','EN_DESCARGA','ENTREGADO','CANCELADO')),
cita_carga_at timestamptz, entrega_estimada_at timestamptz,
reserva_desde timestamptz, reserva_hasta timestamptz,
recursos_liberados_at timestamptz,
ultima_actualizacion_operativa_at timestamptz,
umbral_sin_actualizacion interval NOT NULL DEFAULT interval '6 hours' CHECK(umbral_sin_actualizacion > interval '0'),
instrucciones text, restricciones_ruta text,
creado_por uuid NOT NULL REFERENCES tms.usuarios(id),
responsable_id uuid REFERENCES tms.usuarios(id),
cancelado_at timestamptz, motivo_cancelacion text,
cerrado_at timestamptz, cerrado_por uuid REFERENCES tms.usuarios(id),
FOREIGN KEY(origen_id, cliente_id) REFERENCES tms.cliente_direcciones(id, cliente_id),
FOREIGN KEY(destino_id, cliente_id) REFERENCES tms.cliente_direcciones(id, cliente_id),
FOREIGN KEY(convenio_id, cliente_id) REFERENCES tms.cliente_convenios(id, cliente_id),
CHECK(entrega_estimada_at >= cita_carga_at),
CHECK((reserva_desde IS NULL) = (reserva_hasta IS NULL)),
CHECK(reserva_hasta > reserva_desde),
CHECK((cerrado_at IS NULL) = (cerrado_por IS NULL)),
CHECK(estado_operativo <> 'CANCELADO' OR (cancelado_at IS NOT NULL AND motivo_cancelacion IS NOT NULL)),
CHECK(estado_operativo IN ('BORRADOR','CANCELADO') OR
 (origen_id IS NOT NULL AND destino_id IS NOT NULL AND origen_snapshot IS NOT NULL AND destino_snapshot IS NOT NULL
 AND tipo_servicio_id IS NOT NULL AND tipo_carga IS NOT NULL
 AND cita_carga_at IS NOT NULL AND entrega_estimada_at IS NOT NULL
 AND reserva_desde IS NOT NULL AND reserva_hasta IS NOT NULL
 AND (unidad_id IS NOT NULL OR proveedor_id IS NOT NULL))),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_comercial (
viaje_id uuid PRIMARY KEY REFERENCES tms.viajes(id),
flete_base numeric(18,2) NOT NULL CHECK(flete_base >= 0),
moneda char(3) NOT NULL DEFAULT 'MXN' CHECK(moneda IN ('MXN','USD')),
horas_libres_carga numeric(8,2) CHECK(horas_libres_carga >= 0),
horas_libres_descarga numeric(8,2) CHECK(horas_libres_descarga >= 0),
tarifa_estadia_hora numeric(18,2) CHECK(tarifa_estadia_hora >= 0),
condiciones_snapshot text,
checklist_confirmado_por uuid REFERENCES tms.usuarios(id), checklist_confirmado_at timestamptz,
costos_requeridos boolean NOT NULL DEFAULT false,
costos_completos_por uuid REFERENCES tms.usuarios(id), costos_completos_at timestamptz,
CHECK((costos_completos_por IS NULL) = (costos_completos_at IS NULL)),
CHECK((checklist_confirmado_por IS NULL) = (checklist_confirmado_at IS NULL)),
UNIQUE(viaje_id, moneda),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_tiempos (
viaje_id uuid PRIMARY KEY REFERENCES tms.viajes(id),
salida_programada_at timestamptz, descarga_programada_at timestamptz,
llegada_carga_at timestamptz, inicio_carga_at timestamptz, salida_cargado_at timestamptz,
llegada_destino_at timestamptz, inicio_descarga_at timestamptz, fin_descarga_at timestamptz,
entregado_at timestamptz,
CHECK(inicio_carga_at >= llegada_carga_at), CHECK(salida_cargado_at >= inicio_carga_at),
CHECK(llegada_destino_at >= salida_cargado_at), CHECK(inicio_descarga_at >= llegada_destino_at),
CHECK(fin_descarga_at >= inicio_descarga_at), CHECK(entregado_at >= fin_descarga_at),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_carga (
viaje_id uuid PRIMARY KEY REFERENCES tms.viajes(id),
descripcion text, mercancia text, hazmat boolean NOT NULL DEFAULT false,
refrigerada boolean NOT NULL DEFAULT false, temperatura_min_c numeric(6,2), temperatura_max_c numeric(6,2),
peso_kg numeric(12,3) CHECK(peso_kg >= 0), pallets integer CHECK(pallets >= 0),
volumen_m3 numeric(12,3) CHECK(volumen_m3 >= 0), embalaje text,
CHECK(temperatura_max_c >= temperatura_min_c),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_eventos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
viaje_id uuid NOT NULL REFERENCES tms.viajes(id),
tipo text NOT NULL CHECK(tipo IN ('CREACION','ESTATUS','ASIGNACION','TIEMPO','CIERRE','CANCELACION','CORRECCION','COMENTARIO')),
estado_anterior text, estado_nuevo text, datos jsonb NOT NULL DEFAULT '{}',
ocurrido_at timestamptz NOT NULL, registrado_por uuid NOT NULL REFERENCES tms.usuarios(id),
origen text NOT NULL CHECK(origen IN ('INTERNO','CLIENTE','OPERADOR','PROVEEDOR','SISTEMA')),
comentario text, archivo_id uuid REFERENCES tms.archivos(id),
latitud numeric(9,6) CHECK(latitud BETWEEN -90 AND 90),
longitud numeric(9,6) CHECK(longitud BETWEEN -180 AND 180),
visible_cliente boolean NOT NULL DEFAULT false,
visible_externo boolean NOT NULL DEFAULT false,
idempotency_key uuid NOT NULL UNIQUE,
CHECK((latitud IS NULL) = (longitud IS NULL)),
CHECK(tipo <> 'ESTATUS' OR (estado_anterior IS NOT NULL AND estado_nuevo IS NOT NULL)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.servicio_evidencias (
tipo_servicio_id uuid NOT NULL REFERENCES tms.tipos_servicio(id),
tipo_evidencia_id uuid NOT NULL REFERENCES tms.tipos_evidencia(id),
obligatoria_facturar boolean NOT NULL DEFAULT false,
requiere_validacion boolean NOT NULL DEFAULT true,
visible_cliente boolean NOT NULL DEFAULT false,
PRIMARY KEY(tipo_servicio_id, tipo_evidencia_id),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_evidencias (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
viaje_id uuid NOT NULL REFERENCES tms.viajes(id),
tipo_evidencia_id uuid NOT NULL REFERENCES tms.tipos_evidencia(id),
obligatoria_facturar boolean NOT NULL DEFAULT false,
requiere_validacion boolean NOT NULL DEFAULT true,
visible_cliente boolean NOT NULL DEFAULT false,
no_aplica boolean NOT NULL DEFAULT false,
exencion_motivo text, exencion_por uuid REFERENCES tms.usuarios(id), exencion_at timestamptz,
UNIQUE(viaje_id, tipo_evidencia_id),
CHECK(NOT no_aplica OR (exencion_motivo IS NOT NULL AND exencion_por IS NOT NULL AND exencion_at IS NOT NULL)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.evidencia_entregas (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
evidencia_id uuid NOT NULL REFERENCES tms.viaje_evidencias(id),
archivo_id uuid NOT NULL REFERENCES tms.archivos(id),
estado text NOT NULL DEFAULT 'RECIBIDA' CHECK(estado IN ('RECIBIDA','RECHAZADA','VALIDADA')),
subida_por uuid NOT NULL REFERENCES tms.usuarios(id),
revisada_por uuid REFERENCES tms.usuarios(id), revisada_at timestamptz, motivo_revision text,
UNIQUE(evidencia_id, archivo_id),
CHECK(estado = 'RECIBIDA' OR (revisada_por IS NOT NULL AND revisada_at IS NOT NULL)),
CHECK(estado <> 'RECHAZADA' OR motivo_revision IS NOT NULL),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_costos (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
viaje_id uuid NOT NULL REFERENCES tms.viajes(id),
tipo_costo_id uuid NOT NULL REFERENCES tms.tipos_costo(id), descripcion text NOT NULL,
monto_estimado numeric(18,2) CHECK(monto_estimado >= 0), monto_real numeric(18,2) CHECK(monto_real >= 0),
moneda char(3) NOT NULL CHECK(moneda IN ('MXN','USD')),
tipo_cambio_a_viaje numeric(18,8) NOT NULL CHECK(tipo_cambio_a_viaje > 0),
comprobante_id uuid REFERENCES tms.archivos(id), proveedor_id uuid REFERENCES tms.proveedores(id),
creado_por uuid NOT NULL REFERENCES tms.usuarios(id),
anulado_at timestamptz, motivo_anulacion text,
CHECK(monto_estimado IS NOT NULL OR monto_real IS NOT NULL),
CHECK(anulado_at IS NULL OR motivo_anulacion IS NOT NULL),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_extras (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
viaje_id uuid NOT NULL REFERENCES tms.viajes(id),
tipo_extra_id uuid NOT NULL REFERENCES tms.tipos_extra(id), descripcion text NOT NULL,
monto numeric(18,2) NOT NULL CHECK(monto >= 0), moneda char(3) NOT NULL,
se_cobra_cliente boolean NOT NULL DEFAULT false, se_agrega_factura boolean NOT NULL DEFAULT false,
estado text NOT NULL DEFAULT 'PENDIENTE' CHECK(estado IN ('PENDIENTE','VALIDADO','RECHAZADO','CANCELADO')),
origen text NOT NULL DEFAULT 'MANUAL' CHECK(origen IN ('MANUAL','SUGERENCIA_ESTADIA')),
requiere_comprobante boolean NOT NULL DEFAULT false,
comprobante_id uuid REFERENCES tms.archivos(id), creado_por uuid NOT NULL REFERENCES tms.usuarios(id),
revisado_por uuid REFERENCES tms.usuarios(id), revisado_at timestamptz, motivo_revision text,
FOREIGN KEY(viaje_id, moneda) REFERENCES tms.viaje_comercial(viaje_id, moneda),
CHECK(NOT se_agrega_factura OR se_cobra_cliente),
CHECK(estado = 'PENDIENTE' OR (revisado_por IS NOT NULL AND revisado_at IS NOT NULL)),
CHECK(estado <> 'VALIDADO' OR NOT requiere_comprobante OR comprobante_id IS NOT NULL),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_incidencias (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
viaje_id uuid NOT NULL REFERENCES tms.viajes(id), tipo text NOT NULL,
severidad text NOT NULL CHECK(severidad IN ('BAJA','MEDIA','ALTA','CRITICA')),
descripcion text NOT NULL, estado text NOT NULL DEFAULT 'ABIERTA' CHECK(estado IN ('ABIERTA','EN_ATENCION','CERRADA')),
bloquea_facturacion boolean NOT NULL DEFAULT false, visible_cliente boolean NOT NULL DEFAULT false,
visible_externo boolean NOT NULL DEFAULT false,
reportada_por uuid NOT NULL REFERENCES tms.usuarios(id), responsable_id uuid REFERENCES tms.usuarios(id),
cerrada_por uuid REFERENCES tms.usuarios(id), cerrada_at timestamptz, solucion text,
CHECK(estado <> 'CERRADA' OR (cerrada_por IS NOT NULL AND cerrada_at IS NOT NULL AND solucion IS NOT NULL)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_mensajes (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
viaje_id uuid NOT NULL REFERENCES tms.viajes(id),
autor_id uuid NOT NULL REFERENCES tms.usuarios(id),
tipo text NOT NULL CHECK(tipo IN ('CLIENTE','NOTA_INTERNA','SISTEMA','OPERADOR_PROVEEDOR','FINANZAS')),
mensaje text NOT NULL CHECK(btrim(mensaje) <> ''), archivo_id uuid REFERENCES tms.archivos(id),
visible_cliente boolean NOT NULL DEFAULT false, visible_externo boolean NOT NULL DEFAULT false,
CHECK(tipo NOT IN ('NOTA_INTERNA','FINANZAS') OR (NOT visible_cliente AND NOT visible_externo)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_facturacion_operativa (
viaje_id uuid PRIMARY KEY REFERENCES tms.viajes(id),
estado text NOT NULL DEFAULT 'NO_ENVIADO' CHECK(estado IN ('NO_ENVIADO','ENVIADO','DEVUELTO','FACTURADO','PAGADO','CANCELADO')),
enviado_por uuid REFERENCES tms.usuarios(id), enviado_at timestamptz,
envio_snapshot jsonb, observaciones text,
CHECK(estado NOT IN ('ENVIADO','FACTURADO','PAGADO') OR
 (enviado_por IS NOT NULL AND enviado_at IS NOT NULL AND envio_snapshot IS NOT NULL)),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_referencias_finanzas (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
viaje_id uuid NOT NULL REFERENCES tms.viajes(id),
sistema text NOT NULL, documento_externo_id text NOT NULL,
tipo text NOT NULL CHECK(tipo IN ('FACTURA','NOTA_CREDITO','PAGO')),
folio text, moneda char(3) NOT NULL CHECK(moneda IN ('MXN','USD')),
monto_aplicado numeric(18,2) NOT NULL CHECK(monto_aplicado >= 0),
cancelado boolean NOT NULL DEFAULT false, sincronizado_at timestamptz NOT NULL DEFAULT now(),
UNIQUE(viaje_id, sistema, tipo, documento_externo_id),
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.viaje_alertas (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
viaje_id uuid NOT NULL REFERENCES tms.viajes(id),
tipo text NOT NULL CHECK(tipo IN ('SIN_ACTUALIZACION','PENDIENTE_POD','PENDIENTE_EVIDENCIA','PENDIENTE_EXTRA','INCIDENCIA')),
mensaje text NOT NULL, resuelta_at timestamptz,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.notificaciones (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
usuario_id uuid NOT NULL REFERENCES tms.usuarios(id),
viaje_id uuid REFERENCES tms.viajes(id), tipo text NOT NULL, titulo text NOT NULL, mensaje text NOT NULL,
leida_at timestamptz, email_estado text NOT NULL DEFAULT 'NO_REQUERIDO'
CHECK(email_estado IN ('NO_REQUERIDO','PENDIENTE','ENVIADO','ERROR')),
email_intentos integer NOT NULL DEFAULT 0 CHECK(email_intentos >= 0),
email_enviado_at timestamptz, email_ultimo_error text,
dedupe_key text NOT NULL UNIQUE,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reservas [inicio, fin): permiten viajes consecutivos, impiden traslapes.
-- Liberar recursos al terminar operacion; no esperar al pago de Finanzas.
ALTER TABLE tms.viajes ADD CONSTRAINT no_traslape_unidad_id
EXCLUDE USING gist (unidad_id WITH =, tstzrange(reserva_desde, reserva_hasta, '[)') WITH &&)
WHERE (unidad_id IS NOT NULL AND reserva_desde IS NOT NULL AND recursos_liberados_at IS NULL
AND estado_operativo NOT IN ('BORRADOR','CANCELADO'));
ALTER TABLE tms.viajes ADD CONSTRAINT no_traslape_caja_id
EXCLUDE USING gist (caja_id WITH =, tstzrange(reserva_desde, reserva_hasta, '[)') WITH &&)
WHERE (caja_id IS NOT NULL AND reserva_desde IS NOT NULL AND recursos_liberados_at IS NULL
AND estado_operativo NOT IN ('BORRADOR','CANCELADO'));
ALTER TABLE tms.viajes ADD CONSTRAINT no_traslape_operador_id
EXCLUDE USING gist (operador_id WITH =, tstzrange(reserva_desde, reserva_hasta, '[)') WITH &&)
WHERE (operador_id IS NOT NULL AND reserva_desde IS NOT NULL AND recursos_liberados_at IS NULL
AND estado_operativo NOT IN ('BORRADOR','CANCELADO'));

CREATE UNIQUE INDEX usuarios_email_ci ON tms.usuarios(lower(email));
CREATE UNIQUE INDEX clientes_rfc_ci ON tms.clientes(upper(btrim(rfc))) WHERE rfc IS NOT NULL AND btrim(rfc) <> '';
CREATE UNIQUE INDEX cliente_contacto_principal ON tms.cliente_contactos(cliente_id) WHERE principal AND activo;
CREATE UNIQUE INDEX cliente_direccion_principal ON tms.cliente_direcciones(cliente_id) WHERE principal AND activo;
CREATE UNIQUE INDEX proveedor_contacto_principal ON tms.proveedor_contactos(proveedor_id) WHERE principal AND activo;
CREATE UNIQUE INDEX viaje_alerta_abierta ON tms.viaje_alertas(viaje_id, tipo) WHERE resuelta_at IS NULL;
CREATE INDEX viajes_cliente_fecha ON tms.viajes(cliente_id, cita_carga_at DESC);
CREATE INDEX viajes_estado_fecha ON tms.viajes(estado_operativo, cita_carga_at);
CREATE INDEX viaje_eventos_timeline ON tms.viaje_eventos(viaje_id, ocurrido_at, created_at);
CREATE INDEX notificaciones_pendientes ON tms.notificaciones(usuario_id, created_at DESC) WHERE leida_at IS NULL;
CREATE INDEX ix_usuario_roles_rol_id ON tms.usuario_roles(rol_id);
CREATE INDEX ix_usuario_roles_usuario_id ON tms.usuario_roles(usuario_id);
CREATE INDEX ix_rol_permisos_permiso_id ON tms.rol_permisos(permiso_id);
CREATE INDEX ix_rol_permisos_rol_id ON tms.rol_permisos(rol_id);
CREATE INDEX ix_cliente_contactos_cliente_id ON tms.cliente_contactos(cliente_id);
CREATE INDEX ix_cliente_direcciones_cliente_id ON tms.cliente_direcciones(cliente_id);
CREATE INDEX ix_cliente_direcciones_contacto_id ON tms.cliente_direcciones(contacto_id);
CREATE INDEX ix_cliente_convenios_cliente_id ON tms.cliente_convenios(cliente_id);
CREATE INDEX ix_cliente_convenios_destino_id ON tms.cliente_convenios(destino_id);
CREATE INDEX ix_cliente_convenios_origen_id ON tms.cliente_convenios(origen_id);
CREATE INDEX ix_cliente_convenios_tipo_servicio_id ON tms.cliente_convenios(tipo_servicio_id);
CREATE INDEX ix_proveedor_contactos_proveedor_id ON tms.proveedor_contactos(proveedor_id);
CREATE INDEX ix_cliente_usuarios_cliente_id ON tms.cliente_usuarios(cliente_id);
CREATE INDEX ix_cliente_usuarios_usuario_id ON tms.cliente_usuarios(usuario_id);
CREATE INDEX ix_proveedor_usuarios_proveedor_id ON tms.proveedor_usuarios(proveedor_id);
CREATE INDEX ix_proveedor_usuarios_usuario_id ON tms.proveedor_usuarios(usuario_id);
CREATE INDEX ix_operadores_proveedor_id ON tms.operadores(proveedor_id);
CREATE INDEX ix_operadores_usuario_id ON tms.operadores(usuario_id);
CREATE INDEX ix_unidades_proveedor_id ON tms.unidades(proveedor_id);
CREATE INDEX ix_cajas_proveedor_id ON tms.cajas(proveedor_id);
CREATE INDEX ix_archivos_subido_por ON tms.archivos(subido_por);
CREATE INDEX ix_unidad_documentos_archivo_id ON tms.unidad_documentos(archivo_id);
CREATE INDEX ix_unidad_documentos_unidad_id ON tms.unidad_documentos(unidad_id);
CREATE INDEX ix_unidad_documentos_validado_por ON tms.unidad_documentos(validado_por);
CREATE INDEX ix_unidad_documentos_vence ON tms.unidad_documentos(vence_el);
CREATE INDEX ix_caja_documentos_archivo_id ON tms.caja_documentos(archivo_id);
CREATE INDEX ix_caja_documentos_caja_id ON tms.caja_documentos(caja_id);
CREATE INDEX ix_caja_documentos_validado_por ON tms.caja_documentos(validado_por);
CREATE INDEX ix_caja_documentos_vence ON tms.caja_documentos(vence_el);
CREATE INDEX ix_operador_documentos_archivo_id ON tms.operador_documentos(archivo_id);
CREATE INDEX ix_operador_documentos_operador_id ON tms.operador_documentos(operador_id);
CREATE INDEX ix_operador_documentos_validado_por ON tms.operador_documentos(validado_por);
CREATE INDEX ix_operador_documentos_vence ON tms.operador_documentos(vence_el);
CREATE INDEX ix_viajes_caja_id ON tms.viajes(caja_id);
CREATE INDEX ix_viajes_cerrado_por ON tms.viajes(cerrado_por);
CREATE INDEX ix_viajes_cliente_id ON tms.viajes(cliente_id);
CREATE INDEX ix_viajes_convenio_id ON tms.viajes(convenio_id);
CREATE INDEX ix_viajes_creado_por ON tms.viajes(creado_por);
CREATE INDEX ix_viajes_destino_id ON tms.viajes(destino_id);
CREATE INDEX ix_viajes_operador_id ON tms.viajes(operador_id);
CREATE INDEX ix_viajes_origen_id ON tms.viajes(origen_id);
CREATE INDEX ix_viajes_proveedor_id ON tms.viajes(proveedor_id);
CREATE INDEX ix_viajes_responsable_id ON tms.viajes(responsable_id);
CREATE INDEX ix_viajes_tipo_servicio_id ON tms.viajes(tipo_servicio_id);
CREATE INDEX ix_viajes_unidad_id ON tms.viajes(unidad_id);
CREATE INDEX ix_viaje_comercial_checklist_confirmado_por ON tms.viaje_comercial(checklist_confirmado_por);
CREATE INDEX ix_viaje_comercial_costos_completos_por ON tms.viaje_comercial(costos_completos_por);
CREATE INDEX ix_viaje_eventos_archivo_id ON tms.viaje_eventos(archivo_id);
CREATE INDEX ix_viaje_eventos_registrado_por ON tms.viaje_eventos(registrado_por);
CREATE INDEX ix_viaje_eventos_viaje_id ON tms.viaje_eventos(viaje_id);
CREATE INDEX ix_servicio_evidencias_tipo_evidencia_id ON tms.servicio_evidencias(tipo_evidencia_id);
CREATE INDEX ix_servicio_evidencias_tipo_servicio_id ON tms.servicio_evidencias(tipo_servicio_id);
CREATE INDEX ix_viaje_evidencias_exencion_por ON tms.viaje_evidencias(exencion_por);
CREATE INDEX ix_viaje_evidencias_tipo_evidencia_id ON tms.viaje_evidencias(tipo_evidencia_id);
CREATE INDEX ix_viaje_evidencias_viaje_id ON tms.viaje_evidencias(viaje_id);
CREATE INDEX ix_evidencia_entregas_archivo_id ON tms.evidencia_entregas(archivo_id);
CREATE INDEX ix_evidencia_entregas_evidencia_id ON tms.evidencia_entregas(evidencia_id);
CREATE INDEX ix_evidencia_entregas_revisada_por ON tms.evidencia_entregas(revisada_por);
CREATE INDEX ix_evidencia_entregas_subida_por ON tms.evidencia_entregas(subida_por);
CREATE INDEX ix_viaje_costos_comprobante_id ON tms.viaje_costos(comprobante_id);
CREATE INDEX ix_viaje_costos_creado_por ON tms.viaje_costos(creado_por);
CREATE INDEX ix_viaje_costos_proveedor_id ON tms.viaje_costos(proveedor_id);
CREATE INDEX ix_viaje_costos_tipo_costo_id ON tms.viaje_costos(tipo_costo_id);
CREATE INDEX ix_viaje_costos_viaje_id ON tms.viaje_costos(viaje_id);
CREATE INDEX ix_viaje_extras_comprobante_id ON tms.viaje_extras(comprobante_id);
CREATE INDEX ix_viaje_extras_creado_por ON tms.viaje_extras(creado_por);
CREATE INDEX ix_viaje_extras_revisado_por ON tms.viaje_extras(revisado_por);
CREATE INDEX ix_viaje_extras_tipo_extra_id ON tms.viaje_extras(tipo_extra_id);
CREATE INDEX ix_viaje_extras_viaje_id ON tms.viaje_extras(viaje_id);
CREATE INDEX ix_viaje_incidencias_cerrada_por ON tms.viaje_incidencias(cerrada_por);
CREATE INDEX ix_viaje_incidencias_reportada_por ON tms.viaje_incidencias(reportada_por);
CREATE INDEX ix_viaje_incidencias_responsable_id ON tms.viaje_incidencias(responsable_id);
CREATE INDEX ix_viaje_incidencias_viaje_id ON tms.viaje_incidencias(viaje_id);
CREATE INDEX ix_viaje_mensajes_archivo_id ON tms.viaje_mensajes(archivo_id);
CREATE INDEX ix_viaje_mensajes_autor_id ON tms.viaje_mensajes(autor_id);
CREATE INDEX ix_viaje_mensajes_viaje_id ON tms.viaje_mensajes(viaje_id);
CREATE INDEX ix_viaje_facturacion_operativa_enviado_por ON tms.viaje_facturacion_operativa(enviado_por);
CREATE INDEX ix_viaje_referencias_finanzas_viaje_id ON tms.viaje_referencias_finanzas(viaje_id);
CREATE INDEX ix_viaje_alertas_viaje_id ON tms.viaje_alertas(viaje_id);
CREATE INDEX ix_notificaciones_usuario_id ON tms.notificaciones(usuario_id);
CREATE INDEX ix_notificaciones_viaje_id ON tms.notificaciones(viaje_id);

-- Metadatos automaticos y RLS cerrada por defecto; ninguna politica de portal aun.
CREATE FUNCTION tms.marcar_actualizacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.usuarios
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.usuarios ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.roles
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.roles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.permisos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.permisos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.usuario_roles
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.usuario_roles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.rol_permisos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.rol_permisos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.clientes
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.clientes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.cliente_contactos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.cliente_contactos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.cliente_direcciones
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.cliente_direcciones ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.tipos_servicio
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.tipos_servicio ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.tipos_evidencia
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.tipos_evidencia ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.tipos_costo
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.tipos_costo ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.tipos_extra
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.tipos_extra ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.cliente_convenios
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.cliente_convenios ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.proveedores
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.proveedores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.proveedor_contactos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.proveedor_contactos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.cliente_usuarios
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.cliente_usuarios ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.proveedor_usuarios
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.proveedor_usuarios ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.operadores
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.operadores ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.unidades
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.unidades ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.cajas
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.cajas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.archivos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.archivos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.unidad_documentos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.unidad_documentos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.caja_documentos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.caja_documentos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.operador_documentos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.operador_documentos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viajes
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viajes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_comercial
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_comercial ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_tiempos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_tiempos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_carga
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_carga ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_eventos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_eventos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.servicio_evidencias
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.servicio_evidencias ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_evidencias
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_evidencias ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.evidencia_entregas
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.evidencia_entregas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_costos
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_costos ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_extras
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_extras ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_incidencias
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_incidencias ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_mensajes
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_mensajes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_facturacion_operativa
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_facturacion_operativa ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_referencias_finanzas
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_referencias_finanzas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.viaje_alertas
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.viaje_alertas ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER actualizar_fecha BEFORE UPDATE ON tms.notificaciones
FOR EACH ROW EXECUTE FUNCTION tms.marcar_actualizacion();
ALTER TABLE tms.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION tms.impedir_edicion_historial() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Historial inmutable: registrar una correccion como nuevo evento'; END;
$$;
CREATE TRIGGER historial_inmutable BEFORE UPDATE OR DELETE ON tms.viaje_eventos
FOR EACH ROW EXECUTE FUNCTION tms.impedir_edicion_historial();

-- Estado efectivo del checklist: un registro puede tener varias entregas.
CREATE VIEW tms.v_evidencias_estado WITH (security_invoker = true) AS
SELECT e.*,
 CASE WHEN e.no_aplica THEN 'NO_APLICA'
 WHEN EXISTS (SELECT 1 FROM tms.evidencia_entregas x JOIN tms.archivos a ON a.id=x.archivo_id
              WHERE x.evidencia_id=e.id AND x.estado='VALIDADA' AND a.estado='DISPONIBLE') THEN 'VALIDADA'
 WHEN EXISTS (SELECT 1 FROM tms.evidencia_entregas x JOIN tms.archivos a ON a.id=x.archivo_id
              WHERE x.evidencia_id=e.id AND x.estado='RECIBIDA' AND a.estado='DISPONIBLE') THEN 'RECIBIDA'
 WHEN EXISTS (SELECT 1 FROM tms.evidencia_entregas x WHERE x.evidencia_id=e.id AND x.estado='RECHAZADA') THEN 'RECHAZADA'
 ELSE 'PENDIENTE' END AS estado
FROM tms.viaje_evidencias e;

-- Diagnostico calculado; no duplicar banderas falta_pod/falta_evidencia en tablas.
-- Propuesta: POD obligatorio para todos los viajes. Ajustar cuando se resuelva seccion 21 del maestro.
CREATE VIEW tms.v_preparacion_facturacion WITH (security_invoker = true) AS
SELECT v.id AS viaje_id,
 v.estado_operativo='ENTREGADO' AS entregado,
 (c.checklist_confirmado_at IS NOT NULL) AS checklist_confirmado,
 EXISTS (SELECT 1 FROM tms.v_evidencias_estado e JOIN tms.tipos_evidencia t ON t.id=e.tipo_evidencia_id
         WHERE e.viaje_id=v.id AND t.codigo='POD_FIRMADO' AND NOT e.no_aplica
         AND (e.estado='VALIDADA' OR (e.estado='RECIBIDA' AND NOT e.requiere_validacion))) AS pod_completo,
 NOT EXISTS (SELECT 1 FROM tms.v_evidencias_estado e WHERE e.viaje_id=v.id AND e.obligatoria_facturar
         AND NOT (e.estado IN ('VALIDADA','NO_APLICA') OR (e.estado='RECIBIDA' AND NOT e.requiere_validacion))) AS evidencias_completas,
 NOT EXISTS (SELECT 1 FROM tms.viaje_extras x WHERE x.viaje_id=v.id AND x.estado='PENDIENTE') AS extras_resueltos,
 NOT EXISTS (SELECT 1 FROM tms.viaje_incidencias i WHERE i.viaje_id=v.id AND i.bloquea_facturacion AND i.estado<>'CERRADA') AS sin_bloqueos,
 (c.viaje_id IS NOT NULL AND (NOT c.costos_requeridos OR c.costos_completos_at IS NOT NULL)) AS costos_completos,
 c.moneda, c.flete_base,
 COALESCE((SELECT sum(x.monto) FROM tms.viaje_extras x WHERE x.viaje_id=v.id
           AND x.estado='VALIDADO' AND x.se_cobra_cliente AND x.se_agrega_factura),0) AS extras_facturables
FROM tms.viajes v LEFT JOIN tms.viaje_comercial c ON c.viaje_id=v.id;

CREATE VIEW tms.v_listo_facturar WITH (security_invoker = true) AS
SELECT p.*, (entregado AND checklist_confirmado AND pod_completo AND evidencias_completas AND extras_resueltos AND sin_bloqueos AND costos_completos) AS listo,
flete_base + extras_facturables AS subtotal_sin_impuestos
FROM tms.v_preparacion_facturacion p;

INSERT INTO tms.roles(codigo) VALUES
('SUPER_ADMIN'),('GERENCIA'),('TRAFICO'),('VENTAS'),('ADMINISTRACION'),('FINANZAS'),('CLIENTE'),('OPERADOR'),('PROVEEDOR'),('LECTURA');
INSERT INTO tms.permisos(codigo) VALUES
('viajes.ver'),('viajes.crear'),('viajes.editar'),('viajes.estatus'),('viajes.cerrar'),
('costos.ver'),('costos.editar'),('utilidad.ver'),('extras.autorizar'),('evidencias.validar'),
('facturacion.enviar'),('reportes.ver');
-- Asignaciones rol-permiso pendientes de la matriz final; no conceder por defecto.
INSERT INTO tms.tipos_evidencia(codigo,nombre) VALUES
('FOTO_CARGA','Foto carga'),
('FOTO_MERCANCIA','Foto mercancia'),
('FOTO_SELLO_CARGA','Foto sello carga'),
('FOTO_SELLO_DESTINO','Foto sello destino'),
('FOTO_DESCARGA','Foto descarga'),
('POD_FIRMADO','Pod firmado'),
('TICKET_COMBUSTIBLE','Ticket combustible'),
('CASETA','Caseta'),
('COMPROBANTE_MANIOBRA','Comprobante maniobra'),
('FACTURA_PROVEEDOR','Factura proveedor'),
('DOCUMENTO_CARTA_PORTE','Documento carta porte'),
('OTRO','Otro');
INSERT INTO tms.tipos_costo(codigo,nombre) VALUES
('DIESEL','Diesel'),
('CASETAS','Casetas'),
('VIATICOS','Viaticos'),
('SUELDO_OPERADOR','Sueldo operador'),
('PROVEEDOR','Proveedor'),
('MANTENIMIENTO','Mantenimiento'),
('PERMISOS','Permisos'),
('MULTAS','Multas'),
('OTROS','Otros');
INSERT INTO tms.tipos_extra(codigo,nombre) VALUES
('ESTADIA','Estadia'),
('MANIOBRA','Maniobra'),
('FLETE_EN_FALSO','Flete en falso'),
('CAMBIO_CITA','Cambio cita'),
('PERMISO_ESPECIAL','Permiso especial'),
('MULTA','Multa'),
('MOCHE','Moche'),
('CARGA_EXTRA','Carga extra'),
('DESCARGA_EXTRA','Descarga extra'),
('ADITAMENTO_EXTRA','Aditamento extra'),
('ESPERA','Espera'),
('DESVIO','Desvio'),
('SEGUNDO_INTENTO','Segundo intento');

REVOKE ALL ON ALL TABLES IN SCHEMA tms FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA tms FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tms FROM PUBLIC;
COMMIT;
