/**
 * Administra los endpoints relacionados con Server-Sent Events (SSE)
 * utilizando composición con el EventBus existente.
 */
export default class EventRoutes {
  constructor({ eventBus }) {
    this.eventBus = eventBus;
  }

  register(app) {
    app.get('/api/events', (req, res) => this.handleSseConnection(req, res));
    app.get('/api/events/stats', (req, res) => res.json(this.eventBus.getStats()));
    app.get('/api/health', (req, res) => {
      const stats = this.eventBus.getStats();
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        sse: {
          connectedClients: stats.connectedClients,
          totalEvents: stats.totalEvents
        }
      });
    });
  }

  handleSseConnection(req, res) {
    console.log('🔌 Nueva conexión SSE solicitada desde:', req.headers.origin || req.headers.host);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Connection, Accept, Origin, X-Requested-With, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
      'X-Accel-Buffering': 'no'
    });

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

    this.eventBus.addClient(res);

    const cleanup = (eventName) => {
      console.log(`🔌 Cliente SSE desconectado (${eventName})`);
      clearInterval(heartbeat);
      this.eventBus.removeClient(res);
    };

    req.on('close', () => cleanup('close'));
    req.on('error', (error) => {
      console.error('❌ Error en conexión SSE:', error);
      cleanup('error');
    });

    try {
      res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);
      console.log('✅ Conexión SSE establecida exitosamente');
    } catch (error) {
      console.error('❌ Error enviando mensaje de conexión:', error);
      cleanup('initial-send-error');
    }
  }
}

