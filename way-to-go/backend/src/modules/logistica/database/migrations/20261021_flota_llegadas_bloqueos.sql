-- Aplicar manualmente una sola vez sobre el esquema TMS existente.
-- Registra ubicación WTG y auditoría de llegadas, bloqueos y liberaciones.
BEGIN;

CREATE TABLE tms.ubicacion_wtg (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  direccion text NOT NULL CHECK (btrim(direccion) <> ''),
  latitud numeric(9,6) NOT NULL CHECK (latitud BETWEEN -90 AND 90),
  longitud numeric(9,6) NOT NULL CHECK (longitud BETWEEN -180 AND 180),
  actualizado_por uuid NOT NULL REFERENCES tms.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tms.unidad_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unidad_id uuid NOT NULL REFERENCES tms.unidades(id),
  tipo text NOT NULL CHECK (tipo IN ('LLEGADA','BLOQUEO','LIBERACION')),
  ocurrido_at timestamptz NOT NULL DEFAULT now(),
  registrado_por uuid NOT NULL REFERENCES tms.usuarios(id),
  motivo text CHECK (motivo IS NULL OR btrim(motivo) <> ''),
  relacionado_id uuid REFERENCES tms.unidad_eventos(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((tipo = 'BLOQUEO' AND motivo IS NOT NULL AND relacionado_id IS NULL)
      OR (tipo = 'LIBERACION' AND relacionado_id IS NOT NULL)
      OR (tipo = 'LLEGADA' AND motivo IS NULL AND relacionado_id IS NULL))
);

CREATE INDEX ix_unidad_eventos_unidad_fecha ON tms.unidad_eventos(unidad_id, ocurrido_at DESC);

INSERT INTO tms.permisos(codigo, descripcion) VALUES
  ('flota.ver','Consultar unidades, disponibilidad y calendario de flota'),
  ('flota.editar','Registrar llegadas y operar bloqueos de mantenimiento de flota')
ON CONFLICT(codigo) DO NOTHING;

COMMIT;
