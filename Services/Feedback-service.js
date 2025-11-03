import FeedbackRepository from '../Repostories/Feedback-repository.js';

export default class FeedbackService {
  constructor() {
    this.repo = new FeedbackRepository();
  }

  async createAsync(payload) {
    try {
      console.log('🔧 FeedbackService: Procesando feedback:', {
        trendId: payload?.trendId,
        action: payload?.action,
        reason: payload?.reason,
        feedback: payload?.feedback
      });

      const clean = {
        trendId: Number.isFinite(Number(payload?.trendId)) ? Number(payload.trendId) : null,
        action: (payload?.action || '').toString().trim(),
        reason: payload?.reason ? String(payload.reason) : null,
        feedback: payload?.feedback ? String(payload.feedback) : null,
        trendData: payload?.trendData ?? null,
        timestamp: payload?.timestamp ? new Date(payload.timestamp) : null
      };
      
      if (!clean.action) {
        console.error('❌ FeedbackService: action es requerido');
        throw new Error('action es requerido');
      }
      
      console.log('🔧 FeedbackService: Datos limpios para guardar:', clean);
      if (typeof this.repo.createAsync !== 'function') {
        throw new Error('FeedbackRepository.createAsync no está disponible en este despliegue');
      }
      const result = await this.repo.createAsync(clean);
      console.log('✅ FeedbackService: Feedback guardado exitosamente:', result);
      return result;
    } catch (error) {
      console.error('❌ FeedbackService: Error creando feedback:', error?.message || error);
      throw error;
    }
  }

  async hasNegativeForLinkOrPair({ trendLink, newsletterId = null }) {
    return await this.repo.hasNegativeForLinkOrPair({ trendLink, newsletterId });
  }

  async getRecentNegatives({ limit = 100 } = {}) {
    return await this.repo.getRecentNegatives({ limit });
  }

  // Construye patrones de títulos con feedback negativo
  async buildNegativeTitlePatterns({ limit = 300 } = {}) {
    const negatives = await this.getRecentNegatives({ limit });
    const tokensCount = new Map();
    const bigramsSet = new Set();

    const normalize = (s) => {
      try {
        return String(s || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      } catch {
        return String(s || '').toLowerCase();
      }
    };
    const STOP = new Set(['la','el','los','las','de','del','y','o','u','un','una','en','para','por','con','que','se','es','al','lo','a','su','sus','como','sobre','más','mas','sin','si','no','ya','muy']);

    const tokenize = (text) => normalize(text).split(' ').filter(t => t && t.length > 2 && !STOP.has(t));
    const getBigrams = (arr) => {
      const res = [];
      for (let i = 0; i < arr.length - 1; i++) res.push(arr[i] + ' ' + arr[i+1]);
      return res;
    };

    for (const fb of negatives) {
      const title = fb?.trendData?.trendTitulo || '';
      if (!title) continue;
      const tokens = tokenize(title);
      for (const t of tokens) tokensCount.set(t, (tokensCount.get(t) || 0) + 1);
      for (const bg of getBigrams(tokens)) bigramsSet.add(bg);
    }

    const topTokens = [...tokensCount.entries()]
      .sort((a,b) => b[1] - a[1])
      .slice(0, 50)
      .map(([t]) => t);

    return { topTokens, bigrams: [...bigramsSet].slice(0, 200) };
  }

  // Estadísticas de razones negativas para guiar al agente
  async getNegativeReasonsStats({ limit = 300 } = {}) {
    const negatives = await this.getRecentNegatives({ limit });
    const reasonCounts = new Map();
    const actionCounts = new Map();
    
    for (const fb of negatives) {
      const r = String(fb?.reason || 'other').toLowerCase();
      const a = String(fb?.action || 'unknown').toLowerCase();
      reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1);
      actionCounts.set(a, (actionCounts.get(a) || 0) + 1);
    }
    
    const topReasons = [...reasonCounts.entries()]
      .sort((a,b) => b[1] - a[1])
      .map(([reason, count]) => ({ reason, count }));
    
    const topActions = [...actionCounts.entries()]
      .sort((a,b) => b[1] - a[1])
      .map(([action, count]) => ({ action, count }));
    
    return { topReasons, topActions };
  }

  // Devuelve textos representativos de pares noticia↔newsletter rechazados (para embeddings)
  async getNegativePairExamples({ limit = 200 } = {}) {
    const negatives = await this.getRecentNegatives({ limit });
    const examples = [];
    for (const fb of negatives) {
      const t = fb?.trendData?.trendTitulo || '';
      const nl = fb?.trendData?.newsletterTitulo || String(fb?.trendData?.newsletterId || '');
      const text = `${t || ''} :: ${nl || ''}`.trim();
      if (text.length > 0) examples.push(text);
      if (examples.length >= limit) break;
    }
    return examples;
  }
}


