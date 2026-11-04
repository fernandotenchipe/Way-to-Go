import express from 'express';
import { CatalogNotFoundError } from '../services/cfdi-catalogs.js';

const permission = 'carta_porte.catalogos.ver';

export default function cfdiCatalogRouter({ provider }) {
  if (!provider) throw new TypeError('Se requiere proveedor de catálogos CFDI');
  const router = express.Router();
  const read = (req, res, next) => {
    if (!req.user?.permissions?.includes(permission)) return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'No tienes permiso para consultar catálogos SAT' });
    next();
  };
  const route = (handler) => async (req, res) => {
    try { res.json({ success: true, data: await handler(req) }); }
    catch (error) {
      if (error instanceof CatalogNotFoundError || error.status) return res.status(error.status || 404).json({ success: false, code: error.code || 'INVALID_REQUEST', error: error.message });
      console.error('CFDI catalog read error:', error.code || error.name);
      return res.status(503).json({ success: false, code: 'CATALOG_UNAVAILABLE', error: 'No se pudo consultar el catálogo CFDI' });
    }
  };
  router.get('/cfdi/catalogs', read, route(() => provider.listCatalogs()));
  router.get('/cfdi/catalogs/:catalog', read, route((req) => provider.search(req.params.catalog, req.query)));
  router.get('/cfdi/catalogs/:catalog/keys/:key', read, route((req) => {
    let contexto;
    if (req.query.contexto !== undefined) {
      try { contexto = JSON.parse(req.query.contexto); }
      catch { return Promise.reject(Object.assign(new Error('El contexto debe ser JSON válido'), { status: 400, code: 'INVALID_CONTEXT' })); }
      if (!contexto || Array.isArray(contexto) || typeof contexto !== 'object') {
        return Promise.reject(Object.assign(new Error('El contexto debe ser un objeto JSON'), { status: 400, code: 'INVALID_CONTEXT' }));
      }
    }
    return provider.getByKey(req.params.catalog, req.params.key, { contexto, vigente: req.query.vigente === 'true', fecha: req.query.fecha });
  }));
  return router;
}
