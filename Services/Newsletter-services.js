import NewsletterRepostory from '../Repostories/Newsletter-repostory.js'; 

export default class NewsletterService {
  getAllAsync = async (query) => {
    try {
      const repo = new NewsletterRepostory();
      // CAMBIADO: limit = null para traer TODOS los newsletters por defecto
      const { id, link, Resumen, titulo, page = 1, limit = null } = query;
      const events = await repo.getAllAsync({ id, link, Resumen, titulo, page, limit });
      return events;
    } catch (error) {
      console.error('Error en NewsletterService.getAllAsync:', error);
      throw error;
    }
  };

  // Verifica existencia exacta por link
  existsByLink = async (link) => {
    try {
      const repo = new NewsletterRepostory();
      if (!link || typeof link !== 'string') return null;
      return await repo.existsByLinkExact(link);
    } catch (error) {
      console.error('Error en NewsletterService.existsByLink:', error);
      throw error;
    }
  };

  // Crea un newsletter (error si falta link)
  createAsync = async (payload) => {
    try {
      const repo = new NewsletterRepostory();
      const { link, titulo, Resumen } = payload || {};
      if (!link || typeof link !== 'string') {
        throw new Error('Falta el campo "link"');
      }
      return await repo.createAsync({ link, titulo, Resumen });
    } catch (error) {
      console.error('Error en NewsletterService.createAsync:', error);
      throw error;
    }
  };

  // Crea si no existe (ignora duplicados devolviendo señal desde el repo)
  createOrIgnoreAsync = async ({ link, Resumen, titulo }) => {
    try {
      const repo = new NewsletterRepostory();
      if (!link || typeof link !== 'string') {
        throw new Error('link requerido');
      }
      const created = await repo.createOrIgnoreAsync({ link, Resumen, titulo });
      return created;
    } catch (error) {
      console.error('Error en NewsletterService.createOrIgnoreAsync:', error);
      throw error;
    }
  };

  deleteAsync = async (id) => {
    try {
      const repo = new NewsletterRepostory();
      return await repo.deleteByIdAsync(id);
    } catch (error) {
      console.error('Error en NewsletterService.deleteAsync:', error);
      throw error;
    }
  };

  deleteByIdOrLink = async ({ id, link }) => {
    try {
      const repo = new NewsletterRepostory();
      return await repo.deleteByIdOrLink({ id, link });
    } catch (error) {
      console.error('Error en NewsletterService.deleteByIdOrLink:', error);
      throw error;
    }
  };

  updateResumenAsync = async (id, Resumen) => {
    try {
      const repo = new NewsletterRepostory();
      return await repo.updateResumenByIdAsync(id, Resumen);
    } catch (error) {
      console.error('Error en NewsletterService.updateResumenAsync:', error);
      throw error;
    }
  };

  updateResumenByIdOrLinkAsync = async ({ id, link, Resumen }) => {
    try {
      const repo = new NewsletterRepostory();
      return await repo.updateResumenByIdOrLinkAsync({ id, link, Resumen });
    } catch (error) {
      console.error('Error en NewsletterService.updateResumenByIdOrLinkAsync:', error);
      throw error;
    }
  };

  // Obtener newsletter por ID
  getByIdAsync = async (id) => {
    try {
      const repo = new NewsletterRepostory();
      return await repo.getByIdAsync(id);
    } catch (error) {
      console.error('Error en NewsletterService.getByIdAsync:', error);
      throw error;
    }
  };
}