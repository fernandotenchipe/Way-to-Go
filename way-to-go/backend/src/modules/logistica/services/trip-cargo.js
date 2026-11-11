import { fields, only, reject, uuid } from './carta-porte-input.js';
import { createCfdiCatalogProvider } from './cfdi-catalogs.js';

export const CARTA_PORTE_31_CATALOG_VERSION = 'edf31d04-86e4-4780-9bbb-6121bc6b5d38';

const satFields = {
  bienes_transp_sat: 'c_ClaveProdServCP',
  clave_unidad_sat: 'c_ClaveUnidad',
  clave_material_peligroso_sat: 'c_MaterialPeligroso',
  embalaje_sat: 'c_TipoEmbalaje',
};
const cartaPorteSatFields = Object.fromEntries(Object.entries(satFields).filter(([field])=>field!=='clave_unidad_sat'));
const itemFields = {
  descripcion:'text', mercancia:'text', cantidad:'decimal', bienes_transp_sat:'text',
  clave_unidad_sat:'text', unidad:'text', peso_kg:'decimal', hazmat:'boolean',
  clave_material_peligroso_sat:'text', embalaje_sat:'text', embalaje:'text',
};
const itemColumns = Object.keys(itemFields);
const requiredSchemaColumns = ['id','viaje_id','posicion','descripcion','mercancia','cantidad','bienes_transp_sat','clave_unidad_sat','unidad','peso_kg','hazmat','clave_material_peligroso_sat','embalaje','embalaje_sat'];
const requiredSchemaSql = `SELECT count(DISTINCT column_name)::int AS found FROM information_schema.columns
  WHERE table_schema='tms' AND table_name='viaje_carga_mercancias' AND column_name=ANY($1::text[])`;

export async function tripCargoModelReady(db) {
  const {rows:[row]}=await db.query(requiredSchemaSql,[requiredSchemaColumns]);
  return row?.found===requiredSchemaColumns.length;
}

export async function readTripCargoRows(db,tripId) {
  if(await tripCargoModelReady(db)) {
    const {rows}=await db.query('SELECT * FROM tms.viaje_carga_mercancias WHERE viaje_id=$1 ORDER BY posicion,created_at,id',[tripId]);
    if(rows.length)return rows;
  }
  return (await db.query('SELECT * FROM tms.viaje_carga WHERE viaje_id=$1 ORDER BY created_at',[tripId])).rows;
}

export function mapTripCargoToCartaPorte(cargoRows,cartaPorteId) {
  let position=0;
  return cargoRows.flatMap(cargo=>{
    const descripcion=cargo.descripcion||cargo.mercancia;
    if(!descripcion)return [];
    position+=1;
    return [{
      carta_porte_id:cartaPorteId,posicion:position,descripcion,
      cantidad:cargo.cantidad??null,bienes_transp_sat:cargo.bienes_transp_sat??null,
      clave_unidad_sat:cargo.clave_unidad_sat??null,unidad:cargo.unidad??null,
      peso_kg:Number(cargo.peso_kg)>0?cargo.peso_kg:null,material_peligroso:cargo.hazmat,
      clave_material_peligroso_sat:cargo.clave_material_peligroso_sat??null,
      embalaje_sat:cargo.embalaje_sat??null,descripcion_embalaje:cargo.embalaje??null,
    }];
  });
}

export function tripCargoMissingFields(cargo) {
  const missing=[];
  const cargoRows=Array.isArray(cargo)?cargo:(cargo?[cargo]:[]);
  if(!cargoRows.length)missing.push('mercancias');
  for(const [index,line] of cargoRows.entries()) {
    const prefix=`mercancias[${index}]`;
    for(const key of ['descripcion','peso_kg'])if(line?.[key]==null||line[key]==='')missing.push(`${prefix}.${key}`);
    if(line.cantidad==null)missing.push(`${prefix}.cantidad`);
    if(!line.clave_unidad_sat)missing.push(`${prefix}.clave_unidad_sat`);
    if(!line.unidad)missing.push(`${prefix}.unidad`);
    if(!line.bienes_transp_sat)missing.push(`${prefix}.bienes_transp_sat`);
    if(line.hazmat==null&&line.material_peligroso==null)missing.push(`${prefix}.hazmat`);
    if((line.hazmat===true||line.material_peligroso===true)&&!line.clave_material_peligroso_sat)missing.push(`${prefix}.clave_material_peligroso_sat`);
    if((line.hazmat===true||line.material_peligroso===true)&&!line.embalaje_sat)missing.push(`${prefix}.embalaje_sat`);
    if(Number(line.peso_kg)<=0)missing.push(`${prefix}.peso_kg`);
  }
  return [...new Set(missing)];
}

export function tripPrefillMissing({customer,origin,destination,transport,operator,cargo}={}) {
  const missing=[];
  const requireFields=(record,keys,prefix)=>{for(const key of keys)if(record?.[key]==null||record[key]==='')missing.push(`${prefix}.${key}`);};
  requireFields(customer,['rfc','regimen_fiscal','domicilio_legal_codigo_postal'],'cliente');
  for(const [name,address] of [['origen',origin],['destino',destination]])
    requireFields(address,['calle','ciudad','estado','codigo_postal','pais_sat','estado_sat','municipio_sat','fecha_hora'],`ubicacion.${name}`);
  if(!transport)missing.push('transporte.unidad');
  else {
    requireFields(transport,['placas','configuracion_vehicular_sat','permiso_sict_sat','numero_permiso_sict'],'transporte');
    if(!transport.aseguradora_rc||!transport.poliza_rc)missing.push('transporte.seguro_responsabilidad_civil');
  }
  if(!operator)missing.push('operador');
  else requireFields(operator,['nombre','rfc','numero_licencia'],'operador');
  return [...new Set([...missing,...tripCargoMissingFields(cargo)])];
}

export async function findInvalidTripCargoSatKeys(db,items,{catalogProvider=createCfdiCatalogProvider({pool:db})}={}) {
const isCatalogPlaceholder = value =>
  String(value ?? '').trim().replace(/\s+/g,' ').toLocaleLowerCase('es-MX') === 'no existe en el catálogo';
  const requested=[];
  for(const [index,item] of items.entries())for(const [field,catalog] of Object.entries(satFields))
    if(item[field])requested.push({index,field,catalog,key:item[field]});
  if(!requested.length)return [];
  const unitKeys=requested.filter(row=>row.field==='clave_unidad_sat');
  const cartaPorteKeys=requested.filter(row=>row.field!=='clave_unidad_sat');
  const invalid=[];
  for(const row of unitKeys) {
    let match;
    try { match=await catalogProvider.getByKey('c_ClaveUnidad',row.key,{vigente:true}); }
    catch { reject(503,'SAT_CATALOG_UNAVAILABLE','No está disponible c_ClaveUnidad en el proveedor CFDI configurado'); }
    if(!match)invalid.push({index:row.index,field:row.field,catalog:row.catalog,key:row.key});
  }
  if(!cartaPorteKeys.length)return invalid;
  const {rows}=await db.query(`WITH requested AS (
      SELECT * FROM unnest($2::text[],$3::text[],$4::text[],$5::integer[]) AS item(field,catalog,sat_key,item_index)
    ), version AS (
      SELECT id FROM tms.cp_sat_versiones WHERE id=$1::uuid AND familia='CARTA_PORTE' AND version_complemento='3.1'
    )
    SELECT r.field,r.catalog,r.sat_key,r.item_index,
      EXISTS(SELECT 1 FROM version) AS version_ready,
      EXISTS(SELECT 1 FROM tms.cp_sat_claves c JOIN version v ON v.id=c.version_id WHERE c.catalogo=r.catalog) AS catalog_ready,
      (SELECT c.descripcion FROM tms.cp_sat_claves c JOIN version v ON v.id=c.version_id WHERE c.catalogo=r.catalog AND c.clave=r.sat_key ORDER BY c.clave_contexto LIMIT 1) AS descripcion,
      EXISTS(SELECT 1 FROM tms.cp_sat_claves c JOIN version v ON v.id=c.version_id
        WHERE c.catalogo=r.catalog AND c.clave=r.sat_key
          AND (c.vigente_desde IS NULL OR c.vigente_desde<=CURRENT_DATE)
          AND (c.vigente_hasta IS NULL OR c.vigente_hasta>=CURRENT_DATE)) AS key_valid
    FROM requested r`,[
    CARTA_PORTE_31_CATALOG_VERSION,
    cartaPorteKeys.map(row=>row.field),cartaPorteKeys.map(row=>row.catalog),cartaPorteKeys.map(row=>row.key),cartaPorteKeys.map(row=>row.index),
  ]);
  const unavailable=rows.find(row=>!row.version_ready||!row.catalog_ready);
  if(unavailable)reject(503,'SAT_CATALOG_UNAVAILABLE',`No está disponible ${unavailable.catalog} en la versión Carta Porte 3.1 configurada`);
  invalid.push(...rows.filter(row=>!row.key_valid
    ||(row.catalog==='c_ClaveProdServCP'&&isCatalogPlaceholder(row.descripcion)))
    .map(row=>({index:row.item_index,field:row.field,catalog:row.catalog,key:row.sat_key})));
  return invalid;
}

export async function validateTripCargoSatKey(db,field,key,options) {
  if(!satFields[field])reject(400,'UNKNOWN_SAT_FIELD','Campo SAT de mercancía no admitido');
  const [invalid]=await findInvalidTripCargoSatKeys(db,[{[field]:key}],options);
  if(invalid)reject(422,'INVALID_SAT_KEY',`La clave no existe o no está vigente en ${invalid.catalog}`,[{path:field,code:'INVALID_SAT_KEY',message:`Clave no válida para ${invalid.catalog}`}]);
  return true;
}

function normalizeItem(input,{isNew=false}={}) {
  only(input,['id',...itemColumns]);
  if(input.id!==undefined&&!uuid(input.id))reject(400,'INVALID_ID','Identificador de mercancía inválido');
  const data=fields(Object.fromEntries(Object.entries(input).filter(([key])=>key!=='id')),itemFields);
  for(const [key,value] of Object.entries(data))if(typeof value==='string'&&!value.trim())data[key]=null;
  if(isNew&&![data.descripcion,data.mercancia].some(value=>typeof value==='string'&&value.trim()))
    reject(400,'REQUIRED_DESCRIPTION','Cada mercancía nueva requiere descripción operativa');
  if(isNew&&!Object.hasOwn(data,'hazmat'))reject(400,'HAZMAT_REQUIRED','Indica si la mercancía es material peligroso');
  if(Object.hasOwn(data,'hazmat')&&data.hazmat===null)reject(400,'HAZMAT_REQUIRED','Indica si la mercancía es material peligroso');
  if(data.clave_material_peligroso_sat&&data.hazmat!==true)reject(422,'HAZMAT_MISMATCH','La clave de material peligroso requiere hazmat=true');
  if(data.cantidad!=null&&Number(data.cantidad)<=0)reject(400,'INVALID_QUANTITY','La cantidad debe ser mayor que cero');
  if(data.peso_kg!=null&&Number(data.peso_kg)<0)reject(400,'INVALID_WEIGHT','El peso no puede ser negativo');
  for(const key of ['peso_kg','volumen_m3'])if(data[key]!=null&&String(data[key]).split('.')[1]?.length>3)reject(400,'INVALID_DECIMAL',`${key} admite hasta tres decimales`);
  if(data.temperatura_min_c!=null&&data.temperatura_max_c!=null&&Number(data.temperatura_max_c)<Number(data.temperatura_min_c))
    reject(400,'INVALID_TEMPERATURE_RANGE','La temperatura máxima debe ser mayor o igual a la mínima');
  return {id:input.id,data};
}

export function createTripCargoService({pool,catalogProvider=createCfdiCatalogProvider({pool})}) {
  async function ensureSchema(db) {
    if(!await tripCargoModelReady(db))reject(503,'CARGO_MIGRATION_REQUIRED','Aplica y verifica la migración 20261104_viaje_carga_mercancias.sql antes de usar este servicio');
  }
  async function trip(db,folio,lock=false) {
    if(!/^\d{1,18}$/.test(String(folio)))reject(400,'INVALID_FOLIO','Folio inválido');
    const {rows:[row]}=await db.query(`SELECT id,folio,updated_at,estado_operativo FROM tms.viajes WHERE folio::text=$1${lock?' FOR UPDATE':''}`,[String(folio)]);
    if(!row)reject(404,'TRIP_NOT_FOUND','Viaje no encontrado');
    return row;
  }
  async function rows(db,tripId) {
    return (await db.query('SELECT * FROM tms.viaje_carga_mercancias WHERE viaje_id=$1 ORDER BY posicion,created_at,id',[tripId])).rows;
  }
  async function response(db,journey,items=undefined) {
    const cargo=items??await rows(db,journey.id);
    return {viaje_id:journey.id,updated_at:journey.updated_at,mercancias:cargo,faltantes:tripCargoMissingFields(cargo)};
  }
  async function transaction(action) {
    const db=await pool.connect();
    try {await db.query('BEGIN');const result=await action(db);await db.query('COMMIT');return result;}
    catch(error){await db.query('ROLLBACK');throw error;}
    finally{db.release();}
  }
  return {
    async list(folio) {
      return transaction(async db=>{await ensureSchema(db);const journey=await trip(db,folio);return response(db,journey);});
    },
    async save(folio,body,idempotencyKey,actor) {
      only(body,['updated_at','motivo','mercancias','remove']);
      if(typeof body.updated_at!=='string'||!Number.isFinite(Date.parse(body.updated_at)))reject(400,'INVALID_UPDATED_AT','Envía la fecha updated_at de la ficha de mercancías');
      if(typeof body.motivo!=='string'||!body.motivo.trim()||body.motivo.length>1000)reject(400,'REASON_REQUIRED','Indica el motivo del cambio');
      if(!uuid(idempotencyKey))reject(400,'IDEMPOTENCY_REQUIRED','Envía Idempotency-Key UUID');
      const incoming=body.mercancias??[];
      const removals=body.remove??[];
      if(!Array.isArray(incoming)||incoming.length>100||!Array.isArray(removals)||removals.length>100)reject(400,'INVALID_BATCH','Envía hasta 100 mercancías y 100 eliminaciones');
      const normalized=incoming.map(item=>normalizeItem(item,{isNew:!item?.id}));
      if(new Set(normalized.map(item=>item.id).filter(Boolean)).size!==normalized.filter(item=>item.id).length)reject(400,'DUPLICATE_ITEM_ID','No repitas identificadores de mercancía');
      if(removals.some(value=>!uuid(value))||new Set(removals).size!==removals.length)reject(400,'INVALID_REMOVALS','La lista remove debe contener UUID únicos');
      if(normalized.some(item=>item.id&&removals.includes(item.id)))reject(400,'CONFLICTING_ITEM_ACTION','No actualices y elimines la misma mercancía');
      return transaction(async db=>{
        await ensureSchema(db);
        const journey=await trip(db,folio,true);
        const {rows:[previousRequest]}=await db.query('SELECT viaje_id FROM tms.viaje_eventos WHERE idempotency_key=$1 FOR SHARE',[idempotencyKey]);
        if(previousRequest){
          if(previousRequest.viaje_id!==journey.id)reject(409,'IDEMPOTENCY_CONFLICT','La clave de idempotencia ya pertenece a otro viaje');
          return response(db,journey);
        }
        if(['ENTREGADO','CANCELADO'].includes(journey.estado_operativo))reject(409,'TRIP_LOCKED','El viaje finalizado no admite cambios de mercancía');
        if(new Date(journey.updated_at).getTime()!==Date.parse(body.updated_at))reject(409,'STALE_TRIP','El viaje cambió; recarga sus mercancías antes de guardar');
        const before=await rows(db,journey.id);
        const existing=new Map(before.map(item=>[item.id,item]));
        for(const item of normalized)if(item.id&&!existing.has(item.id))reject(404,'ITEM_NOT_FOUND','La mercancía no pertenece a este viaje');
        for(const id of removals)if(!existing.has(id))reject(404,'ITEM_NOT_FOUND','La mercancía a eliminar no pertenece a este viaje');
        for(const item of normalized)if(item.id) {
          const merged={...existing.get(item.id),...item.data};
          if(merged.clave_material_peligroso_sat&&merged.hazmat!==true)reject(422,'HAZMAT_MISMATCH','La clave de material peligroso requiere hazmat=true');
        }
        const invalidKeys=await findInvalidTripCargoSatKeys(db,normalized.map(item=>item.data),{catalogProvider});
        if(invalidKeys.length){const invalid=invalidKeys[0];reject(422,'INVALID_SAT_KEY',`La clave no existe o no está vigente en ${invalid.catalog}`,[{path:`mercancias[${invalid.index}].${invalid.field}`,code:'INVALID_SAT_KEY',message:`Clave no válida para ${invalid.catalog}`}]);}
        for(const itemId of removals)await db.query('DELETE FROM tms.viaje_carga_mercancias WHERE viaje_id=$1 AND id=$2',[journey.id,itemId]);
        let nextPosition=Math.max(0,...before.map(item=>Number(item.posicion)||0))+1;
        for(const item of normalized) {
          if(item.id) {
            const entries=Object.entries(item.data);
            if(!entries.length)continue;
            await db.query(`UPDATE tms.viaje_carga_mercancias SET ${entries.map(([key],index)=>`${key}=$${index+3}`).join(',')} WHERE viaje_id=$1 AND id=$2`,[journey.id,item.id,...entries.map(([,value])=>value)]);
          } else {
            const entries=Object.entries(item.data);
            await db.query(`INSERT INTO tms.viaje_carga_mercancias (viaje_id,posicion,${entries.map(([key])=>key).join(',')}) VALUES ($1,$2,${entries.map((_,index)=>`$${index+3}`).join(',')})`,[journey.id,nextPosition++,...entries.map(([,value])=>value)]);
          }
        }
        const after=await rows(db,journey.id);
        const {rows:[updatedTrip]}=await db.query('UPDATE tms.viajes SET updated_at=now() WHERE id=$1 RETURNING updated_at',[journey.id]);
        await db.query(`INSERT INTO tms.viaje_eventos(viaje_id,tipo,ocurrido_at,registrado_por,origen,comentario,datos,idempotency_key)
          VALUES ($1,'CORRECCION',now(),$2,'INTERNO',$3,$4::jsonb,$5)`,[journey.id,actor,body.motivo.trim(),JSON.stringify({categoria:'MERCANCIAS',antes:before,despues:after}),idempotencyKey]);
        return response(db,{...journey,updated_at:updatedTrip.updated_at},after);
      });
    },
  };
}
