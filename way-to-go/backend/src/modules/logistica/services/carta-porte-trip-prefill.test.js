import test from 'node:test';
import assert from 'node:assert/strict';
import { createCartaPorteService } from './carta-porte.js';
import { tripPrefillMissing } from './trip-cargo.js';

const uuid=(n)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const complete={
  customer:{rfc:'AAA010101AAA',regimen_fiscal:'601',domicilio_legal_codigo_postal:'01000'},
  origin:{calle:'Calle 1',ciudad:'CDMX',estado:'CDMX',codigo_postal:'01000',pais_sat:'MEX',estado_sat:'CMX',municipio_sat:'002',fecha_hora:'2026-11-04T10:00:00Z'},
  destination:{calle:'Calle 2',ciudad:'Puebla',estado:'Puebla',codigo_postal:'72000',pais_sat:'MEX',estado_sat:'PUE',municipio_sat:'114',fecha_hora:'2026-11-04T15:00:00Z'},
  transport:{placas:'ABC123',configuracion_vehicular_sat:'C2',permiso_sict_sat:'TPAF01',numero_permiso_sict:'123',aseguradora_rc:'Aseguradora',poliza_rc:'POL-1'},
  operator:{nombre:'Operador',rfc:'BBB010101BBB',numero_licencia:'LIC-1'},
  cargo:{descripcion:'Carga',peso_kg:'100',cantidad:'1',clave_unidad_sat:'H87',unidad:'Pieza',bienes_transp_sat:'01010101',hazmat:false},
};

function poolFor(query) {
  const calls=[];
  return {calls,connect:async()=>({
    query:async(sql,params=[])=>{calls.push({sql:sql.replace(/\s+/g,' ').trim(),params});return query(sql,params);},
    release() {},
  }),query:async(sql,params=[])=>query(sql,params)};
}

test('reporta el viaje completo sin confundir código postal con claves SAT',()=>{
  assert.deepEqual(tripPrefillMissing(complete),[]);
  const incomplete={...complete,cargo:{...complete.cargo,cantidad:null,clave_unidad_sat:null,bienes_transp_sat:null},origin:{...complete.origin,estado_sat:null}};
  const missing=tripPrefillMissing(incomplete);
  assert.ok(missing.includes('ubicacion.origen.estado_sat'));
  assert.ok(missing.includes('mercancias[0].cantidad'));
  assert.ok(missing.includes('mercancias[0].clave_unidad_sat'));
  assert.ok(missing.includes('mercancias[0].bienes_transp_sat'));
  assert.ok(!missing.includes('ubicacion.origen.codigo_postal'));
});

test('marca la información parcial y la falta de unidad u operador',()=>{
  const missing=tripPrefillMissing({customer:{rfc:'AAA'},origin:{codigo_postal:'01000'},cargo:{descripcion:'Carga'}});
  assert.ok(missing.includes('transporte.unidad'));
  assert.ok(missing.includes('operador'));
  assert.ok(missing.includes('cliente.regimen_fiscal'));
  assert.ok(missing.includes('ubicacion.origen.estado_sat'));
  assert.ok(missing.includes('mercancias[0].peso_kg'));
});

test('un material peligroso sin clave correspondiente queda señalado',()=>{
  const missing=tripPrefillMissing({...complete,cargo:{...complete.cargo,hazmat:true,clave_material_peligroso_sat:null}});
  assert.ok(missing.includes('mercancias[0].clave_material_peligroso_sat'));
});

test('el viaje con documento existente se rechaza antes de insertar otro',async()=>{
  const pool=poolFor(async(sql)=>{
    if(sql==='BEGIN'||sql==='ROLLBACK'||sql==='COMMIT')return {rows:[]};
    if(sql.includes('FROM tms.viajes WHERE folio::text'))return {rows:[{id:uuid(1),estado_operativo:'PROGRAMADO'}]};
    if(sql.includes("FROM tms.cfdi WHERE viaje_id=$1 AND origen='PROPIO'"))return {rows:[{id:uuid(2)}]};
    throw new Error(`Consulta inesperada: ${sql}`);
  });
  const service=createCartaPorteService({pool});
  await assert.rejects(service.create('10',{empresa_emisora_id:uuid(3),tipo_comprobante:'T',escenario_fiscal:'TRASLADO_BIENES_PROPIOS',mercancias_propias:true},uuid(4)),e=>e.code==='EXISTING_DOCUMENT');
  assert.equal(pool.calls.filter(c=>/^INSERT INTO/i.test(c.sql)).length,0);
});

test('consultar un borrador conserva los valores manuales y no ejecuta escrituras',async()=>{
  const cp={id:uuid(5),cfdi_id:uuid(6),viaje_id:uuid(1),descripcion_carga:'Descripción manual'};
  const invoice={id:uuid(6),estado:'BORRADOR',origen:'PROPIO',observaciones:'Nota manual'};
  const pool=poolFor(async(sql)=>{
    if(sql==='BEGIN'||sql==='COMMIT')return {rows:[]};
    if(sql.includes('JOIN tms.cartas_porte c'))return {rows:[invoice]};
    if(sql==='SELECT * FROM tms.cartas_porte WHERE id=$1')return {rows:[cp]};
    if(sql==='SELECT * FROM tms.cfdi WHERE id=$1')return {rows:[invoice]};
    if(sql.startsWith('SELECT * FROM tms.'))return {rows:[]};
    throw new Error(`Consulta inesperada: ${sql}`);
  });
  const result=await createCartaPorteService({pool}).get(cp.id);
  assert.equal(result.descripcion_carga,'Descripción manual');
  assert.equal(result.cfdi.observaciones,'Nota manual');
  assert.equal(pool.calls.some(c=>/^(INSERT|UPDATE|DELETE) /i.test(c.sql)),false);
});
