import express from 'express';
import AuthService from '../Services/Auth-service.js';

const router = express.Router();
const authService = new AuthService();

// POST /api/auth/forgot-password - Solicitar recuperación de contraseña
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email requerido'
      });
    }
    
    const result = await authService.requestPasswordReset(email);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error en forgot-password:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error procesando solicitud'
    });
  }
});

// GET /api/auth/verify-reset-token - Verificar token de recuperación
router.get('/verify-reset-token', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token requerido'
      });
    }
    
    const result = await authService.verifyResetToken(token);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error en verify-reset-token:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error verificando token'
    });
  }
});

// POST /api/auth/reset-password - Cambiar contraseña usando token
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;
    
    if (!token || !newPassword || !confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'Token, nueva contraseña y confirmación requeridos'
      });
    }
    
    const result = await authService.resetPassword(token, newPassword, confirmPassword);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error en reset-password:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error cambiando contraseña'
    });
  }
});

// GET /api/auth/health - Verificar estado del servicio
router.get('/health', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Servicio de autenticación funcionando correctamente',
      timestamp: new Date().toISOString(),
      frontendUrl: process.env.FRONTEND_URL
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error verificando estado del servicio'
    });
  }
});

export default router;
