import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CARTA_PORTE_31_CATALOG_VERSION,
  createTripCargoService,
  findInvalidTripCargoSatKeys,
  mapTripCargoToCartaPorte,
  readTripCargoRows,
  tripCargoMissingFields,
  validateTripCargoSatKey,
} from './trip-cargo.js';

const uuid=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const now='2026-11-04T12:00:00.000Z';
const actor=uuid(90);

test('mapea una mercancía reutilizando peso, hazmat y descripción',()=>{
  const [mapped]=mapTripCargoToCartaPorte([{descripcion:'Refacciones',peso_kg:'42.500',hazmat:false}],uuid(8));
  assert.equal(mapped.descripcion,'Refacciones');
  assert.equal(mapped.peso_kg,'42.500');
  assert.equal(mapped.material_peligroso,false);
  assert.equal(mapped.cantidad,null);
  assert.equal(mapped.clave_unidad_sat,null);
});

test('mapea varias mercancías en orden y no compacta claves fiscales faltantes',()=>{
  const mapped=mapTripCargoToCartaPorte([
    {mercancia:'Pintura',peso_kg:'10',hazmat:true,clave_material_peligroso_sat:'1263',embalaje_sat:'1A1'},
    {descripcion:'Madera',peso_kg:'35',hazmat:false,cantidad:'2',clave_unidad_sat:'H87',unidad:'Pieza',bienes_transp_sat:'11121600'},
  ],uuid(8));
  assert.equal(mapped.length,2);
  assert.deepEqual(mapped.map(item=>item.posicion),[1,2]);
  assert.equal(mapped[0].clave_material_peligroso_sat,'1263');
  assert.equal(mapped[0].cantidad,null);
  assert.equal(mapped[1].bienes_transp_sat,'11121600');
});

test('Carta Porte lee varias partidas tras la migración y conserva el fallback histórico',async()=>{
  const details=[{descripcion:'A',hazmat:false,posicion:1},{descripcion:'B',hazmat:true,posicion:2}];
  const modernCalls=[];
  const modern=await readTripCargoRows({query:async(sql)=>{
    modernCalls.push(sql);
    if(sql.includes('information_schema.columns'))return {rows:[{found:14}]};
    if(sql.includes('viaje_carga_mercancias'))return {rows:details};
    throw new Error(`Consulta no esperada: ${sql}`);
  }},uuid(1));
  assert.deepEqual(modern,details);
  assert.ok(modernCalls.some(sql=>sql.includes('viaje_carga_mercancias')));

  const legacy={descripcion:'Mercancía histórica',peso_kg:'12.000',hazmat:false,embalaje:'Caja'};
  const legacyResult=await readTripCargoRows({query:async(sql)=>{
    if(sql.includes('information_schema.columns'))return {rows:[{found:0}]};
    if(sql.includes('FROM tms.viaje_carga WHERE'))return {rows:[legacy]};
    throw new Error(`Consulta no esperada: ${sql}`);
  }},uuid(1));
  const [prefilled]=mapTripCargoToCartaPorte(legacyResult,uuid(2));
  assert.equal(prefilled.descripcion,'Mercancía histórica');
  assert.equal(prefilled.peso_kg,'12.000');
  assert.equal(prefilled.descripcion_embalaje,'Caja');
});

test('reporta campos pendientes por renglón y condiciona embalaje a material peligroso',()=>{
  const missing=tripCargoMissingFields([
    {descripcion:'Pintura',peso_kg:'4',hazmat:true},
    {descripcion:'Mesa',peso_kg:'12',hazmat:false},
  ]);
  assert.ok(missing.includes('mercancias[0].clave_material_peligroso_sat'));
  assert.ok(missing.includes('mercancias[0].embalaje_sat'));
  assert.ok(missing.includes('mercancias[1].cantidad'));
  assert.ok(missing.includes('mercancias[1].clave_unidad_sat'));
});

test('valida clave SAT vigente en el catálogo y versión Carta Porte 3.1 indicada',async()=>{
  let params;
  await validateTripCargoSatKey({query:async(_sql,values)=>{params=values;return {rows:[{version_ready:true,catalog_ready:true,key_valid:true}]};}},'bienes_transp_sat','01010101');
  assert.deepEqual(params,[CARTA_PORTE_31_CATALOG_VERSION,['bienes_transp_sat'],['c_ClaveProdServCP'],['01010101'],[0]]);
});

test('rechaza una clave SAT inexistente sin asignar sustitutos',async()=>{
  const db={query:async()=>({rows:[{version_ready:true,catalog_ready:true,key_valid:false}]})};
  const catalogProvider={getByKey:async()=>null};
  await assert.rejects(validateTripCargoSatKey(db,'clave_unidad_sat','NO_EXISTE',{catalogProvider}),error=>error.code==='INVALID_SAT_KEY'&&error.status===422);
});

test('valida c_ClaveUnidad en el proveedor CFDI y no consulta PostgreSQL Carta Porte',async()=>{
  const requested=[];
  const catalogProvider={getByKey:async(...args)=>{requested.push(args);return args[1]==='H87'?{clave:'H87',descripcion:'Pieza'}:null;}};
  const db={query:async()=>{throw new Error('La unidad debe validarse en CFDI local');}};
  assert.deepEqual(await findInvalidTripCargoSatKeys(db,[{clave_unidad_sat:'H87'}],{catalogProvider}),[]);
  assert.deepEqual(requested[0],['c_ClaveUnidad','H87',{vigente:true}]);
  assert.deepEqual(await findInvalidTripCargoSatKeys(db,[{clave_unidad_sat:'NO_EXISTE'}],{catalogProvider}),[
    {index:0,field:'clave_unidad_sat',catalog:'c_ClaveUnidad',key:'NO_EXISTE'},
  ]);
});

function memoryPool({validKeys=['31211500','11121600','H87','1263','1A1'],cargo=[],schemaColumns=14}={}) {
  const state={journey:{id:uuid(1),folio:'20',updated_at:now,estado_operativo:'PROGRAMADO',ultima_actualizacion_operativa_at:'2026-11-04T11:00:00.000Z',resumen_operativo:{paradas:2,estatus:'En ruta'}},cargo:structuredClone(cargo),events:new Map(),calls:[],nextId:1};
  const client={
    async query(sql,params=[]) {
      const text=sql.replace(/\s+/g,' ').trim();
      state.calls.push({sql:text,params});
      if(text==='BEGIN')return {rows:[]};
      if(text==='COMMIT')return {rows:[]};
      if(text==='ROLLBACK')return {rows:[]};
      if(text.startsWith('SELECT count(DISTINCT column_name)'))return {rows:[{found:schemaColumns}]};
      if(text.startsWith('SELECT id,folio,updated_at,estado_operativo FROM tms.viajes'))return {rows:[{...state.journey}]};
      if(text.startsWith('SELECT viaje_id FROM tms.viaje_eventos WHERE idempotency_key'))return {rows:state.events.has(params[0])?[{viaje_id:state.events.get(params[0])}]:[]};
      if(text.startsWith('SELECT * FROM tms.viaje_carga_mercancias WHERE viaje_id'))return {rows:structuredClone(state.cargo)};
      if(text.startsWith('WITH requested AS'))return {rows:params[1].map((field,index)=>({field,catalog:params[2][index],sat_key:params[3][index],item_index:params[4][index],version_ready:true,catalog_ready:true,key_valid:validKeys.includes(params[3][index])}))};
      if(text.startsWith('INSERT INTO tms.viaje_carga_mercancias')) {
        const columns=text.match(/\(viaje_id,posicion,([^)]*)\)/)[1].split(',');
        const row={viaje_id:params[0],posicion:params[1],id:uuid(state.nextId++),created_at:now};
        columns.forEach((key,index)=>{row[key]=params[index+2];});
        state.cargo.push(row);return {rows:[row]};
      }
      if(text.startsWith('UPDATE tms.viaje_carga_mercancias SET')) {
        const row=state.cargo.find(item=>item.viaje_id===params[0]&&item.id===params[1]);
        const set=text.match(/SET (.*?) WHERE/)[1].split(',');
        set.forEach((entry,index)=>{const key=entry.split('=')[0];row[key]=params[index+2];});
        return {rows:[row]};
      }
      if(text.startsWith('DELETE FROM tms.viaje_carga_mercancias')) {
        state.cargo=state.cargo.filter(item=>!(item.viaje_id===params[0]&&item.id===params[1]));return {rows:[]};
      }
      if(text.startsWith('UPDATE tms.viajes SET updated_at')) {
        state.journey.updated_at='2026-11-04T12:01:00.000Z';return {rows:[{updated_at:state.journey.updated_at}]};
      }
      if(text.startsWith('INSERT INTO tms.viaje_eventos')) {
        state.events.set(params[4],params[0]);return {rows:[]};
      }
      throw new Error(`Consulta no simulada: ${text}`);
    },
    release() {},
  };
  return {state,pool:{connect:async()=>client},catalogProvider:{getByKey:async(catalog,key)=>catalog==='c_ClaveUnidad'&&validKeys.includes(key)?{clave:key}:null}};
}

test('registra varias mercancías, conserva campos opcionales y no duplica al reintentar',async()=>{
  const {state,pool,catalogProvider}=memoryPool();
  const service=createTripCargoService({pool,catalogProvider});
  const body={updated_at:now,motivo:'Captura de mercancías',mercancias:[
    {descripcion:'Pintura',peso_kg:'10',hazmat:true,clave_material_peligroso_sat:'1263',embalaje_sat:'1A1',bienes_transp_sat:'31211500'},
    {descripcion:'Madera',peso_kg:'35',hazmat:false,cantidad:'2',clave_unidad_sat:'H87',unidad:'Pieza',bienes_transp_sat:'11121600'},
  ]};
  const key=uuid(11);
  const saved=await service.save('20',body,key,actor);
  assert.equal(saved.mercancias.length,2);
  assert.equal(saved.mercancias[0].clave_material_peligroso_sat,'1263');
  assert.ok(saved.faltantes.includes('mercancias[0].cantidad'));
  await service.save('20',body,key,actor);
  assert.equal(state.cargo.length,2);
  assert.equal(state.calls.filter(call=>call.sql.startsWith('INSERT INTO tms.viaje_carga')).length,2);
  assert.deepEqual(state.journey.resumen_operativo,{paradas:2,estatus:'En ruta'});
  assert.equal(state.journey.ultima_actualizacion_operativa_at,'2026-11-04T11:00:00.000Z');
  assert.ok(state.calls.some(call=>call.sql==='UPDATE tms.viajes SET updated_at=now() WHERE id=$1 RETURNING updated_at'));
});

test('actualización parcial conserva la descripción manual existente',async()=>{
  const original={id:uuid(3),viaje_id:uuid(1),descripcion:'Descripción manual',peso_kg:'15.000',hazmat:false,cantidad:'1.000000',created_at:now};
  const {state,pool,catalogProvider}=memoryPool({cargo:[original]});
  const saved=await createTripCargoService({pool,catalogProvider}).save('20',{updated_at:now,motivo:'Ajustar cantidad',mercancias:[{id:original.id,cantidad:'3'}]},uuid(12),actor);
  assert.equal(state.cargo[0].descripcion,'Descripción manual');
  assert.equal(state.cargo[0].cantidad,'3');
  assert.equal(saved.mercancias[0].descripcion,'Descripción manual');
});

test('una clave SAT inválida aborta la transacción antes de insertar mercancías',async()=>{
  const {state,pool,catalogProvider}=memoryPool({validKeys:[]});
  await assert.rejects(createTripCargoService({pool,catalogProvider}).save('20',{updated_at:now,motivo:'Prueba',mercancias:[{descripcion:'Carga',peso_kg:'2',hazmat:false,bienes_transp_sat:'NO_EXISTE'}]},uuid(13),actor),error=>error.code==='INVALID_SAT_KEY');
  assert.equal(state.cargo.length,0);
  assert.ok(state.calls.some(call=>call.sql==='ROLLBACK'));
});

test('la migración conserva la PK y fila histórica, copiándola a una tabla hija',async()=>{
  const file=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../database/migrations/20261104_viaje_carga_mercancias.sql');
  const sql=await readFile(file,'utf8');
  assert.match(sql,/CREATE TABLE tms\.viaje_carga_mercancias/i);
  assert.match(sql,/REFERENCES tms\.viaje_carga\(viaje_id\)/i);
  assert.match(sql,/cantidad numeric\(20,6\)/i);
  assert.doesNotMatch(sql,/ALTER TABLE tms\.viaje_carga\s+DROP CONSTRAINT/i);
  assert.doesNotMatch(sql,/\bUPDATE\s+tms\.viaje_carga\b/i);
  assert.doesNotMatch(sql,/\bDROP\s+COLUMN\b/i);
  assert.match(sql,/INSERT INTO tms\.viaje_carga_mercancias/i);
  assert.match(sql,/SELECT viaje_id,1,descripcion,mercancia,peso_kg,hazmat,embalaje,created_at,updated_at\s+FROM tms\.viaje_carga/i);
});

test('las rutas de mercancías quedan bloqueadas hasta que la migración esté instalada',async()=>{
  const {pool,state,catalogProvider}=memoryPool({schemaColumns:0});
  await assert.rejects(createTripCargoService({pool,catalogProvider}).list('20'),error=>error.code==='CARGO_MIGRATION_REQUIRED'&&error.status===503);
  assert.equal(state.calls.some(call=>call.sql.startsWith('SELECT id,folio,updated_at')),false);
  assert.equal(state.calls.some(call=>/^(INSERT|UPDATE|DELETE) /i.test(call.sql)),false);
});
