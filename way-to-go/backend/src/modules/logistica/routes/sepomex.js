import express from 'express';
import { createSepomexService, SepomexError } from '../services/sepomex.js';

const permission = 'carta_porte.catalogos.ver';

export default function sepomexRouter({ pool }) {
  const router = express.Router();
  const service = createSepomexService({ pool });
  const read = (req, res, next) => {
    if (!req.user?.permissions?.includes(permission)) {
      return res.status(403).json({ success: false, code: 'FORBIDDEN', error: 'No tienes permiso para consultar catálogos SEPOMEX' });
    }
    return next();
  };
  const route = handler => async (req, res) => {
    try { return res.json({ success: true, data: await handler(req) }); }
    catch (error) {
      const failure = error instanceof SepomexError ? error : new SepomexError(503, 'SEPOMEX_UNAVAILABLE', 'No se pudo consultar SEPOMEX');
      return res.status(failure.status).json({ success: false, code: failure.code, error: failure.message });
    }
  };

  router.get('/sepomex/postal-codes/:codigo_postal', read, route(req => service.postalCode(req.params.codigo_postal)));
  router.get('/sepomex/settlements', read, route(req => service.settlements(req.query)));
  router.get('/sepomex/states', read, route(req => service.states(req.query)));
  router.get('/sepomex/municipalities', read, route(req => service.municipalities(req.query)));
  router.get('/sepomex/cities', read, route(req => service.cities(req.query)));
  return router;
}
