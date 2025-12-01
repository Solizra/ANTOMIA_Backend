import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    console.log('🔧 [EmailService] Constructor - Inicializando EmailService');
    this.transporter = null;
    this.initializeTransporter();
    console.log('🔧 [EmailService] Constructor - EmailService inicializado, transporter:', this.transporter ? '✅ Configurado' : '❌ No configurado');
  }

  isEnabled() {
    return !!this.transporter;
  }

  initializeTransporter() {
    try {
      const emailDisabled = String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true';
      console.log('[EmailService] Inicializando transporter...', {
        emailDisabled,
        hasSmtpHost: !!process.env.SMTP_HOST,
        hasSmtpPort: !!process.env.SMTP_PORT,
        hasSmtpUser: !!process.env.SMTP_USER,
        hasSmtpPass: !!process.env.SMTP_PASS,
        hasEmailUser: !!process.env.EMAIL_USER,
        hasEmailPassword: !!process.env.EMAIL_PASSWORD,
        hasEmailFrom: !!process.env.EMAIL_FROM,
      });
      
      if (emailDisabled) {
        this.transporter = null;
        console.warn('⚠️ Email deshabilitado: EMAIL_DISABLED habilitado. El sistema continuará sin enviar correos.');
        return;
      }

      // Validar EMAIL_FROM (obligatorio)
      if (!process.env.EMAIL_FROM || !process.env.EMAIL_FROM.trim()) {
        console.warn('⚠️ EMAIL_FROM no está definido. Los emails pueden fallar al enviarse.');
        console.warn('   Define EMAIL_FROM con la dirección remitente (ej: "ANTOMIA" <ia.antom2025@gmail.com>)');
      }

      // Intentar usar SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS primero (configuración principal)
      const smtpHost = (process.env.SMTP_HOST || '').trim();
      const smtpPort = parseInt(process.env.SMTP_PORT, 10);
      const smtpUser = (process.env.SMTP_USER || '').trim();
      const smtpPass = (process.env.SMTP_PASS || '').trim();

      // Fallback a EMAIL_USER/EMAIL_PASSWORD si faltan SMTP_USER/SMTP_PASS
      const emailUser = (process.env.EMAIL_USER || '').trim();
      const emailPassword = (process.env.EMAIL_PASSWORD || '').trim();

      // Determinar qué credenciales usar
      let finalUser, finalPass, usingFallback = false;
      
      if (smtpUser && smtpPass) {
        finalUser = smtpUser;
        finalPass = smtpPass;
        console.log('[EmailService] Usando SMTP_USER y SMTP_PASS (configuración principal)');
      } else if (emailUser && emailPassword) {
        finalUser = emailUser;
        finalPass = emailPassword;
        usingFallback = true;
        console.warn('⚠️ [EmailService] Usando EMAIL_USER y EMAIL_PASSWORD como fallback.');
        console.warn('   Se recomienda usar SMTP_USER y SMTP_PASS para mejor compatibilidad con Brevo.');
      } else {
        this.transporter = null;
        console.warn('⚠️ Email deshabilitado: faltan credenciales de autenticación.');
        console.warn('   Variables necesarias: SMTP_USER + SMTP_PASS (o EMAIL_USER + EMAIL_PASSWORD como fallback)');
        return;
      }

      // Validar host y port
      if (!smtpHost || !smtpPort || isNaN(smtpPort)) {
        this.transporter = null;
        console.warn('⚠️ Email deshabilitado: faltan SMTP_HOST o SMTP_PORT.');
        console.warn('   Variables necesarias: SMTP_HOST, SMTP_PORT');
        if (usingFallback) {
          console.warn('   Nota: Aunque tengas EMAIL_USER/EMAIL_PASSWORD, aún necesitas SMTP_HOST y SMTP_PORT.');
        }
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        auth: {
          user: finalUser,
          pass: finalPass
        }
      });

      console.log('[EmailService] ✅ Transporter creado usando configuración Brevo.', {
        host: smtpHost,
        port: smtpPort,
        user: finalUser ? '[set]' : '[missing]',
        usingFallback: usingFallback ? 'EMAIL_USER/EMAIL_PASSWORD' : 'SMTP_USER/SMTP_PASS',
      });
      this.verifyTransporter('Brevo SMTP');
    } catch (error) {
      console.error('❌ Error inicializando email service:', error);
      this.transporter = null;
    }
  }

  verifyTransporter(mode = 'SMTP') {
    if (!this.transporter) {
      console.warn('✉️ verifyTransporter omitido: transporter inexistente.');
      return;
    }
    console.log(`[EmailService] Verificando transporter (${mode})...`);
    this.transporter.verify().then(() => {
      console.log(`✅ Email service configurado correctamente (${mode})`);
    }).catch((error) => {
      console.error('❌ Error configurando email service (no bloqueante):', error?.code || error?.message || error);
    });
  }

  logEmailConfigHint() {
    console.log('ℹ️ Configura el envío de correos definiendo las siguientes variables:');
    console.log('   OBLIGATORIAS:');
    console.log('   - EMAIL_FROM (dirección remitente, ej: "ANTOMIA" <ia.antom2025@gmail.com>)');
    console.log('   - SMTP_HOST (ej: smtp-relay.brevo.com)');
    console.log('   - SMTP_PORT (ej: 587)');
    console.log('   PRINCIPALES (recomendadas):');
    console.log('   - SMTP_USER (tu API key de Brevo)');
    console.log('   - SMTP_PASS (tu API key de Brevo)');
    console.log('   FALLBACK (opcionales, solo si no tienes SMTP_USER/SMTP_PASS):');
    console.log('   - EMAIL_USER (solo como fallback)');
    console.log('   - EMAIL_PASSWORD (solo como fallback)');
  }

  // Enviar notificación de nuevo Trend (BCC masivo para eficiencia)
  async sendNewTrendNotification(recipients, trend) {
    console.log('📬 [EmailService] sendNewTrendNotification - INICIANDO');
    console.log('📬 [EmailService] Parámetros recibidos:', {
      recipientsCount: Array.isArray(recipients) ? recipients.length : 0,
      recipients: recipients,
      trendId: trend?.id,
      trendTitle: trend?.['Título_del_Trend'] || trend?.Titulo,
    });
    
    try {
      // Validar EMAIL_FROM antes de enviar
      if (!process.env.EMAIL_FROM || !process.env.EMAIL_FROM.trim()) {
        console.warn('⚠️ [EmailService] EMAIL_FROM no está definido. El envío puede fallar.');
      }

      console.log('📬 [EmailService] Verificando configuración de email...', {
        hasTransporter: !!this.transporter,
        emailDisabled: String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true',
        hasSmtpHost: !!process.env.SMTP_HOST,
        hasSmtpPort: !!process.env.SMTP_PORT,
        hasSmtpUser: !!process.env.SMTP_USER,
        hasSmtpPass: !!process.env.SMTP_PASS,
        hasEmailUser: !!process.env.EMAIL_USER,
        hasEmailPassword: !!process.env.EMAIL_PASSWORD,
        emailFrom: process.env.EMAIL_FROM || '⚠️ NO DEFINIDO',
      });
      if (!Array.isArray(recipients) || recipients.length === 0) {
        console.warn('[EmailService] Notificación omitida: lista de destinatarios vacía.');
        return { skipped: true, reason: 'sin destinatarios' };
      }

      if (!this.transporter) {
        console.warn('✉️ Notificación de Trend omitida (email deshabilitado).');
        console.warn('   Verifica que EMAIL_DISABLED no esté en "true" y que tengas configuradas las variables de email.');
        console.warn('   Variables necesarias: SMTP_HOST, SMTP_PORT, SMTP_USER + SMTP_PASS (o EMAIL_USER + EMAIL_PASSWORD), EMAIL_FROM');
        return { skipped: true };
      }

      const sanitize = (value) => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const subject = `Nuevo Trend: ${trend?.['Título_del_Trend'] || trend?.Titulo || 'ANTOMIA'}`;

      const link = trend?.['Link_del_Trend'] || trend?.link || '';
      const quickLink = trend?.quickLink && trend.quickLink !== link ? trend.quickLink : '';
      const nl = trend?.['Nombre_Newsletter_Relacionado'] || trend?.newsletter || '';
      const resumen = trend?.resumenCorto || trend?.Analisis_relacion || 'Sin resumen disponible';
      const relacionado = typeof trend?.Relacionado === 'boolean'
        ? trend.Relacionado
        : (typeof trend?.relacionado === 'boolean' ? trend.relacionado : null);
      const relationText = relacionado === null
        ? 'No se pudo determinar la relación con newsletters'
        : (relacionado
          ? `Relacionado con ${nl || 'un newsletter registrado'}`
          : 'Sin newsletter relacionado');

      const html = `
        <div style="font-family: Arial, sans-serif; line-height:1.5;">
          <h2 style="margin:0 0 12px 0;">Nuevo Trend disponible</h2>
          <p style="margin:0 0 8px 0;"><strong>Título:</strong> ${sanitize(trend?.['Título_del_Trend'] || 'Sin título')}</p>
          <p style="margin:0 0 8px 0;"><strong>Resumen breve:</strong> ${sanitize(resumen)}</p>
          <p style="margin:0 0 8px 0;"><strong>Relación:</strong> ${sanitize(relationText)}</p>
          ${nl ? `<p style="margin:0 0 8px 0;"><strong>Newsletter:</strong> ${sanitize(nl)}</p>` : ''}
          ${link ? `<p style="margin:0 0 8px 0;"><strong>Fuente original:</strong> <a href="${link}" target="_blank" rel="noopener">${link}</a></p>` : ''}
          ${(quickLink || link) ? `<p style="margin:0 0 12px 0;"><strong>Acceso rápido:</strong> <a href="${quickLink || link}" target="_blank" rel="noopener">${quickLink || link}</a></p>` : ''}
          <p style="color:#777;font-size:12px;margin-top:16px;">Este mensaje fue enviado automáticamente por ANTOMIA.</p>
        </div>
      `;
      const textLines = [
        'Nuevo Trend disponible',
        `Título: ${trend?.['Título_del_Trend'] || 'Sin título'}`,
        `Resumen breve: ${resumen}`,
        `Relación: ${relationText}`,
      ];
      if (nl) textLines.push(`Newsletter: ${nl}`);
      if (link) textLines.push(`Fuente: ${link}`);
      if (quickLink || link) textLines.push(`Acceso rápido: ${quickLink || link}`);
      const text = textLines.join('\n');

      // Usar EMAIL_FROM o fallback
      const emailFrom = process.env.EMAIL_FROM || recipients[0] || 'no-reply@antomia.local';
      if (!process.env.EMAIL_FROM) {
        console.warn('⚠️ [EmailService] EMAIL_FROM no definido, usando fallback:', emailFrom);
      }

      const toPlaceholder = emailFrom.includes('@') ? emailFrom : recipients[0] || 'no-reply@antomia.local';

      const mailOptions = {
        from: process.env.EMAIL_FROM || emailFrom,
        to: toPlaceholder, // placeholder
        bcc: recipients,
        subject,
        html,
        text
      };

      console.log('📬 [EmailService] Preparando envío de correo...', {
        subject,
        from: process.env.EMAIL_FROM || emailFrom,
        toPlaceholder,
        bccCount: recipients.length,
        bccRecipients: recipients,
        hasQuickLink: Boolean(quickLink),
      });

      console.log('📬 [EmailService] Llamando a transporter.sendMail()...');
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ [EmailService] Notificación de nuevo Trend enviada a ${recipients.length} destinatarios`);
      console.log(`   Destinatarios: ${recipients.join(', ')}`);
      console.log(`   MessageId: ${result.messageId || 'N/A'}`);
      console.log(`   Response: ${result.response || 'N/A'}`);
      console.log('📬 [EmailService] sendNewTrendNotification - COMPLETADO EXITOSAMENTE');
      return result;
    } catch (error) {
      console.error('❌ Error enviando notificación de Trend:', error);
      console.error('   Error completo:', {
        message: error?.message,
        code: error?.code,
        command: error?.command,
        response: error?.response,
        responseCode: error?.responseCode,
        stack: error?.stack
      });
      // No lanzar el error para que no rompa el flujo de creación de trends
      return { error: true, message: error?.message || 'Error desconocido' };
    }
  }
  // Enviar email de recuperación de contraseña
  async sendPasswordResetEmail(email, resetToken, userName = 'Usuario') {
    try {
      // Envío de emails deshabilitado por requerimiento: no se envía correo
      return { skipped: true };

      const resetUrl = `${process.env.FRONTEND_URL}/change-password?token=${resetToken}`;
      
      if (!process.env.EMAIL_FROM) {
        console.warn('⚠️ [EmailService] EMAIL_FROM no definido para email de recuperación.');
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'no-reply@antomia.local',
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

      if (!process.env.EMAIL_FROM) {
        console.warn('⚠️ [EmailService] EMAIL_FROM no definido para email de confirmación.');
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || 'no-reply@antomia.local',
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
