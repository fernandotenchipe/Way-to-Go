import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fiscalScenarios, resolveFiscalScenario, validateFiscalCreation, validateFiscalModel, validateCfdiCatalogKeys } from '../../../backend/src/modules/logistica/services/carta-porte-fiscal.js';

const ownTransfer = () => ({
  cfdi:{tipo_comprobante:'T',total:'0.000000',forma_pago_sat:null,metodo_pago_sat:null,
    emisor_snapshot:{rfc:'AAA010101AAA'},receptor_snapshot:{rfc:'AAA010101AAA'}},
  merchandise:[{bienes_transp_sat:'11121600'}],
  concepts:[{id:'c1',clave_producto_servicio_sat:'11121600',objeto_impuesto_sat:'01',cantidad:'1.000000',valor_unitario:'0.000000',importe:'0.000000',descuento:null}],
  taxes:[],
});

test('El servicio de transporte facturado requiere escenario explícito y CFDI I',()=>{
  assert.deepEqual(resolveFiscalScenario({tipoComprobante:'I',escenarioFiscal:fiscalScenarios.TRANSPORT_SERVICE}),{escenario:fiscalScenarios.TRANSPORT_SERVICE,inferidoDeTipoExplicito:false});
  assert.throws(()=>resolveFiscalScenario({tipoComprobante:'I'}),e=>e.code==='FISCAL_SCENARIO_TYPE_MISMATCH');
  assert.throws(()=>resolveFiscalScenario({tipoComprobante:'I',escenarioFiscal:fiscalScenarios.OWN_GOODS}),e=>e.code==='FISCAL_SCENARIO_TYPE_MISMATCH');
});

test('El traslado tipo T necesita declaración de mercancías propias y no deriva propiedad del vehículo',()=>{
  assert.equal(resolveFiscalScenario({tipoComprobante:'T',escenarioFiscal:fiscalScenarios.OWN_GOODS,mercanciasPropias:true}).escenario,fiscalScenarios.OWN_GOODS);
  assert.throws(()=>resolveFiscalScenario({tipoComprobante:'T',escenarioFiscal:fiscalScenarios.OWN_GOODS,mercanciasPropias:false}),e=>e.code==='OWN_GOODS_DECLARATION_REQUIRED');
  assert.throws(()=>resolveFiscalScenario({tipoComprobante:'T',escenarioFiscal:fiscalScenarios.TRANSPORT_SERVICE,mercanciasPropias:true}),e=>e.code==='OWN_GOODS_DECLARATION_REQUIRED');
});

test('La creación solo permite T con bienes declarados propios, medios propios y RFC coincidente',()=>{
  const context={tipoComprobante:'T',escenarioFiscal:fiscalScenarios.OWN_GOODS,mercanciasPropias:true,
    trip:{unidad_id:'unit-1',proveedor_id:null},issuer:{rfc:'AAA010101AAA'},customer:{rfc:'AAA010101AAA'}};
  assert.equal(validateFiscalCreation(context).escenario,fiscalScenarios.OWN_GOODS);
  assert.throws(()=>validateFiscalCreation({...context,trip:{unidad_id:null,proveedor_id:null}}),e=>e.code==='OWN_MEANS_REQUIRED');
  assert.throws(()=>validateFiscalCreation({...context,trip:{unidad_id:'unit-1',proveedor_id:'provider-1'}}),e=>e.code==='OWN_MEANS_REQUIRED');
  assert.throws(()=>validateFiscalCreation({...context,customer:{rfc:'BBB010101BBB'}}),e=>e.code==='TRANSFER_RFC_MISMATCH');
});

test('La creación del servicio facturado usa CFDI I sin confundir flota propia con mercancías propias',()=>{
  const result=validateFiscalCreation({tipoComprobante:'I',escenarioFiscal:fiscalScenarios.TRANSPORT_SERVICE,
    trip:{unidad_id:'unit-1',proveedor_id:null},issuer:{rfc:'AAA010101AAA'},customer:{rfc:'BBB010101BBB'}});
  assert.equal(result.escenario,fiscalScenarios.TRANSPORT_SERVICE);
});

test('El escenario local sin complemento no se convierte silenciosamente en Carta Porte',()=>{
  assert.throws(()=>resolveFiscalScenario({tipoComprobante:'I',escenarioFiscal:fiscalScenarios.LOCAL_NO_COMPLEMENT}),e=>e.code==='CARTA_PORTE_NOT_REQUIRED');
});

test('El CFDI T acepta el caso de bienes propios sin contraprestación',()=>{
  assert.deepEqual(validateFiscalModel(ownTransfer(),{scenario:fiscalScenarios.OWN_GOODS,mercanciasPropias:true,mediosPropios:true}).errors,[]);
});

test('El CFDI T rechaza RFC distinto, total distinto de cero, pagos, impuestos y concepto no relacionado',()=>{
  const base=ownTransfer();
  for(const [mutate,code] of [
    [d=>{d.cfdi.receptor_snapshot.rfc='BBB010101BBB';},'TRANSFER_RFC_MISMATCH'],
    [d=>{d.cfdi.total='1.000000';},'TRANSFER_TOTAL_NOT_ZERO'],
    [d=>{d.cfdi.forma_pago_sat='03';},'PAYMENT_FIELDS_NOT_ALLOWED'],
    [d=>{d.cfdi.metodo_pago_sat='PUE';},'PAYMENT_FIELDS_NOT_ALLOWED'],
    [d=>{d.concepts[0].clave_producto_servicio_sat='99999999';},'TRANSFER_CONCEPT_MISMATCH'],
    [d=>{d.taxes.push({id:'tax1',concepto_id:'c1',movimiento:'TRASLADO'});},'TAXES_NOT_ALLOWED_FOR_TRANSFER'],
  ]){
    const data=structuredClone(base);mutate(data);
    assert.ok(validateFiscalModel(data,{scenario:fiscalScenarios.OWN_GOODS,mercanciasPropias:true,mediosPropios:true}).errors.some(error=>error.code===code),code);
  }
});

test('El CFDI I de servicio exige datos fiscales y detalle de impuestos cuando el concepto es objeto',()=>{
  const data={cfdi:{tipo_comprobante:'I',total:'100.000000',forma_pago_sat:'99',metodo_pago_sat:'PPD'},concepts:[{id:'c1',objeto_impuesto_sat:'02'}],taxes:[]};
  assert.ok(validateFiscalModel(data,{scenario:fiscalScenarios.TRANSPORT_SERVICE}).errors.some(error=>error.code==='TAX_DETAIL_REQUIRED'));
  data.taxes=[{concepto_id:'c1'}];
  assert.ok(!validateFiscalModel(data,{scenario:fiscalScenarios.TRANSPORT_SERVICE}).errors.some(error=>error.code==='TAX_DETAIL_REQUIRED'));
});

test('El CFDI I detecta importes de concepto y total que no cuadran',()=>{
  const data={cfdi:{tipo_comprobante:'I',total:'120.000000',subtotal:'100.000000',descuento:'0.000000',impuestos_trasladados:'16.000000',impuestos_retenidos:'0.000000',forma_pago_sat:'03',metodo_pago_sat:'PUE'},
    concepts:[{id:'c1',cantidad:'1.000000',valor_unitario:'100.000000',importe:'99.000000',objeto_impuesto_sat:'01'}],taxes:[]};
  const codes=validateFiscalModel(data,{scenario:fiscalScenarios.TRANSPORT_SERVICE}).errors.map(error=>error.code);
  assert.ok(codes.includes('CONCEPT_AMOUNT_MISMATCH'));
  assert.ok(codes.includes('TOTAL_MISMATCH'));
});

test('La tasa/cuota debe estar vigente en SAT y corresponder al impuesto y movimiento',async()=>{
  const provider={listCatalogs:async()=>[{catalogo:'c_Impuesto'},{catalogo:'c_TipoFactor'},{catalogo:'c_TasaOCuota'}],
    getByKey:async(_catalog,key)=>({clave:key}),search:async()=>({resultados:[
      {clave_contexto:{Impuesto:'IVA',Factor:'Tasa','Traslado':'Sí','Retención':'No','Rango o fijo':'Fijo','Valor mínimo':null,'Valor máximo':'0.16'}},
      {clave_contexto:{Impuesto:'IVA',Factor:'Tasa','Traslado':'No','Retención':'Sí','Rango o fijo':'Rango','Valor mínimo':'0.0','Valor máximo':'0.16'}},
    ]})};
  const data={cfdi:{fecha_expedicion:'2026-11-12'},taxes:[
    {impuesto_sat:'002',tipo_factor_sat:'Tasa',movimiento:'TRASLADO',tasa_cuota:'0.16'},
    {impuesto_sat:'002',tipo_factor_sat:'Tasa',movimiento:'RETENCION',tasa_cuota:'0.04'},
    {impuesto_sat:'002',tipo_factor_sat:'Tasa',movimiento:'RETENCION',tasa_cuota:'0.17'},
  ]};
  const errors=await validateCfdiCatalogKeys(data,provider);
  assert.deepEqual(errors.map(error=>[error.path,error.code]),[['taxes[2].tasa_cuota','INVALID_SAT_TAX_RATE']]);
});

test('Se validan las claves de concepto CFDI contra los catálogos vigentes',async()=>{
  const catalogs=['c_UsoCFDI','c_Exportacion','c_Moneda','c_FormaPago','c_MetodoPago','c_RegimenFiscal','c_ClaveProdServ','c_ClaveUnidad','c_ObjetoImp','c_Impuesto','c_TipoFactor'];
  const provider={listCatalogs:async()=>catalogs.map(catalogo=>({catalogo})),getByKey:async(_catalog,key)=>key==='INVALID'?null:{clave:key}};
  const data={cfdi:{fecha_expedicion:'2026-11-11T10:00:00Z',uso_cfdi_sat:'S01',exportacion_sat:'01',moneda:'XXX',forma_pago_sat:null,metodo_pago_sat:null,emisor_snapshot:{regimen_fiscal_sat:'601'},receptor_snapshot:{regimen_fiscal_sat:'601'}},concepts:[{clave_producto_servicio_sat:'INVALID',clave_unidad_sat:'H87',objeto_impuesto_sat:'01'}],taxes:[]};
  const errors=await validateCfdiCatalogKeys(data,provider);
  assert.equal(errors.length,1);
  assert.equal(errors[0].code,'INVALID_SAT_KEY');
  assert.equal(errors[0].path,'concepts[0].clave_producto_servicio_sat');
});

test('El concepto de CFDI tipo T se valida con c_ClaveProdServCP',async()=>{
  const calls=[];
  const catalogs=['c_UsoCFDI','c_Exportacion','c_Moneda','c_RegimenFiscal','c_ClaveProdServCP','c_ClaveUnidad','c_ObjetoImp'];
  const provider={listCatalogs:async()=>catalogs.map(catalogo=>({catalogo})),getByKey:async(catalog,key)=>{calls.push([catalog,key]);return {clave:key};}};
  const data={cfdi:{tipo_comprobante:'T',fecha_expedicion:'2026-11-11T10:00:00Z',uso_cfdi_sat:'S01',exportacion_sat:'01',moneda:'MXN',
    emisor_snapshot:{regimen_fiscal_sat:'601'},receptor_snapshot:{regimen_fiscal_sat:'601'}},
    concepts:[{clave_producto_servicio_sat:'10101500',clave_unidad_sat:'H87',objeto_impuesto_sat:'01'}],taxes:[]};
  assert.deepEqual(await validateCfdiCatalogKeys(data,provider),[]);
  assert.ok(calls.some(([catalog,key])=>catalog==='c_ClaveProdServCP'&&key==='10101500'));
});

test('La validación previa comprueba catálogos SAT propios de Carta Porte',async()=>{
  const catalogs=['c_ClaveProdServCP','c_ClaveUnidad','c_MaterialPeligroso','c_TipoEmbalaje','c_ConfigAutotransporte','c_TipoPermiso','c_FiguraTransporte'];
  const provider={listCatalogs:async()=>catalogs.map(catalogo=>({catalogo})),getByKey:async(catalog,key)=>key==='INVALID'?null:{catalogo:catalog,clave:key}};
  const data={cfdi:{tipo_comprobante:'I',fecha_expedicion:'2026-11-11T10:00:00Z'},
    merchandise:[{bienes_transp_sat:'11121600',clave_unidad_sat:'H87',clave_material_peligroso_sat:'INVALID',embalaje_sat:'1A1'}],
    transport:[{configuracion_vehicular_sat:'C2',permiso_sict_sat:'TPAF01'}],figures:[{tipo_figura_sat:'01'}]};
  const errors=await validateCfdiCatalogKeys(data,provider);
  assert.deepEqual(errors.map(({path,code})=>({path,code})),[
    {path:'merchandise[0].clave_material_peligroso_sat',code:'INVALID_SAT_KEY'},
  ]);
});

test('La falta de fecha no oculta claves SAT inexistentes en la validación preliminar',async()=>{
  const catalogs=['c_ClaveProdServ'];
  const calls=[];
  const provider={listCatalogs:async()=>catalogs.map(catalogo=>({catalogo})),getByKey:async(catalog,key,options)=>{calls.push({catalog,key,options});return null;}};
  const errors=await validateCfdiCatalogKeys({cfdi:{},concepts:[{clave_producto_servicio_sat:'INVALID'}]},provider);
  assert.equal(errors[0]?.code,'INVALID_SAT_KEY');
  assert.deepEqual(calls[0].options,{vigente:false});
});

test('Los datos QA generan advertencia diferenciada de errores fiscales',()=>{
  const result=validateFiscalModel(ownTransfer(),{scenario:fiscalScenarios.OWN_GOODS,mercanciasPropias:true,mediosPropios:true,qaDeclared:true});
  assert.deepEqual(result.errors,[]);
  assert.ok(result.warnings.some(warning=>warning.category==='QA'));
});
