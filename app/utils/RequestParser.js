/**
 * Utilidad para extraer datos complejos desde diferentes lugares del request.
 * Evita mantener funciones sueltas en el entrypoint del servidor.
 */
export default class RequestParser {
  static extractEmail(req) {
    if (req.query?.email) return String(req.query.email);

    if (req.params?.email) {
      try {
        const decoded = decodeURIComponent(String(req.params.email));
        if (decoded.includes('@')) return decoded;
        return String(req.params.email);
      } catch {
        return String(req.params.email);
      }
    }

    if (req.headers && req.headers['x-user-email']) {
      return String(req.headers['x-user-email']);
    }

    if (req.body && typeof req.body === 'object' && req.body.email) {
      return String(req.body.email);
    }

    if (req.body && typeof req.body === 'string') {
      const raw = req.body.trim();
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.email) return String(parsed.email);
      } catch {}

      try {
        const params = new URLSearchParams(raw);
        const value = params.get('email');
        if (value) return String(value);
      } catch {}

      if (raw.includes('@') && raw.includes('.')) return raw;
    }

    return null;
  }
}

