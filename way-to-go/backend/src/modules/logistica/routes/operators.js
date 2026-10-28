import express from 'express';
import multer from 'multer';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {requireTripRead,requireTripEdit} from '../middleware/auth.js';
import {createOperatorService} from '../services/operators.js';
import {uuid,reject} from '../services/carta-porte-input.js';
const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../uploads/logistica-operadores');
export function operatorFileType(b){if(b.subarray(0,5).toString()==='%PDF-')return {mime:'application/pdf',ext:'pdf'};if(b[0]===255&&b[1]===216&&b[2]===255)return {mime:'image/jpeg',ext:'jpg'};if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {mime:'image/png',ext:'png'};return null;}
export default function operatorsRouter({pool}){
 const router=express.Router(),service=createOperatorService({pool}),upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024,files:1,fields:6,parts:7}}).single('file');
 const localDemo=()=>process.env.NODE_ENV!=='production'&&process.env.LOGISTICA_AUTH_DISABLED==='true';
 const actor=(req,res,next)=>uuid(req.user?.id)||localDemo()?next():res.status(403).json({success:false,error:'Usuario TMS requerido',code:'REAL_ACTOR_REQUIRED'});
 const documentActor=(req,res,next)=>uuid(req.user?.id)?next():res.status(403).json({success:false,error:'Para adjuntar documentos se requiere un usuario TMS válido',code:'REAL_ACTOR_REQUIRED'});
 const route=(fn,successStatus=200)=>async(req,res)=>{try{const data=await fn(req,res);if(!res.headersSent)res.status(successStatus).json({success:true,data});}catch(e){let status=e.status||500,code=e.code||'OPERATOR_ERROR',error=e.status?e.message:'No se pudo completar la operación';if(['42P01','42703'].includes(e.code)){status=503;code='SCHEMA_UNAVAILABLE';error='Revisa el esquema de Operadores instalado';}else if(e.code==='23505'){status=409;error='El registro ya existe';}else if(['23503','23514','23502','22007','22008','22P02'].includes(e.code)){status=422;error='Revisa los datos capturados';}else if(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','57P01'].includes(e.code)){status=503;error='Base de datos no disponible';}if(status===500)console.error('Operadores:',e.code||e.name);res.status(status).json({success:false,error,code});}};
 router.get('/operators/manage',requireTripRead,route(req=>service.list(req.query)));
 router.get('/operators/:id',requireTripRead,route(req=>service.detail(req.params.id)));
 router.post('/operators',requireTripEdit,actor,route(req=>service.save(null,req.body,req.user.id),201));
 router.patch('/operators/:id',requireTripEdit,actor,route(req=>service.save(req.params.id,req.body,req.user.id)));
 router.patch('/operators/:id/active',requireTripEdit,actor,route(req=>service.save(req.params.id,req.body,req.user.id,true)));
 router.post('/operators/:id/documents',requireTripEdit,documentActor,(req,res,next)=>upload(req,res,e=>e?res.status(400).json({success:false,error:'Archivo inválido o supera 8 MB'}):next()),route(async req=>{if(!req.file)reject(400,'FILE_REQUIRED','Selecciona archivo');const type=operatorFileType(req.file.buffer);if(!type)reject(400,'INVALID_FILE','Solo PDF, JPG o PNG');const storage_path=randomUUID()+'.'+type.ext;await mkdir(folder,{recursive:true});await writeFile(path.join(folder,storage_path),req.file.buffer,{flag:'wx'});try{return await service.document(req.params.id,req.body,{key:storage_path,name:path.basename(req.file.originalname).slice(0,180),mime:type.mime,size:req.file.size,hash:createHash('sha256').update(req.file.buffer).digest('hex')},req.user.id);}catch(e){await unlink(path.join(folder,storage_path)).catch(()=>{});throw e;}},201));
 router.get('/operators/:id/documents/:documentId/download',requireTripRead,route(async(req,res)=>{const f=await service.documentFile(req.params.id,req.params.documentId);if(!/^[a-f0-9-]{36}\.(pdf|jpg|png)$/i.test(f.storage_path))reject(409,'INVALID_KEY','Archivo inválido');const b=await readFile(path.join(folder,f.storage_path));if(b.length!==Number(f.size_bytes)||createHash('sha256').update(b).digest('hex')!==f.sha256)reject(409,'INTEGRITY','Archivo no coincide');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.type(f.mime_type).attachment(f.nombre_original).send(b);}));
 return router;
}
