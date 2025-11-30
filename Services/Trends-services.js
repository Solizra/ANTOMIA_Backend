import TrendsRepository from '../Repostories/Trends-repostory.js';
import { Pool } from 'pg';
import 'dotenv/config';
import { getBackendUrl } from '../constants.js';

export default class TrendsService {
  constructor() {
    this.repo = new TrendsRepository();
    this.pool = null;
    // Lazy load to avoid circular deps at import time
    this._emailService = null;
  }

  // Obtener pool de conexiones reutilizable
  getPool() {
    if (!this.pool) {
      this.pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_DATABASE || process.env.DB_NAME, // Aceptar ambas variables
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
        max: 5, // Máximo 5 conexiones
        idleTimeoutMillis: 30000, // 30 segundos
        connectionTimeoutMillis: 2000, // 2 segundos
      });
    }
    return this.pool;
  }

  // Validar que un newsletter existe antes de crear un trend usando la API
  async validateNewsletterId(newsletterId) {
    // null es válido (sin newsletter relacionado)
    if (newsletterId == null) return true;
    
    // Convertir a número y validar
    const id = parseInt(newsletterId);
    if (isNaN(id) || id <= 0) {
      console.warn(`⚠️ Newsletter ID inválido: ${newsletterId}. Debe ser un número positivo.`);
      return false;
    }
    
    try {
      // Usar la API del backend para validar el newsletter
      const baseUrl = getBackendUrl();
      const apiUrl = `${baseUrl}/api/Newsletter/${id}`;
      
      console.log(`🔍 Validando newsletter ID ${id} via API: ${apiUrl}`);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 5000 // 5 segundos de timeout
      });
      
      if (response.ok) {
        const newsletter = await response.json();
        const exists = newsletter && newsletter.id;
        console.log(`✅ Newsletter ID ${id} ${exists ? 'existe' : 'no existe'} en la API`);
        return exists;
      } else if (response.status === 404) {
        console.warn(`⚠️ Newsletter con ID ${id} no encontrado (404) en la API`);
        return false;
      } else {
        console.error(`❌ Error HTTP ${response.status} validando newsletter ID ${id}`);
        return false;
      }
    } catch (error) {
      console.error('Error validando newsletter ID via API:', error);
      return false;
    }
  }

  async createAsync(payload) {
    try {
      console.log('🔧 [TrendsService] createAsync - Iniciando creación de trend');
      // Validar newsletter ID antes de crear el trend
      if (payload.id_newsletter != null) {
        console.log('🔧 [TrendsService] Validando newsletter ID:', payload.id_newsletter);
        const isValidNewsletter = await this.validateNewsletterId(payload.id_newsletter);
        if (!isValidNewsletter) {
          console.warn(`⚠️ Newsletter ID ${payload.id_newsletter} no existe. Estableciendo a null.`);
          payload.id_newsletter = null;
        }
      }
      
      if (typeof this.repo.createAsync !== 'function') {
        throw new Error('TrendsRepository.createAsync no está disponible en este despliegue');
      }
      console.log('🔧 [TrendsService] Llamando a repo.createAsync...');
      const created = await this.repo.createAsync(payload);
      console.log('🔧 [TrendsService] Trend insertado en BD, ID:', created?.id);

      if (created?.duplicated) {
        console.log('ℹ️ Trend duplicado detectado. Se omite notificación por correo.');
        return created;
      }

      console.log('🔧 [TrendsService] Llamando a notifyNewTrend...');
      await this.notifyNewTrend(created, payload);
      console.log('🔧 [TrendsService] createAsync completado exitosamente');
      return created;
    } catch (error) {
      console.error('❌ [TrendsService] Error en createAsync:', error);
      console.error('   Stack:', error?.stack);
      throw error;
    }
  }

  async getByIdAsync(id) {
    return await this.repo.getByIdAsync(id);
  }

  async listAsync(query = {}) {
    const { page = 1, limit = 20 } = query;
    return await this.repo.listAsync({ page, limit });
  }

  async deleteAsync(id) {
    try {
      console.log(`🔧 TrendsService: Iniciando eliminación de trend ID: ${id}`);
      const result = await this.repo.deleteAsync(id);
      console.log(`🔧 TrendsService: Resultado de eliminación: ${result}`);
      return result;
    } catch (error) {
      console.error(`❌ TrendsService: Error eliminando trend ${id}:`, error?.message || error);
      throw error;
    }
  }
  
  async deleteOlderThanDays(days = 30) {
    return await this.repo.deleteOlderThanDays(days);
  }
  
  // Cerrar el pool de conexiones
  async closePool() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  getTrendAlertRecipients() {
    console.log('📋 [TrendsService] getTrendAlertRecipients - Obteniendo destinatarios...');
    const envKeys = [
      'TREND_ALERT_RECIPIENTS',
      'NEW_TREND_ALERT_RECIPIENTS',
      'NEW_TREND_NOTIFICATION_EMAILS'
    ];
    console.log('📋 [TrendsService] Buscando en variables de entorno:', envKeys);
    
    const rawList = envKeys
      .map(key => {
        const value = process.env[key];
        console.log(`📋 [TrendsService] ${key}:`, value ? `"${value}"` : 'NO DEFINIDO');
        return value;
      })
      .find(value => typeof value === 'string' && value.trim().length > 0);

    console.log('📋 [TrendsService] Lista raw encontrada:', rawList || 'NINGUNA');

    const parsed = (rawList || '')
      .split(/[,;\n]/)
      .map(e => e.trim().toLowerCase())
      .filter(e => e && e.includes('@'));

    console.log('📋 [TrendsService] Emails parseados:', parsed);

    const unique = Array.from(new Set(parsed));
    if (unique.length > 0) {
      console.log('📋 [TrendsService] Usando destinatarios de variables de entorno:', unique);
      return unique;
    }

    console.log('📋 [TrendsService] Usando destinatario por defecto: sassonindiana@gmail.com');
    return ['sassonindiana@gmail.com'];
  }

  buildQuickAccessLink(trend) {
    const explicitUrl = (process.env.NEW_TREND_QUICK_LINK || '').trim();
    if (explicitUrl) return explicitUrl;

    const baseOverride = (process.env.TREND_ALERT_PAGE_BASE_URL || '').trim().replace(/\/$/, '');
    const pagePath = (process.env.TREND_ALERT_PAGE_PATH || '/trends').trim();
    const normalizedPath = pagePath ? (pagePath.startsWith('/') ? pagePath : `/${pagePath}`) : '';
    const trendId = trend?.id ? `/${trend.id}` : '';

    if (baseOverride) {
      return `${baseOverride}${normalizedPath}${trendId}`;
    }

    const frontendBase = (process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
    if (frontendBase && trend?.id) {
      return `${frontendBase}/trends/${trend.id}`;
    }

    return trend?.['Link_del_Trend'] || '';
  }

  async notifyNewTrend(createdTrend, sourcePayload = {}) {
    try {
      console.log('📧 [TrendsService] notifyNewTrend - INICIANDO');
      console.log('📧 [TrendsService] Trend recibido:', {
        id: createdTrend?.id,
        titulo: createdTrend?.['Título_del_Trend'],
        tieneEmailService: !!this._emailService
      });
      
      if (!this._emailService) {
        console.log('📧 [TrendsService] EmailService no inicializado, importando...');
        const { default: EmailService } = await import('./Email-service.js');
        this._emailService = new EmailService();
        console.log('📧 [TrendsService] EmailService creado');
      }

      console.log('📧 [TrendsService] Verificando si EmailService está habilitado...');
      if (!this._emailService?.isEnabled()) {
        console.log('✉️ [TrendsService] Servicio de email deshabilitado. Notificación omitida.');
        console.log('   Verifica las variables de entorno EMAIL_*');
        return;
      }
      console.log('📧 [TrendsService] EmailService está habilitado ✅');

      console.log('📧 [TrendsService] Obteniendo lista de destinatarios...');
      const recipients = this.getTrendAlertRecipients();
      console.log('📧 [TrendsService] Destinatarios obtenidos:', recipients);
      if (recipients.length === 0) {
        console.log('✉️ [TrendsService] No hay destinatarios configurados para notificación de Trends.');
        return;
      }

      console.log('📧 [TrendsService] Preparando datos para email...', {
        trendId: createdTrend?.id,
        trendTitle: createdTrend?.['Título_del_Trend'] || createdTrend?.Titulo,
        recipientsCount: recipients.length,
        recipients: recipients,
        payloadHasResumen: Boolean(sourcePayload?.resumenCorto || sourcePayload?.Analisis_relacion),
      });

      const resumen =
        sourcePayload.resumenCorto ||
        createdTrend.resumenCorto ||
        createdTrend.resumen ||
        sourcePayload.Analisis_relacion ||
        createdTrend['Analisis_relacion'] ||
        'Sin resumen disponible';

      const quickLink = this.buildQuickAccessLink(createdTrend);

      const trendForEmail = {
        ...createdTrend,
        resumenCorto: resumen,
        quickLink,
        Relacionado: typeof createdTrend.Relacionado === 'boolean'
          ? createdTrend.Relacionado
          : Boolean(createdTrend.relacionado ?? sourcePayload.Relacionado),
        Nombre_Newsletter_Relacionado:
          createdTrend['Nombre_Newsletter_Relacionado'] ||
          sourcePayload.Nombre_Newsletter_Relacionado ||
          createdTrend.newsletterTitulo ||
          ''
      };

      console.log('📧 [TrendsService] Llamando a sendNewTrendNotification...');
      const emailResult = await this._emailService.sendNewTrendNotification(recipients, trendForEmail);
      console.log('📧 [TrendsService] Resultado de sendNewTrendNotification:', {
        hasError: !!emailResult?.error,
        hasSkipped: !!emailResult?.skipped,
        message: emailResult?.message,
        reason: emailResult?.reason
      });
      
      if (emailResult?.error) {
        console.warn('⚠️ [TrendsService] Error al enviar notificación de Trend:', emailResult.message);
      } else if (emailResult?.skipped) {
        console.log('ℹ️ [TrendsService] Notificación de Trend omitida:', emailResult.reason || 'razón desconocida');
      } else {
        console.log('✅ [TrendsService] Notificación de Trend enviada con éxito.');
      }
      console.log('📧 [TrendsService] notifyNewTrend - COMPLETADO');
    } catch (notifyErr) {
      console.error('❌ [TrendsService] ERROR en notifyNewTrend:', notifyErr?.message || notifyErr);
      console.error('   Stack completo:', notifyErr?.stack);
      console.error('   Tipo de error:', notifyErr?.constructor?.name);
    }
  }
}
