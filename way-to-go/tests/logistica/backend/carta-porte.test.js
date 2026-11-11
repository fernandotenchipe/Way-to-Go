import { test } from 'node:test';
import assert from 'node:assert/strict';
import cartaPorteRouter from '../../../backend/src/modules/logistica/routes/carta-porte.js';
import { createCartaPorteService } from '../../../backend/src/modules/logistica/services/carta-porte.js';
import { createFiscalOperations, processFiscalOperation } from '../../../backend/src/modules/logistica/services/carta-porte-operations.js';
import { fields, decimal, formatDecimal, multiplyDecimal } from '../../../backend/src/modules/logistica/services/carta-porte-input.js';
import { validateCartaPorte } from '../../../backend/src/modules/logistica/services/carta-porte-validation.js';
import { createCartaPorteStorage } from '../../../backend/src/modules/logistica/services/carta-porte-storage.js';

const actor='11111111-1111-4111-8111-111111111111';
const cpId='22222222-2222-4222-8222-222222222222';
const documentId='33333333-3333-4333-8333-333333333333';
const operationId='44444444-4444-4444-8444-444444444444';
function mockPool(handler=()=>({rows:[]})) {
  const calls=[];const db={async query(sql,params){calls.push({sql,params});return handler(sql,params);},release(){calls.push({sql:'RELEASE'});}};
  return {calls,query:db.query,connect:async()=>db};
}
async function invoke(method,path,{body={},params={},permission='carta_porte.ver',actorId=actor,pool=mockPool()}={}) {
  const router=cartaPorteRouter({pool});
  const route=router.stack.find(x=>x.route?.path===path&&x.route.methods[method]).route;
  const req={params,body,query:{},get:()=>undefined,user:{id:actorId,permissions:permission?[permission]:[]}};
  const res={statusCode:200,headersSent:false,status(n){this.statusCode=n;return this;},json(value){this.body=value;this.headersSent=true;return this;}};
  for(const layer of route.stack){let next=false;await layer.handle(req,res,()=>{next=true;});if(!next)break;}
  return {res,pool};
}

function aggregateReadPool(auditRows=[]) {
  const invoice={id:documentId,revision:'7',estado:'BORRADOR',origen:'PROPIO',tipo_comprobante:'T',emisor_snapshot:{rfc:'AAA010101AAA'},receptor_snapshot:{rfc:'AAA010101AAA'}};
  const cp={id:cpId,cfdi_id:documentId,viaje_id:'55555555-5555-4555-8555-555555555555'};
  return mockPool(sql=>{
    if(sql.startsWith('SELECT f.*'))return {rows:[invoice]};
    if(sql==='SELECT * FROM tms.cartas_porte WHERE id=$1')return {rows:[cp]};
    if(sql==='SELECT * FROM tms.cfdi WHERE id=$1')return {rows:[invoice]};
    if(sql.includes('FROM tms.cp_auditoria'))return {rows:auditRows};
    if(sql.includes('ORDER BY created_at'))return {rows:[]};
    return {rows:[]};
  });
}

test('GET Carta Porte devuelve el escenario fiscal auditado, sin inferirlo del CFDI tipo T',async()=>{
  const pool=aggregateReadPool([{datos:{escenario_fiscal:'TRASLADO_BIENES_PROPIOS',mercancias_propias:true}}]);
  const data=await createCartaPorteService({pool}).get(cpId);
  assert.equal(data.cfdi.tipo_comprobante,'T');
  assert.equal(data.escenario_fiscal,'TRASLADO_BIENES_PROPIOS');
  assert.equal(data.mercancias_propias,true);
  assert.ok(pool.calls.some(call=>call.sql.includes("datos ? 'escenario_fiscal'")));
});

test('GET /carta-porte/:id expone el escenario fiscal auditado en la respuesta HTTP',async()=>{
  const pool=aggregateReadPool([{datos:{escenario_fiscal:'SERVICIO_TRANSPORTE',mercancias_propias:false}}]);
  const {res}=await invoke('get','/carta-porte/:id',{params:{id:cpId},pool});
  assert.equal(res.statusCode,200);
  assert.equal(res.body.data.escenario_fiscal,'SERVICIO_TRANSPORTE');
  assert.equal(res.body.data.mercancias_propias,false);
});

test('GET Carta Porte devuelve escenario null en borradores legados sin auditoría, aunque sean tipo T',async()=>{
  const data=await createCartaPorteService({pool:aggregateReadPool()}).get(cpId);
  assert.equal(data.cfdi.tipo_comprobante,'T');
  assert.equal(data.escenario_fiscal,null);
  assert.equal(data.mercancias_propias,null);
});

test('GET Carta Porte devuelve escenario null si el valor auditado no es reconocido',async()=>{
  const pool=aggregateReadPool([{datos:JSON.stringify({escenario_fiscal:'INFERIDO',mercancias_propias:true})}]);
  const data=await createCartaPorteService({pool}).get(cpId);
  assert.equal(data.escenario_fiscal,null);
  assert.equal(data.mercancias_propias,null);
});

test('Dinero decimal conserva exactitud y rechaza valores fuera del contrato',()=>{
  assert.equal(formatDecimal(multiplyDecimal('0.1','0.2')),'0.020000');
  assert.equal(formatDecimal(multiplyDecimal('650','17.98')),'11687.000000');
  for(const value of ['1e6','NaN','-2','0.0000001',0.1])assert.throws(()=>decimal(value));
});
test('Entradas no permiten estado fiscal, snapshots ni columnas arbitrarias',()=>{
  assert.throws(()=>fields({estado:'TIMBRADO'},{descripcion:'text'}),e=>e.code==='UNKNOWN_FIELDS');
  assert.throws(()=>fields({domicilio:{password:'secret'}},{domicilio:'address'}));
  assert.throws(()=>fields({descripcion:'   '},{descripcion:'text'},['descripcion']));
});
test('Ni bypass local ni falta de permiso permiten consultar o editar el módulo',async()=>{
  for(const options of [{actorId:'local-dev'},{permission:null}]){
    const {res,pool}=await invoke('get','/carta-porte/catalogs/summary',options);
    assert.equal(res.statusCode,403);assert.equal(pool.calls.length,0);
  }
});
test('Catálogos desconocidos no se interpolan a SQL',async()=>{
  const {res,pool}=await invoke('get','/carta-porte/catalogs/:resource',{permission:'carta_porte.catalogos.ver',params:{resource:'__proto__'}});
  assert.equal(res.statusCode,404);assert.equal(pool.calls.length,0);
});
test('La migración pendiente se informa como 503 sin sustituirla por demostraciones',async()=>{
  const pool=mockPool(()=>{throw Object.assign(new Error('missing'),{code:'42P01'});});
  const {res}=await invoke('get','/carta-porte/catalogs/summary',{pool,permission:'carta_porte.catalogos.ver'});
  assert.equal(res.statusCode,503);assert.equal(res.body.code,'SCHEMA_NOT_READY');
});
test('Editar Flota exige también el permiso propietario y no permite saltarse sus bloqueos',async()=>{
  const {res,pool}=await invoke('post','/carta-porte/catalogs/:resource',{params:{resource:'units'},permission:'carta_porte.catalogos.editar',body:{numero_economico:'DEMO-1',tipo_unidad:'Tracto'}});
  assert.equal(res.statusCode,403);assert.equal(pool.calls.length,0);
  await assert.rejects(()=>createCartaPorteService({pool}).catalogSave('units',cpId,{activo:true,expected_updated_at:'2026-10-21T10:00:00Z'},actor,true),e=>e.code==='USE_FLEET_WORKFLOW');
});
test('El almacenamiento verifica identidad y ruta antes de acceder al disco',async()=>{
  const row={id:cpId,subido_por:actor,storage_path:'../../secret.xml'};
  const storage=createCartaPorteStorage({pool:mockPool(()=>({rows:[row]}))});
  await assert.rejects(()=>storage.read(cpId,{actor:documentId}),e=>e.code==='FILE_FORBIDDEN');
  await assert.rejects(()=>storage.read(cpId,{actor}),e=>e.code==='INVALID_STORAGE_KEY');
});
test('Catálogo guarda registro y auditoría en una misma transacción',async()=>{
  const pool=mockPool(sql=>({rows:sql.startsWith('INSERT INTO tms.mercancias')?[{id:cpId,descripcion:'Autopartes',activo:true}]:[]}));
  const service=createCartaPorteService({pool});
  const result=await service.catalogSave('merchandise',null,{descripcion:'Autopartes'},actor);
  assert.equal(result.descripcion,'Autopartes');
  assert.ok(pool.calls.some(c=>c.sql.startsWith('INSERT INTO tms.cp_auditoria')));
  assert.ok(pool.calls.some(c=>c.sql==='COMMIT'));
});
test('Fallo de auditoría revierte el alta del catálogo',async()=>{
  const pool=mockPool(sql=>{if(sql.includes('INSERT INTO tms.cp_auditoria'))throw new Error('audit failed');return {rows:[{id:cpId,descripcion:'Autopartes'}]};});
  await assert.rejects(()=>createCartaPorteService({pool}).catalogSave('merchandise',null,{descripcion:'Autopartes'},actor));
  assert.ok(pool.calls.some(c=>c.sql==='ROLLBACK'));assert.ok(!pool.calls.some(c=>c.sql==='COMMIT'));
});
test('La empresa emisora no devuelve referencias de secretos',async()=>{
  const pool=mockPool(()=>({rows:[{id:cpId,nombre:'DEMO',csd_secret_ref:'private-vault-reference'}]}));
  const row=await createCartaPorteService({pool}).catalogGet('issuers',cpId);
  assert.ok(!Object.hasOwn(row,'csd_secret_ref'));
});
test('Revisión desactualizada no modifica el documento',async()=>{
  const pool=mockPool(()=>({rows:[{id:documentId,revision:'4',estado:'BORRADOR',origen:'PROPIO'}]}));
  await assert.rejects(()=>createCartaPorteService({pool}).patch(cpId,{expected_revision:'3',header:{orden_compra:'OC-1'}},actor),e=>e.status===409);
  assert.ok(!pool.calls.some(c=>c.sql.startsWith('UPDATE')||c.sql.startsWith('INSERT')));
});
test('Un documento timbrado no admite edición de cabecera',async()=>{
  const pool=mockPool(()=>({rows:[{id:documentId,revision:'4',estado:'TIMBRADO',origen:'PROPIO'}]}));
  await assert.rejects(()=>createCartaPorteService({pool}).patch(cpId,{expected_revision:'4',header:{orden_compra:'OC-1'}},actor),e=>e.code==='DOCUMENT_LOCKED');
});
test('Campos de pertenencia del lote no se aceptan desde el cliente',async()=>{
  const pool=mockPool(()=>({rows:[{id:documentId,revision:'4',estado:'BORRADOR',origen:'PROPIO'}]}));
  await assert.rejects(()=>createCartaPorteService({pool}).group(cpId,'merchandise',{expected_revision:'4',merchandise:{upsert:[{carta_porte_id:actor,descripcion:'Ajeno'}]}},actor),e=>e.code==='UNKNOWN_FIELDS');
  assert.ok(pool.calls.some(c=>c.sql==='ROLLBACK'));
});
test('Editar ubicaciones conserva importes CFDI y partidas existentes',async()=>{
  const original={subtotal:'245.000000',descuento:'5.000000',impuestos_trasladados:'38.400000',impuestos_retenidos:'0.000000',total:'278.400000'};
  const cargo=[{id:actor,posicion:1,descripcion:'Mercancía existente',cantidad:'2.000000',peso_kg:'12.000',bienes_transp_sat:'11121600'}];
  const loc={id:operationId,carta_porte_id:cpId,posicion:1,tipo:'Origen',identificador_sat:'OR000001',participante_id:null,direccion_id:null,
    participante_snapshot:{nombre:'Participante anterior'},domicilio_snapshot:{calle:'Domicilio anterior'},fecha_hora:'2026-10-23T15:00:00Z',zona_horaria:'America/Monterrey',distancia_recorrida_km:'12.50'};
  const cfdi={id:documentId,revision:'7',estado:'BORRADOR',origen:'PROPIO',...original};
  const cp={id:cpId,cfdi_id:documentId,viaje_id:'55555555-5555-4555-8555-555555555555',numero_total_mercancias:1,peso_bruto_total:'12.000'};
  const calls=[];
  const db={async query(sql,params=[]){
    calls.push({sql,params});
    if(sql.startsWith('SELECT f.*'))return {rows:[cfdi]};
    if(sql==='SELECT * FROM tms.cartas_porte WHERE id=$1')return {rows:[cp]};
    if(sql==='SELECT * FROM tms.cfdi WHERE id=$1')return {rows:[cfdi]};
    if(sql.includes('FROM tms.cp_ubicaciones')&&sql.includes('AND id=$2'))return {rows:[loc]};
    if(sql.includes('FROM tms.cp_ubicaciones')&&sql.includes('ORDER BY created_at'))return {rows:[loc]};
    if(sql.includes('FROM tms.cp_mercancias')&&sql.includes('ORDER BY created_at'))return {rows:cargo};
    if(sql.startsWith('UPDATE tms.cp_ubicaciones'))return {rows:[loc]};
    if(sql.startsWith('INSERT INTO tms.cp_auditoria'))return {rows:[{}]};
    if(sql.startsWith('UPDATE'))return {rows:[{}]};
    return {rows:[]};
  },release(){}};
  const pool={query:db.query,connect:async()=>db};
  const result=await createCartaPorteService({pool}).group(cpId,'locations',{expected_revision:'7',locations:{upsert:[{
    id:operationId,posicion:1,tipo:'Origen',identificador_sat:'OR000001',fecha_hora:loc.fecha_hora,zona_horaria:loc.zona_horaria,
  }],remove:[]}},actor);
  assert.deepEqual(result.cfdi&&Object.fromEntries(Object.keys(original).map(k=>[k,result.cfdi[k]])),original);
  assert.deepEqual(result.merchandise,cargo);
  assert.equal(result.locations[0].id,loc.id);assert.equal(result.locations[0].posicion,loc.posicion);
  assert.equal(result.locations[0].fecha_hora,loc.fecha_hora);assert.equal(result.locations[0].identificador_sat,loc.identificador_sat);
  assert.deepEqual(Object.fromEntries(Object.keys(original).map(k=>[k,cfdi[k]])),original);
  assert.deepEqual(cargo,[{id:actor,posicion:1,descripcion:'Mercancía existente',cantidad:'2.000000',peso_kg:'12.000',bienes_transp_sat:'11121600'}]);
  assert.ok(!calls.some(c=>/^(UPDATE|SELECT) tms\.(cfdi|cfdi_conceptos|cfdi_impuestos|cp_mercancias)\b/.test(c.sql)));
  assert.ok(calls.some(c=>c.sql.startsWith('INSERT INTO tms.cp_auditoria')));
  assert.ok(calls.some(c=>c.sql==='COMMIT'));
});
test('Editar transporte y figuras no recalcula ni toca importes CFDI',async()=>{
  const cfdi={id:documentId,revision:'7',estado:'BORRADOR',origen:'PROPIO',subtotal:'245.000000',descuento:null,impuestos_trasladados:null,impuestos_retenidos:null,total:null};
  const calls=[];
  const db={async query(sql,params=[]){calls.push({sql,params});
    if(sql.startsWith('SELECT f.*'))return {rows:[cfdi]};
    if(sql==='SELECT * FROM tms.cartas_porte WHERE id=$1')return {rows:[{id:cpId,cfdi_id:documentId}]};
    if(sql==='SELECT * FROM tms.cfdi WHERE id=$1')return {rows:[cfdi]};
    if(sql.startsWith('INSERT INTO tms.cp_auditoria'))return {rows:[{}]};
    return {rows:[]};
  },release(){}};
  await createCartaPorteService({pool:{query:db.query,connect:async()=>db}}).group(cpId,'transport',{
    expected_revision:'7',transport:{upsert:[],remove:[]},trailers:{upsert:[],remove:[]},figures:{upsert:[],remove:[]},parts:{upsert:[],remove:[]},
  },actor);
  assert.ok(!calls.some(c=>/^(UPDATE|SELECT) tms\.(cfdi|cfdi_conceptos|cfdi_impuestos)\b/.test(c.sql)));
  assert.deepEqual(Object.fromEntries(['subtotal','descuento','impuestos_trasladados','impuestos_retenidos','total'].map(k=>[k,cfdi[k]])),
    {subtotal:'245.000000',descuento:null,impuestos_trasladados:null,impuestos_retenidos:null,total:null});
});
test('Editar conceptos e impuestos recalcula importes CFDI cuando los datos están completos',async()=>{
  const concept={id:actor,cfdi_id:documentId,posicion:1,descripcion:'Flete',cantidad:'2.000000',valor_unitario:'100.000000',descuento:'10.000000',importe:'200.000000'};
  const tax={id:operationId,cfdi_id:documentId,concepto_id:actor,movimiento:'TRASLADO',tipo_factor_sat:'Tasa',base:'190.000000',tasa_cuota:'0.160000',importe:'30.400000'};
  const cfdi={id:documentId,revision:'7',estado:'BORRADOR',origen:'PROPIO',subtotal:'200.000000',descuento:'10.000000',impuestos_trasladados:'30.400000',impuestos_retenidos:'10.000000',total:'210.400000'};
  const calls=[];
  const db={async query(sql,params=[]){
    calls.push({sql,params});
    if(sql.startsWith('SELECT f.*'))return {rows:[cfdi]};
    if(sql.includes('FROM tms.cfdi_conceptos')&&sql.includes('AND id=$2'))return {rows:[concept]};
    if(sql.includes('FROM tms.cfdi_impuestos')&&sql.includes('AND id=$2'))return {rows:[tax]};
    if(sql==='SELECT * FROM tms.cartas_porte WHERE id=$1')return {rows:[{id:cpId,cfdi_id:documentId}]};
    if(sql==='SELECT * FROM tms.cfdi WHERE id=$1')return {rows:[cfdi]};
    if(sql.includes('FROM tms.cfdi_conceptos')&&sql.includes('ORDER BY created_at'))return {rows:[concept]};
    if(sql.includes('FROM tms.cfdi_impuestos')&&sql.includes('ORDER BY created_at'))return {rows:[tax]};
    if(sql==='SELECT * FROM tms.cfdi_conceptos WHERE cfdi_id=$1')return {rows:[concept]};
    if(sql==='SELECT * FROM tms.cfdi_impuestos WHERE cfdi_id=$1')return {rows:[tax]};
    if(sql.includes('SELECT subtotal,descuento,impuestos_trasladados,impuestos_retenidos'))return {rows:[cfdi]};
    if(sql.startsWith('INSERT INTO tms.cp_auditoria'))return {rows:[{}]};
    if(sql.startsWith('UPDATE'))return {rows:[{}]};
    return {rows:[]};
  },release(){}};
  const pool={query:db.query,connect:async()=>db};
  const conceptInput={...concept};delete conceptInput.cfdi_id;delete conceptInput.importe;
  const taxInput={...tax};delete taxInput.cfdi_id;delete taxInput.importe;
  await createCartaPorteService({pool}).group(cpId,'invoice-items',{expected_revision:'7',concepts:{upsert:[conceptInput],remove:[]},taxes:{upsert:[taxInput],remove:[]}},actor);
  const cfdiUpdate=calls.find(c=>c.sql.startsWith('UPDATE tms.cfdi SET'));
  assert.ok(cfdiUpdate);
  assert.deepEqual(cfdiUpdate.params.slice(1),['200.000000','10.000000','30.400000','0.000000','220.400000']);
  assert.ok(calls.some(c=>c.sql.startsWith('UPDATE tms.cfdi_conceptos SET importe=')));
  assert.ok(calls.some(c=>c.sql.startsWith('UPDATE tms.cfdi_impuestos SET importe=')));
  assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE tms.cartas_porte SET numero_total_mercancias=')));
});
test('Editar mercancías recalcula solo número y peso total de carga',async()=>{
  const item={id:actor,carta_porte_id:cpId,posicion:1,descripcion:'Madera',cantidad:'2.000000',peso_kg:'35.000',bienes_transp_sat:'11121600'};
  const itemInput={...item};delete itemInput.carta_porte_id;
  const cfdi={id:documentId,revision:'7',estado:'BORRADOR',origen:'PROPIO',subtotal:'90.000000',descuento:'0.000000',impuestos_trasladados:'14.400000',impuestos_retenidos:'0.000000',total:'104.400000'};
  const calls=[];
  const db={async query(sql,params=[]){calls.push({sql,params});
    if(sql.startsWith('SELECT f.*'))return {rows:[cfdi]};
    if(sql.includes('WITH requested AS'))return {rows:[{field:'bienes_transp_sat',catalog:'c_ClaveProdServCP',sat_key:'11121600',item_index:0,version_ready:true,catalog_ready:true,key_valid:true,descripcion:'Madera'}]};
    if(sql.includes('FROM tms.cp_mercancias')&&sql.includes('AND id=$2'))return {rows:[item]};
    if(sql==='SELECT count(*)::int AS count, sum(peso_kg) AS weight FROM tms.cp_mercancias WHERE carta_porte_id=$1')return {rows:[{count:2,weight:'45.000'}]};
    if(sql==='SELECT * FROM tms.cartas_porte WHERE id=$1')return {rows:[{id:cpId,cfdi_id:documentId}]};
    if(sql==='SELECT * FROM tms.cfdi WHERE id=$1')return {rows:[cfdi]};
    if(sql.includes('FROM tms.cp_mercancias')&&sql.includes('ORDER BY created_at'))return {rows:[item]};
    if(sql.startsWith('INSERT INTO tms.cp_auditoria'))return {rows:[{}]};
    if(sql.startsWith('UPDATE'))return {rows:[{}]};
    return {rows:[]};
  },release(){}};
  await createCartaPorteService({pool:{query:db.query,connect:async()=>db}}).group(cpId,'merchandise',{
    expected_revision:'7',merchandise:{upsert:[itemInput],remove:[]},sanitary:{upsert:[],remove:[]},
  },actor);
  const cargoTotals=calls.find(c=>c.sql.startsWith('UPDATE tms.cartas_porte SET numero_total_mercancias='));
  assert.ok(cargoTotals);assert.deepEqual(cargoTotals.params.slice(1),[2,'45.000']);
  assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE tms.cfdi')));
});
test('PUT de mercancías rechaza claves Carta Porte inválidas antes de escribir',async()=>{
  const cfdi={id:documentId,revision:'7',estado:'BORRADOR',origen:'PROPIO'};
  const calls=[];
  const db={async query(sql,params=[]){calls.push({sql,params});
    if(sql.startsWith('SELECT f.*'))return {rows:[cfdi]};
    if(sql.includes('WITH requested AS'))return {rows:[{field:'bienes_transp_sat',catalog:'c_ClaveProdServCP',sat_key:'NO_EXISTE',item_index:0,version_ready:true,catalog_ready:true,key_valid:false,descripcion:'Clave desconocida'}]};
    return {rows:[]};
  },release(){}};
  const pool={query:db.query,connect:async()=>db};
  await assert.rejects(()=>createCartaPorteService({pool}).group(cpId,'merchandise',{
    expected_revision:'7',merchandise:{upsert:[{posicion:1,descripcion:'Carga QA',cantidad:'1.000000',peso_kg:'2.000',bienes_transp_sat:'NO_EXISTE'}],remove:[]},
  },actor),error=>error.code==='INVALID_SAT_KEY');
  assert.ok(!calls.some(call=>call.sql.startsWith('INSERT INTO tms.cp_mercancias')||call.sql.startsWith('UPDATE tms.cp_mercancias')));
  assert.ok(calls.some(call=>call.sql==='ROLLBACK'));
});
test('Recalcular un borrador sin conceptos conserva importes NULL',async()=>{
  const cfdi={id:documentId,revision:'7',estado:'BORRADOR',origen:'PROPIO',subtotal:null,descuento:null,impuestos_trasladados:null,impuestos_retenidos:null,total:null};
  const calls=[];
  const db={async query(sql,params=[]){calls.push({sql,params});
    if(sql.startsWith('SELECT f.*'))return {rows:[cfdi]};
    if(sql==='SELECT * FROM tms.cartas_porte WHERE id=$1')return {rows:[{id:cpId,cfdi_id:documentId}]};
    if(sql==='SELECT * FROM tms.cfdi WHERE id=$1')return {rows:[cfdi]};
    if(sql==='SELECT * FROM tms.cfdi_conceptos WHERE cfdi_id=$1'||sql==='SELECT * FROM tms.cfdi_impuestos WHERE cfdi_id=$1')return {rows:[]};
    if(sql.startsWith('INSERT INTO tms.cp_auditoria'))return {rows:[{}]};
    return {rows:[]};
  },release(){}};
  await createCartaPorteService({pool:{query:db.query,connect:async()=>db}}).group(cpId,'invoice-items',{
    expected_revision:'7',concepts:{upsert:[],remove:[]},taxes:{upsert:[],remove:[]},relations:{upsert:[],remove:[]},
  },actor);
  assert.deepEqual(Object.fromEntries(['subtotal','descuento','impuestos_trasladados','impuestos_retenidos','total'].map(k=>[k,cfdi[k]])),
    {subtotal:null,descuento:null,impuestos_trasladados:null,impuestos_retenidos:null,total:null});
  assert.ok(!calls.some(c=>c.sql.startsWith('UPDATE tms.cfdi SET')));
});

test('El recálculo del CFDI T fija subtotal y total en cero solo desde conceptos de traslado',async()=>{
  const cfdi={id:documentId,revision:'7',estado:'BORRADOR',origen:'PROPIO',tipo_comprobante:'T',subtotal:null,total:'0.000000'};
  const concept={id:actor,cfdi_id:documentId,posicion:1,descripcion:'Madera',clave_producto_servicio_sat:'11121600',clave_unidad_sat:'H87',objeto_impuesto_sat:'01',cantidad:'1.000000',valor_unitario:'0.000000',descuento:null,importe:null};
  const cargo={bienes_transp_sat:'11121600'};const calls=[];
  const db={async query(sql,params=[]){calls.push({sql,params});
    if(sql.startsWith('SELECT f.*'))return {rows:[cfdi]};
    if(sql==='SELECT tipo_comprobante FROM tms.cfdi WHERE id=$1')return {rows:[{tipo_comprobante:'T'}]};
    if(sql==='SELECT * FROM tms.cfdi_conceptos WHERE cfdi_id=$1')return {rows:[concept]};
    if(sql.includes('SELECT id FROM tms.cfdi_impuestos'))return {rows:[]};
    if(sql.includes('SELECT bienes_transp_sat FROM tms.cp_mercancias'))return {rows:[cargo]};
    if(sql==='SELECT * FROM tms.cartas_porte WHERE id=$1')return {rows:[{id:cpId,cfdi_id:documentId,viaje_id:actor}]};
    if(sql==='SELECT * FROM tms.cfdi WHERE id=$1')return {rows:[cfdi]};
    if(sql.includes('ORDER BY created_at'))return {rows:[]};
    if(sql.startsWith('INSERT INTO tms.cp_auditoria'))return {rows:[{}]};
    if(sql.startsWith('UPDATE'))return {rows:[{}]};
    return {rows:[]};
  },release(){}};
  const pool={query:db.query,connect:async()=>db};
  const input={...concept};delete input.cfdi_id;delete input.importe;
  await createCartaPorteService({pool}).group(cpId,'invoice-items',{expected_revision:'7',concepts:{upsert:[input],remove:[]},taxes:{upsert:[],remove:[]}},actor);
  assert.ok(calls.some(c=>c.sql.startsWith('UPDATE tms.cfdi_conceptos SET importe=')&&c.params.at(-1)==='0.000000'));
  assert.ok(calls.some(c=>c.sql.startsWith('UPDATE tms.cfdi SET subtotal=')&&c.params.includes('0.000000')));
  assert.ok(calls.some(c=>c.sql.startsWith('UPDATE tms.cfdi SET subtotal=')&&c.params[0]===documentId&&c.params.includes('0.000000')));
});
test('La validación estructural detecta destinos incorrectos y materiales peligrosos incompletos',()=>{
  const errors=validateCartaPorte({cfdi:{},locations:[{id:actor,tipo:'Destino',posicion:1}],merchandise:[{material_peligroso:true}],allocations:[{origen_id:actor,destino_id:actor}]});
  assert.ok(errors.some(e=>e.code==='ORIGIN_DESTINATION_REQUIRED'));
  assert.ok(errors.some(e=>e.path==='merchandise[0].clave_material_peligroso_sat'));
  assert.ok(errors.some(e=>e.code==='LOCATION_TYPE'));
});
test('Sin PAC el timbrado no abre transacciones ni inventa UUID',async()=>{
  const pool=mockPool();const service=createCartaPorteService({pool});
  await assert.rejects(()=>service.providerAction('stamp',{id:cpId,body:{expected_revision:'4'},actor,idempotencyKey:operationId}),e=>e.code==='PAC_NOT_CONFIGURED');
  assert.equal(pool.calls.length,0);
});
test('La misma clave idempotente devuelve la operación previa aun si avanzó la revisión',async()=>{
  const prior={id:operationId,cfdi_id:documentId,operacion:'TIMBRAR',revision_solicitada:'4',solicitud_snapshot:{command:{expected_revision:'4'}},estado:'ENVIADO'};
  const ops=createFiscalOperations({provider:{name:'test',environment:'PRUEBAS'},files:{},pool:{query:async()=>({rows:[prior]})},transaction:fn=>fn({}),header:async()=>({id:documentId,revision:'10'})});
  const result=await ops.stamp({id:cpId,body:{expected_revision:'4'},idempotencyKey:operationId,actor});
  assert.equal(result.id,operationId);assert.equal(result.estado,'ENVIADO');
  await assert.rejects(()=>ops.stamp({id:cpId,body:{expected_revision:'5'},idempotencyKey:operationId,actor}),e=>e.code==='IDEMPOTENCY_CONFLICT');
});
test('Un timeout del proveedor queda por conciliar, sin reenvío ni documento timbrado',async()=>{
  const pool=mockPool(sql=>{
    if(sql.includes('SELECT f.id FROM'))return {rows:[{id:documentId}]};
    if(sql.startsWith('SELECT * FROM tms.cfdi'))return {rows:[{id:documentId,estado:'CANCELACION_PENDIENTE'}]};
    if(sql.includes('SELECT * FROM tms.cp_timbrado_intentos'))return {rows:[{id:operationId,cfdi_id:documentId,estado:sql.includes('ORDER BY')?'PENDIENTE':'ENVIADO',operacion:'CANCELAR',solicitud_snapshot:{payload:{}},solicitado_por:actor}]};
    return {rows:[]};
  });
  const result=await processFiscalOperation({pool,provider:{cancel:async()=>{throw new Error('timeout');}},files:{}});
  assert.equal(result.estado,'POR_CONCILIAR');
  assert.ok(!pool.calls.some(c=>c.sql.startsWith('UPDATE tms.cfdi')&&c.params?.includes('TIMBRADO')));
});
test('Un envío abandonado se consulta al PAC sin emitir otra vez',async()=>{
  let lookups=0,stamps=0;
  const pool=mockPool(sql=>{
    if(sql.includes('SELECT f.id FROM'))return {rows:[{id:documentId}]};
    if(sql.startsWith('SELECT * FROM tms.cfdi'))return {rows:[{id:documentId,estado:'TIMBRANDO'}]};
    if(sql.includes('SELECT * FROM tms.cp_timbrado_intentos'))return {rows:[{id:operationId,cfdi_id:documentId,estado:'ENVIADO',operacion:'TIMBRAR',solicitud_snapshot:{payload:{}},solicitado_por:actor}]};
    return {rows:[]};
  });
  const result=await processFiscalOperation({pool,provider:{lookup:async()=>{lookups++;return {status:'UNKNOWN'};},stamp:async()=>{stamps++;}},files:{}});
  assert.equal(result.estado,'POR_CONCILIAR');assert.equal(lookups,1);assert.equal(stamps,0);
});
