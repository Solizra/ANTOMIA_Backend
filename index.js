import 'dotenv/config';
import express from "express";
import cors from "cors";
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import NewsletterRouter from './Controllers/Newsletter-controller.js'
import TrendsRouter from './Controllers/Trends-controller.js'
import FuentesRouter from './Controllers/Fuentes-controller.js'
import FeedbackRouter from './Controllers/Feedback-controller.js'
import AuthRouter from './Controllers/Auth-controller.js'
import AuthService from './Services/Auth-service.js'
import { analizarNoticiaEstructurada } from './Agent/main.js';
import { iniciarProgramacionAutomatica } from './APIs/buscarNoticias.mjs';
import { importSubstackFeed } from './APIs/importSubstack.mjs';
import eventBus from './EventBus.js';
import { apiURL } from './constants.js';
const app = express();
const port = process.env.PORT || 3000;
const authService = new AuthService();

// Ruta absoluta al archivo de URLs de noticias
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const noticiasFilePath = path.join(__dirname, 'APIs', 'noticias.json');

app.use(cors());
app.use(express.json());

// Definición de rutas principales (cada una con su controlador y servicio detrás)
app.use('/api/Newsletter', NewsletterRouter); // `${apiURL}/api/Newsletter`
app.use('/api/Trends', TrendsRouter); // `${apiURL}/api/Trends`
app.use('/api/Fuentes', FuentesRouter); // `${apiURL}/api/Fuentes`
app.use('/api/Feedback', FeedbackRouter); // `${apiURL}/api/Feedback`
app.use('/api/auth', AuthRouter); // `${apiURL}/api/auth`

// Alias de endpoints de usuarios para compatibilidad con frontend: /api/users
app.get('/api/users', async (req, res) => {
  try {
    const result = await authService.listAllUsers();
    res.status(200).json(result);
  } catch (error) {
    console.error('Error en GET /api/users:', error);
    res.status(500).json({ success: false, error: error?.message || 'Error interno' });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { email, password, nombre, apellido, activo, email_verificado } = req.body || {};
    const result = await authService.createUserAdmin({ email, password, nombre, apellido, activo, email_verificado });
    res.status(201).json(result);
  } catch (error) {
    console.error('Error en POST /api/users:', error);
    const status = (error?.message && (error.message.includes('inválido') || error.message.includes('registrado') || error.message.includes('coinciden'))) ? 400 : 500;
    res.status(status).json({ success: false, error: error?.message || 'Error interno' });
  }
});

app.put('/api/users/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
    }
    const allowed = ['email', 'password', 'nombre', 'apellido', 'activo', 'email_verificado'];
    const updates = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
    const result = await authService.updateUserAdmin(userId, updates);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error en PUT /api/users/:userId:', error);
    const status = (error?.message && (error.message.includes('inválido') || error.message.includes('no encontrado'))) ? 400 : 500;
    res.status(status).json({ success: false, error: error?.message || 'Error interno' });
  }
});

app.delete('/api/users/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ success: false, error: 'ID de usuario inválido' });
    }
    const result = await authService.deleteUserAdmin(userId);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error en DELETE /api/users/:userId:', error);
    const status = (error?.message && error.message.includes('no encontrado')) ? 400 : 500;
    res.status(status).json({ success: false, error: error?.message || 'Error interno' });
  }
});

// DELETE por email (sin :userId)
app.delete('/api/users', async (req, res) => {
  try {
    const email = req.query.email || req.body?.email;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Email requerido para eliminar' });
    }
    const result = await authService.deleteUserByEmailAdmin(String(email));
    res.status(200).json(result);
  } catch (error) {
    console.error('Error en DELETE /api/users (por email):', error);
    const status = (error?.message && (error.message.includes('inválido') || error.message.includes('no encontrado'))) ? 400 : 500;
    res.status(status).json({ success: false, error: error?.message || 'Error interno' });
  }
});

// Alias adicionales que apuntan a los mismos handlers: /api/Users, /api/usuarios, /api/usuarios_registrados
const usersAliases = ['/api/Users', '/api/usuarios', '/api/usuarios_registrados'];
for (const base of usersAliases) {
  app.get(base, async (req, res) => {
    try {
      const result = await authService.listAllUsers();
      res.status(200).json(result);
    } catch (error) {
      console.error(`Error en GET ${base}:`, error);
      res.status(500).json({ success: false, error: error?.message || 'Error interno' });
    }
  });
  app.post(base, async (req, res) => {
    try {
      const { email, password, nombre, apellido, activo, email_verificado } = req.body || {};
      const result = await authService.createUserAdmin({ email, password, nombre, apellido, activo, email_verificado });
      res.status(201).json(result);
    } catch (error) {
      console.error(`Error en POST ${base}:`, error);
      const status = (error?.message && (error.message.includes('inválido') || error.message.includes('registrado') || error.message.includes('coinciden'))) ? 400 : 500;
      res.status(status).json({ success: false, error: error?.message || 'Error interno' });
    }
  });
  app.delete(base, async (req, res) => {
    try {
      const email = req.query.email || req.body?.email;
      if (!email) {
        return res.status(400).json({ success: false, error: 'Email requerido para eliminar' });
      }
      const result = await authService.deleteUserByEmailAdmin(String(email));
      res.status(200).json(result);
    } catch (error) {
      console.error(`Error en DELETE ${base}:`, error);
      const status = (error?.message && (error.message.includes('inválido') || error.message.includes('no encontrado'))) ? 400 : 500;
      res.status(status).json({ success: false, error: error?.message || 'Error interno' });
    }
  });
}

// Endpoint para disparar manualmente el workflow de GitHub Actions `auto-update.yml`
async function triggerAutoUpdateWorkflow(req, res) {
  try {
    const adminToken = req.headers['x-admin-token'];
    if (!process.env.ADMIN_API_TOKEN) {
      return res.status(500).json({ success: false, error: 'ADMIN_API_TOKEN no configurado en el servidor.' });
    }
    if (adminToken !== process.env.ADMIN_API_TOKEN) {
      return res.status(401).json({ success: false, error: 'No autorizado' });
    }

    const owner = process.env.GITHUB_REPO_OWNER;
    const repo = process.env.GITHUB_REPO_NAME;
    const workflowFile = process.env.GITHUB_WORKFLOW_FILE || 'auto-update.yml';
    const ref = process.env.GITHUB_DEFAULT_BRANCH || 'main';
    const token = process.env.GITHUB_TOKEN; // PAT o token de GitHub App con permiso repo:actions

    if (!owner || !repo || !token) {
      return res.status(500).json({
        success: false,
        error: 'Variables GITHUB_REPO_OWNER, GITHUB_REPO_NAME y/o GITHUB_TOKEN no configuradas.'
      });
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ ref })
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({ success: false, error: text || 'Error al disparar el workflow' });
    }

    return res.status(200).json({ success: true, message: 'Workflow auto-update.yml disparado correctamente' });
  } catch (error) {
    console.error('Error al disparar auto-update:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Error interno' });
  }
}

// Rutas compatibles para el disparo del workflow
app.post('/api/admin/run-auto-update', triggerAutoUpdateWorkflow);
app.post('/api/github/trigger-backend', triggerAutoUpdateWorkflow);

// Endpoint para obtener las últimas URLs de noticias guardadas por el scheduler
app.get('/api/news/latest', (req, res) => {
  try {
    if (!fs.existsSync(noticiasFilePath)) return res.status(200).json([]);
    const raw = fs.readFileSync(noticiasFilePath, 'utf8');
    const data = raw ? JSON.parse(raw) : [];
    res.status(200).json(data);
  } catch (e) {
    console.error('Error leyendo últimas noticias:', e);
    res.status(500).json({ error: 'Error leyendo últimas noticias' });
  }
});

// Ruta directa para análisis (redundante con el router, pero asegura disponibilidad)
app.post('/api/Newsletter/analizar', async (req, res) => {
  try {
    const { input } = req.body || {};
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'Falta el campo "input" (URL o texto) en el body.' });
    }
    const resultado = await analizarNoticiaEstructurada(input);
    res.status(200).json(resultado);
  } catch (e) {
    console.error('Error en /api/Newsletter/analizar (index):', e);
    res.status(500).json({ error: e?.message || 'Error interno.' });
  }
});

// Endpoint para Server-Sent Events (SSE) - Actualización en tiempo real
app.get('/api/events', (req, res) => {
  console.log('🔌 Nueva conexión SSE solicitada desde:', req.headers.origin || req.headers.host);
  
  // Configurar headers para SSE con CORS completo
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control, Connection, Accept, Origin, X-Requested-With, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'X-Accel-Buffering': 'no' // Deshabilitar buffering de nginx si está presente
  });

  // Enviar heartbeat cada 30 segundos para mantener la conexión
  const heartbeat = setInterval(() => {
    try {
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() })}\n\n`);
      }
    } catch (error) {
      console.error('Error enviando heartbeat:', error);
      clearInterval(heartbeat);
    }
  }, 30000);

  // Agregar cliente al EventBus
  eventBus.addClient(res);

  // Manejar desconexión del cliente
  req.on('close', () => {
    console.log('🔌 Cliente SSE desconectado');
    clearInterval(heartbeat);
    eventBus.removeClient(res);
  });

  // Manejar errores de conexión
  req.on('error', (error) => {
    console.error('❌ Error en conexión SSE:', error);
    clearInterval(heartbeat);
    eventBus.removeClient(res);
  });

  // Enviar evento de conexión exitosa
  try {
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
    console.log('✅ Conexión SSE establecida exitosamente');
  } catch (error) {
    console.error('❌ Error enviando mensaje de conexión:', error);
  }
});

// Endpoint para obtener estadísticas del EventBus
app.get('/api/events/stats', (req, res) => {
  res.json(eventBus.getStats());
});

// Endpoint de salud para verificar el estado del servidor
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sse: {
      connectedClients: eventBus.getStats().connectedClients,
      totalEvents: eventBus.getStats().totalEvents
    }
  });
});

// Endpoint manual para probar la búsqueda de noticias
app.post('/api/news/search-now', async (req, res) => {
  try {
    console.log('🧪 Búsqueda manual de noticias solicitada...');
    const { buscarNoticias } = await import('./APIs/buscarNoticias.mjs');
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
});

// Import manual del feed Substack ahora
app.post('/api/newsletters/import-substack-now', async (req, res) => {
  try {
    const result = await importSubstackFeed();
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error en import substack:', error);
    res.status(500).json({ success: false, error: error?.message || 'Error' });
  }
});

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  // Ejecutar búsqueda de noticias una sola vez al iniciar el servidor
  try {
    console.log('🚀 Iniciando búsqueda de noticias...');
    const { buscarNoticias } = await import('./APIs/buscarNoticias.mjs');
    buscarNoticias().then(() => {
      console.log('✅ Búsqueda de noticias completada');
    }).catch((error) => {
      console.error('❌ Error en búsqueda de noticias:', error);
    });
    
    // Import de Substack ahora se maneja via GitHub Actions cada 14 días
    // Comentado temporalmente para evitar errores al iniciar
    // importSubstackFeed().catch(console.error);
  } catch (e) {
    console.error('Error iniciando la búsqueda de noticias:', e);
  }
});
