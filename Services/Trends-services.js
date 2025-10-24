import TrendsRepository from '../Repostories/Trends-repostory.js';
import { Pool } from 'pg';
import 'dotenv/config';

export default class TrendsService {
  constructor() {
    this.repo = new TrendsRepository();
  }

  // Validar que un newsletter existe antes de crear un trend
  async validateNewsletterId(newsletterId) {
    if (newsletterId == null) return true; // null es válido
    
    const pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });

    try {
      const client = await pool.connect();
      const result = await client.query('SELECT "id" FROM "Newsletter" WHERE "id" = $1 LIMIT 1', [newsletterId]);
      await client.release();
      await pool.end();
      
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error validando newsletter ID:', error);
      await pool.end();
      return false;
    }
  }

  async createAsync(payload) {
    // Validar newsletter ID antes de crear el trend
    if (payload.id_newsletter != null) {
      const isValidNewsletter = await this.validateNewsletterId(payload.id_newsletter);
      if (!isValidNewsletter) {
        console.warn(`⚠️ Newsletter ID ${payload.id_newsletter} no existe. Estableciendo a null.`);
        payload.id_newsletter = null;
      }
    }
    
    return await this.repo.createAsync(payload);
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
  
  
}


