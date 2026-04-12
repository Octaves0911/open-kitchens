/**
 * JWT Authentication Middleware
 * Attaches req.user if a valid Bearer token is present.
 * Routes using requireAuth will return 401 if no valid token.
 */
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ok_jwt_secret_change_in_prod_2025';

/**
 * Verify token and attach user — does NOT block if missing (use requireAuth for that).
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

/**
 * Blocks request with 401 if user is not authenticated.
 */
function requireAuth(req, res, next) {
  optionalAuth(req, res, () => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    next();
  });
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

module.exports = { optionalAuth, requireAuth, signToken };