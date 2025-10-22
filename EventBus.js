// EventBus.js - Sistema de notificaciones en tiempo real
class EventBus {
  constructor() {
    this.clients = new Set();
    this.eventHistory = [];
    this.maxHistory = 100; // Mantener solo los últimos 100 eventos
    this.blacklist = new Set(); // pares trendLink|newsletterId para ocultar
  }

  // Agregar un nuevo cliente (frontend)
  addClient(client) {
    this.clients.add(client);
    console.log(`🔌 Cliente conectado. Total de clientes: ${this.clients.size}`);
    
    // Enviar historial de eventos al nuevo cliente
    if (this.eventHistory.length > 0) {
      client.write(`data: ${JSON.stringify({
        type: 'history',
        events: this.eventHistory.slice(-10) // Últimos 10 eventos
      })}\n\n`);
    }
  }

  // Remover un cliente
  removeClient(client) {
    this.clients.delete(client);
    console.log(`🔌 Cliente desconectado. Total de clientes: ${this.clients.size}`);
  }

  // Enviar evento a todos los clientes conectados
  broadcast(event) {
    const eventData = {
      ...event,
      timestamp: new Date().toISOString(),
      id: Date.now() + Math.random()
    };

    // Agregar al historial
    this.eventHistory.push(eventData);
    if (this.eventHistory.length > this.maxHistory) {
      this.eventHistory.shift();
    }

    // Enviar a todos los clientes
    const message = `data: ${JSON.stringify(eventData)}\n\n`;
    this.clients.forEach(client => {
      try {
        // Filtrar eventos newTrend si están en blacklist
        if (eventData.type === 'newTrend') {
          const key = `${eventData.data?.trendLink || ''}|${eventData.data?.newsletterId ?? 'null'}`;
          if (this.blacklist.has(key)) return;
        }
        client.write(message);
      } catch (error) {
        console.error('Error enviando evento a cliente:', error);
        this.removeClient(client);
      }
    });

    console.log(`📡 Evento broadcast enviado: ${event.type} a ${this.clients.size} clientes`);
  }

  // Registrar clave para no volver a mostrar un trend eliminado
  addToBlacklist(trendLink, newsletterId) {
    const key = `${trendLink || ''}|${newsletterId ?? 'null'}`;
    this.blacklist.add(key);
  }

  // Consultar si un par está bloqueado
  isBlacklisted(trendLink, newsletterId) {
    const key = `${trendLink || ''}|${newsletterId ?? 'null'}`;
    return this.blacklist.has(key);
  }

  // Notificar nuevo trend agregado
  notifyNewTrend(trend) {
    this.broadcast({
      type: 'newTrend',
      data: trend
    });
  }

  // Notificar actualización de noticias
  notifyNewsUpdate(news) {
    this.broadcast({
      type: 'newsUpdate',
      data: news
    });
  }

  // Notificar error
  notifyError(error) {
    this.broadcast({
      type: 'error',
      data: { message: error.message || error }
    });
  }

  // Obtener estadísticas
  getStats() {
    return {
      connectedClients: this.clients.size,
      totalEvents: this.eventHistory.length,
      lastEvent: this.eventHistory[this.eventHistory.length - 1]
    };
  }
}

// Instancia global del EventBus
const eventBus = new EventBus();

export default eventBus;
