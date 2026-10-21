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
