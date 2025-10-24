import TrendsRepository from '../Repostories/Trends-repostory.js';
import { Pool } from 'pg';
import 'dotenv/config';
import { getBackendUrl } from '../constants.js';

export default class TrendsService {
  constructor() {
    this.repo = new TrendsRepository();
    this.pool = null;
  }

  // Obtener pool de conexiones reutilizable
  getPool() {
    if (!this.pool) {
      this.pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
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
      // Validar newsletter ID antes de crear el trend
      if (payload.id_newsletter != null) {
        const isValidNewsletter = await this.validateNewsletterId(payload.id_newsletter);
        if (!isValidNewsletter) {
          console.warn(`⚠️ Newsletter ID ${payload.id_newsletter} no existe. Estableciendo a null.`);
          payload.id_newsletter = null;
        }
      }
      
      return await this.repo.createAsync(payload);
    } catch (error) {
      console.error('Error en TrendsService.createAsync:', error);
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
}


