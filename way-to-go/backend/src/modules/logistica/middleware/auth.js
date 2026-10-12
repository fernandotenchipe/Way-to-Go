import jwt from 'jsonwebtoken';
import { query } from '../../../shared/database/db.js';

// Solo permite omitir la sesión en desarrollo local; en producción el bypass nunca se activa.
const isLocalAuthDisabled = () =>
  process.env.NODE_ENV !== 'production' && process.env.LOGISTICA_AUTH_DISABLED === 'true';

export async function requireLogisticsUser(req, res, next) {
  if (isLocalAuthDisabled()) {
    req.user = { id: 'local-dev', name: 'Desarrollo local', roles: ['local-dev'], permissions: [] };
    return next();
  }

  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ success: false, error: 'Se requiere iniciar sesión' });

  try {
    const claims = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    const email = typeof claims.email === 'string' ? claims.email.trim() : '';
    if (!email) return res.status(403).json({ success: false, error: 'La sesión no tiene correo asociado' });

    const { rows } = await query(`
      SELECT u.id, u.email, u.nombre, r.codigo AS role, p.codigo AS permission
      FROM tms.usuarios u
      JOIN tms.usuario_roles ur ON ur.usuario_id = u.id
      JOIN tms.roles r ON r.id = ur.rol_id
      LEFT JOIN tms.rol_permisos rp ON rp.rol_id = r.id
      LEFT JOIN tms.permisos p ON p.id = rp.permiso_id
      WHERE lower(u.email) = lower($1) AND u.activo
      ORDER BY r.codigo, p.codigo
    `, [email]);

    if (!rows.length) return res.status(403).json({ success: false, error: 'Usuario sin acceso asignado al TMS' });
    req.user = {
      ...claims,
      id: rows[0].id,
      email: rows[0].email,
      name: rows[0].nombre,
      roles: [...new Set(rows.map(({ role }) => role))],
      permissions: [...new Set(rows.map(({ permission }) => permission).filter(Boolean))],
    };
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Sesión inválida o vencida' });
    }
    console.error('Logística auth error:', error);
    return res.status(503).json({ success: false, error: 'No se pudo validar el acceso al TMS' });
  }
}

function requirePermission(permission, message) {
  return (req, res, next) => {
    if (isLocalAuthDisabled()) return next();
    if (!req.user?.permissions?.includes(permission)) {
      return res.status(403).json({ success: false, error: message });
    }
    return next();
  };
}

export const requireFinanceRole = requirePermission('costos.editar', 'Se requiere permiso para editar costos');
export const requireCostRead = requirePermission('costos.ver', 'Se requiere permiso para consultar costos');
export const requireTripRead = requirePermission('viajes.ver', 'Se requiere permiso para consultar viajes');
export const requireTripEdit = requirePermission('viajes.editar', 'Se requiere permiso para editar viajes');
export const requireTrafficRole = requirePermission('viajes.estatus', 'Se requiere permiso para operar viajes');
export const requireCreateTrip = requirePermission('viajes.crear', 'Se requiere permiso para crear viajes');
export const requireExtraApproval = requirePermission('extras.autorizar', 'Se requiere permiso para autorizar extras');
