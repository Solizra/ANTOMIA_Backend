import RequestParser from '../utils/RequestParser.js';

export default class UserRoutes {
  constructor({ authService, authMiddleware }) {
    this.authService = authService;
    this.authMiddleware = authMiddleware;

    this.listUsers = this.listUsers.bind(this);
    this.createUser = this.createUser.bind(this);
    this.updateUser = this.updateUser.bind(this);
    this.deleteUserById = this.deleteUserById.bind(this);
    this.deleteUserByEmail = this.deleteUserByEmail.bind(this);
    this.deleteUserByEmailPost = this.deleteUserByEmailPost.bind(this);
  }

  register(app) {
    app.get('/api/users', this.listUsers);
    app.post(
      '/api/users',
      this.authMiddleware.requireAuth,
      this.authMiddleware.requireAdderWhitelist,
      this.createUser
    );
    app.put('/api/users/:userId', this.authMiddleware.requireAuth, this.updateUser);
    app.delete('/api/users/:userId', this.authMiddleware.requireAuth, this.deleteUserById);

    app.delete('/api/users', this.deleteUserByEmail);
    app.delete('/api/users/:email', this.deleteUserByEmail);
    app.post('/api/users/delete', this.deleteUserByEmailPost);

    this.registerUserAliases(app, ['/api/Users', '/api/usuarios', '/api/usuarios_registrados']);
    this.registerAdminAliases(app, ['/api/admin/users', '/api/admin/Users']);
  }

  registerUserAliases(app, aliases) {
    aliases.forEach((base) => {
      app.get(base, this.listUsers);
      app.post(
        base,
        this.authMiddleware.requireAuth,
        this.authMiddleware.requireAdderWhitelist,
        this.createUser
      );
      app.delete(base, this.deleteUserByEmail);
      app.delete(`${base}/:email`, this.deleteUserByEmail);
      app.post(`${base}/delete`, this.deleteUserByEmailPost);
    });
  }

  registerAdminAliases(app, adminAliases) {
    adminAliases.forEach((base) => {
      app.delete(base, this.deleteUserByEmail);
      app.delete(`${base}/:email`, this.deleteUserByEmail);
      app.post(`${base}/delete`, this.deleteUserByEmailPost);
    });
  }

  async listUsers(req, res) {
    try {
      const payload = this.extractTokenPayload(req);
      if (payload?.userId) {
        const result = await this.authService.listUsersByOwner(payload.userId);
        return res.status(200).json(result);
      }
      const result = await this.authService.listAllUsers();
      return res.status(200).json(result);
    } catch (error) {
      console.error('Error listando usuarios:', error);
      res.status(500).json({ success: false, error: error?.message || 'Error interno' });
    }
  }

  async createUser(req, res) {
    try {
      const { email, password, confirmPassword, nombre, apellido, activo, email_verificado } = req.body || {};
      const ownerUserId = req.user?.userId;
      const result = await this.authService.createUserForOwner(
        { email, password, confirmPassword, nombre, apellido, activo, email_verificado },
        ownerUserId
      );
      res.status(201).json(result);
    } catch (error) {
      console.error('Error creando usuario:', error);
      const status = this.isBadRequest(error?.message) ? 400 : 500;
      res.status(status).json({ success: false, error: error?.message || 'Error interno' });
    }
  }

  async updateUser(req, res) {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (!userId || Number.isNaN(userId)) {
        return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
      }
      const allowed = ['email', 'password', 'nombre', 'apellido', 'activo', 'email_verificado'];
      const updates = Object.fromEntries(
        Object.entries(req.body || {}).filter(([key]) => allowed.includes(key))
      );
      const result = await this.authService.updateUserAdmin(userId, updates);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error actualizando usuario:', error);
      const status = this.isBadRequest(error?.message) ? 400 : 500;
      res.status(status).json({ success: false, error: error?.message || 'Error interno' });
    }
  }

  async deleteUserById(req, res) {
    try {
      const userId = parseInt(req.params.userId, 10);
      if (!userId || Number.isNaN(userId)) {
        return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
      }
      const result = await this.authService.deleteUserAdmin(userId);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error eliminando usuario por ID:', error);
      const status = this.isBadRequest(error?.message) ? 400 : 500;
      res.status(status).json({ success: false, error: error?.message || 'Error interno' });
    }
  }

  async deleteUserByEmail(req, res) {
    try {
      const email = RequestParser.extractEmail(req);
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email requerido para eliminar' });
      }
      const result = await this.authService.deleteUserByEmailAdmin(String(email));
      res.status(200).json(result);
    } catch (error) {
      console.error('Error eliminando usuario por email:', error);
      const status = this.isBadRequest(error?.message) ? 400 : 500;
      res.status(status).json({ success: false, error: error?.message || 'Error interno' });
    }
  }

  async deleteUserByEmailPost(req, res) {
    return this.deleteUserByEmail(req, res);
  }

  extractTokenPayload(req) {
    try {
      const authHeader = req.headers.authorization || '';
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token) {
        return this.authService.verifyJWT(token);
      }
    } catch {}
    return null;
  }

  isBadRequest(message = '') {
    const lowered = message.toLowerCase();
    return (
      lowered.includes('inválido') ||
      lowered.includes('registrado') ||
      lowered.includes('no encontrado') ||
      lowered.includes('coinciden')
    );
  }
}

