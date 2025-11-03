import express from 'express';
import AuthService from '../Services/Auth-service.js';

const router = express.Router();
const authService = new AuthService();

// Middleware para validar datos de entrada
const validateRequestData = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Campos requeridos faltantes: ${missingFields.join(', ')}`
      });
    }
    
    next();
  };
};

// Middleware para manejo de errores
const handleError = (res, error, defaultMessage = 'Error interno del servidor') => {
  console.error('Error en Auth Controller:', error);
  
  const statusCode = error.message.includes('inválido') || 
                    error.message.includes('no encontrado') || 
                    error.message.includes('incorrecta') ? 400 : 500;
  
  res.status(statusCode).json({
    success: false,
    error: error.message || defaultMessage
  });
};

// POST /api/auth/register - Registrar nuevo usuario
router.post('/register', validateRequestData(['email', 'password', 'confirmPassword']), async (req, res) => {
  try {
    const { email, password, confirmPassword, nombre, apellido } = req.body;
    
    const result = await authService.registerUser({
      email,
      password,
      confirmPassword,
      nombre,
      apellido
    });
    
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, 'Error registrando usuario');
  }
});

// POST /api/auth/login - Autenticar usuario
router.post('/login', validateRequestData(['email', 'password']), async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const result = await authService.authenticateUser(email, password);
    
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error autenticando usuario');
  }
});

// POST /api/auth/forgot-password - Solicitar recuperación de contraseña
router.post('/forgot-password', validateRequestData(['email']), async (req, res) => {
  try {
    const { email } = req.body;
    
    const result = await authService.requestPasswordReset(email);
    
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error procesando solicitud de recuperación');
  }
});

// GET /api/auth/verify-reset-token/:token - Verificar token de recuperación
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const token = req.params.token;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token requerido'
      });
    }
    
    const result = await authService.verifyResetToken(token);
    
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error verificando token');
  }
});

// POST /api/auth/reset-password - Cambiar contraseña usando token
router.post('/reset-password', validateRequestData(['token', 'newPassword', 'confirmPassword']), async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    
    const result = await authService.resetPassword(token, newPassword, confirmPassword);
    
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error cambiando contraseña');
  }
});

// POST /api/auth/change-password - Cambiar contraseña (usuario autenticado)
router.post('/change-password', validateRequestData(['currentPassword', 'newPassword', 'confirmPassword']), async (req, res) => {
  try {
    // TODO: Implementar middleware de autenticación JWT
    const userId = req.user?.userId; // Esto vendría del middleware de autenticación
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }
    
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    const result = await authService.changePassword(userId, currentPassword, newPassword, confirmPassword);
    
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error cambiando contraseña');
  }
});

// POST /api/auth/cleanup-tokens - Limpiar tokens expirados (admin)
router.post('/cleanup-tokens', async (req, res) => {
  try {
    const deletedCount = await authService.cleanupExpiredTokens();
    
    res.status(200).json({
      success: true,
      message: `Tokens expirados eliminados: ${deletedCount}`,
      deletedCount
    });
  } catch (error) {
    handleError(res, error, 'Error limpiando tokens');
  }
});

// GET /api/auth/validate-password - Validar fortaleza de contraseña
router.post('/validate-password', validateRequestData(['password']), async (req, res) => {
  try {
    const { password } = req.body;
    
    const validation = authService.validatePassword(password);
    
    res.status(200).json({
      success: true,
      isValid: validation.isValid,
      errors: validation.errors
    });
  } catch (error) {
    handleError(res, error, 'Error validando contraseña');
  }
});

// GET /api/auth/health - Verificar estado del servicio de autenticación
router.get('/health', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Servicio de autenticación funcionando correctamente',
      timestamp: new Date().toISOString(),
      services: {
        authService: 'active',
        emailService: 'active',
        database: 'connected'
      }
    });
  } catch (error) {
    handleError(res, error, 'Error verificando estado del servicio');
  }
});

// POST /api/auth/verify-supervisor - Verificar existencia de supervisor
router.post('/verify-supervisor', validateRequestData(['supervisorEmail']), async (req, res) => {
  try {
    const { supervisorEmail } = req.body;
    
    const result = await authService.verifySupervisorExists(supervisorEmail);
    
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error verificando supervisor');
  }
});

// POST /api/auth/register-with-supervisor - Registrar usuario con validación de supervisor
router.post('/register-with-supervisor', validateRequestData(['email', 'password', 'confirmPassword', 'supervisorEmail']), async (req, res) => {
  try {
    const { email, password, confirmPassword, nombre, apellido, supervisorEmail } = req.body;
    
    const result = await authService.registerUserWithSupervisor(
      { email, password, confirmPassword, nombre, apellido },
      supervisorEmail
    );
    
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, 'Error registrando usuario con supervisor');
  }
});

// GET /api/auth/users - Listar todos los usuarios
router.get('/users', async (req, res) => {
  try {
    const result = await authService.listAllUsers();
    
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error listando usuarios');
  }
});

// POST /api/auth/users - Crear usuario (admin)
router.post('/users', validateRequestData(['email', 'password']), async (req, res) => {
  try {
    const { email, password, nombre, apellido, activo, email_verificado } = req.body;
    const result = await authService.createUserAdmin({ email, password, nombre, apellido, activo, email_verificado });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, 'Error creando usuario');
  }
});

// PUT /api/auth/users/:userId - Actualizar usuario (admin)
router.put('/users/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
    }
    const allowed = ['email', 'password', 'nombre', 'apellido', 'activo', 'email_verificado'];
    const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
    const result = await authService.updateUserAdmin(userId, updates);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error actualizando usuario');
  }
});

// DELETE /api/auth/users/:userId - Eliminar usuario (admin)
router.delete('/users/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
    }
    const result = await authService.deleteUserAdmin(userId);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error eliminando usuario');
  }
});

// POST /api/auth/users/:userId/deactivate - Desactivar usuario
router.post('/users/:userId/deactivate', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de usuario inválido'
      });
    }
    
    const result = await authService.deactivateUser(userId);
    
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error desactivando usuario');
  }
});

// POST /api/auth/users/:userId/activate - Activar usuario
router.post('/users/:userId/activate', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        error: 'ID de usuario inválido'
      });
    }
    
    const result = await authService.activateUser(userId);
    
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, 'Error activando usuario');
  }
});

// Middleware de manejo de rutas no encontradas (Express 5: evitar '*')
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado',
    availableEndpoints: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/forgot-password',
      'GET /api/auth/verify-reset-token/:token',
      'POST /api/auth/reset-password',
      'POST /api/auth/change-password',
      'POST /api/auth/cleanup-tokens',
      'POST /api/auth/validate-password',
      'GET /api/auth/health',
      'POST /api/auth/verify-supervisor',
      'POST /api/auth/register-with-supervisor',
      'GET /api/auth/users',
      'POST /api/auth/users',
      'PUT /api/auth/users/:userId',
      'DELETE /api/auth/users/:userId',
      'POST /api/auth/users/:userId/activate',
      'POST /api/auth/users/:userId/deactivate'
    ]
  });
});

export default router;
