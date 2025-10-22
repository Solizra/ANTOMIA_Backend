import { Router } from 'express';
import FeedbackService from '../Services/Feedback-service.js';
import eventBus from '../EventBus.js';

const router = Router();
const svc = new FeedbackService();

router.post('', async (req, res) => {
  try {
    const payload = req.body || {};
    
    // VALIDACIÓN: Asegurar que se guarde SIEMPRE
    if (!payload.action) {
      console.error('❌ Feedback rechazado: falta action');
      return res.status(400).json({ error: 'action es requerido' });
    }

    console.log('📝 Feedback recibido:', {
      trendId: payload?.trendId,
      action: payload?.action,
      reason: payload?.reason,
      feedback: payload?.feedback,
      hasTrendData: !!payload?.trendData
    });

    const created = await svc.createAsync(payload);
    
    console.log('✅ Feedback guardado en BD:', {
      id: created?.id,
      trendId: created?.trendId,
      action: created?.action,
      reason: created?.reason,
      feedback: created?.feedback
    });

    // Notificar al frontend/otros consumidores
    try {
      eventBus.broadcast({ type: 'feedback', data: created });
      console.log('📡 Feedback notificado via EventBus');
    } catch (eventErr) {
      console.warn('⚠️ Error notificando feedback via EventBus:', eventErr?.message);
    }

    // Procesar feedback para mejorar la IA (SIEMPRE)
    try {
      const isDelete = String(created?.action || '').toLowerCase() === 'delete';
      const isNegative = String(created?.feedback || '').toLowerCase() === 'negative';
      const link = payload?.trendData?.trendLink || null;
      const newsletterId = payload?.trendData?.newsletterId ?? null;
      
      // Para feedback negativo, agregar a blacklist para evitar repetición
      if (isDelete && isNegative && link) {
        eventBus.addToBlacklist(link, newsletterId);
        console.log(`🚫 Feedback negativo - Par bloqueado: ${link}|${newsletterId}`);
      }
      
      // Log para monitoreo de tipos de feedback (SIEMPRE)
      console.log(`📊 Feedback procesado - Acción: ${created?.action || 'N/A'}, Razón: ${created?.reason || 'N/A'}, Tipo: ${created?.feedback || 'N/A'}`);
      
    } catch (processErr) {
      console.warn('⚠️ Error procesando feedback para IA:', processErr?.message);
    }
    
    res.status(201).json(created);
  } catch (e) {
    console.error('❌ Error crítico creando Feedback:', e?.message || e);
    res.status(400).json({ error: e?.message || 'Error creando feedback' });
  }
});

export default router;


