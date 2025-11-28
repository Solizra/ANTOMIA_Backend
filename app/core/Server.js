import express from 'express';
import cors from 'cors';

import NewsletterRouter from '../../Controllers/Newsletter-controller.js';
import TrendsRouter from '../../Controllers/Trends-controller.js';
import FuentesRouter from '../../Controllers/Fuentes-controller.js';
import FeedbackRouter from '../../Controllers/Feedback-controller.js';
import AuthRouter from '../../Controllers/Auth-controller.js';

import AuthService from '../../Services/Auth-service.js';
import { analizarNoticiaEstructurada } from '../../Agent/main.js';
import eventBus from '../../EventBus.js';

import AppConfig from '../config/AppConfig.js';
import AuthMiddleware from '../middlewares/AuthMiddleware.js';
import UserRoutes from '../routes/UserRoutes.js';
import EventRoutes from '../routes/EventRoutes.js';
import NewsRoutes from '../routes/NewsRoutes.js';
import AutomationRoutes from '../routes/AutomationRoutes.js';

/**
 * Server aplica principios OO para encapsular la bootstrapping lógica
 * del backend. Centraliza dependencias y facilita pruebas.
 */
export default class Server {
  constructor() {
    this.app = express();
    this.config = new AppConfig();
    this.port = this.config.getPort();

    this.authService = new AuthService();
    this.authMiddleware = new AuthMiddleware(this.authService, this.config.getUserAdderWhitelist());

    this.userRoutes = new UserRoutes({ authService: this.authService, authMiddleware: this.authMiddleware });
    this.eventRoutes = new EventRoutes({ eventBus });
    this.newsRoutes = new NewsRoutes({ config: this.config, eventBus });
    this.automationRoutes = new AutomationRoutes({ config: this.config });
  }

  configure() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    this.registerRouters();
    this.userRoutes.register(this.app);
    this.registerAnalysisShortcut();
    this.eventRoutes.register(this.app);
    this.newsRoutes.register(this.app);
    this.automationRoutes.register(this.app);
  }

  registerRouters() {
    this.app.use('/api/Newsletter', NewsletterRouter);
    this.app.use('/api/Trends', TrendsRouter);
    this.app.use('/api/Fuentes', FuentesRouter);
    this.app.use('/api/Feedback', FeedbackRouter);
    this.app.use('/api/auth', AuthRouter);
  }

  registerAnalysisShortcut() {
    // Ruta directa para asegurar disponibilidad del análisis aunque falle el router principal
    this.app.post('/api/Newsletter/analizar', async (req, res) => {
      try {
        const { input } = req.body || {};
        if (!input || typeof input !== 'string') {
          return res.status(400).json({ error: 'Falta el campo "input" (URL o texto) en el body.' });
        }
        const resultado = await analizarNoticiaEstructurada(input);
        res.status(200).json(resultado);
      } catch (error) {
        console.error('Error en /api/Newsletter/analizar (directo):', error);
        res.status(500).json({ error: error?.message || 'Error interno.' });
      }
    });
  }

  start() {
    this.configure();
    this.app.listen(this.port, () => {
      console.log(`Server listening on port ${this.port}`);
      this.newsRoutes.triggerInitialNewsFetch();
    });
  }
}

