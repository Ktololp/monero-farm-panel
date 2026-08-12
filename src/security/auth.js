import { parseCookies, verifySessionToken } from './crypto.js';

export function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return verifySessionToken(cookies.panel_session);
}

export function requireAuth(req, res, next) {
  if (!isAuthenticated(req)) return res.status(401).json({ error: 'Authentication required' });
  next();
}

export function requireCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookies = parseCookies(req.headers.cookie || '');
  const token = req.get('x-csrf-token') || '';
  if (!cookies.panel_csrf || !token || cookies.panel_csrf !== token) return res.status(403).json({ error: 'CSRF validation failed' });
  next();
}
