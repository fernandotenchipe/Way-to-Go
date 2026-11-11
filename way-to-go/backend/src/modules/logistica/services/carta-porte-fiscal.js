import { reject, decimal, multiplyDecimal } from './carta-porte-input.js';

export const fiscalScenarios = Object.freeze({
  TRANSPORT_SERVICE: 'SERVICIO_TRANSPORTE',
  OWN_GOODS: 'TRASLADO_BIENES_PROPIOS',
  LOCAL_NO_COMPLEMENT: 'SERVICIO_LOCAL_SIN_CARTA_PORTE',
});

/** Resolve an explicit CFDI scenario without deriving goods ownership from fleet modality. */
export function resolveFiscalScenario({ tipoComprobante, escenarioFiscal, mercanciasPropias }) {
  if (!['I', 'T'].includes(tipoComprobante)) reject(400, 'INVALID_INVOICE_TYPE', 'Selecciona CFDI tipo I o T');
  if (escenarioFiscal && !Object.values(fiscalScenarios).includes(escenarioFiscal)) {
    reject(400, 'INVALID_FISCAL_SCENARIO', 'Escenario fiscal no reconocido');
  }
  if (escenarioFiscal === fiscalScenarios.LOCAL_NO_COMPLEMENT) {
    reject(409, 'CARTA_PORTE_NOT_REQUIRED', 'El escenario indica que no corresponde Carta Porte; utiliza el flujo de CFDI sin complemento');
  }
  if (tipoComprobante === 'I') {
    if (escenarioFiscal !== fiscalScenarios.TRANSPORT_SERVICE) {
      reject(422, 'FISCAL_SCENARIO_TYPE_MISMATCH', 'Un servicio de transporte facturado requiere CFDI tipo I');
    }
    return { escenario: fiscalScenarios.TRANSPORT_SERVICE, inferidoDeTipoExplicito: false };
  }
  if (escenarioFiscal !== fiscalScenarios.OWN_GOODS || mercanciasPropias !== true) {
    reject(422, 'OWN_GOODS_DECLARATION_REQUIRED', 'CFDI tipo T requiere declarar TRASLADO_BIENES_PROPIOS y mercancias_propias=true');
  }
  return { escenario: fiscalScenarios.OWN_GOODS, inferidoDeTipoExplicito: false };
}

export function validateFiscalCreation({ tipoComprobante, escenarioFiscal, mercanciasPropias, trip, issuer, customer }) {
  const scenario=resolveFiscalScenario({tipoComprobante,escenarioFiscal,mercanciasPropias});
  if(tipoComprobante==='T') {
    if(trip?.proveedor_id||!trip?.unidad_id)reject(422,'OWN_MEANS_REQUIRED','El traslado tipo T requiere medios propios asignados al viaje; la modalidad de la unidad no acredita propiedad de las mercancías');
    if(!issuer?.rfc||issuer.rfc!==customer?.rfc)reject(422,'TRANSFER_RFC_MISMATCH','En el CFDI tipo T el RFC emisor y receptor debe ser el mismo');
  }
  return scenario;
}

const nonZero = input => {
  if (input == null || input === '') return false;
  try { return decimal(String(input)) !== 0n; }
  catch { return true; }
};
const asMinor = input => { try { return input==null?null:decimal(String(input)); } catch { return null; } };
const qaText = input => /\b(QA|DEMO|FICTICI[OA]|NO[- ]VALID[OA]|SIN VALIDEZ)\b/i.test(String(input ?? ''));

/** Type-specific checks layered over the existing structural Carta Porte validator. */
export function validateFiscalModel(data, { scenario = null, qaDeclared = false, mercanciasPropias = false, mediosPropios = false } = {}) {
  const errors = [], warnings = [];
  const add = (category, path, code, message) => errors.push({ category, path, code, message });
  const invoice = data.cfdi || {};
  const concepts = data.concepts || [];
  const taxes = data.taxes || [];

  if (invoice.tipo_comprobante === 'I') {
    if (!invoice.forma_pago_sat) add('FISCAL', 'invoice.forma_pago_sat', 'REQUIRED_FOR_INCOME', 'Indica la forma de pago aplicable; cuando no se haya recibido el pago, revisa la clave 99 y el complemento de pagos');
    if (!invoice.metodo_pago_sat) add('FISCAL', 'invoice.metodo_pago_sat', 'REQUIRED_FOR_INCOME', 'CFDI tipo I requiere método de pago');
    if (invoice.total == null) add('FISCAL', 'invoice.total', 'TOTAL_INCOMPLETE', 'Completa los conceptos e impuestos para calcular el total del CFDI tipo I');
    let conceptSum=0n,conceptDiscount=0n,conceptsComplete=concepts.length>0;
    for (const [index, concept] of concepts.entries()) {
      const quantity=asMinor(concept.cantidad),price=asMinor(concept.valor_unitario),amount=asMinor(concept.importe);
      if(quantity===null||price===null||amount===null){conceptsComplete=false;add('FISCAL',`concepts[${index}]`,'CONCEPT_AMOUNT_INCOMPLETE','Completa cantidad, valor unitario e importe del concepto');}
      else {if(quantity<=0n||price<0n)add('FISCAL',`concepts[${index}]`,'INVALID_CONCEPT_AMOUNT','La cantidad debe ser positiva y el valor unitario no puede ser negativo');const expected=multiplyDecimal(String(concept.cantidad),String(concept.valor_unitario));conceptSum+=expected;if(amount!==expected)add('FISCAL',`concepts[${index}].importe`,'CONCEPT_AMOUNT_MISMATCH','El importe del concepto no coincide con cantidad por valor unitario');}
      if(concept.descuento!=null){const lineDiscount=asMinor(concept.descuento);if(lineDiscount===null)add('FISCAL',`concepts[${index}].descuento`,'INVALID_DISCOUNT','El descuento del concepto no es válido');else {conceptDiscount+=lineDiscount;if(amount!==null&&lineDiscount>amount)add('FISCAL',`concepts[${index}].descuento`,'INVALID_DISCOUNT','El descuento supera al importe del concepto');}}
      if (concept.objeto_impuesto_sat === '01' && taxes.some(tax => tax.concepto_id === concept.id)) {
        add('FISCAL', `concepts[${index}]`, 'TAX_ON_NON_OBJECT', 'Un concepto No objeto de impuesto no debe tener impuestos asociados');
      }
      if (concept.objeto_impuesto_sat === '02' && !taxes.some(tax => tax.concepto_id === concept.id)) {
        add('FISCAL', `concepts[${index}]`, 'TAX_DETAIL_REQUIRED', 'El concepto objeto de impuesto requiere el detalle fiscal aplicable');
      }
    }
    if(conceptsComplete&&asMinor(invoice.subtotal)!==null&&asMinor(invoice.subtotal)!==conceptSum)add('FISCAL','invoice.subtotal','SUBTOTAL_MISMATCH','El subtotal no coincide con la suma de los conceptos');
    let transferSum=0n,withheldSum=0n,taxesComplete=true;
    for(const [index,tax] of taxes.entries()){
      if(!concepts.some(concept=>concept.id===tax.concepto_id))add('FISCAL',`taxes[${index}].concepto_id`,'TAX_CONCEPT_REQUIRED','El impuesto debe estar vinculado a un concepto del CFDI');
      if(!['TRASLADO','RETENCION'].includes(tax.movimiento))add('FISCAL',`taxes[${index}].movimiento`,'INVALID_TAX_MOVEMENT','Indica si el impuesto es traslado o retención');
      let taxAmount=0n;
      if(tax.tipo_factor_sat==='Exento'){
        if(tax.importe!=null)add('FISCAL',`taxes[${index}].importe`,'EXEMPT_AMOUNT_NOT_ALLOWED','Un impuesto exento no lleva importe calculado');
      }else{
        const base=asMinor(tax.base),rate=asMinor(tax.tasa_cuota),amount=asMinor(tax.importe);
        if(base===null||rate===null||amount===null){taxesComplete=false;add('FISCAL',`taxes[${index}]`,'TAX_AMOUNT_INCOMPLETE','Completa base, tasa o cuota e importe del impuesto');}
        else {taxAmount=multiplyDecimal(String(tax.base),String(tax.tasa_cuota));if(amount!==taxAmount)add('FISCAL',`taxes[${index}].importe`,'TAX_AMOUNT_MISMATCH','El importe del impuesto no coincide con base por tasa o cuota');}
      }
      if(tax.movimiento==='TRASLADO')transferSum+=taxAmount;
      else if(tax.movimiento==='RETENCION')withheldSum+=taxAmount;
    }
    const noTaxableConcepts=concepts.length>0&&concepts.every(concept=>concept.objeto_impuesto_sat==='01');
    if((taxes.length>0&&taxesComplete)||noTaxableConcepts){
      const declaredTransfer=asMinor(invoice.impuestos_trasladados),declaredWithheld=asMinor(invoice.impuestos_retenidos);
      if(declaredTransfer===null||declaredTransfer!==transferSum)add('FISCAL','invoice.impuestos_trasladados','TRANSFERRED_TAX_TOTAL_MISMATCH','El total de impuestos trasladados no coincide con su detalle');
      if(declaredWithheld===null||declaredWithheld!==withheldSum)add('FISCAL','invoice.impuestos_retenidos','WITHHELD_TAX_TOTAL_MISMATCH','El total de impuestos retenidos no coincide con su detalle');
    }
    const transfer=asMinor(invoice.impuestos_trasladados),withheld=asMinor(invoice.impuestos_retenidos),discount=asMinor(invoice.descuento),subtotal=asMinor(invoice.subtotal),total=asMinor(invoice.total);
    if(discount!==null&&discount!==conceptDiscount||discount===null&&conceptDiscount!==0n)add('FISCAL','invoice.descuento','DISCOUNT_MISMATCH','El descuento del comprobante no coincide con los descuentos de los conceptos');
    if(total!==null&&(transfer===null||withheld===null||subtotal===null))add('FISCAL','invoice','INCOME_TOTAL_INCOMPLETE','No se puede comprobar el total hasta completar impuestos y subtotal');
    else if(total!==null){const expected=subtotal-(discount??conceptDiscount)+transfer-withheld;if(expected!==total)add('FISCAL','invoice.total','TOTAL_MISMATCH','El total no coincide con subtotal, descuento e impuestos');}
  } else if (invoice.tipo_comprobante === 'T') {
    const issuerRfc = invoice.emisor_snapshot?.rfc;
    const receiverRfc = invoice.receptor_snapshot?.rfc;
    if (!issuerRfc || !receiverRfc || issuerRfc !== receiverRfc) {
      add('FISCAL', 'invoice.receptor_snapshot.rfc', 'TRANSFER_RFC_MISMATCH', 'En el traslado de bienes propios, RFC de emisor y receptor deben coincidir');
    }
    if (scenario !== fiscalScenarios.OWN_GOODS || mercanciasPropias !== true || mediosPropios !== true) {
      add('FISCAL', 'escenario_fiscal', 'OWN_GOODS_SCENARIO_UNDECLARED', 'Falta declaración auditada de mercancías propias y confirmación de medios propios');
    }
    if (invoice.total == null || nonZero(invoice.total)) {
      add('FISCAL', 'invoice.total', 'TRANSFER_TOTAL_NOT_ZERO', 'El CFDI tipo T debe tener total igual a cero');
    }
    if (invoice.forma_pago_sat || invoice.metodo_pago_sat) {
      add('FISCAL', 'invoice', 'PAYMENT_FIELDS_NOT_ALLOWED', 'CFDI tipo T no debe incluir forma ni método de pago');
    }
    if (taxes.length) add('FISCAL', 'taxes', 'TAXES_NOT_ALLOWED_FOR_TRANSFER', 'CFDI tipo T de bienes propios no debe llevar impuestos de una contraprestación');
    const cargoKeys = new Set((data.merchandise || []).map(item => item.bienes_transp_sat).filter(Boolean));
    const conceptKeys = new Set(concepts.map(concept => concept.clave_producto_servicio_sat).filter(Boolean));
    for (const [index, concept] of concepts.entries()) {
      if (!cargoKeys.has(concept.clave_producto_servicio_sat)) {
        add('FISCAL', `concepts[${index}].clave_producto_servicio_sat`, 'TRANSFER_CONCEPT_MISMATCH', 'La clave del concepto de traslado debe identificar una mercancía del complemento');
      }
      if (concept.objeto_impuesto_sat !== '01') {
        add('FISCAL', `concepts[${index}].objeto_impuesto_sat`, 'TRANSFER_TAX_OBJECT', 'Para este traslado QA sin contraprestación, el concepto debe declararse No objeto de impuesto');
      }
      if(asMinor(concept.cantidad)===null||asMinor(concept.cantidad)<=0n||asMinor(concept.valor_unitario)===null||asMinor(concept.importe)===null) add('FISCAL',`concepts[${index}]`,'TRANSFER_CONCEPT_INCOMPLETE','Completa la cantidad, valor unitario e importe cero del concepto de traslado');
      if (nonZero(concept.valor_unitario) || nonZero(concept.importe) || nonZero(concept.descuento)) {
        add('FISCAL', `concepts[${index}]`, 'TRANSFER_CONCEPT_AMOUNT_NOT_ZERO', 'Los conceptos del traslado de bienes propios deben quedar en cero');
      }
    }
    for (const key of cargoKeys) if (!conceptKeys.has(key)) {
      add('FISCAL', 'concepts', 'TRANSFER_CONCEPT_MISSING', `Falta el concepto de traslado para la clave ${key}`);
    }
  } else {
    add('FISCAL', 'invoice.tipo_comprobante', 'INVOICE_TYPE_REQUIRED', 'Tipo de CFDI no reconocido');
  }

  const qaEvidence = qaDeclared || [invoice.emisor_snapshot?.nombre, invoice.receptor_snapshot?.nombre,
    ...(data.figures || []).map(row => row.nombre), ...(data.transport || []).flatMap(row => [row.placas, row.numero_permiso_sict])]
    .some(qaText);
  if (qaEvidence) warnings.push({ category: 'QA', code: 'SYNTHETIC_DATA', message: 'El documento contiene datos QA/ficticios; no es apto para operación fiscal, despacho ni timbrado' });
  if (data.transporte_internacional === true) warnings.push({ category: 'FISCAL', code: 'INTERNATIONAL_RULES_REQUIRE_REVIEW', message: 'El escenario internacional requiere revisar reglas y anexos aduaneros aplicables' });
  return { errors, warnings };
}

/** Validate only keys the backend actually consumes from CFDI 4.0 catalogs. */
export async function validateCfdiCatalogKeys(data, catalogProvider) {
  const errors=[];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data.cfdi?.fecha_expedicion||'').slice(0,10)))return errors;
  const catalogues=await catalogProvider.listCatalogs();
  const known=new Set(catalogues.map(row=>row.catalogo));
  const check=async(catalog,key,path)=>{
    if(!key)return;
    if(!known.has(catalog)){errors.push({category:'FISCAL',path,code:'CFDI_CATALOG_MISSING',message:`No está disponible el catálogo ${catalog}`});return;}
    try {
      const row=await catalogProvider.getByKey(catalog,key,{vigente:true,fecha:String(data.cfdi.fecha_expedicion).slice(0,10)});
      if(!row)errors.push({category:'FISCAL',path,code:'INVALID_SAT_KEY',message:`La clave ${key} no está vigente en ${catalog}`});
    } catch(error) {
      if(error.code==='AMBIGUOUS_KEY') errors.push({category:'FISCAL',path,code:'SAT_KEY_CONTEXT_REQUIRED',message:`La clave ${key} requiere contexto en ${catalog}`});
      else throw error;
    }
  };
  const f=data.cfdi||{};
  for(const [path,catalog,key] of [
    ['invoice.uso_cfdi_sat','c_UsoCFDI',f.uso_cfdi_sat],['invoice.exportacion_sat','c_Exportacion',f.exportacion_sat],
    ['invoice.moneda','c_Moneda',f.moneda],['invoice.forma_pago_sat','c_FormaPago',f.forma_pago_sat],
    ['invoice.metodo_pago_sat','c_MetodoPago',f.metodo_pago_sat],
  ]) await check(catalog,key,path);
  for(const [side,snapshot] of [['emisor',f.emisor_snapshot],['receptor',f.receptor_snapshot]]) await check('c_RegimenFiscal',snapshot?.regimen_fiscal_sat,`invoice.${side}_snapshot.regimen_fiscal_sat`);
  for(const [i,concept] of (data.concepts||[]).entries())for(const [field,catalog,key] of [
    ['clave_producto_servicio_sat','c_ClaveProdServ',concept.clave_producto_servicio_sat],
    ['clave_unidad_sat','c_ClaveUnidad',concept.clave_unidad_sat],['objeto_impuesto_sat','c_ObjetoImp',concept.objeto_impuesto_sat],
  ]) await check(catalog,key,`concepts[${i}].${field}`);
  for(const [i,tax] of (data.taxes||[]).entries())for(const [field,catalog,key] of [
    ['impuesto_sat','c_Impuesto',tax.impuesto_sat],['tipo_factor_sat','c_TipoFactor',tax.tipo_factor_sat],
  ]) await check(catalog,key,`taxes[${i}].${field}`);
  return errors;
}
