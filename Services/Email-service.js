class EmailService {
  constructor() {
    console.log('🔧 [EmailService] Constructor - Inicializando EmailService con API de Brevo');
    this.apiKey = null;
    this.isServiceEnabled = false;
    this.initializeService();
    console.log('🔧 [EmailService] Constructor - EmailService inicializado:', this.isServiceEnabled ? '✅ Configurado' : '❌ No configurado');
  }

  isEnabled() {
    return this.isServiceEnabled;
  }

  initializeService() {
    try {
      const emailDisabled = String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true';
      console.log('[EmailService] Inicializando servicio de email...', {
        emailDisabled,
        hasBrevoApiKey: !!process.env.BREVO_API_KEY,
        hasEmailFrom: !!process.env.EMAIL_FROM,
      });
      
      if (emailDisabled) {
        this.isServiceEnabled = false;
        console.warn('⚠️ Email deshabilitado: EMAIL_DISABLED habilitado. El sistema continuará sin enviar correos.');
        return;
      }

      // Validar BREVO_API_KEY (obligatorio)
      const apiKey = (process.env.BREVO_API_KEY || '').trim();
      if (!apiKey) {
        this.isServiceEnabled = false;
        console.warn('⚠️ Email deshabilitado: BREVO_API_KEY no está definido.');
        console.warn('   Define BREVO_API_KEY con tu API key de Brevo para habilitar el envío de correos.');
        return;
      }

      // Validar EMAIL_FROM (obligatorio)
      if (!process.env.EMAIL_FROM || !process.env.EMAIL_FROM.trim()) {
        console.warn('⚠️ EMAIL_FROM no está definido. Los emails pueden fallar al enviarse.');
        console.warn('   Define EMAIL_FROM con la dirección remitente (ej: "ANTOMIA" <ia.antom2025@gmail.com>)');
      }

      this.apiKey = apiKey;
      this.isServiceEnabled = true;

      console.log('[EmailService] ✅ Servicio configurado correctamente usando API de Brevo.', {
        hasApiKey: !!this.apiKey,
        emailFrom: process.env.EMAIL_FROM || '⚠️ NO DEFINIDO',
      });
    } catch (error) {
      console.error('❌ Error inicializando email service:', error);
      this.isServiceEnabled = false;
    }
  }

  logEmailConfigHint() {
    console.log('ℹ️ Configura el envío de correos definiendo las siguientes variables:');
    console.log('   OBLIGATORIAS:');
    console.log('   - BREVO_API_KEY (tu API key de Brevo)');
    console.log('   - EMAIL_FROM (dirección remitente, ej: "ANTOMIA" <ia.antom2025@gmail.com>)');
  }

  /**
   * Método privado para enviar emails usando la API de Brevo
   * @param {Object} emailData - Datos del email
   * @param {string|Array} emailData.to - Email(s) destinatario(s)
   * @param {Array} emailData.bcc - Email(s) en BCC (opcional)
   * @param {string} emailData.subject - Asunto del email
   * @param {string} emailData.html - Contenido HTML
   * @param {string} emailData.text - Contenido texto plano (opcional)
   * @returns {Promise<Object>} Resultado del envío
   */
  async sendEmailViaBrevoAPI({ to, bcc, subject, html, text }) {
    const emailFrom = process.env.EMAIL_FROM || 'no-reply@antomia.local';
    
    // Parsear EMAIL_FROM si tiene formato "Nombre" <email@domain.com>
    let senderName = 'ANTOMIA';
    let senderEmail = emailFrom;
    
    if (emailFrom.includes('<') && emailFrom.includes('>')) {
      const match = emailFrom.match(/^"?([^"<]+)"?\s*<(.+)>$/);
      if (match) {
        senderName = match[1].trim();
        senderEmail = match[2].trim();
      }
    } else if (emailFrom.includes('@')) {
      senderEmail = emailFrom;
    }

    // Convertir 'to' a array si es string
    const toArray = Array.isArray(to) ? to : [{ email: to }];
    
    // Preparar destinatarios
    const recipients = toArray.map(email => {
      if (typeof email === 'string') {
        return { email };
      }
      return email;
    });

    // Preparar BCC si existe
    const bccArray = bcc && Array.isArray(bcc) && bcc.length > 0
      ? bcc.map(email => (typeof email === 'string' ? { email } : email))
      : undefined;

    const payload = {
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: recipients,
      subject: subject,
      htmlContent: html
    };

    // Agregar BCC si existe
    if (bccArray && bccArray.length > 0) {
      payload.bcc = bccArray;
    }

    // Agregar texto plano si existe
    if (text) {
      payload.textContent = text;
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    if (!response.ok) {
      const errorMessage = responseData.message || responseData.error || `HTTP ${response.status}`;
      throw new Error(`Brevo API error: ${errorMessage}`);
    }

    return {
      messageId: responseData.messageId,
      response: responseData,
      success: true
    };
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
        isServiceEnabled: this.isServiceEnabled,
        emailDisabled: String(process.env.EMAIL_DISABLED || '').toLowerCase() === 'true',
        hasBrevoApiKey: !!process.env.BREVO_API_KEY,
        emailFrom: process.env.EMAIL_FROM || '⚠️ NO DEFINIDO',
      });

      if (!Array.isArray(recipients) || recipients.length === 0) {
        console.warn('[EmailService] Notificación omitida: lista de destinatarios vacía.');
        return { skipped: true, reason: 'sin destinatarios' };
      }

      if (!this.isServiceEnabled) {
        console.warn('✉️ Notificación de Trend omitida (email deshabilitado).');
        console.warn('   Verifica que EMAIL_DISABLED no esté en "true" y que tengas configuradas las variables de email.');
        console.warn('   Variables necesarias: BREVO_API_KEY, EMAIL_FROM');
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

      console.log('📬 [EmailService] Preparando envío de correo...', {
        subject,
        from: process.env.EMAIL_FROM || emailFrom,
        toPlaceholder,
        bccCount: recipients.length,
        bccRecipients: recipients,
        hasQuickLink: Boolean(quickLink),
      });

      console.log('📬 [EmailService] Llamando a API de Brevo...');
      
      // Reintento máximo 2 veces para el envío de email (no afecta el análisis)
      const maxRetries = 2;
      let lastError = null;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 1) {
            console.log(`📬 [EmailService] Reintento ${attempt}/${maxRetries} de envío de email...`);
            // Esperar 2 segundos antes de reintentar
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          
          const result = await this.sendEmailViaBrevoAPI({
            to: toPlaceholder,
            bcc: recipients,
            subject,
            html,
            text
          });

          console.log(`✅ [EmailService] Notificación de nuevo Trend enviada a ${recipients.length} destinatarios (intento ${attempt})`);
          console.log(`   Destinatarios: ${recipients.join(', ')}`);
          console.log(`   MessageId: ${result.messageId || 'N/A'}`);
          console.log(`   Response: ${JSON.stringify(result.response || {})}`);
          console.log('📬 [EmailService] sendNewTrendNotification - COMPLETADO EXITOSAMENTE');
          return result;
        } catch (sendError) {
          lastError = sendError;
          console.warn(`⚠️ [EmailService] Error en intento ${attempt}/${maxRetries} de envío:`, sendError?.message || sendError);
          
          // Si es el último intento, lanzar el error
          if (attempt === maxRetries) {
            throw sendError;
          }
          
          // Si no es el último intento, continuar al siguiente
          console.log(`   Reintentando envío de email...`);
        }
      }
      
      // Esto no debería ejecutarse, pero por seguridad
      throw lastError || new Error('Error desconocido en envío de email');
    } catch (error) {
      console.error('❌ Error enviando notificación de Trend:', error);
      console.error('   Error completo:', {
        message: error?.message,
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

      if (!this.isServiceEnabled) {
        console.warn('⚠️ [EmailService] Servicio de email deshabilitado. Email de recuperación omitido.');
        return { skipped: true };
      }

      const resetUrl = `${process.env.FRONTEND_URL}/change-password?token=${resetToken}`;
      
      if (!process.env.EMAIL_FROM) {
        console.warn('⚠️ [EmailService] EMAIL_FROM no definido para email de recuperación.');
      }

      const subject = 'Recuperar Contraseña - ANTOMIA';
      const html = this.getPasswordResetEmailTemplate(userName, resetUrl);
      const text = this.getPasswordResetEmailText(userName, resetUrl);

      const result = await this.sendEmailViaBrevoAPI({
        to: email,
        subject,
        html,
        text
      });

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

      if (!this.isServiceEnabled) {
        console.warn('⚠️ [EmailService] Servicio de email deshabilitado. Email de confirmación omitido.');
        return { skipped: true };
      }

      if (!process.env.EMAIL_FROM) {
        console.warn('⚠️ [EmailService] EMAIL_FROM no definido para email de confirmación.');
      }

      const subject = 'Contraseña Actualizada - ANTOMIA';
      const html = this.getPasswordChangeConfirmationTemplate(userName);
      const text = this.getPasswordChangeConfirmationText(userName);

      const result = await this.sendEmailViaBrevoAPI({
        to: email,
        subject,
        html,
        text
      });

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
