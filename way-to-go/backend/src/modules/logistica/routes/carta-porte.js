import express from 'express';
import multer from 'multer';
import { createCartaPorteService } from '../services/carta-porte.js';
import { groups, catalogs } from '../services/carta-porte-config.js';
import { uuid, only, revision, reject } from '../services/carta-porte-input.js';

export default function cartaPorteRouter({pool,provider=null,files=null}) {
  const router=express.Router();
  const service=createCartaPorteService({pool,provider,files});
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1}}).single('file');
  const gate=permission=>(req,res,next)=>{
    if(!uuid(req.user?.id))return res.status(403).json({success:false,code:'REAL_ACTOR_REQUIRED',error:'Inicia sesión con un usuario TMS válido'});
    if(!req.user.permissions?.includes(permission))return res.status(403).json({success:false,code:'FORBIDDEN',error:'No tienes permiso para esta operación de Carta Porte'});
    next();
  };
  const route=(handler,status=200)=>async(req,res)=>{
    try{const data=await handler(req,res);if(!res.headersSent)res.status(status).json({success:true,data});}
    catch(error){
      let status=error.status||500,code=error.status?error.code:'CARTA_PORTE_ERROR',message=error.status?error.message:'No se pudo completar la operación';
      if(['42P01','42703'].includes(error.code)){status=503;code='SCHEMA_NOT_READY';message='La migración de Carta Porte aún no está instalada o no coincide con esta versión';}
      else if(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','57P01'].includes(error.code)||/connection.*timeout|timeout expired/i.test(error.message)){status=503;code='DATABASE_UNAVAILABLE';message='No se pudo consultar la base de datos';}
      else if(error.code==='23505'){status=409;code='DUPLICATE';message='El registro o la operación ya existe';}
      else if(['23503','23514','23502','22007','22008','22003','22P02'].includes(error.code)){status=422;code='INVALID_DATA';message='Revisa los datos y sus relaciones';}
      if(status===500)console.error('Carta Porte error:',error.code||error.name);
      res.status(status).json({success:false,error:message,code,...(error.fields?.length?{fields:error.fields}:{})});
    }
  };
  const read=gate('carta_porte.ver'),edit=gate('carta_porte.editar');
  router.post('/carta-porte/files/xml',gate('carta_porte.importar'),(req,res,next)=>upload(req,res,error=>error?res.status(400).json({success:false,code:'INVALID_UPLOAD',error:'Archivo inválido o mayor a 10 MB'}):next()),route(async req=>{
    if(!files)reject(503,'STORAGE_NOT_CONFIGURED','Almacenamiento privado pendiente de configurar');
    if(!req.file||!req.file.originalname.toLowerCase().endsWith('.xml'))reject(400,'XML_REQUIRED','Selecciona un archivo XML');
    const result=await files.write({content:req.file.buffer,mime:'application/xml',name:req.file.originalname,actor:req.user.id});
    return {...result,verified:false};
  },201));
  const catalogRead=gate('carta_porte.catalogos.ver'),catalogEdit=gate('carta_porte.catalogos.editar');
  const catalogName=req=>{if(!Object.hasOwn(catalogs,req.params.resource))reject(404,'UNKNOWN_CATALOG','Catálogo inexistente');return req.params.resource;};
  const catalogWrite=(req,res,next)=>{
    if(!Object.hasOwn(catalogs,req.params.resource))return res.status(404).json({success:false,code:'UNKNOWN_CATALOG',error:'Catálogo inexistente'});
    const permission=catalogs[req.params.resource].permission;
    if(permission&&!req.user.permissions.includes(permission))return res.status(403).json({success:false,code:'FORBIDDEN',error:'Falta el permiso del módulo propietario del recurso'});
    next();
  };
  router.get('/carta-porte/catalogs/summary',catalogRead,route(()=>service.summary()));
  router.get('/carta-porte/sat/:catalog',catalogRead,route(req=>service.sat(req.params.catalog,req.query)));
  router.get('/carta-porte/catalogs/:resource',catalogRead,route(req=>service.catalogList(catalogName(req),req.query)));
  router.get('/carta-porte/catalogs/:resource/:id',catalogRead,route(req=>service.catalogGet(catalogName(req),req.params.id)));
  router.post('/carta-porte/catalogs/:resource',catalogEdit,catalogWrite,route(req=>service.catalogSave(catalogName(req),null,req.body,req.user.id),201));
  router.patch('/carta-porte/catalogs/:resource/:id',catalogEdit,catalogWrite,route(req=>service.catalogSave(catalogName(req),req.params.id,req.body,req.user.id)));
  router.patch('/carta-porte/catalogs/:resource/:id/active',catalogEdit,catalogWrite,route(req=>service.catalogSave(catalogName(req),req.params.id,req.body,req.user.id,true)));
  router.get('/trips/:folio/carta-porte',read,route(req=>service.list(req.params.folio)));
  router.post('/trips/:folio/carta-porte',edit,route(req=>service.create(req.params.folio,req.body,req.user.id),201));
  router.get('/carta-porte/:id',read,route(req=>service.get(req.params.id)));
  router.patch('/carta-porte/:id',edit,route(req=>service.patch(req.params.id,req.body,req.user.id)));
  for(const group of Object.keys(groups))router.put(`/carta-porte/:id/${group}`,edit,route(req=>service.group(req.params.id,group,req.body,req.user.id)));
  router.post('/carta-porte/:id/reopen',edit,route(req=>service.reopen(req.params.id,req.body,req.user.id)));
  router.post('/carta-porte/:id/validate',gate('carta_porte.validar'),route(req=>service.validate(req.params.id,req.body,req.user.id)));
  router.get('/carta-porte/:id/events',read,route(req=>service.events(req.params.id)));
  router.get('/carta-porte/:id/operations/:operationId',read,route(req=>service.operation(req.params.id,req.params.operationId)));
  router.get('/carta-porte/:id/files/:kind',read,route(async(req,res)=>{
    const file=await service.file(req.params.id,req.params.kind,req.user.id);
    res.setHeader('Cache-Control','private, no-store');res.type(file.mime);res.attachment(file.name);res.send(file.content);
  }));
  for(const [action,permission]of [['stamp','timbrar'],['reconcile','timbrar'],['cancel','cancelar'],['replacement','cancelar'],['refresh-snapshots','editar']]) {
    router.post(`/carta-porte/:id/${action}`,gate(`carta_porte.${permission}`),route(async req=>{
      if(!uuid(req.params.id))reject(400,'INVALID_ID','Identificador inválido');
      const allowed=action==='cancel'?['expected_revision','motivo','uuid_sustituto']:['expected_revision'];
      only(req.body,allowed);revision(req.body.expected_revision);
      const key=req.get('Idempotency-Key');
      if(['stamp','cancel'].includes(action)&&!uuid(key))reject(400,'IDEMPOTENCY_REQUIRED','Envía Idempotency-Key UUID');
      return service.providerAction(action,{id:req.params.id,body:req.body,actor:req.user.id,idempotencyKey:key});
    },['stamp','cancel'].includes(action)?202:200));
  }
  router.post('/trips/:folio/carta-porte/import',gate('carta_porte.importar'),route(req=>{
    only(req.body,['xml_archivo_id']);if(!uuid(req.body.xml_archivo_id))reject(400,'INVALID_ID','Selecciona un XML privado válido');
    return service.providerAction('import',{folio:req.params.folio,xmlArchivoId:req.body.xml_archivo_id,actor:req.user.id});
  },201));
  return router;
}
