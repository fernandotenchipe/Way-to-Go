import { createHash } from 'node:crypto';
import { children, headerFields } from './carta-porte-config.js';
import { reject, uuid } from './carta-porte-input.js';

const sha = content => createHash('sha256').update(content).digest('hex');
const stringify = value => JSON.stringify(value);
const canonical = value => JSON.stringify(value,Object.keys(value).sort());

// Operaciones durables; el adaptador prepara/firma/valida XML y habla con el PAC.
export function createFiscalOperations({provider,files,transaction,header,aggregate,insert,update,audit,pool}) {
  const configured=()=>{if(!provider||!files||typeof provider.name!=='string'||!provider.name||!['PRUEBAS','PRODUCCION'].includes(provider.environment))reject(503,'PAC_NOT_CONFIGURED','Faltan proveedor fiscal y almacenamiento privado');};
  const queue=async(action,request)=>{
    configured();
    const {id,body,actor,idempotencyKey}=request;
    if(!uuid(idempotencyKey))reject(400,'IDEMPOTENCY_REQUIRED','Envía una clave idempotente UUID');
    // Idempotencia se comprueba antes de expected_revision para admitir reintentos de la misma petición.
    const prior=(await pool.query('SELECT * FROM tms.cp_timbrado_intentos WHERE idempotency_key=$1',[idempotencyKey])).rows[0];
    if(prior){
      const data=await transaction(async db=>{const f=await header(db,id);if(f.id!==prior.cfdi_id||prior.operacion!==(action==='stamp'?'TIMBRAR':'CANCELAR')||String(prior.revision_solicitada)!==String(body.expected_revision)||canonical(prior.solicitud_snapshot.command)!==canonical(body))reject(409,'IDEMPOTENCY_CONFLICT','La clave pertenece a otra solicitud');return prior;});
      return {id:data.id,estado:data.estado,uuid:data.uuid_respuesta};
    }
    if(action==='cancel'&&(!['01','02','03','04'].includes(body.motivo)||(body.motivo==='01'&&!uuid(body.uuid_sustituto))))reject(422,'CANCELLATION_REASON','Motivo o UUID sustituto inválido');
    // Reservar y persistir artefacto con el agregado bloqueado; no llamar aquí al PAC.
    return transaction(async db=>{
      const f=await header(db,id,body.expected_revision);
      if(f.origen!=='PROPIO')reject(409,'EXTERNAL_DOCUMENT','No emitir ni cancelar el comprobante de un proveedor');
      if(f.estado!==(action==='stamp'?'VALIDADO':'TIMBRADO'))reject(409,'DOCUMENT_STATE','Estado incompatible con la operación');
      const open=(await db.query("SELECT id FROM tms.cp_timbrado_intentos WHERE cfdi_id=$1 AND operacion IN ('TIMBRAR','CANCELAR') AND estado IN ('PENDIENTE','ENVIADO','POR_CONCILIAR')",[f.id])).rows;
      if(open.length)reject(409,'OPERATION_PENDING','Primero concilia la operación anterior');
      const data=await aggregate(db,id);
      let payload;
      if(action==='stamp'){
        if(typeof provider.prepare!=='function')reject(503,'PAC_NOT_CONFIGURED','No está configurada la generación y firma fiscal');
        // prepare es local: CSD, XSD y artefacto exacto. No puede contactar al PAC.
        const prepared=await provider.prepare(data);
        if(!prepared?.valid||typeof prepared.xml!=='string'||!prepared.xml)reject(422,'INVALID_XML','No fue posible preparar el XML fiscal',prepared?.errors||[]);
        const artifact=await files.write({content:prepared.xml,mime:'application/xml',name:`solicitud-${f.id}.xml`,actor,db});
        if(!uuid(artifact?.id))reject(503,'STORAGE_UNAVAILABLE','No se pudo conservar el XML de la solicitud');
        payload={artifact_id:artifact.id,xml_sha256:sha(prepared.xml),id_ccp:data.id_ccp};
      }else payload={uuid:f.uuid_fiscal,motivo:body.motivo,uuid_sustituto:body.uuid_sustituto||null};
      const snapshot={command:body,payload};
      const attempt=await insert(db,'cp_timbrado_intentos',{cfdi_id:f.id,operacion:action==='stamp'?'TIMBRAR':'CANCELAR',idempotency_key:idempotencyKey,proveedor:provider.name,ambiente:provider.environment,revision_solicitada:String(f.revision),solicitud_snapshot:stringify(snapshot),solicitud_sha256:sha(stringify(snapshot)),solicitado_por:actor});
      await update(db,'cfdi',{estado:action==='stamp'?'TIMBRANDO':'CANCELACION_PENDIENTE'},'id=$1',[f.id]);
      await audit(db,actor,'cfdi',f.id,action==='stamp'?'SOLICITAR_TIMBRADO':'SOLICITAR_CANCELACION',f.id,{intento_id:attempt.id});
      return {id:attempt.id,estado:attempt.estado};
    });
  };
  return {
    stamp:request=>queue('stamp',request),
    cancel:request=>queue('cancel',request),
    async reconcile({id,body,actor}){
      configured();
      return transaction(async db=>{
        const f=await header(db,id,body.expected_revision);
        const attempt=(await db.query("SELECT * FROM tms.cp_timbrado_intentos WHERE cfdi_id=$1 AND estado IN ('ENVIADO','POR_CONCILIAR') ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[f.id])).rows[0];
        if(!attempt)reject(409,'NO_PENDING_OPERATION','No hay operación incierta para conciliar');
        if(attempt.estado==='ENVIADO'&&Date.now()-Date.parse(attempt.iniciado_at)<120000)reject(409,'OPERATION_RUNNING','La operación sigue en curso');
        await update(db,'cp_timbrado_intentos',{estado:'POR_CONCILIAR'},'id=$1',[attempt.id]);
        if(f.estado==='TIMBRANDO')await update(db,'cfdi',{estado:'POR_CONCILIAR'},'id=$1',[f.id]);
        await audit(db,actor,'cfdi',f.id,'SOLICITAR_CONCILIACION',f.id,{intento_id:attempt.id});
        return {id:attempt.id,estado:'POR_CONCILIAR'};
      });
    },
    async import({folio,xmlArchivoId,actor}){
      configured();
      if(typeof provider.verifyImport!=='function')reject(503,'PAC_CAPABILITY_UNAVAILABLE','Verificación de XML externo pendiente de configurar');
      const file=await files.read(xmlArchivoId,{actor}); // El almacenamiento verifica pertenencia del archivo.
      const imported=await provider.verifyImport(file.content,{actor});
      if(!imported?.valid||!uuid(imported.invoice?.uuid_fiscal)||!uuid(imported.header?.id_ccp))reject(422,'INVALID_EXTERNAL_XML','XML externo no verificable');
      return transaction(async db=>{
        const t=(await db.query('SELECT * FROM tms.viajes WHERE folio::text=$1 FOR UPDATE',[String(folio)])).rows[0];
        if(!t)reject(404,'TRIP_NOT_FOUND','Viaje no encontrado');
        const allowed=['tipo_comprobante','fecha_expedicion','lugar_expedicion_cp','emisor_snapshot','receptor_snapshot','uso_cfdi_sat','forma_pago_sat','metodo_pago_sat','exportacion_sat','moneda','tipo_cambio','subtotal','descuento','impuestos_trasladados','impuestos_retenidos','total'];
        const values=Object.fromEntries(allowed.filter(k=>imported.invoice[k]!==undefined).map(k=>[k,typeof imported.invoice[k]==='object'&&imported.invoice[k]!==null?stringify(imported.invoice[k]):imported.invoice[k]]));
        const f=await insert(db,'cfdi',{...values,viaje_id:t.id,origen:'EXTERNO',creado_por:actor});
        const cp=await insert(db,'cartas_porte',{...Object.fromEntries([...Object.keys(headerFields),'peso_bruto_total','peso_neto_total','numero_total_mercancias','cargo_tasacion'].filter(k=>imported.header[k]!==undefined).map(k=>[k,imported.header[k]])),viaje_id:t.id,cfdi_id:f.id,id_ccp:imported.header.id_ccp});
        for(const [key,c]of Object.entries(children))for(const input of imported[key]||[]){
          // Adaptador de confianza; aun así, solo columnas declaradas. IDs internos ya normalizados.
          const row=Object.fromEntries([...new Set([...c.keys,...Object.keys(c.fields),'participante_snapshot','domicilio_snapshot',...(key==='concepts'||key==='taxes'?['importe']:[])])].filter(k=>input[k]!==undefined).map(k=>[k,input[k]]));
          await insert(db,c.table,{...row,[c.scope]:c.scope==='cfdi_id'?f.id:cp.id});
        }
        const fiscalKeys=['uuid_fiscal','timbrado_at','numero_certificado_emisor','numero_certificado_sat','rfc_pac','sello_cfdi','sello_sat','cadena_original_tfd'];
        await update(db,'cfdi',{...Object.fromEntries(fiscalKeys.filter(k=>imported.invoice[k]!==undefined).map(k=>[k,imported.invoice[k]])),xml_archivo_id:xmlArchivoId,estado:'TIMBRADO',congelado_at:new Date().toISOString()},'id=$1',[f.id]);
        await audit(db,actor,'cfdi',f.id,'IMPORTAR',f.id);return aggregate(db,cp.id);
      });
    },
  };
}

// Ejecutar desde un worker con adaptador y almacenamiento configurados; no se inicia al importar.
export async function processFiscalOperation({pool,provider,files}) {
  if(!provider||!files)reject(503,'PAC_NOT_CONFIGURED','Worker fiscal sin proveedor o almacenamiento');
  const db=await pool.connect();let attempt, document;
  try{
    await db.query('BEGIN');
    // Orden estable: CFDI antes que intento, igual que las rutas.
    const candidate=(await db.query("SELECT f.id FROM tms.cfdi f WHERE EXISTS (SELECT 1 FROM tms.cp_timbrado_intentos i WHERE i.cfdi_id=f.id AND i.operacion IN ('TIMBRAR','CANCELAR') AND (i.estado IN ('PENDIENTE','POR_CONCILIAR') OR (i.estado='ENVIADO' AND i.iniciado_at<now()-interval '2 minutes'))) ORDER BY f.created_at FOR UPDATE OF f SKIP LOCKED LIMIT 1")).rows[0];
    if(!candidate){await db.query('COMMIT');return null;}
    document=(await db.query('SELECT * FROM tms.cfdi WHERE id=$1',[candidate.id])).rows[0];
    attempt=(await db.query("SELECT * FROM tms.cp_timbrado_intentos WHERE cfdi_id=$1 AND operacion IN ('TIMBRAR','CANCELAR') AND (estado IN ('PENDIENTE','POR_CONCILIAR') OR (estado='ENVIADO' AND iniciado_at<now()-interval '2 minutes')) ORDER BY created_at FOR UPDATE LIMIT 1",[candidate.id])).rows[0];
    await db.query("UPDATE tms.cp_timbrado_intentos SET estado='ENVIADO',iniciado_at=now() WHERE id=$1",[attempt.id]);
    await db.query('COMMIT');
    let result;
    try{
      if(attempt.estado==='POR_CONCILIAR'||attempt.estado==='ENVIADO')result=attempt.operacion==='TIMBRAR'?await provider.lookup(attempt,document):await provider.cancellationStatus(attempt,document);
      else if(attempt.operacion==='TIMBRAR'){
        const xml=await files.read(attempt.solicitud_snapshot.payload.artifact_id,{system:true});
        if(sha(xml.content)!==attempt.solicitud_snapshot.payload.xml_sha256)throw new Error('XML_ARTIFACT_MISMATCH');
        result=await provider.stamp({xml:xml.content,idempotencyKey:attempt.idempotency_key});
      }else result=await provider.cancel(attempt.solicitud_snapshot.payload,{idempotencyKey:attempt.idempotency_key});
    }catch{result={status:'UNKNOWN',code:'PROVIDER_UNCERTAIN',message:'Resultado pendiente de conciliación'};}
    // Archivo durable antes de cambiar el estado fiscal. files.write registra tms.archivos.
    let artifact;
    if(result.status==='ACCEPTED'){
      if(attempt.operacion==='TIMBRAR'&&(!uuid(result.uuid)||!result.xml||!result.timbradoAt))result={status:'UNKNOWN',code:'INVALID_PROVIDER_RESPONSE'};
      else if(attempt.operacion==='CANCELAR'&&!result.acknowledgment)result={status:'UNKNOWN',code:'MISSING_CANCELLATION_ACK'};
      else try{artifact=await files.write({content:attempt.operacion==='TIMBRAR'?result.xml:result.acknowledgment,mime:'application/xml',name:`resultado-${attempt.id}.xml`,actor:attempt.solicitado_por});if(!uuid(artifact?.id))throw new Error();}catch{result={status:'UNKNOWN',code:'STORAGE_UNAVAILABLE'};}
    }
    if(!['ACCEPTED','REJECTED','UNKNOWN'].includes(result.status))result={status:'UNKNOWN',code:'INVALID_PROVIDER_RESPONSE'};
    await db.query('BEGIN');
    await db.query('SELECT id FROM tms.cfdi WHERE id=$1 FOR UPDATE',[document.id]);
    const current=(await db.query('SELECT * FROM tms.cp_timbrado_intentos WHERE id=$1 FOR UPDATE',[attempt.id])).rows[0];
    if(current.estado!=='ENVIADO'){await db.query('ROLLBACK');return {id:attempt.id,estado:current.estado};}
    const accepted=result.status==='ACCEPTED',rejected=result.status==='REJECTED';
    const status=accepted?'ACEPTADO':rejected?'RECHAZADO':'POR_CONCILIAR';
    await update(db,'cp_timbrado_intentos',{estado:status,codigo_respuesta:String(result.code||''),mensaje_respuesta:String(result.message||'').slice(0,1000),uuid_respuesta:accepted&&attempt.operacion==='TIMBRAR'?result.uuid:null,terminado_at:accepted||rejected?new Date().toISOString():null},'id=$1',[attempt.id]);
    if(attempt.operacion==='TIMBRAR'){
      const changes={estado:accepted?'TIMBRADO':rejected?'RECHAZADO':'POR_CONCILIAR'};
      if(accepted)Object.assign(changes,{uuid_fiscal:result.uuid,timbrado_at:result.timbradoAt,congelado_at:new Date().toISOString(),xml_archivo_id:artifact.id,...Object.fromEntries(['numero_certificado_emisor','numero_certificado_sat','rfc_pac','sello_cfdi','sello_sat','cadena_original_tfd'].filter(k=>result[k]!==undefined).map(k=>[k,result[k]]))});
      await update(db,'cfdi',changes,'id=$1',[document.id]);
    }else if(accepted)await update(db,'cfdi',{estado:'CANCELADO',cancelado_at:new Date().toISOString(),motivo_cancelacion_sat:attempt.solicitud_snapshot.payload.motivo,acuse_cancelacion_archivo_id:artifact.id},'id=$1',[document.id]);
    else if(rejected)await update(db,'cfdi',{estado:'TIMBRADO'},'id=$1',[document.id]);
    await audit(db,attempt.solicitado_por,'cfdi',document.id,`PAC_${status}`,document.id,{intento_id:attempt.id});
    await db.query('COMMIT');return {id:attempt.id,estado:status};
  }catch(error){await db.query('ROLLBACK');throw error;}finally{db.release();}
}

// Helpers cerrados: solo los utiliza el worker con columnas internas conocidas.
async function update(db,table,data,where,params){const entries=Object.entries(data);return db.query(`UPDATE tms.${table} SET ${entries.map(([k],i)=>`${k}=$${params.length+i+1}`).join(',')} WHERE ${where}`,[...params,...entries.map(([,v])=>v)]);}
async function audit(db,actor,table,entity,action,cfdi,data){return db.query('INSERT INTO tms.cp_auditoria(tabla,entidad_id,accion,actor_id,cfdi_id,datos) VALUES ($1,$2,$3,$4,$5,$6)',[table,entity,action,actor,cfdi,stringify(data)]);}
