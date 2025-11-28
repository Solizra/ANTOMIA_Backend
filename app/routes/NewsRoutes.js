import fs from 'fs';

export default class NewsRoutes {
  constructor({ config, eventBus }) {
    this.config = config;
    this.eventBus = eventBus;
  }

  register(app) {
    app.get('/api/news/latest', (req, res) => this.getLatestNews(req, res));
    app.post('/api/news/search-now', async (req, res) => this.searchNewsNow(req, res));
    app.post('/api/newsletters/import-substack-now', async (req, res) =>
      this.importSubstackNow(req, res)
    );
  }

  getLatestNews(req, res) {
    try {
      const filePath = this.config.getNewsFilePath();
      if (!fs.existsSync(filePath)) return res.status(200).json([]);
      const raw = fs.readFileSync(filePath, 'utf8');
      const data = raw ? JSON.parse(raw) : [];
      res.status(200).json(data);
    } catch (error) {
      console.error('Error leyendo últimas noticias:', error);
      res.status(500).json({ error: 'Error leyendo últimas noticias' });
    }
  }

  async searchNewsNow(req, res) {
    try {
      console.log('🧪 Búsqueda manual de noticias solicitada...');
      const { buscarNoticias } = await import('../../APIs/buscarNoticias.mjs');
      const resultado = await buscarNoticias();
      res.json({
        success: true,
        message: 'Búsqueda de noticias ejecutada manualmente',
        resultado: resultado.length
      });
    } catch (error) {
      console.error('❌ Error en búsqueda manual:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async importSubstackNow(req, res) {
    try {
      const { importSubstackFeed } = await import('../../APIs/importSubstack.mjs');
      const result = await importSubstackFeed();
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error en import substack:', error);
      res.status(500).json({ success: false, error: error?.message || 'Error' });
    }
  }

  async triggerInitialNewsFetch() {
    try {
      console.log('🚀 Iniciando búsqueda de noticias...');
      const { buscarNoticias } = await import('../../APIs/buscarNoticias.mjs');
      buscarNoticias()
        .then(() => console.log('✅ Búsqueda de noticias completada'))
        .catch((error) => console.error('❌ Error en búsqueda de noticias:', error));
    } catch (error) {
      console.error('Error iniciando la búsqueda de noticias:', error);
    }
  }
}

