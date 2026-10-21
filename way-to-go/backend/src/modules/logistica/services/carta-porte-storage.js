import { randomUUID,createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdir,writeFile,readFile } from 'node:fs/promises';
import { reject,uuid } from './carta-porte-input.js';

const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../../uploads/logistica-carta-porte');
const bucket='logistica-carta-porte';
const digest=value=>createHash('sha256').update(value).digest('hex');
// Almacenamiento privado local, reemplazable por un adaptador de objetos en producción.
// Construir el adaptador no abre conexiones ni escribe archivos.
export function createCartaPorteStorage({pool,directory=base}) {
  return {
    async write({content,mime,name,actor,db=pool}) {
      if(!uuid(actor))reject(403,'REAL_ACTOR_REQUIRED','Archivo sin autor TMS válido');
      if(!['application/xml','application/pdf'].includes(mime))reject(400,'INVALID_FILE_TYPE','Tipo de archivo no permitido');
      const data=Buffer.isBuffer(content)?content:Buffer.from(String(content),'utf8');
      if(!data.length||data.length>10*1024*1024)reject(400,'INVALID_FILE_SIZE','El documento debe medir entre 1 byte y 10 MB');
      const key=`${randomUUID()}.${mime==='application/xml'?'xml':'pdf'}`;
      await mkdir(directory,{recursive:true});await writeFile(path.join(directory,key),data,{flag:'wx'});
      const result=await db.query("INSERT INTO tms.archivos(bucket,storage_path,nombre_original,mime_type,size_bytes,sha256,estado,subido_por) VALUES ($1,$2,$3,$4,$5,$6,'DISPONIBLE',$7) RETURNING id",[bucket,key,path.basename(name).slice(0,180),mime,data.length,digest(data),actor]);
      return {id:result.rows[0].id};
    },
    async read(fileId,{actor,authorizedDocument=false,system=false}={}) {
      if(!uuid(fileId))reject(400,'INVALID_FILE_ID','Identificador de archivo inválido');
      const row=(await pool.query("SELECT * FROM tms.archivos WHERE id=$1 AND bucket=$2 AND estado='DISPONIBLE'",[fileId,bucket])).rows[0];
      if(!row)reject(404,'FILE_NOT_FOUND','Archivo privado no disponible');
      if(!system&&!authorizedDocument&&row.subido_por!==actor)reject(403,'FILE_FORBIDDEN','El archivo no pertenece a esta sesión');
      if(!/^[0-9a-f-]{36}\.(xml|pdf)$/i.test(row.storage_path))reject(409,'INVALID_STORAGE_KEY','Referencia de almacenamiento inválida');
      const data=await readFile(path.join(directory,row.storage_path));
      if(data.length!==Number(row.size_bytes)||digest(data)!==row.sha256)reject(409,'FILE_INTEGRITY','El archivo no coincide con su registro');
      return {content:data,mime:row.mime_type,name:row.nombre_original};
    },
  };
}
