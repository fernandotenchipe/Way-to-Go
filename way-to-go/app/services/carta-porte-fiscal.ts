export type CartaPorteFiscalScenario = 'SERVICIO_TRANSPORTE' | 'TRASLADO_BIENES_PROPIOS';

export interface CreateTripCartaPorteFiscalInput {
  empresa_emisora_id: string;
  tipo_comprobante: 'I' | 'T';
  escenario_fiscal: CartaPorteFiscalScenario;
  mercancias_propias?: true;
  datos_qa?: boolean;
}

/** Resolves only from the user's explicit scenario; fleet ownership is never consulted. */
export function resolveTripCartaPorteFiscalSelection(
  scenario: CartaPorteFiscalScenario | '',
  ownGoodsConfirmed: boolean,
): Omit<CreateTripCartaPorteFiscalInput, 'empresa_emisora_id'> {
  if (!scenario) throw new Error('Selecciona explícitamente el escenario fiscal.');
  if (scenario === 'TRASLADO_BIENES_PROPIOS' && !ownGoodsConfirmed) {
    throw new Error('Confirma expresamente que las mercancías son propiedad del emisor para continuar con un CFDI tipo T.');
  }
  return {
    tipo_comprobante: scenario === 'SERVICIO_TRANSPORTE' ? 'I' : 'T',
    escenario_fiscal: scenario,
    ...(scenario === 'TRASLADO_BIENES_PROPIOS' ? { mercancias_propias: true as const } : {}),
  };
}

/** Builds the backend request after the explicit selection has been validated. */
export function buildTripCartaPorteFiscalInput(
  issuerId: string,
  scenario: CartaPorteFiscalScenario | '',
  ownGoodsConfirmed: boolean,
  datosQa = false,
): CreateTripCartaPorteFiscalInput {
  if (!issuerId) throw new Error('Selecciona una empresa emisora activa.');
  return { empresa_emisora_id: issuerId, ...resolveTripCartaPorteFiscalSelection(scenario, ownGoodsConfirmed), ...(datosQa ? { datos_qa: true } : {}) };
}
