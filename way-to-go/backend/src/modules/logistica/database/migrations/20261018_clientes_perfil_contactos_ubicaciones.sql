-- Extiende el perfil de Clientes sin modificar las tablas de Viajes.
-- Aplicar manualmente solo después de confirmar la versión del esquema existente.
BEGIN;

ALTER TABLE tms.clientes
  ADD COLUMN IF NOT EXISTS domicilio_legal_calle text,
  ADD COLUMN IF NOT EXISTS domicilio_legal_ciudad text,
  ADD COLUMN IF NOT EXISTS domicilio_legal_estado text,
  ADD COLUMN IF NOT EXISTS domicilio_legal_pais char(2),
  ADD COLUMN IF NOT EXISTS domicilio_legal_codigo_postal text,
  ADD COLUMN IF NOT EXISTS canal_registro text,
  ADD COLUMN IF NOT EXISTS motivo_registro text,
  ADD COLUMN IF NOT EXISTS servicios_acordados text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS regimen_fiscal text,
  ADD COLUMN IF NOT EXISTS contacto_facturacion_id uuid;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'clientes_contacto_facturacion_fk'
      AND conrelid = 'tms.clientes'::regclass
  ) THEN
    ALTER TABLE tms.clientes
      ADD CONSTRAINT clientes_contacto_facturacion_fk
      FOREIGN KEY (contacto_facturacion_id, id)
      REFERENCES tms.cliente_contactos (id, cliente_id)
      NOT VALID;
  END IF;
END
$migration$;

ALTER TABLE tms.cliente_direcciones
  ADD COLUMN IF NOT EXISTS tipo_ubicacion text,
  ADD COLUMN IF NOT EXISTS tipo_zona text;

COMMENT ON COLUMN tms.clientes.domicilio_legal_calle IS 'Domicilio legal/fiscal o matriz; separado de las ubicaciones operativas.';
COMMENT ON COLUMN tms.clientes.canal_registro IS 'Canal por el que llegó el cliente; catálogo por confirmar.';
COMMENT ON COLUMN tms.clientes.motivo_registro IS 'Motivo de alta capturado por el equipo comercial.';
COMMENT ON COLUMN tms.clientes.servicios_acordados IS 'Servicios acordados, por ejemplo IMPORTACION y EXPORTACION.';
COMMENT ON COLUMN tms.clientes.regimen_fiscal IS 'Régimen fiscal del receptor según la constancia fiscal; valor a confirmar con el cliente.';
COMMENT ON COLUMN tms.clientes.contacto_facturacion_id IS 'Contacto elegido para comunicaciones de facturación.';
COMMENT ON COLUMN tms.cliente_direcciones.tipo_ubicacion IS 'Clasificación operativa libre: sucursal, planta, almacén u otro.';
COMMENT ON COLUMN tms.cliente_direcciones.tipo_zona IS 'Tipo de zona de la ubicación; valor libre hasta acordar catálogo.';

COMMIT;
