import nodemailer from 'nodemailer';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  isEnabled() {
    return !!this.transporter;
  }

  initializeTransporter() {
    try {
      const emailDisabled = String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true';
      if (emailDisabled) {
        this.transporter = null;
        console.warn('⚠️ Email deshabilitado: EMAIL_DISABLED habilitado. El sistema continuará sin enviar correos.');
        return;
      }

      const smtpUrl = (process.env.EMAIL_SMTP_URL || process.env.SMTP_URL || '').trim();
      if (smtpUrl) {
        this.transporter = nodemailer.createTransport(smtpUrl);
        this.verifyTransporter('URL SMTP');
        return;
      }

      const service = (process.env.EMAIL_SERVICE || '').trim();
      const rawHost = (process.env.EMAIL_HOST || '').trim();
      const user = (process.env.EMAIL_USER || '').trim();
      const pass = (process.env.EMAIL_PASSWORD || '').trim();
      let host = rawHost;

      if (!host && !service && user.endsWith('@gmail.com')) {
        host = 'smtp.gmail.com';
      }

      if (!service && (!host || !user || !pass)) {
        this.transporter = null;
        console.warn('⚠️ Email deshabilitado: faltan EMAIL_HOST/USER/PASSWORD o EMAIL_SERVICE/USER/PASSWORD.');
        this.logEmailConfigHint();
        return;
      }

      const port = parseInt(process.env.EMAIL_PORT, 10) || (service ? undefined : 587);
      const secure = port === 465;

      const transportConfig = service
        ? {
            service,
            auth: { user, pass }
          }
        : {
            host,
            port,
            secure,
            auth: { user, pass },
            tls: { rejectUnauthorized: false },
            connectionTimeout: 10000,
            greetingTimeout: 8000,
            socketTimeout: 15000
          };

      this.transporter = nodemailer.createTransport(transportConfig);
      this.verifyTransporter(service ? `service:${service}` : host || 'SMTP');
    } catch (error) {
      console.error('❌ Error inicializando email service:', error);
    }
  }

  verifyTransporter(mode = 'SMTP') {
    if (!this.transporter) return;
    this.transporter.verify().then(() => {
      console.log(`✅ Email service configurado correctamente (${mode})`);
    }).catch((error) => {
      console.error('❌ Error configurando email service (no bloqueante):', error?.code || error?.message || error);
    });
  }

  logEmailConfigHint() {
    console.log('ℹ️ Configura el envío de correos definiendo una de estas opciones:');
    console.log('   - EMAIL_SMTP_URL="smtps://usuario:password@smtp.servidor.com"');
    console.log('   - EMAIL_SERVICE="gmail" + EMAIL_USER + EMAIL_PASSWORD (usa una app password)');
    console.log('   - EMAIL_HOST + EMAIL_PORT + EMAIL_USER + EMAIL_PASSWORD');
    console.log('   Además define EMAIL_FROM con la dirección remitente.');
  }

  // Enviar notificación de nuevo Trend (BCC masivo para eficiencia)
  async sendNewTrendNotification(recipients, trend) {
    try {
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return { skipped: true, reason: 'sin destinatarios' };
      }

      if (!this.transporter) {
        console.warn('✉️ Notificación de Trend omitida (email deshabilitado).');
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

      const fallbackFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || recipients[0] || 'no-reply@antomia.local').trim();
      const fromHeader = fallbackFrom.includes('<') ? fallbackFrom : `"ANTOMIA" <${fallbackFrom}>`;
      const toPlaceholder = (process.env.EMAIL_FROM && process.env.EMAIL_FROM.includes('@'))
        ? process.env.EMAIL_FROM
        : fallbackFrom;

      const mailOptions = {
        from: fromHeader,
        to: toPlaceholder, // placeholder
        bcc: recipients,
        subject,
        html,
        text
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Notificación de nuevo Trend enviada a ${recipients.length} destinatarios`);
      return result;
    } catch (error) {
      console.error('❌ Error enviando notificación de Trend:', error);
      throw error;
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
