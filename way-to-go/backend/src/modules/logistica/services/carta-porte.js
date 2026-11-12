import { randomUUID, createHash } from 'node:crypto';
import { catalogs, children, groups, headerFields, invoiceFields } from './carta-porte-config.js';
import { reject, uuid, fields, only, object, revision, decimal, formatDecimal, multiplyDecimal } from './carta-porte-input.js';
import { createFiscalOperations } from './carta-porte-operations.js';
import { createOperatorService } from './operators.js';
import { CARTA_PORTE_31_CATALOG_VERSION, findInvalidTripCargoSatKeys, mapTripCargoToCartaPorte, readTripCargoRows, tripPrefillMissing } from './trip-cargo.js';
import { createCfdiCatalogProvider } from './cfdi-catalogs.js';
import { validateFiscalCreation, validateCfdiCatalogKeys } from './carta-porte-fiscal.js';

const editable = new Set(['BORRADOR','RECHAZADO']);
const json = value => JSON.stringify(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const keysFor = c => [...new Set([...c.keys,...Object.keys(c.fields)])];
function id(value) { if (!uuid(value)) reject(400,'INVALID_ID','Identificador inválido'); return value; }
function pagination(query = {}) {
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit<1 || limit>100 || !Number.isSafeInteger(offset) || offset<0) reject(400,'INVALID_PAGE','Paginación inválida');
  return {limit,offset};
}
async function insert(db, table, data) {
  const entries = Object.entries(data);
  const returning=table==='cp_auditoria'?'*':'*, updated_at::text AS updated_at';
  const {rows} = await db.query(`INSERT INTO tms.${table} (${entries.map(([k])=>k).join(',')}) VALUES (${entries.map((_,i)=>`$${i+1}`).join(',')}) RETURNING ${returning}`,entries.map(([,v])=>v));
  return rows[0];
}
async function update(db, table, data, where, params) {
  const entries = Object.entries(data);
  if (!entries.length) reject(400,'EMPTY_UPDATE','No hay cambios');
  const {rows} = await db.query(`UPDATE tms.${table} SET ${entries.map(([k],i)=>`${k}=$${params.length+i+1}`).join(',')} WHERE ${where} RETURNING *, updated_at::text AS updated_at`,[...params,...entries.map(([,v])=>v)]);
  return rows[0];
}
async function audit(db, actor, table, entity, action, cfdi = null, data = {}) {
  if (cfdi) {
    const current = (await db.query('SELECT revision FROM tms.cfdi WHERE id=$1',[cfdi])).rows[0];
    if (current?.revision != null) data = { ...data, revision_nueva: Number(current.revision) };
  }
  await insert(db,'cp_auditoria',{tabla:table,entidad_id:entity,accion:action,actor_id:actor,cfdi_id:cfdi,datos:json(data)});
}
function safeCatalog(c, row) {
  if (!row) return row;
  return Object.fromEntries(['id',c.statusField||'activo','created_at','updated_at',...Object.keys(c.fields)].map(k=>[k,row[k]]));
}

export function createCartaPorteService({pool, provider = null, files = null, cfdiCatalogProvider=createCfdiCatalogProvider({pool})}) {
  const operators=createOperatorService({pool});
  async function transaction(action) {
    const db=await pool.connect();
    try { await db.query('BEGIN'); const result=await action(db); await db.query('COMMIT'); return result; }
    catch(error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
  async function trip(db, folio, lock=false) {
    if (!/^\d{1,18}$/.test(String(folio))) reject(400,'INVALID_FOLIO','Folio inválido');
    const {rows}=await db.query(`SELECT * FROM tms.viajes WHERE folio::text=$1${lock?' FOR UPDATE':''}`,[String(folio)]);
    if (!rows[0]) reject(404,'TRIP_NOT_FOUND','Viaje no encontrado');
    return rows[0];
  }
  async function header(db, cpId, expected, requireEditable=false) {
    id(cpId);
    // Bloquear primero CFDI, antes de leer o escribir cualquier hijo.
    const {rows}=await db.query('SELECT f.* FROM tms.cfdi f JOIN tms.cartas_porte c ON c.cfdi_id=f.id WHERE c.id=$1 FOR UPDATE OF f',[cpId]);
    const f=rows[0];
    if (!f) reject(404,'DOCUMENT_NOT_FOUND','Carta Porte no encontrada');
    if (expected!==undefined && String(f.revision)!==revision(expected)) reject(409,'STALE_REVISION','El documento cambió; vuelve a consultarlo');
    if (requireEditable && !editable.has(f.estado)) reject(409,'DOCUMENT_LOCKED','El documento no admite cambios');
    if (requireEditable && f.origen!=='PROPIO') reject(409,'EXTERNAL_DOCUMENT','No editar comprobantes de proveedor');
    return f;
  }
  async function aggregate(db, cpId) {
    const {rows}=await db.query('SELECT * FROM tms.cartas_porte WHERE id=$1',[id(cpId)]);
    if (!rows[0]) reject(404,'DOCUMENT_NOT_FOUND','Carta Porte no encontrada');
    const cp=rows[0];
    const {rows: invoices}=await db.query('SELECT * FROM tms.cfdi WHERE id=$1',[cp.cfdi_id]);
    const data={...cp,cfdi:invoices[0]};
    for (const [key,c] of Object.entries(children)) data[key]=(await db.query(`SELECT * FROM tms.${c.table} WHERE ${c.scope}=$1 ORDER BY created_at`,[c.scope==='cfdi_id'?cp.cfdi_id:cp.id])).rows;
    const parseSnapshot=value=>{if(value&&typeof value==='object')return value;if(typeof value==='string'){try{return JSON.parse(value);}catch{}}return {};};
    const scenarioRow=(await db.query("SELECT datos FROM tms.cp_auditoria WHERE cfdi_id=$1 AND datos ? 'escenario_fiscal' ORDER BY created_at DESC,id DESC LIMIT 1",[cp.cfdi_id])).rows[0];
    const scenarioData=parseSnapshot(scenarioRow?.datos);
    const knownScenarios=new Set(['SERVICIO_TRANSPORTE','TRASLADO_BIENES_PROPIOS']);
    // The scenario is returned only when it was explicitly audited. Never infer
    // it from the invoice type or transport assignment for legacy documents.
    data.escenario_fiscal=knownScenarios.has(scenarioData.escenario_fiscal)?scenarioData.escenario_fiscal:null;
    data.mercancias_propias=data.escenario_fiscal?scenarioData.mercancias_propias===true:null;
    const locations=data.locations||[];
    const location=(type)=>{const row=locations.find(item=>item.tipo===type);if(!row)return null;const address=parseSnapshot(row.domicilio_snapshot);return {...address,ciudad:address.ciudad??address.municipio,fecha_hora:row.fecha_hora};};
    const receiver=parseSnapshot(data.cfdi?.receptor_snapshot);
    const figure=(data.figures||[]).find(item=>item.tipo_figura_sat==='01');
    data.precarga={faltantes:tripPrefillMissing({
      customer:{rfc:receiver.rfc,regimen_fiscal:receiver.regimen_fiscal_sat,domicilio_legal_codigo_postal:receiver.domicilio_fiscal_cp},
      origin:location('Origen'),destination:location('Destino'),transport:data.transport?.[0]||null,operator:figure||null,cargo:data.merchandise||[],
    })};
    return data;
  }
  async function source(db, table, resourceId, active=true) {
    const {rows}=await db.query(`SELECT * FROM tms.${table} WHERE id=$1${active?' AND activo=true':''}`,[id(resourceId)]);
    if (!rows[0]) reject(422,'INACTIVE_REFERENCE','Referencia inexistente o inactiva');
    return rows[0];
  }
  function fiscalCustomer(c) {
    return {rfc:c.rfc,nombre:c.razon_social,regimen_fiscal_sat:c.regimen_fiscal,domicilio_fiscal_cp:c.domicilio_legal_codigo_postal,
      residencia_fiscal_sat:c.residencia_fiscal_sat,numero_registro_tributario:c.numero_registro_tributario};
  }
  async function tripPrefill(db,t,cp,customer,transport) {
    const sourceCargoRows=await readTripCargoRows(db,t.id);
    const invalidKeys=await findInvalidTripCargoSatKeys(db,sourceCargoRows,{catalogProvider:cfdiCatalogProvider});
    const cargoRows=sourceCargoRows.map((cargo,index)=>{
      const filtered={...cargo};
      for(const invalid of invalidKeys)if(invalid.index===index)filtered[invalid.field]=null;
      return filtered;
    });
    const {rows:[times]}=await db.query('SELECT salida_programada_at,descarga_programada_at FROM tms.viaje_tiempos WHERE viaje_id=$1',[t.id]);
    const addressRows=(await db.query(`SELECT v.tipo,v.posicion,v.fecha_hora,a.*,p.id AS participante_id,d.id AS cp_direccion_id
      FROM (VALUES ('Origen',$1::uuid,$2::uuid,$3::timestamptz,1),('Destino',$4::uuid,$5::uuid,$6::timestamptz,2)) v(tipo,cliente_id,direccion_id,fecha_hora,posicion)
      JOIN tms.clientes c ON c.id=v.cliente_id
      JOIN tms.cliente_direcciones a ON a.id=v.direccion_id AND a.cliente_id=c.id
      LEFT JOIN tms.cp_participantes p ON p.cliente_id=c.id
      LEFT JOIN tms.cp_direcciones d ON d.cliente_direccion_id=a.id`,
      [t.cliente_id,t.origen_id,t.cita_carga_at||times?.salida_programada_at,t.cliente_id,t.destino_id,times?.descarga_programada_at||t.entrega_estimada_at])).rows;
    for (const a of addressRows) {
      let p=a.participante_id;
      if (!p) {
        const inserted=await db.query(`INSERT INTO tms.cp_participantes(cliente_id,nombre,rfc)
          SELECT id,razon_social,rfc FROM tms.clientes WHERE id=$1 ON CONFLICT(cliente_id) DO NOTHING RETURNING id`,[t.cliente_id]);
        p=inserted.rows[0]?.id||(await db.query('SELECT id FROM tms.cp_participantes WHERE cliente_id=$1',[t.cliente_id])).rows[0]?.id;
      }
      let d=a.cp_direccion_id;
      if (!d) {
        const inserted=await db.query(`INSERT INTO tms.cp_direcciones(participante_id,cliente_direccion_id,nombre,calle,numero_exterior,numero_interior,colonia,localidad,municipio,estado,pais,codigo_postal,referencia,pais_sat,estado_sat,municipio_sat,localidad_sat,colonia_sat,zona_horaria)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
          ON CONFLICT(cliente_direccion_id) DO NOTHING RETURNING id`,[p,a.id,a.nombre,a.calle,a.numero_exterior,a.numero_interior,a.colonia,a.localidad,a.ciudad,a.estado,a.pais,a.codigo_postal,a.referencia,a.pais_sat,a.estado_sat,a.municipio_sat,a.localidad_sat,a.colonia_sat,a.zona_horaria]);
        d=inserted.rows[0]?.id||(await db.query('SELECT id FROM tms.cp_direcciones WHERE cliente_direccion_id=$1',[a.id])).rows[0]?.id;
      }
      if (p&&d) {
        const location=await snapshots(db,'locations',{carta_porte_id:cp.id,posicion:a.posicion,tipo:a.tipo,identificador_sat:a.tipo==='Origen'?'OR000001':'DE000001',participante_id:p,direccion_id:d,fecha_hora:a.fecha_hora});
        await insert(db,'cp_ubicaciones',location);
      }
    }
    const origin=addressRows.find(x=>x.tipo==='Origen');
    const destination=addressRows.find(x=>x.tipo==='Destino');
    let operator=null;
    if (t.operador_id) {
      operator=(await db.query('SELECT * FROM tms.operadores WHERE id=$1 AND activo=true',[t.operador_id])).rows[0]||null;
      if(operator) await insert(db,'cp_figuras',await snapshots(db,'figures',{carta_porte_id:cp.id,tipo_figura_sat:'01',operador_id:operator.id}));
    }
    for(const item of mapTripCargoToCartaPorte(cargoRows,cp.id))await insert(db,'cp_mercancias',item);
    const firstDescribedCargo=cargoRows.find(cargo=>cargo.descripcion||cargo.mercancia);
    const headerDescription=firstDescribedCargo?.descripcion||firstDescribedCargo?.mercancia;
    if(headerDescription)await update(db,'cartas_porte',{descripcion_carga:headerDescription},'id=$1',[cp.id]);
    const mappedCargo=cargoRows.map(cargo=>({...cargo,descripcion:cargo.descripcion||cargo.mercancia}));
    return {missing:tripPrefillMissing({customer,origin,destination,transport,operator,cargo:mappedCargo})};
  }
  async function participant(db, pId) {
    const p=await source(db,'cp_participantes',pId);
    if (p.cliente_id) return {id:p.id,...fiscalCustomer(await source(db,'clientes',p.cliente_id))};
    if (p.proveedor_id) { const v=await source(db,'proveedores',p.proveedor_id); return {id:p.id,nombre:v.razon_social,rfc:v.rfc,residencia_fiscal_sat:p.residencia_fiscal_sat,numero_registro_tributario:p.numero_registro_tributario}; }
    return {id:p.id,nombre:p.nombre,rfc:p.rfc,residencia_fiscal_sat:p.residencia_fiscal_sat,numero_registro_tributario:p.numero_registro_tributario};
  }
  async function snapshots(db, name, row, refresh=false) {
    if (name==='locations') {
      if (row.participante_id) row.participante_snapshot=json(await participant(db,row.participante_id));
      if (row.direccion_id) {
        const a=await source(db,'cp_direcciones',row.direccion_id);
        if (a.participante_id!==row.participante_id) reject(422,'ADDRESS_OWNER','La dirección no pertenece al participante');
        const addr=a.cliente_direccion_id?await source(db,'cliente_direcciones',a.cliente_direccion_id):a;
        if (a.cliente_direccion_id) { const p=await source(db,'cp_participantes',a.participante_id); if (p.cliente_id!==addr.cliente_id) reject(422,'ADDRESS_OWNER','Cliente y dirección no coinciden'); }
        const domicile=Object.fromEntries(['calle','numero_exterior','numero_interior','colonia','localidad','municipio','estado','pais','codigo_postal','referencia','pais_sat','estado_sat','municipio_sat','localidad_sat','colonia_sat'].map(k=>[k,addr[k]??null]));
        domicile.ciudad=addr.ciudad??addr.municipio??null;
        row.domicilio_snapshot=json(domicile);
        row.zona_horaria=addr.zona_horaria;
      }
    }
    if (name==='merchandise' && row.mercancia_id) {
      const m=await source(db,'mercancias',row.mercancia_id);
      for (const key of ['descripcion','bienes_transp_sat','clave_unidad_sat','unidad','material_peligroso','clave_material_peligroso_sat','embalaje_sat','descripcion_embalaje','fraccion_arancelaria','tipo_materia_sat','descripcion_materia']) if (refresh||!(key in row)) row[key]=m[key];
    }
    if (name==='transport' && row.unidad_id) {
      const {rows}=await db.query("SELECT * FROM tms.unidades WHERE id=$1 AND estatus='ACTIVA'",[row.unidad_id]);
      if (!rows[0]) reject(422,'INACTIVE_UNIT','Unidad no disponible');
      for (const [key,origin] of Object.entries({placas:'placas',anio_modelo:'anio',configuracion_vehicular_sat:'configuracion_vehicular_sat',permiso_sict_sat:'permiso_sict_sat',numero_permiso_sict:'numero_permiso_sict'})) if (refresh||!(key in row)) row[key]=rows[0][origin];
      for (const [prefix,type] of [['rc','RESPONSABILIDAD_CIVIL'],['ambiental','AMBIENTAL'],['carga','CARGA']]) {
        if (refresh || !(`seguro_${prefix}_id` in row)) {
          const {rows: policies}=await db.query("SELECT id FROM tms.unidad_seguros WHERE unidad_id=$1 AND tipo=$2 AND activo AND (vigente_desde IS NULL OR vigente_desde<=current_date) AND (vigente_hasta IS NULL OR vigente_hasta>=current_date) ORDER BY updated_at DESC,id DESC LIMIT 1",[row.unidad_id,type]);
          row[`seguro_${prefix}_id`]=policies[0]?.id||null;
        }
        if (row[`seguro_${prefix}_id`]) {
          const policy=await source(db,'unidad_seguros',row[`seguro_${prefix}_id`],false);
          if (policy.unidad_id!==row.unidad_id || policy.tipo!==type) reject(422,'INSURANCE_MISMATCH','Seguro de otra unidad o cobertura');
          if (refresh || !(`aseguradora_${prefix}` in row)) row[`aseguradora_${prefix}`]=policy.aseguradora;
          if (refresh || !(`poliza_${prefix}` in row)) row[`poliza_${prefix}`]=policy.poliza;
        }
      }
    }
    if (name==='trailers' && row.caja_id) {
      const {rows}=await db.query("SELECT * FROM tms.cajas WHERE id=$1 AND estatus='ACTIVA'",[row.caja_id]);
      if (!rows[0]) reject(422,'INACTIVE_TRAILER','Remolque inactivo');
      if(refresh||!row.placas)row.placas=rows[0].placas;if(refresh||!row.subtipo_remolque_sat)row.subtipo_remolque_sat=rows[0].subtipo_remolque_sat;
    }
    if (name==='figures' && row.operador_id) {
      const op=await source(db,'operadores',row.operador_id);
      for (const key of ['nombre','rfc','numero_licencia','residencia_fiscal_sat','numero_registro_tributario']) row[key]=op[key];
      row.domicilio_snapshot=json(op.domicilio_fiscal||{});
      if (row.tipo_figura_sat!=='01') reject(422,'FIGURE_TYPE','La referencia a operador requiere figura 01');
    } else if (name==='figures' && row.participante_id) Object.assign(row,await participant(db,row.participante_id),{id:row.id});
    return row;
  }
  async function recalculateInvoiceTotals(db, fId) {
    const invoice=(await db.query('SELECT tipo_comprobante FROM tms.cfdi WHERE id=$1',[fId])).rows[0];
    const concepts=(await db.query('SELECT * FROM tms.cfdi_conceptos WHERE cfdi_id=$1',[fId])).rows;
    if (invoice?.tipo_comprobante==='T') {
      const taxes=(await db.query('SELECT id FROM tms.cfdi_impuestos WHERE cfdi_id=$1',[fId])).rows;
      if (taxes.length) reject(422,'TRANSFER_TAXES_NOT_ALLOWED','El CFDI tipo T no admite impuestos de contraprestación');
      if (!concepts.length) return;
      if (concepts.some(c=>c.cantidad==null||c.valor_unitario==null||c.descuento!=null&&decimal(c.descuento)!==0n
        ||decimal(c.valor_unitario)!==0n||c.importe!=null&&decimal(c.importe)!==0n)) {
        reject(422,'TRANSFER_CONCEPT_AMOUNT_NOT_ZERO','Los conceptos de traslado deben estar completos y tener importes cero');
      }
      const cargo=(await db.query('SELECT bienes_transp_sat FROM tms.cp_mercancias WHERE carta_porte_id=(SELECT id FROM tms.cartas_porte WHERE cfdi_id=$1)',[fId])).rows;
      const cargoKeys=new Set(cargo.map(row=>row.bienes_transp_sat).filter(Boolean));
      if (!cargo.length||concepts.some(c=>!cargoKeys.has(c.clave_producto_servicio_sat))||cargoKeys.size!==new Set(concepts.map(c=>c.clave_producto_servicio_sat)).size||[...cargoKeys].some(key=>!concepts.some(c=>c.clave_producto_servicio_sat===key))) {
        reject(422,'TRANSFER_CONCEPT_MISMATCH','Los conceptos del traslado deben corresponder a las mercancías del complemento Carta Porte');
      }
      for (const concept of concepts) await update(db,'cfdi_conceptos',{importe:'0.000000'},'id=$1 AND cfdi_id=$2',[concept.id,fId]);
      await update(db,'cfdi',{subtotal:'0.000000',total:'0.000000'},'id=$1',[fId]);
      return;
    }
    // Incomplete drafts are common. Do not turn absent inputs into zeroes or
    // overwrite previously captured totals until every concept is calculable.
    if (!concepts.length || concepts.some(c=>c.cantidad===null || c.valor_unitario===null)) return;
    const taxes=(await db.query('SELECT * FROM tms.cfdi_impuestos WHERE cfdi_id=$1',[fId])).rows;
    const taxesComplete=taxes.every(t=>t.tipo_factor_sat==='Exento'||(t.base!==null&&t.tasa_cuota!==null));
    let subtotal=0n,discount=0n,hasDiscount=false;
    for (const c of concepts) {
      const amount=multiplyDecimal(c.cantidad,c.valor_unitario);
      subtotal+=amount;
      // A missing optional line discount means no discount under the CFDI model;
      // keep the persisted summary NULL when none was supplied.
      const disc=c.descuento===null?0n:decimal(c.descuento);
      if(c.descuento!==null)hasDiscount=true;
      discount+=disc;
      if (disc>amount) reject(422,'INVALID_DISCOUNT','El descuento supera al importe');
      await update(db,'cfdi_conceptos',{importe:formatDecimal(amount)},'id=$1 AND cfdi_id=$2',[c.id,fId]);
    }
    const changes={subtotal:formatDecimal(subtotal),descuento:hasDiscount?formatDecimal(discount):null};
    if(!taxesComplete){changes.impuestos_trasladados=null;changes.impuestos_retenidos=null;changes.total=null;await update(db,'cfdi',changes,'id=$1',[fId]);return;}
    let transfers=0n,withheld=0n,transfersKnown=false,withheldKnown=false;
    if(taxes.length){transfersKnown=true;withheldKnown=true;}
    else if(concepts.every(c=>c.objeto_impuesto_sat==='01')){transfersKnown=true;withheldKnown=true;}
    for (const tax of taxes) {
      const exempt=tax.tipo_factor_sat==='Exento';
      const amount=exempt?0n:multiplyDecimal(tax.base,tax.tasa_cuota);
      await update(db,'cfdi_impuestos',{importe:exempt?null:formatDecimal(amount)},'id=$1 AND cfdi_id=$2',[tax.id,fId]);
      if (tax.movimiento==='TRASLADO') transfers+=amount;
      else withheld+=amount;
    }
    if (transfersKnown) changes.impuestos_trasladados=formatDecimal(transfers);
    if (withheldKnown) changes.impuestos_retenidos=formatDecimal(withheld);
    if(!taxesComplete||!transfersKnown||!withheldKnown){changes.impuestos_trasladados=null;changes.impuestos_retenidos=null;changes.total=null;}
    const current=(await db.query('SELECT subtotal,descuento,impuestos_trasladados,impuestos_retenidos FROM tms.cfdi WHERE id=$1',[fId])).rows[0]||{};
    const known={...current,...changes};
    if (taxesComplete&&transfersKnown&&withheldKnown&&known.subtotal!==null&&known.subtotal!==undefined&&known.impuestos_trasladados!==null&&known.impuestos_trasladados!==undefined&&known.impuestos_retenidos!==null&&known.impuestos_retenidos!==undefined) {
      const total=decimal(known.subtotal)-(known.descuento==null?0n:decimal(known.descuento))+decimal(known.impuestos_trasladados)-decimal(known.impuestos_retenidos);
      if(total<0n)reject(422,'INVALID_TOTAL','El total no puede ser negativo');
      changes.total=formatDecimal(total);
    }
    await update(db,'cfdi',changes,'id=$1',[fId]);
  }
  async function recalculateMerchandiseTotals(db, cpId) {
    const m=(await db.query('SELECT count(*)::int AS count, sum(peso_kg) AS weight FROM tms.cp_mercancias WHERE carta_porte_id=$1',[cpId])).rows[0];
    await update(db,'cartas_porte',{numero_total_mercancias:m.count||null,peso_bruto_total:m.weight||null},'id=$1',[cpId]);
  }
  async function changeGroup(db, cpId, fId, group, input) {
    const names=groups[group]; if (!names) reject(404,'UNKNOWN_SECTION','Apartado inexistente');
    only(input,['expected_revision',...names]);
    const prepared={};
    for(const name of names){
      if(!input[name])continue;
      const c=children[name]; only(input[name],['upsert','remove']);
      const upsert=input[name].upsert||[],remove=input[name].remove||[];
      if(!Array.isArray(upsert)||!Array.isArray(remove)||upsert.length>100||remove.length>100)reject(400,'INVALID_BATCH','Envía hasta 100 filas por apartado');
      const keySpec=Object.fromEntries(c.keys.map(k=>[k,c.fields[k]||'uuid']));
      const removals=remove.map(entry=>fields(entry,keySpec,c.keys));
      const updates=upsert.map(entry=>{
        const parsed=fields(entry,{...c.fields,...Object.fromEntries(c.keys.map(k=>[k,c.fields[k]||'uuid']))});
        if(c.keys.includes('id')&&!parsed.id)parsed.id=randomUUID();
        for(const key of c.keys)if(parsed[key]===undefined)reject(400,'MISSING_KEY',`Falta ${key}`);
        return parsed;
      });
      const identity=row=>JSON.stringify(c.keys.map(k=>row[k]));
      const updateKeys=updates.map(identity),removeKeys=removals.map(identity);
      if(new Set(updateKeys).size!==updateKeys.length||new Set(removeKeys).size!==removeKeys.length)reject(400,'DUPLICATE_ROW_KEY','No repitas la misma fila en el lote');
      if(updateKeys.some(key=>removeKeys.includes(key)))reject(400,'CONFLICTING_ROW_ACTION','No actualices y elimines la misma fila');
      prepared[name]={upsert:updates,remove:removals};
    }
    // Borrar dependencias en orden inverso; insertar padres antes que sus relaciones.
    for (const name of [...names].reverse()) {
      if (!prepared[name]) continue;
      const c=children[name], scope=c.scope==='cfdi_id'?fId:cpId;
      for (const key of prepared[name].remove) {
        const values=[scope,...c.keys.map(k=>key[k])];
        const result=await db.query(`DELETE FROM tms.${c.table} WHERE ${c.scope}=$1${c.keys.map((k,i)=>` AND ${k}=$${i+2}`).join('')} RETURNING *`,values);
        if (!result.rows.length) reject(404,'ROW_NOT_FOUND','Fila a eliminar no encontrada en este documento');
      }
    }
    for (const name of names) {
      const c=children[name], scope=c.scope==='cfdi_id'?fId:cpId;
      for (const parsed of prepared[name]?.upsert||[]) {
        const params=[scope,...c.keys.map(k=>parsed[k])];
        const where=`${c.scope}=$1${c.keys.map((k,i)=>` AND ${k}=$${i+2}`).join('')}`;
        const existing=(await db.query(`SELECT * FROM tms.${c.table} WHERE ${where}`,params)).rows[0];
        const sourceKey={merchandise:'mercancia_id',transport:'unidad_id',trailers:'caja_id'}[name];
        let row=await snapshots(db,name,{...(existing||{}),...parsed},Boolean(sourceKey&&existing&&parsed[sourceKey]&&parsed[sourceKey]!==existing[sourceKey]));
        if(name==='merchandise'){
          if(!row.descripcion?.trim())reject(422,'MERCHANDISE_DESCRIPTION_REQUIRED','Cada mercancía requiere descripción');
          if(row.cantidad!=null&&decimal(row.cantidad)<=0n)reject(422,'INVALID_QUANTITY','La cantidad debe ser mayor que cero');
          if(row.peso_kg!=null&&decimal(row.peso_kg)<=0n)reject(422,'INVALID_WEIGHT','El peso de la mercancía debe ser mayor que cero');
        }
        if(name==='merchandise'&&(!existing||['bienes_transp_sat','clave_unidad_sat','material_peligroso','clave_material_peligroso_sat','embalaje_sat'].some(key=>Object.hasOwn(parsed,key)))){
          if(row.clave_material_peligroso_sat&&row.material_peligroso!==true)reject(422,'HAZMAT_MISMATCH','La clave de material peligroso requiere material_peligroso=true');
          if(row.material_peligroso===true&&(!row.clave_material_peligroso_sat||!row.embalaje_sat))reject(422,'HAZMAT_FIELDS_REQUIRED','El material peligroso requiere clave SAT y embalaje SAT');
          const invalidKeys=await findInvalidTripCargoSatKeys(db,[row],{catalogProvider:cfdiCatalogProvider});
          if(invalidKeys.length){const invalid=invalidKeys[0];reject(422,'INVALID_SAT_KEY',`La clave no existe o no está vigente en ${invalid.catalog}`,[{path:`merchandise.${invalid.field}`,code:'INVALID_SAT_KEY',message:`Clave no válida para ${invalid.catalog}`}]);}
        }
        // Solo columnas conocidas: los valores obtenidos de SELECT no se interpolan como nombres.
        const allowed=[...keysFor(c),'participante_snapshot','domicilio_snapshot'];
        row=Object.fromEntries(Object.entries(row).filter(([k])=>allowed.includes(k)));
        if (existing) {
          const changes=Object.fromEntries(Object.entries(row).filter(([k])=>!c.keys.includes(k)));
          if (Object.keys(changes).length) await update(db,c.table,changes,where,params);
        } else await insert(db,c.table,{...row,[c.scope]:scope});
      }
    }
    // Recalculate only the derived data owned by the section being edited.
    // In particular, location edits must never touch CFDI amounts or cargo.
    if (group==='merchandise') await recalculateMerchandiseTotals(db,cpId);
    if (group==='invoice-items') await recalculateInvoiceTotals(db,fId);
  }
  function requireProvider() { if (!provider || !files) reject(503,'PAC_NOT_CONFIGURED','Proveedor fiscal y almacenamiento privado pendientes de configurar'); }
  const fiscal=createFiscalOperations({provider,files,transaction,header,aggregate,insert,update,audit,pool});

  return {
    async catalogList(name, query) {
      const c=Object.hasOwn(catalogs,name)?catalogs[name]:null; if (!c) reject(404,'UNKNOWN_CATALOG','Catálogo inexistente');
      const {limit,offset}=pagination(query); const q=String(query.q||'').slice(0,200);
      const columns=['id',c.statusField||'activo','created_at','updated_at::text AS updated_at',...Object.keys(c.fields)].join(',');
      return (await pool.query(`SELECT ${columns} FROM tms.${c.table} WHERE ${c.search} ILIKE $1 ORDER BY ${c.search},id LIMIT $2 OFFSET $3`,[`%${q}%`,limit,offset])).rows;
    },
    async catalogGet(name, resourceId) {
      const c=Object.hasOwn(catalogs,name)?catalogs[name]:null; if (!c) reject(404,'UNKNOWN_CATALOG','Catálogo inexistente');
      const row=(await pool.query(`SELECT *,updated_at::text AS updated_at FROM tms.${c.table} WHERE id=$1`,[id(resourceId)])).rows[0];
      if (!row) reject(404,'NOT_FOUND','Registro no encontrado'); return safeCatalog(c,row);
    },
    async catalogSave(name, resourceId, body, actor, activeOnly=false) {
      if(name==='operators')return operators.save(resourceId,body,actor,activeOnly);
      const c=Object.hasOwn(catalogs,name)?catalogs[name]:null; if (!c) reject(404,'UNKNOWN_CATALOG','Catálogo inexistente');
      const {expected_updated_at,...input}=object(body);
      if(c.statusField&&activeOnly)reject(409,'USE_FLEET_WORKFLOW','El estado del recurso se gestiona desde Flota y sus bloqueos');
      const data=fields(input,activeOnly?{activo:'boolean'}:c.fields,resourceId?[]:c.required);
      if(data.rfc)data.rfc=data.rfc.toUpperCase();
      if(data.zona_horaria){try{new Intl.DateTimeFormat('es-MX',{timeZone:data.zona_horaria});}catch{reject(400,'INVALID_TIMEZONE','Zona horaria inválida');}}
      for(const key of ['pais','domicilio_legal_pais'])if(data[key]&&!/^[A-Za-z]{2}$/.test(data[key]))reject(400,'INVALID_COUNTRY','El país operativo utiliza dos letras; la clave SAT tiene su campo propio');
      if (activeOnly && typeof data.activo!=='boolean') reject(400,'INVALID_ACTIVE','Envía activo como booleano');
      return transaction(async db=>{
        let row;
        const existing=resourceId?(await db.query(`SELECT *,updated_at::text AS updated_at FROM tms.${c.table} WHERE id=$1 FOR UPDATE`,[id(resourceId)])).rows[0]:null;
        if(resourceId&&!existing)reject(404,'NOT_FOUND','Registro no encontrado');
        if(!activeOnly&&name==='participants'){
          if(existing&&(existing.cliente_id||existing.proveedor_id)&&['nombre','rfc'].some(k=>Object.hasOwn(data,k)))reject(409,'EDIT_MASTER_RESOURCE','La identidad vinculada se edita en Clientes o Proveedores');
          if(data.cliente_id){const customer=await source(db,'clientes',data.cliente_id);data.nombre=customer.razon_social;data.rfc=customer.rfc;}
          if(data.proveedor_id){const supplier=await source(db,'proveedores',data.proveedor_id);data.nombre=supplier.razon_social;data.rfc=supplier.rfc;}
        }
        if(!activeOnly&&name==='addresses'){
          if(existing?.cliente_direccion_id)reject(409,'EDIT_MASTER_RESOURCE','La dirección vinculada se edita en Clientes y direcciones');
          if(data.cliente_direccion_id){
            const original=await source(db,'cliente_direcciones',data.cliente_direccion_id);
            const p=await source(db,'cp_participantes',data.participante_id||existing?.participante_id);
            if(p.cliente_id!==original.cliente_id)reject(422,'ADDRESS_OWNER','La dirección no pertenece al cliente del participante');
          }
        }
        if (resourceId) {
          if (typeof expected_updated_at!=='string' || Number.isNaN(Date.parse(expected_updated_at))) reject(400,'EXPECTED_VERSION','Envía expected_updated_at');
          row=await update(db,c.table,data,'id=$1 AND updated_at=$2::timestamptz',[id(resourceId),expected_updated_at]);
          if (!row) reject(409,'STALE_CATALOG','Registro inexistente o modificado');
        } else row=await insert(db,c.table,data);
        await audit(db,actor,c.table,row.id,resourceId?'ACTUALIZAR':'CREAR'); return safeCatalog(c,row);
      });
    },
    async summary() {
      const result={}; for (const [name,c] of Object.entries(catalogs)) result[name]=(await pool.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE ${c.statusField?"estatus='ACTIVA'":'activo'})::int AS activos FROM tms.${c.table}`)).rows[0]; return result;
    },
    async sat(catalog,query={}) {
      if (!/^[A-Za-z_]{1,80}$/.test(catalog)) reject(400,'INVALID_CATALOG','Catálogo SAT inválido');
      id(query.version_id); const {limit,offset}=pagination(query);
      const date=query.date||new Date().toISOString().slice(0,10); fields({date},{date:'date'});
      return (await pool.query('SELECT catalogo,clave,descripcion,reglas FROM tms.cp_sat_claves WHERE version_id=$1 AND catalogo=$2 AND (vigente_desde IS NULL OR vigente_desde<=$3::date) AND (vigente_hasta IS NULL OR vigente_hasta>=$3::date) AND (descripcion ILIKE $4 OR clave ILIKE $4) ORDER BY clave LIMIT $5 OFFSET $6',[query.version_id,catalog,date,`%${String(query.q||'').slice(0,200)}%`,limit,offset])).rows;
    },
    async list(folio) { const t=await trip(pool,folio); return (await pool.query('SELECT c.*,f.estado,f.origen,f.revision,f.uuid_fiscal FROM tms.cartas_porte c JOIN tms.cfdi f ON f.id=c.cfdi_id WHERE c.viaje_id=$1 ORDER BY c.created_at DESC',[t.id])).rows; },
    async get(cpId) { return transaction(async db=>{await header(db,cpId);return aggregate(db,cpId);}); },
    async create(folio,body,actor) {
      const input=fields(body,{empresa_emisora_id:'uuid',tipo_comprobante:'text',cliente_id:'uuid',escenario_fiscal:'text',mercancias_propias:'boolean',datos_qa:'boolean'},['empresa_emisora_id','tipo_comprobante','escenario_fiscal']);
      if (!['I','T'].includes(input.tipo_comprobante)) reject(400,'INVALID_INVOICE_TYPE','Tipo de comprobante inválido');
      return transaction(async db=>{
        const t=await trip(db,folio,true);
        if (t.estado_operativo==='CANCELADO') reject(409,'TRIP_CANCELLED','No crear documentos de un viaje cancelado');
        const open=(await db.query("SELECT id FROM tms.cfdi WHERE viaje_id=$1 AND origen='PROPIO' AND estado<>'CANCELADO'",[t.id])).rows;
        if (open.length) reject(409,'EXISTING_DOCUMENT','Ya existe un documento propio; consulta o sustituye el existente');
        const issuer=await source(db,'empresas_emisoras',input.empresa_emisora_id);
        const customer=await source(db,'clientes',input.cliente_id||t.cliente_id);
        const fiscalScenario=validateFiscalCreation({tipoComprobante:input.tipo_comprobante,escenarioFiscal:input.escenario_fiscal,mercanciasPropias:input.mercancias_propias,trip:t,issuer,customer});
        const f=await insert(db,'cfdi',{viaje_id:t.id,empresa_emisora_id:issuer.id,cliente_id:customer.id,tipo_comprobante:input.tipo_comprobante,creado_por:actor,
          emisor_snapshot:json({rfc:issuer.rfc,nombre:issuer.razon_social,regimen_fiscal_sat:issuer.regimen_fiscal_sat,domicilio:issuer.domicilio}),receptor_snapshot:json(fiscalCustomer(customer)),lugar_expedicion_cp:issuer.lugar_expedicion_cp,uso_cfdi_sat:customer.uso_cfdi,
          forma_pago_sat:input.tipo_comprobante==='T'?null:customer.forma_pago,metodo_pago_sat:input.tipo_comprobante==='T'?null:customer.metodo_pago,
          ...(input.tipo_comprobante==='T'?{total:'0.000000'}:{})});
        const cp=await insert(db,'cartas_porte',{cfdi_id:f.id,viaje_id:t.id,sat_version_id:CARTA_PORTE_31_CATALOG_VERSION});
        let transport=null;
        if (t.unidad_id) {
          transport=await snapshots(db,'transport',{unidad_id:t.unidad_id});
          await insert(db,'cp_autotransporte',{carta_porte_id:cp.id,...transport});
        }
        const prefill=await tripPrefill(db,t,cp,customer,transport);
        await audit(db,actor,'cartas_porte',cp.id,'CREAR',f.id,{precarga_faltante:prefill.missing,escenario_fiscal:fiscalScenario.escenario,mercancias_propias:input.mercancias_propias===true,datos_qa:input.datos_qa===true});
        const document=await aggregate(db,cp.id);
        document.precarga.faltantes=[...new Set([...document.precarga.faltantes,...prefill.missing])];
        document.advertencias=[];
        if(input.datos_qa===true)document.advertencias.push({category:'QA',code:'SYNTHETIC_DATA',message:'Documento de prueba con datos QA; no utilizar para operación fiscal ni timbrado'});
        return document;
      });
    },
    async patch(cpId,body,actor) {
      only(body,['expected_revision','header','invoice','escenario_fiscal','mercancias_propias','datos_qa']); revision(body.expected_revision);
      const cp=fields(body.header||{},headerFields), invoice=fields(body.invoice||{},invoiceFields);
      const fiscalMetadata=fields(Object.fromEntries(['escenario_fiscal','mercancias_propias','datos_qa'].filter(k=>Object.hasOwn(body,k)).map(k=>[k,body[k]])),{escenario_fiscal:'text',mercancias_propias:'boolean',datos_qa:'boolean'},Object.hasOwn(body,'escenario_fiscal')?['escenario_fiscal']:[]);
      return transaction(async db=>{
        const f=await header(db,cpId,body.expected_revision,true);
        if(f.tipo_comprobante==='T'&&invoice.cliente_id){
          const target=await source(db,'clientes',invoice.cliente_id);
          const issuerSnapshot=typeof f.emisor_snapshot==='string'?JSON.parse(f.emisor_snapshot):f.emisor_snapshot;
          if(target.rfc!==issuerSnapshot?.rfc)reject(422,'TRANSFER_RFC_MISMATCH','No se puede asignar al CFDI tipo T un receptor con RFC distinto al emisor');
        }
        let auditMetadata={};
        if(Object.keys(fiscalMetadata).length){
          const tripRow=(await db.query('SELECT * FROM tms.viajes WHERE id=$1',[f.viaje_id])).rows[0];
          const issuerSnapshot=typeof f.emisor_snapshot==='string'?JSON.parse(f.emisor_snapshot):f.emisor_snapshot;
          const receiverSnapshot=invoice.cliente_id?fiscalCustomer(await source(db,'clientes',invoice.cliente_id)):(typeof f.receptor_snapshot==='string'?JSON.parse(f.receptor_snapshot):f.receptor_snapshot);
          const scenario=validateFiscalCreation({tipoComprobante:f.tipo_comprobante,escenarioFiscal:fiscalMetadata.escenario_fiscal,
            mercanciasPropias:fiscalMetadata.mercancias_propias,trip:tripRow,issuer:issuerSnapshot,customer:{rfc:receiverSnapshot?.rfc}});
          auditMetadata={escenario_fiscal:scenario.escenario,mercancias_propias:fiscalMetadata.mercancias_propias===true,datos_qa:fiscalMetadata.datos_qa===true};
        }
        if (Object.keys(cp).length) await update(db,'cartas_porte',cp,'id=$1',[cpId]);
        if (invoice.cliente_id) invoice.receptor_snapshot=json(fiscalCustomer(await source(db,'clientes',invoice.cliente_id)));
        if (Object.keys(invoice).length) await update(db,'cfdi',{...invoice,estado:'BORRADOR',solicitud_snapshot:null,solicitud_sha256:null},'id=$1',[f.id]);
        await audit(db,actor,'cartas_porte',cpId,Object.keys(auditMetadata).length?'DECLARAR_ESCENARIO_FISCAL':'EDITAR',f.id,{...auditMetadata,revision_anterior:Number(f.revision)}); return aggregate(db,cpId);
      });
    },
    async group(cpId,group,body,actor) {
      revision(body.expected_revision);
      return transaction(async db=>{const f=await header(db,cpId,body.expected_revision,true);
        if(group==='merchandise'){
          const cp=(await db.query('SELECT sat_version_id FROM tms.cartas_porte WHERE id=$1 FOR UPDATE',[cpId])).rows[0];
          if(cp&&!cp.sat_version_id)await update(db,'cartas_porte',{sat_version_id:CARTA_PORTE_31_CATALOG_VERSION},'id=$1',[cpId]);
        }
        await changeGroup(db,cpId,f.id,group,body);await audit(db,actor,'cartas_porte',cpId,`EDITAR_${group}`,f.id,{revision_anterior:Number(f.revision)});return aggregate(db,cpId);});
    },
    async reopen(cpId,body,actor) {
      only(body,['expected_revision']); revision(body.expected_revision);
      return transaction(async db=>{const f=await header(db,cpId,body.expected_revision);if(!['VALIDADO','RECHAZADO'].includes(f.estado)||f.origen!=='PROPIO')reject(409,'DOCUMENT_LOCKED','No se puede reabrir');await update(db,'cfdi',{estado:'BORRADOR'},'id=$1',[f.id]);await audit(db,actor,'cfdi',f.id,'REABRIR',f.id);return aggregate(db,cpId);});
    },
    async validate(cpId,body,actor) {
      only(body,['expected_revision','dry_run']); revision(body.expected_revision);
      if(body.dry_run!==undefined&&typeof body.dry_run!=='boolean')reject(400,'INVALID_DRY_RUN','dry_run debe ser booleano');
      const dryRun=body.dry_run===true;
      return transaction(async db=>{
        const f=await header(db,cpId,body.expected_revision,true); const data=await aggregate(db,cpId);
        if(f.estado!=='BORRADOR')reject(409,'DOCUMENT_LOCKED','Reabre el documento antes de validarlo');
        const tripRow=(await db.query('SELECT unidad_id,operador_id,caja_id,proveedor_id FROM tms.viajes WHERE id=$1',[f.viaje_id])).rows[0];
        const assignmentErrors=[];
        const checkAssignment=(condition,path,message)=>{
          if(!condition)return;
          if(!dryRun)reject(422,'ASSIGNMENT_MISMATCH',message);
          assignmentErrors.push({category:'ESTRUCTURA',path,code:'ASSIGNMENT_MISMATCH',message});
        };
        checkAssignment(tripRow?.unidad_id&&data.transport[0]?.unidad_id!==tripRow.unidad_id,'transport','La unidad no coincide con la asignación del viaje');
        checkAssignment(tripRow?.operador_id&&!data.figures.some(fig=>fig.operador_id===tripRow.operador_id),'figures','El operador no coincide con la asignación del viaje');
        checkAssignment(tripRow?.caja_id&&!data.trailers.some(trailer=>trailer.caja_id===tripRow.caja_id),'trailers','El remolque no coincide con la asignación del viaje');
        const {validateCartaPorteDetailed}=await import('./carta-porte-validation.js');
        const auditData=(await db.query("SELECT datos FROM tms.cp_auditoria WHERE cfdi_id=$1 AND datos ? 'escenario_fiscal' ORDER BY created_at DESC,id DESC LIMIT 1",[f.id])).rows[0]?.datos||{};
        const metadata=typeof auditData==='string'?JSON.parse(auditData):auditData;
        const fiscalResult=validateCartaPorteDetailed(data,{scenario:metadata.escenario_fiscal,qaDeclared:metadata.datos_qa===true,
          mercanciasPropias:metadata.mercancias_propias===true,mediosPropios:Boolean(tripRow?.unidad_id&&!tripRow?.proveedor_id)});
        let catalogErrors=[];
        try{catalogErrors=await validateCfdiCatalogKeys(data,cfdiCatalogProvider);}
        catch{reject(503,'CFDI_CATALOG_UNAVAILABLE','No se pudieron verificar los catálogos locales CFDI');}
        const errors=[...assignmentErrors,...fiscalResult.errors,...catalogErrors];
        if(dryRun){
          return {valid:errors.length===0,mode:'DRY_RUN',provider_checked:false,errors,
            structural_errors:errors.filter(error=>error.category==='ESTRUCTURA'),
            fiscal_errors:errors.filter(error=>error.category==='FISCAL'),warnings:fiscalResult.warnings,
            pending_fields:[...(data.precarga?.faltantes||[])],revision:Number(f.revision),estado:f.estado};
        }
        if (errors.length) reject(422,'CARTA_PORTE_INCOMPLETE','Falta completar información',errors,fiscalResult.warnings);
        requireProvider();
        const version=(await db.query('SELECT * FROM tms.cp_sat_versiones WHERE id=$1',[data.sat_version_id])).rows[0];
        if (!version) reject(503,'SAT_NOT_CONFIGURED','Carga una revisión oficial de catálogos SAT');
        // El adaptador realiza la validación fiscal completa, XSD, catálogos y redondeos.
        const result=await provider.validate(data,{db,version});
        if (!result?.valid) reject(422,'FISCAL_VALIDATION_FAILED','Documento rechazado por validación fiscal',result?.errors||[],fiscalResult.warnings);
        await update(db,'cfdi',{estado:'VALIDADO',solicitud_snapshot:json(data),solicitud_sha256:hash(json(data))},'id=$1',[f.id]);
        await audit(db,actor,'cfdi',f.id,'VALIDAR',f.id); const validated=await aggregate(db,cpId);validated.advertencias=fiscalResult.warnings;return validated;
      });
    },
    async events(cpId) { return transaction(async db=>{const f=await header(db,cpId);return (await db.query('SELECT * FROM tms.cp_auditoria WHERE cfdi_id=$1 ORDER BY created_at,id',[f.id])).rows;}); },
    async operation(cpId,operationId) { return transaction(async db=>{const f=await header(db,cpId);const row=(await db.query('SELECT id,cfdi_id,operacion,estado,codigo_respuesta,mensaje_respuesta,uuid_respuesta,created_at,updated_at FROM tms.cp_timbrado_intentos WHERE id=$1 AND cfdi_id=$2',[id(operationId),f.id])).rows[0];if(!row)reject(404,'OPERATION_NOT_FOUND','Operación no encontrada');return row;}); },
    async file(cpId,kind,actor) {
      const column={xml:'xml_archivo_id',pdf:'pdf_archivo_id',cancellation:'acuse_cancelacion_archivo_id'}[kind];
      if(!column)reject(404,'FILE_NOT_FOUND','Tipo de documento inexistente');
      const data=await this.get(cpId); if(!data.cfdi[column])reject(404,'FILE_NOT_FOUND','Archivo aún no disponible');
      if(!files)reject(503,'STORAGE_NOT_CONFIGURED','Almacenamiento privado pendiente de configurar');
      return files.read(data.cfdi[column],{actor,authorizedDocument:true});
    },
    // El proveedor es inyectado al crear el servicio; nunca se simula un timbrado.
    async providerAction(action,request) {
      if(action==='refresh-snapshots')return transaction(async db=>{
        const f=await header(db,request.id,request.body.expected_revision,true);
        const data=await aggregate(db,request.id);
        for(const name of ['locations','merchandise','transport','trailers','figures']){
          const c=children[name];
          for(const current of data[name]){
            const row=await snapshots(db,name,{...current},true);
            const changes=Object.fromEntries(Object.entries(row).filter(([k])=>[...Object.keys(c.fields),'participante_snapshot','domicilio_snapshot'].includes(k)&&!c.keys.includes(k)));
            const values=[request.id,...c.keys.map(k=>current[k])];
            await update(db,c.table,changes,`${c.scope}=$1${c.keys.map((k,i)=>` AND ${k}=$${i+2}`).join('')}`,values);
          }
        }
        const customer=await source(db,'clientes',f.cliente_id),issuer=await source(db,'empresas_emisoras',f.empresa_emisora_id);
        await update(db,'cfdi',{estado:'BORRADOR',receptor_snapshot:json(fiscalCustomer(customer)),emisor_snapshot:json({rfc:issuer.rfc,nombre:issuer.razon_social,regimen_fiscal_sat:issuer.regimen_fiscal_sat,domicilio:issuer.domicilio}),solicitud_snapshot:null,solicitud_sha256:null},'id=$1',[f.id]);
        await audit(db,request.actor,'cfdi',f.id,'RECARGAR_CATALOGOS',f.id);return aggregate(db,request.id);
      });
      if(action==='replacement')return transaction(async db=>{
        const lookup=(await db.query('SELECT viaje_id FROM tms.cartas_porte WHERE id=$1',[id(request.id)])).rows[0];
        if(!lookup)reject(404,'DOCUMENT_NOT_FOUND','Carta Porte no encontrada');
        await db.query('SELECT id FROM tms.viajes WHERE id=$1 FOR UPDATE',[lookup.viaje_id]);
        const f=await header(db,request.id,request.body.expected_revision);
        if(f.origen!=='PROPIO'||!['TIMBRADO','CANCELADO'].includes(f.estado))reject(409,'DOCUMENT_STATE','Solo se sustituye un documento propio emitido');
        const previous=(await db.query("SELECT r.id FROM tms.cfdi_relaciones r JOIN tms.cfdi f ON f.id=r.cfdi_id WHERE r.uuid_relacionado=$1 AND r.tipo_relacion_sat='04' AND f.estado<>'CANCELADO'",[f.uuid_fiscal])).rows;
        if(previous.length)reject(409,'EXISTING_REPLACEMENT','Ya existe una sustitución en curso');
        const old=await aggregate(db,request.id);
        const fKeys=['empresa_emisora_id','cliente_id','proveedor_id','tipo_comprobante','lugar_expedicion_cp','emisor_snapshot','receptor_snapshot','uso_cfdi_sat','forma_pago_sat','metodo_pago_sat','exportacion_sat','moneda','tipo_cambio','subtotal','descuento','impuestos_trasladados','impuestos_retenidos','total'];
        const next=await insert(db,'cfdi',{...Object.fromEntries(fKeys.map(k=>[k,f[k]])),viaje_id:f.viaje_id,creado_por:request.actor});
        const cp=await insert(db,'cartas_porte',{...Object.fromEntries(Object.keys(headerFields).map(k=>[k,old[k]])),viaje_id:f.viaje_id,cfdi_id:next.id});
        const remap=new Map();for(const rows of Object.keys(children).map(k=>old[k]))for(const row of rows)if(row.id)remap.set(row.id,randomUUID());
        for(const [name,c]of Object.entries(children)){
          if(name==='relations')continue;
          for(const row of old[name]){
            const values=Object.fromEntries([...new Set([...keysFor(c),'participante_snapshot','domicilio_snapshot',...(name==='concepts'?['importe']:[]),...(name==='taxes'?['importe']:[])])].filter(k=>row[k]!==undefined).map(k=>[k,remap.get(row[k])||row[k]]));
            await insert(db,c.table,{...values,[c.scope]:c.scope==='cfdi_id'?next.id:cp.id});
          }
        }
        await insert(db,'cfdi_relaciones',{cfdi_id:next.id,tipo_relacion_sat:'04',uuid_relacionado:f.uuid_fiscal,cfdi_relacionado_id:f.id});
        await audit(db,request.actor,'cfdi',next.id,'CREAR_SUSTITUCION',next.id,{anterior_id:f.id});return aggregate(db,cp.id);
      });
      if(!Object.hasOwn(fiscal,action))reject(404,'UNKNOWN_OPERATION','Operación inexistente');
      return fiscal[action](request);
    },
  };
}
