import { randomUUID, createHash } from 'node:crypto';
import { catalogs, children, groups, headerFields, invoiceFields } from './carta-porte-config.js';
import { reject, uuid, fields, only, object, revision, decimal, formatDecimal, multiplyDecimal } from './carta-porte-input.js';
import { createFiscalOperations } from './carta-porte-operations.js';
import { createOperatorService } from './operators.js';

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
  await insert(db,'cp_auditoria',{tabla:table,entidad_id:entity,accion:action,actor_id:actor,cfdi_id:cfdi,datos:json(data)});
}
function safeCatalog(c, row) {
  if (!row) return row;
  return Object.fromEntries(['id',c.statusField||'activo','created_at','updated_at',...Object.keys(c.fields)].map(k=>[k,row[k]]));
}

export function createCartaPorteService({pool, provider = null, files = null}) {
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
        row.domicilio_snapshot=json(Object.fromEntries(['calle','numero_exterior','numero_interior','colonia','localidad','municipio','estado','pais','codigo_postal','referencia','pais_sat','estado_sat','municipio_sat','localidad_sat','colonia_sat'].map(k=>[k,addr[k]??null])));
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
        if (row[`seguro_${prefix}_id`]) {
          const policy=await source(db,'unidad_seguros',row[`seguro_${prefix}_id`]);
          if (policy.unidad_id!==row.unidad_id || policy.tipo!==type) reject(422,'INSURANCE_MISMATCH','Seguro de otra unidad o cobertura');
          row[`aseguradora_${prefix}`]=policy.aseguradora; row[`poliza_${prefix}`]=policy.poliza;
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
  async function totals(db, cpId, fId) {
    const concepts=(await db.query('SELECT * FROM tms.cfdi_conceptos WHERE cfdi_id=$1',[fId])).rows;
    let subtotal=0n,discount=0n,transfers=0n,withheld=0n;
    for (const c of concepts) {
      if (c.cantidad===null || c.valor_unitario===null) continue;
      const amount=multiplyDecimal(c.cantidad,c.valor_unitario); const disc=decimal(c.descuento||'0');
      if (disc>amount) reject(422,'INVALID_DISCOUNT','El descuento supera al importe');
      await update(db,'cfdi_conceptos',{importe:formatDecimal(amount)},'id=$1 AND cfdi_id=$2',[c.id,fId]);
      subtotal+=amount; discount+=disc;
    }
    const taxes=(await db.query('SELECT * FROM tms.cfdi_impuestos WHERE cfdi_id=$1',[fId])).rows;
    for (const tax of taxes) {
      const amount=tax.tipo_factor_sat==='Exento'?null:multiplyDecimal(tax.base,tax.tasa_cuota||'0');
      await update(db,'cfdi_impuestos',{importe:amount===null?null:formatDecimal(amount)},'id=$1 AND cfdi_id=$2',[tax.id,fId]);
      if (amount!==null) { if (tax.movimiento==='TRASLADO') transfers+=amount; else withheld+=amount; }
    }
    if (subtotal-discount+transfers-withheld<0n) reject(422,'INVALID_TOTAL','El total no puede ser negativo');
    await update(db,'cfdi',{subtotal:formatDecimal(subtotal),descuento:formatDecimal(discount),impuestos_trasladados:formatDecimal(transfers),impuestos_retenidos:formatDecimal(withheld),total:formatDecimal(subtotal-discount+transfers-withheld)},'id=$1',[fId]);
    const m=(await db.query('SELECT count(*)::int AS count, sum(peso_kg) AS weight FROM tms.cp_mercancias WHERE carta_porte_id=$1',[cpId])).rows[0];
    await update(db,'cartas_porte',{numero_total_mercancias:m.count||null,peso_bruto_total:m.weight||null},'id=$1',[cpId]);
  }
  async function changeGroup(db, cpId, fId, group, input) {
    const names=groups[group]; if (!names) reject(404,'UNKNOWN_SECTION','Apartado inexistente');
    only(input,['expected_revision',...names]);
    // Borrar dependencias en orden inverso; insertar padres antes que sus relaciones.
    for (const name of [...names].reverse()) {
      if (!input[name]) continue;
      const c=children[name], scope=c.scope==='cfdi_id'?fId:cpId;
      only(input[name],['upsert','remove']);
      if (!Array.isArray(input[name].upsert||[]) || !Array.isArray(input[name].remove||[]) || (input[name].upsert||[]).length>100 || (input[name].remove||[]).length>100) reject(400,'INVALID_BATCH','Envía hasta 100 filas por apartado');
      for (const entry of input[name].remove||[]) {
        const keySpec=Object.fromEntries(c.keys.map(k=>[k,c.fields[k]||'uuid']));
        const key=fields(entry,keySpec,c.keys);
        const values=[scope,...c.keys.map(k=>key[k])];
        const result=await db.query(`DELETE FROM tms.${c.table} WHERE ${c.scope}=$1${c.keys.map((k,i)=>` AND ${k}=$${i+2}`).join('')} RETURNING *`,values);
        if (!result.rows.length) reject(404,'ROW_NOT_FOUND','Fila a eliminar no encontrada en este documento');
      }
    }
    for (const name of names) {
      const c=children[name], scope=c.scope==='cfdi_id'?fId:cpId;
      for (const entry of input[name]?.upsert||[]) {
        const parsed=fields(entry,{...c.fields,...Object.fromEntries(c.keys.map(k=>[k,c.fields[k]||'uuid']))});
        if (c.keys.includes('id') && !parsed.id) parsed.id=randomUUID();
        for (const key of c.keys) if (parsed[key]===undefined) reject(400,'MISSING_KEY',`Falta ${key}`);
        const params=[scope,...c.keys.map(k=>parsed[k])];
        const where=`${c.scope}=$1${c.keys.map((k,i)=>` AND ${k}=$${i+2}`).join('')}`;
        const existing=(await db.query(`SELECT * FROM tms.${c.table} WHERE ${where}`,params)).rows[0];
        const sourceKey={merchandise:'mercancia_id',transport:'unidad_id',trailers:'caja_id'}[name];
        let row=await snapshots(db,name,{...(existing||{}),...parsed},Boolean(sourceKey&&existing&&parsed[sourceKey]&&parsed[sourceKey]!==existing[sourceKey]));
        // Solo columnas conocidas: los valores obtenidos de SELECT no se interpolan como nombres.
        const allowed=[...keysFor(c),'participante_snapshot','domicilio_snapshot'];
        row=Object.fromEntries(Object.entries(row).filter(([k])=>allowed.includes(k)));
        if (existing) {
          const changes=Object.fromEntries(Object.entries(row).filter(([k])=>!c.keys.includes(k)));
          if (Object.keys(changes).length) await update(db,c.table,changes,where,params);
        } else await insert(db,c.table,{...row,[c.scope]:scope});
      }
    }
    await totals(db,cpId,fId);
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
      const input=fields(body,{empresa_emisora_id:'uuid',tipo_comprobante:'text',cliente_id:'uuid'},['empresa_emisora_id','tipo_comprobante']);
      if (!['I','T'].includes(input.tipo_comprobante)) reject(400,'INVALID_INVOICE_TYPE','Tipo de comprobante inválido');
      return transaction(async db=>{
        const t=await trip(db,folio,true);
        if (t.estado_operativo==='CANCELADO') reject(409,'TRIP_CANCELLED','No crear documentos de un viaje cancelado');
        const open=(await db.query("SELECT id FROM tms.cfdi WHERE viaje_id=$1 AND origen='PROPIO' AND estado<>'CANCELADO'",[t.id])).rows;
        if (open.length) reject(409,'EXISTING_DOCUMENT','Ya existe un documento propio; consulta o sustituye el existente');
        const issuer=await source(db,'empresas_emisoras',input.empresa_emisora_id);
        const customer=await source(db,'clientes',input.cliente_id||t.cliente_id);
        const f=await insert(db,'cfdi',{viaje_id:t.id,empresa_emisora_id:issuer.id,cliente_id:customer.id,tipo_comprobante:input.tipo_comprobante,creado_por:actor,
          emisor_snapshot:json({rfc:issuer.rfc,nombre:issuer.razon_social,regimen_fiscal_sat:issuer.regimen_fiscal_sat,domicilio:issuer.domicilio}),receptor_snapshot:json(fiscalCustomer(customer)),lugar_expedicion_cp:issuer.lugar_expedicion_cp,uso_cfdi_sat:customer.uso_cfdi,forma_pago_sat:customer.forma_pago,metodo_pago_sat:customer.metodo_pago});
        const cp=await insert(db,'cartas_porte',{cfdi_id:f.id,viaje_id:t.id});
        await audit(db,actor,'cartas_porte',cp.id,'CREAR',f.id); return aggregate(db,cp.id);
      });
    },
    async patch(cpId,body,actor) {
      only(body,['expected_revision','header','invoice']); revision(body.expected_revision);
      const cp=fields(body.header||{},headerFields), invoice=fields(body.invoice||{},invoiceFields);
      return transaction(async db=>{
        const f=await header(db,cpId,body.expected_revision,true);
        if (Object.keys(cp).length) await update(db,'cartas_porte',cp,'id=$1',[cpId]);
        if (invoice.cliente_id) invoice.receptor_snapshot=json(fiscalCustomer(await source(db,'clientes',invoice.cliente_id)));
        if (Object.keys(invoice).length) await update(db,'cfdi',{...invoice,estado:'BORRADOR',solicitud_snapshot:null,solicitud_sha256:null},'id=$1',[f.id]);
        await audit(db,actor,'cartas_porte',cpId,'EDITAR',f.id); return aggregate(db,cpId);
      });
    },
    async group(cpId,group,body,actor) {
      revision(body.expected_revision);
      return transaction(async db=>{const f=await header(db,cpId,body.expected_revision,true);await changeGroup(db,cpId,f.id,group,body);await audit(db,actor,'cartas_porte',cpId,`EDITAR_${group}`,f.id);return aggregate(db,cpId);});
    },
    async reopen(cpId,body,actor) {
      only(body,['expected_revision']); revision(body.expected_revision);
      return transaction(async db=>{const f=await header(db,cpId,body.expected_revision);if(!['VALIDADO','RECHAZADO'].includes(f.estado)||f.origen!=='PROPIO')reject(409,'DOCUMENT_LOCKED','No se puede reabrir');await update(db,'cfdi',{estado:'BORRADOR'},'id=$1',[f.id]);await audit(db,actor,'cfdi',f.id,'REABRIR',f.id);return aggregate(db,cpId);});
    },
    async validate(cpId,body,actor) {
      only(body,['expected_revision']); revision(body.expected_revision);
      return transaction(async db=>{
        const f=await header(db,cpId,body.expected_revision,true); const data=await aggregate(db,cpId);
        if(f.estado!=='BORRADOR')reject(409,'DOCUMENT_LOCKED','Reabre el documento antes de validarlo');
        const tripRow=(await db.query('SELECT unidad_id,operador_id,caja_id FROM tms.viajes WHERE id=$1',[f.viaje_id])).rows[0];
        if(tripRow?.unidad_id&&data.transport[0]?.unidad_id!==tripRow.unidad_id)reject(422,'ASSIGNMENT_MISMATCH','La unidad no coincide con la asignación del viaje');
        if(tripRow?.operador_id&&!data.figures.some(fig=>fig.operador_id===tripRow.operador_id))reject(422,'ASSIGNMENT_MISMATCH','El operador no coincide con la asignación del viaje');
        if(tripRow?.caja_id&&!data.trailers.some(trailer=>trailer.caja_id===tripRow.caja_id))reject(422,'ASSIGNMENT_MISMATCH','El remolque no coincide con la asignación del viaje');
        const {validateCartaPorte}=await import('./carta-porte-validation.js');
        const errors=validateCartaPorte(data);
        if (errors.length) reject(422,'CARTA_PORTE_INCOMPLETE','Falta completar información',errors);
        requireProvider();
        const version=(await db.query('SELECT * FROM tms.cp_sat_versiones WHERE id=$1',[data.sat_version_id])).rows[0];
        if (!version) reject(503,'SAT_NOT_CONFIGURED','Carga una revisión oficial de catálogos SAT');
        // El adaptador realiza la validación fiscal completa, XSD, catálogos y redondeos.
        const result=await provider.validate(data,{db,version});
        if (!result?.valid) reject(422,'FISCAL_VALIDATION_FAILED','Documento rechazado por validación fiscal',result?.errors||[]);
        await update(db,'cfdi',{estado:'VALIDADO',solicitud_snapshot:json(data),solicitud_sha256:hash(json(data))},'id=$1',[f.id]);
        await audit(db,actor,'cfdi',f.id,'VALIDAR',f.id); return aggregate(db,cpId);
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
