import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      const emailDisabled = String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true';
      const host = process.env.EMAIL_HOST || '';
      const user = process.env.EMAIL_USER || '';
      const pass = process.env.EMAIL_PASSWORD || '';

      if (emailDisabled || !host || !user || !pass) {
        this.transporter = null;
        const reason = emailDisabled ? 'EMAIL_DISABLED habilitado' : 'Variables EMAIL_HOST/USER/PASSWORD no configuradas';
        console.warn(`⚠️ Email deshabilitado: ${reason}. El sistema continuará sin enviar correos.`);
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: host,
        port: parseInt(process.env.EMAIL_PORT) || 587,
        secure: false,
        auth: { user, pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        greetingTimeout: 8000,
        socketTimeout: 15000
      });

      // Verificación opcional y no bloqueante
      this.transporter.verify().then(() => {
        console.log('✅ Email service configurado correctamente');
      }).catch((error) => {
        console.error('❌ Error configurando email service (no bloqueante):', error?.code || error?.message || error);
      });
    } catch (error) {
      console.error('❌ Error inicializando email service:', error);
    }
  }

  // Enviar email de recuperación de contraseña
  async sendPasswordResetEmail(email, resetToken, userName = 'Usuario') {
    try {
      // Envío de emails deshabilitado por requerimiento: no se envía correo
      return { skipped: true };

      const resetUrl = `${process.env.FRONTEND_URL}/change-password?token=${resetToken}`;
      
      const mailOptions = {
        from: `"ANTOMIA" <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Recuperar Contraseña - ANTOMIA',
        html: this.getPasswordResetEmailTemplate(userName, resetUrl),
        text: this.getPasswordResetEmailText(userName, resetUrl)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email de recuperación enviado a:', email);
      return result;
    } catch (error) {
      console.error('❌ Error enviando email de recuperación:', error);
      throw error;
    }
  }

  // Enviar email de confirmación de cambio de contraseña
  async sendPasswordChangeConfirmationEmail(email, userName = 'Usuario') {
    try {
      // Envío de emails deshabilitado por requerimiento: no se envía correo
      return { skipped: true };

      const mailOptions = {
        from: `"ANTOMIA" <${process.env.EMAIL_FROM}>`,
        to: email,
        subject: 'Contraseña Actualizada - ANTOMIA',
        html: this.getPasswordChangeConfirmationTemplate(userName),
        text: this.getPasswordChangeConfirmationText(userName)
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email de confirmación enviado a:', email);
      return result;
    } catch (error) {
      console.error('❌ Error enviando email de confirmación:', error);
      throw error;
    }
  }

  // Template HTML para email de recuperación
  getPasswordResetEmailTemplate(userName, resetUrl) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recuperar Contraseña - ANTOMIA</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 10px;
          }
          .content {
            margin-bottom: 30px;
          }
          .button {
            display: inline-block;
            background-color: #3498db;
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            margin: 20px 0;
            transition: background-color 0.3s;
          }
          .button:hover {
            background-color: #2980b9;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
          }
          .warning {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">ANTOMIA</div>
            <p>Plataforma de Análisis de Noticias</p>
          </div>
          
          <div class="content">
            <h2>Hola ${userName},</h2>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en ANTOMIA.</p>
            <p>Si solicitaste este cambio, haz clic en el botón de abajo para crear una nueva contraseña:</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Restablecer Contraseña</a>
            </div>
            
            <div class="warning">
              <strong>⚠️ Importante:</strong>
              <ul>
                <li>Este enlace expirará en 1 hora por seguridad</li>
                <li>Si no solicitaste este cambio, puedes ignorar este email</li>
                <li>Tu contraseña actual seguirá siendo válida hasta que la cambies</li>
              </ul>
            </div>
            
            <p>Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
            <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 5px;">
              ${resetUrl}
            </p>
          </div>
          
          <div class="footer">
            <p>Este email fue enviado automáticamente, por favor no respondas.</p>
            <p>© 2024 ANTOMIA - Todos los derechos reservados</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Template de texto plano para email de recuperación
  getPasswordResetEmailText(userName, resetUrl) {
    return `
      Hola ${userName},
      
      Recibimos una solicitud para restablecer la contraseña de tu cuenta en ANTOMIA.
      
      Si solicitaste este cambio, visita el siguiente enlace para crear una nueva contraseña:
      ${resetUrl}
      
      IMPORTANTE:
      - Este enlace expirará en 1 hora por seguridad
      - Si no solicitaste este cambio, puedes ignorar este email
      - Tu contraseña actual seguirá siendo válida hasta que la cambies
      
      Este email fue enviado automáticamente, por favor no respondas.
      
      © 2024 ANTOMIA - Todos los derechos reservados
    `;
  }

  // Template HTML para confirmación de cambio de contraseña
  getPasswordChangeConfirmationTemplate(userName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Contraseña Actualizada - ANTOMIA</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 10px;
          }
          .success {
            background-color: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            text-align: center;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">ANTOMIA</div>
            <p>Plataforma de Análisis de Noticias</p>
          </div>
          
          <div class="content">
            <h2>Hola ${userName},</h2>
            
            <div class="success">
              <strong>✅ ¡Contraseña actualizada exitosamente!</strong>
            </div>
            
            <p>Tu contraseña ha sido cambiada correctamente. Ahora puedes usar tu nueva contraseña para acceder a tu cuenta en ANTOMIA.</p>
            
            <p>Si no realizaste este cambio, por favor contacta a nuestro equipo de soporte inmediatamente.</p>
          </div>
          
          <div class="footer">
            <p>Este email fue enviado automáticamente, por favor no respondas.</p>
            <p>© 2024 ANTOMIA - Todos los derechos reservados</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Template de texto plano para confirmación
  getPasswordChangeConfirmationText(userName) {
    return `
      Hola ${userName},
      
      ¡Contraseña actualizada exitosamente!
      
      Tu contraseña ha sido cambiada correctamente. Ahora puedes usar tu nueva contraseña para acceder a tu cuenta en ANTOMIA.
      
      Si no realizaste este cambio, por favor contacta a nuestro equipo de soporte inmediatamente.
      
      Este email fue enviado automáticamente, por favor no respondas.
      
      © 2024 ANTOMIA - Todos los derechos reservados
    `;
  }
}

export default EmailService;
