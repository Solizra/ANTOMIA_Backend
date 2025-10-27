import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import AuthRepository from '../Repostories/Auth-repository.js';
import EmailService from './Email-service.js';

class AuthService {
  constructor() {
    this.authRepository = new AuthRepository();
    this.emailService = new EmailService();
    this.jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '1h';
  }

  // Generar token seguro para recuperación de contraseña
  generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Generar JWT token
  generateJWT(payload) {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn });
  }

  // Verificar JWT token
  verifyJWT(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error('Token inválido o expirado');
    }
  }

  // Hashear contraseña
  async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  // Verificar contraseña
  async verifyPassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }

  // Validar formato de email
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validar fortaleza de contraseña
  validatePassword(password) {
    const errors = [];
    
    if (!password || password.length < 8) {
      errors.push('La contraseña debe tener al menos 8 caracteres');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('La contraseña debe contener al menos una letra mayúscula');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('La contraseña debe contener al menos una letra minúscula');
    }
    
    if (!/\d/.test(password)) {
      errors.push('La contraseña debe contener al menos un número');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('La contraseña debe contener al menos un carácter especial');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Solicitar recuperación de contraseña
  async requestPasswordReset(email) {
    try {
      // Validar email
      if (!this.validateEmail(email)) {
        throw new Error('Formato de email inválido');
      }

      // Buscar usuario por email
      const user = await this.authRepository.findUserByEmail(email);
      
      // Por seguridad, siempre devolver éxito aunque el email no exista
      if (!user) {
        console.log(`⚠️ Intento de recuperación para email no registrado: ${email}`);
        return {
          success: true,
          message: 'Si el email está registrado, recibirás un enlace de recuperación'
        };
      }

      // Generar token de recuperación
      const resetToken = this.generateResetToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      // Guardar token en base de datos
      await this.authRepository.createPasswordResetToken(user.id, resetToken, expiresAt);

      // Enviar email de recuperación
      await this.emailService.sendPasswordResetEmail(
        user.email, 
        resetToken, 
        user.nombre || 'Usuario'
      );

      console.log(`✅ Token de recuperación generado para: ${email}`);

      return {
        success: true,
        message: 'Si el email está registrado, recibirás un enlace de recuperación'
      };

    } catch (error) {
      console.error('❌ Error en requestPasswordReset:', error);
      throw error;
    }
  }

  // Verificar token de recuperación
  async verifyResetToken(token) {
    try {
      if (!token) {
        throw new Error('Token requerido');
      }

      const tokenData = await this.authRepository.findValidPasswordResetToken(token);
      
      if (!tokenData) {
        throw new Error('Token inválido o expirado');
      }

      return {
        success: true,
        user: {
          id: tokenData.user_id,
          email: tokenData.email,
          nombre: tokenData.nombre,
          apellido: tokenData.apellido
        }
      };

    } catch (error) {
      console.error('❌ Error en verifyResetToken:', error);
      throw error;
    }
  }

  // Cambiar contraseña usando token
  async resetPassword(token, newPassword, confirmPassword) {
    try {
      // Validar que las contraseñas coincidan
      if (newPassword !== confirmPassword) {
        throw new Error('Las contraseñas no coinciden');
      }

      // Validar fortaleza de contraseña
      const passwordValidation = this.validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`Contraseña inválida: ${passwordValidation.errors.join(', ')}`);
      }

      // Verificar token
      const tokenData = await this.authRepository.findValidPasswordResetToken(token);
      if (!tokenData) {
        throw new Error('Token inválido o expirado');
      }

      // Hashear nueva contraseña
      const hashedPassword = await this.hashPassword(newPassword);

      // Actualizar contraseña en base de datos
      const updatedUser = await this.authRepository.updateUserPassword(
        tokenData.user_id, 
        hashedPassword
      );

      // Marcar token como usado
      await this.authRepository.markPasswordResetTokenAsUsed(token);

      // Enviar email de confirmación
      await this.emailService.sendPasswordChangeConfirmationEmail(
        updatedUser.email,
        updatedUser.nombre || 'Usuario'
      );

      console.log(`✅ Contraseña actualizada para usuario: ${updatedUser.email}`);

      return {
        success: true,
        message: 'Contraseña actualizada exitosamente',
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          nombre: updatedUser.nombre,
          apellido: updatedUser.apellido
        }
      };

    } catch (error) {
      console.error('❌ Error en resetPassword:', error);
      throw error;
    }
  }

  // Cambiar contraseña (usuario autenticado)
  async changePassword(userId, currentPassword, newPassword, confirmPassword) {
    try {
      // Validar que las contraseñas coincidan
      if (newPassword !== confirmPassword) {
        throw new Error('Las contraseñas no coinciden');
      }

      // Validar fortaleza de contraseña
      const passwordValidation = this.validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        throw new Error(`Contraseña inválida: ${passwordValidation.errors.join(', ')}`);
      }

      // Obtener usuario actual
      const user = await this.authRepository.findUserById(userId);
      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Obtener contraseña actual para verificar
      const userWithPassword = await this.authRepository.findUserByEmail(user.email);
      
      // Verificar contraseña actual
      const isCurrentPasswordValid = await this.verifyPassword(currentPassword, userWithPassword.password);
      if (!isCurrentPasswordValid) {
        throw new Error('Contraseña actual incorrecta');
      }

      // Verificar que la nueva contraseña sea diferente
      const isSamePassword = await this.verifyPassword(newPassword, userWithPassword.password);
      if (isSamePassword) {
        throw new Error('La nueva contraseña debe ser diferente a la actual');
      }

      // Hashear nueva contraseña
      const hashedPassword = await this.hashPassword(newPassword);

      // Actualizar contraseña
      const updatedUser = await this.authRepository.updateUserPassword(userId, hashedPassword);

      // Enviar email de confirmación
      await this.emailService.sendPasswordChangeConfirmationEmail(
        updatedUser.email,
        updatedUser.nombre || 'Usuario'
      );

      console.log(`✅ Contraseña cambiada para usuario: ${updatedUser.email}`);

      return {
        success: true,
        message: 'Contraseña actualizada exitosamente'
      };

    } catch (error) {
      console.error('❌ Error en changePassword:', error);
      throw error;
    }
  }

  // Limpiar tokens expirados
  async cleanupExpiredTokens() {
    try {
      const deletedCount = await this.authRepository.cleanupExpiredTokens();
      console.log(`🧹 Tokens expirados eliminados: ${deletedCount}`);
      return deletedCount;
    } catch (error) {
      console.error('❌ Error limpiando tokens expirados:', error);
      throw error;
    }
  }

  // Verificar existencia de supervisor
  async verifySupervisorExists(supervisorEmail) {
    try {
      if (!this.validateEmail(supervisorEmail)) {
        throw new Error('Formato de email del supervisor inválido');
      }

      const supervisor = await this.authRepository.checkSupervisorExists(supervisorEmail);
      
      if (!supervisor) {
        throw new Error('El supervisor especificado no existe en la base de datos');
      }

      return {
        success: true,
        supervisor: {
          id: supervisor.id,
          email: supervisor.email,
          nombre: supervisor.nombre,
          apellido: supervisor.apellido
        }
      };
    } catch (error) {
      console.error('❌ Error en verifySupervisorExists:', error);
      throw error;
    }
  }

  // Registrar usuario con validación de supervisor
  async registerUserWithSupervisor(userData, supervisorEmail) {
    try {
      const { email, password, confirmPassword, nombre, apellido } = userData;

      // Validar supervisor primero
      await this.verifySupervisorExists(supervisorEmail);

      // Validar email
      if (!this.validateEmail(email)) {
        throw new Error('Formato de email inválido');
      }

      // Validar contraseñas
      if (password !== confirmPassword) {
        throw new Error('Las contraseñas no coinciden');
      }

      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.isValid) {
        throw new Error(`Contraseña inválida: ${passwordValidation.errors.join(', ')}`);
      }

      // Verificar si el email ya existe
      const emailExists = await this.authRepository.emailExists(email);
      if (emailExists) {
        throw new Error('El email ya está registrado');
      }

      // Hashear contraseña
      const hashedPassword = await this.hashPassword(password);

      // Crear usuario
      const newUser = await this.authRepository.createUser({
        email,
        password: hashedPassword,
        nombre,
        apellido
      });

      console.log(`✅ Usuario registrado con supervisor: ${email}`);

      return {
        success: true,
        message: 'Usuario registrado exitosamente con contraseña segura',
        user: {
          id: newUser.id,
          email: newUser.email,
          nombre: newUser.nombre,
          apellido: newUser.apellido
        },
        supervisorVerified: true
      };

    } catch (error) {
      console.error('❌ Error en registerUserWithSupervisor:', error);
      throw error;
    }
  }

  // Listar todos los usuarios
  async listAllUsers() {
    try {
      const users = await this.authRepository.listAllUsers();
      
      return {
        success: true,
        users: users.map(user => ({
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          activo: user.activo,
          email_verificado: user.email_verificado,
          fecha_creacion: user.fecha_creacion
        })),
        total: users.length
      };
    } catch (error) {
      console.error('❌ Error en listAllUsers:', error);
      throw error;
    }
  }

  // Desactivar usuario
  async deactivateUser(userId) {
    try {
      const user = await this.authRepository.deactivateUser(userId);
      
      return {
        success: true,
        message: 'Usuario desactivado exitosamente',
        user
      };
    } catch (error) {
      console.error('❌ Error en deactivateUser:', error);
      throw error;
    }
  }

  // Activar usuario
  async activateUser(userId) {
    try {
      const user = await this.authRepository.activateUser(userId);
      
      return {
        success: true,
        message: 'Usuario activado exitosamente',
        user
      };
    } catch (error) {
      console.error('❌ Error en activateUser:', error);
      throw error;
    }
  }

  // Registrar nuevo usuario
  async registerUser(userData) {
    try {
      const { email, password, confirmPassword, nombre, apellido } = userData;

      // Validar email
      if (!this.validateEmail(email)) {
        throw new Error('Formato de email inválido');
      }

      // Validar contraseñas
      if (password !== confirmPassword) {
        throw new Error('Las contraseñas no coinciden');
      }

      const passwordValidation = this.validatePassword(password);
      if (!passwordValidation.isValid) {
        throw new Error(`Contraseña inválida: ${passwordValidation.errors.join(', ')}`);
      }

      // Verificar si el email ya existe
      const emailExists = await this.authRepository.emailExists(email);
      if (emailExists) {
        throw new Error('El email ya está registrado');
      }

      // Hashear contraseña
      const hashedPassword = await this.hashPassword(password);

      // Crear usuario
      const newUser = await this.authRepository.createUser({
        email,
        password: hashedPassword,
        nombre,
        apellido
      });

      console.log(`✅ Usuario registrado: ${email}`);

      return {
        success: true,
        message: 'Usuario registrado exitosamente',
        user: {
          id: newUser.id,
          email: newUser.email,
          nombre: newUser.nombre,
          apellido: newUser.apellido
        }
      };

    } catch (error) {
      console.error('❌ Error en registerUser:', error);
      throw error;
    }
  }

  // Autenticar usuario
  async authenticateUser(email, password) {
    try {
      // Validar email
      if (!this.validateEmail(email)) {
        throw new Error('Formato de email inválido');
      }

      // Buscar usuario
      const user = await this.authRepository.findUserByEmail(email);
      if (!user) {
        throw new Error('Credenciales inválidas');
      }

      // Verificar contraseña
      const isPasswordValid = await this.verifyPassword(password, user.password);
      if (!isPasswordValid) {
        throw new Error('Credenciales inválidas');
      }

      // Generar JWT token
      const token = this.generateJWT({
        userId: user.id,
        email: user.email
      });

      console.log(`✅ Usuario autenticado: ${email}`);

      return {
        success: true,
        message: 'Autenticación exitosa',
        token,
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          email_verificado: user.email_verificado
        }
      };

    } catch (error) {
      console.error('❌ Error en authenticateUser:', error);
      throw error;
    }
  }
}

export default AuthService;
