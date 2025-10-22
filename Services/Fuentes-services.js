import FuentesRepository from '../Repostories/Fuentes-repostory.js';

export default class FuentesService {
  // Orquesta la lógica de negocio para Fuentes
  // Usa el repositorio para acceso a datos y normaliza respuestas para el controlador/UI
  constructor() {
    this.repo = new FuentesRepository();
  }

  // Devuelve una lista de dominios confiables. Si la BDD está vacía, usa un fallback fijo
  async getTrustedDomainsAsync() {
    try {
      const rows = await this.repo.listAsync();
      const domains = rows.filter(r => r.activo === true).map(r => r.dominio).filter(Boolean);
      if (!Array.isArray(domains) || domains.length === 0) {
        return [
          'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'bbc.com',
          'techcrunch.com', 'wired.com', 'theverge.com', 'mit.edu', 'nature.com', 'science.org',
          'elpais.com', 'elconfidencial.com', 'infobae.com'
        ];
      }
      return domains;
    } catch (e) {
      // Fallback si no se puede acceder a la tabla
      return [
        'reuters.com', 'bloomberg.com', 'ft.com', 'wsj.com', 'bbc.com',
        'techcrunch.com', 'wired.com', 'theverge.com', 'mit.edu', 'nature.com', 'science.org',
        'elpais.com', 'elconfidencial.com', 'infobae.com'
      ];
    }
  }

  // Lista todas las fuentes mapeadas a la forma esperada por el frontend
  async listAsync() {
    try {
      return await this.repo.listAsync();
    } catch (e) {
      return [];
    }
  }

  // Intenta agregar una fuente. Si ya existe, el repositorio devuelve { existed: true }
  async addAsync({ fuente, categoria }) {
    return await this.repo.addAsync({ fuente, categoria });
  }

  // Elimina por fuente (case-insensitive)
  async deactivateAsync(fuente) {
    return await this.repo.deactivateAsync(fuente);
  }
}


