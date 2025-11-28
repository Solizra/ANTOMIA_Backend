/**
 * Encapsula los middlewares relacionados a autenticación para
 * favorecer la inyección de dependencias y pruebas unitarias.
 */
export default class AuthMiddleware {
  constructor(authService, whitelistSet) {
    this.authService = authService;
    this.whitelist = whitelistSet;

    this.requireAuth = this.requireAuth.bind(this);
    this.requireAdderWhitelist = this.requireAdderWhitelist.bind(this);
  }

  requireAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization || '';
      const [scheme, token] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ success: false, error: 'No autenticado' });
      }
      const payload = this.authService.verifyJWT(token);
      req.user = { userId: payload.userId, email: payload.email };
      next();
    } catch {
      return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
  }

  requireAdderWhitelist(req, res, next) {
    const email = (req.user?.email || '').toLowerCase();
    if (!this.whitelist.has(email)) {
      return res.status(403).json({ success: false, error: 'No tienes permiso para añadir usuarios' });
    }
    return next();
  }
}

