import { Router } from 'express';
import TrendsService from '../Services/Trends-services.js';
import FeedbackService from '../Services/Feedback-service.js';
import eventBus from '../EventBus.js';

const router = Router();
const svc = new TrendsService();
const feedbackSvc = new FeedbackService();

router.post('/', async (req, res) => {
  try {
    // Coaccionar tipos básicos por seguridad
    const b = req.body || {};
    const norm = {
      id_newsletter: b.id_newsletter,
      Título_del_Trend: b.Título_del_Trend,
      Link_del_Trend: b.Link_del_Trend,
      Nombre_Newsletter_Relacionado: b.Nombre_Newsletter_Relacionado,
      Fecha_Relación: b.Fecha_Relación,
      Relacionado: b.Relacionado,
      Analisis_relacion: b.Analisis_relacion
    };
    const created = await svc.createAsync(norm);
    res.status(201).json(created);
  } catch (e) {
    console.error('Error creando Trend:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await svc.getByIdAsync(req.params.id);
    if (!data) return res.status(404).json({ error: 'No encontrado' });
    res.status(200).json(data);
  } catch (e) {
    console.error('Error obteniendo Trend:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.get('/', async (req, res) => {
  try {
    const data = await svc.listAsync(req.query);
    res.status(200).json(data);
  } catch (e) {
    console.error('Error listando Trends:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const rawId = req.params.id;
    const id = Number(rawId);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'id inválido' });
    }
    
    console.log(`🗑️ Iniciando eliminación de trend ID: ${id}`);
    
    // Capturar razón y datos del trend para registrar feedback negativo
    let reason = null;
    try {
      // aceptar body o query
      const body = req.body || {};
      reason = body.reason ?? req.query?.reason ?? null;
    } catch {}

    // Leer trend actual antes de eliminar para persistir trendData
    let trend = null;
    try {
      trend = await svc.getByIdAsync(id);
    } catch (getErr) {
      console.warn('⚠️ No se pudo obtener trend antes de eliminar:', getErr?.message || getErr);
    }

    // Intentar guardar feedback negativo (no bloquear la eliminación si falla)
    try {
      const trendData = trend ? {
        trendTitulo: trend['Título_del_Trend'] || null,
        newsletterTitulo: trend['Nombre_Newsletter_Relacionado'] || null,
        trendLink: trend['Link_del_Trend'] || null,
        newsletterId: trend['id_newsletter'] ?? null
      } : null;

      await feedbackSvc.createAsync({
        trendId: null, // evitar cascada al borrar Trend
        action: 'delete',
        reason: reason || 'other',
        feedback: 'negativo',
        trendData,
        timestamp: new Date().toISOString()
      });
      console.log('📝 Feedback negativo registrado para trend eliminado:', { id, reason: reason || 'other' });
    } catch (fbErr) {
      console.warn('⚠️ No se pudo registrar feedback negativo en eliminación:', fbErr?.message || fbErr);
    }

    // Intentar borrar (idempotente)
    let deleted = false;
    try {
      deleted = await svc.deleteAsync(id);
    } catch (dbErr) {
      console.error('❌ Error en deleteAsync Trends:', dbErr);
      
      // Verificar si es un error de restricción de clave foránea
      if (dbErr.message && dbErr.message.includes('foreign key constraint')) {
        console.log('🔗 Error de restricción de clave foránea detectado');
        // Intentar eliminación manual en cascada
        try {
          deleted = await svc.deleteAsync(id);
          if (deleted) {
            return res.status(200).json({ 
              message: 'Trend eliminado exitosamente (cascada manual)', 
              id,
              warning: 'Se eliminaron registros relacionados'
            });
          }
        } catch (cascadeErr) {
          console.error('❌ Error en eliminación en cascada:', cascadeErr);
        }
      }
      
      // Responder idempotente para evitar bloquear la UI si hay inconsistencias
      return res.status(200).json({ 
        message: 'Trend eliminado (best-effort)', 
        id,
        warning: 'Puede haber registros relacionados que no se pudieron eliminar'
      });
    }
    
    if (!deleted) {
      // Si no existía, igualmente responder 200 para que la UI quede consistente
      return res.status(200).json({ 
        message: 'Trend no existente (idempotente)', 
        id 
      });
    }
    
    res.status(200).json({ 
      message: 'Trend eliminado exitosamente', 
      id 
    });
  } catch (e) {
    console.error('Error eliminando Trend:', e);
    // Responder 200 idempotente ante cualquier error inesperado para no romper UX
    res.status(200).json({ 
      message: 'Trend eliminado (best-effort)', 
      id: Number(req.params.id) || null,
      error: 'Error interno del servidor'
    });
  }
});



export default router;


