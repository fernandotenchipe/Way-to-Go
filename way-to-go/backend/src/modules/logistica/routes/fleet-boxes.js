import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { requireFleetEdit, requireFleetRead } from '../middleware/auth.js';
import { operatorFileType } from './operators.js';
import { listFleetBoxes, getFleetBox, saveFleetBox, listTrailerTypes, addFleetBoxDocument, getFleetBoxDocumentFile } from '../services/fleet-box-data.js';

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../uploads/logistica-cajas');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export default function fleetBoxesRouter({ pool }) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 6, parts: 7 } }).single('file');
  const route = (handler, status = 200) => async (req, res) => {
    try { const data = await handler(req, res); if (!res.headersSent) res.status(status).json({ success: true, data }); }
    catch (e) {
      const code = e.code || 'FLEET_BOX_ERROR';
      const statusCode = e.status || (code === '23505' ? 409 : ['23503','23514','23502','22P02'].includes(code) ? 422 : ['ECONNREFUSED','ETIMEDOUT','57P01'].includes(code) ? 503 : 500);
      if (statusCode === 500) console.error('Cajas de Flota:', code);
      res.status(statusCode).json({ success: false, code, error: e.status ? e.message : code === '23505' ? 'Ya existe una caja o remolque con ese número' : statusCode === 503 ? 'La base de datos no está disponible' : statusCode === 422 ? 'Revisa los datos del equipo' : 'No se pudo completar la operación' });
    }
  };
  router.get('/fleet/boxes', requireFleetRead, route(req => listFleetBoxes(pool, req.query)));
  router.get('/fleet/trailer-types', requireFleetRead, route(req => listTrailerTypes(pool, req.query.q)));
  router.get('/fleet/boxes/:id', requireFleetRead, route(req => getFleetBox(pool, req.params.id)));
  const actor = (req, res, next) => uuid(req.user?.id) || (process.env.NODE_ENV !== 'production' && process.env.LOGISTICA_AUTH_DISABLED === 'true') ? next() : res.status(403).json({ success: false, error: 'Se requiere una sesión TMS válida' });
  router.post('/fleet/boxes', requireFleetEdit, actor, route(req => saveFleetBox(pool, req.body), 201));
  router.patch('/fleet/boxes/:id', requireFleetEdit, actor, route(req => saveFleetBox(pool, req.body, req.params.id)));
  router.post('/fleet/boxes/:id/documents', requireFleetEdit, (req, res, next) => uuid(req.user?.id) ? next() : res.status(403).json({ success: false, error: 'Se requiere una sesión TMS válida para adjuntar documentos' }),
    (req, res, next) => upload(req, res, e => e ? res.status(400).json({ success: false, error: 'Archivo inválido o mayor a 8 MB' }) : next()),
    route(async req => {
      if (!req.file) throw Object.assign(new Error('Selecciona un archivo'), { status: 400 });
      const type = operatorFileType(req.file.buffer);
      if (!type) throw Object.assign(new Error('Solo se admiten PDF, JPG o PNG'), { status: 400 });
      const key = `${randomUUID()}.${type.ext}`;
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, key), req.file.buffer, { flag: 'wx' });
      try { return await addFleetBoxDocument(pool, req.params.id, req.body, { key, name: path.basename(req.file.originalname).slice(0, 180), mime: type.mime, size: req.file.size, hash: createHash('sha256').update(req.file.buffer).digest('hex') }, req.user.id); }
      catch (e) { await unlink(path.join(folder, key)).catch(() => {}); throw e; }
    }, 201));
  router.get('/fleet/boxes/:id/documents/:documentId/download', requireFleetRead, route(async (req, res) => {
    const file = await getFleetBoxDocumentFile(pool, req.params.id, req.params.documentId);
    if (!/^[a-f0-9-]{36}\.(pdf|jpg|png)$/i.test(file.storage_path)) throw Object.assign(new Error('Archivo inválido'), { status: 409 });
    const data = await readFile(path.join(folder, file.storage_path));
    if (data.length !== Number(file.size_bytes) || createHash('sha256').update(data).digest('hex') !== file.sha256) throw Object.assign(new Error('El archivo no coincide con su registro'), { status: 409 });
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(file.mime_type).attachment(file.nombre_original).send(data);
  }));
  return router;
}
