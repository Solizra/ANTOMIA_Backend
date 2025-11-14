import { Router } from 'express';
import FuentesService from '../Services/Fuentes-services.js';

const router = Router();
const svc = new FuentesService();

// GET /api/Fuentes
// Lista todas las fuentes disponibles (mapeadas a { fuente, categoria, activo })
router.get('/', async (req, res) => {
  try {
    const rows = await svc.listAsync();
    res.status(200).json(rows);
  } catch (e) {
    console.error('Error obteniendo Fuentes:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /api/Fuentes
// Agrega una fuente si no existe. Si ya existe, devuelve un mensaje indicándolo
router.post('/', async (req, res) => {
  try {
    const { dominio, fuente, categoria } = req.body || {};
    const valor = typeof fuente === 'string' && fuente ? fuente : dominio;
    if (!valor || typeof valor !== 'string') {
      return res.status(400).json({ error: 'Campo "fuente" (o "dominio") requerido' });
    }
    const result = await svc.addAsync({ fuente: valor, categoria });
    if (result.existed) {
      return res.status(200).json({
        message: 'La fuente ya está en la base de datos',
        data: result
      });
    }
    return res.status(201).json({
      message: 'Fuente agregada',
      data: result
    });
  } catch (e) {
    console.error('Error agregando Fuente:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /api/Fuentes?dominio=example.com
// Elimina la fuente cuyo valor coincida (case-insensitive)
router.delete('/', async (req, res) => {
  try {
    const { dominio, fuente } = req.query || {};
    const valor = typeof fuente === 'string' && fuente ? fuente : dominio;
    if (!valor || typeof valor !== 'string') {
      return res.status(400).json({ error: 'Parámetro "fuente" (o "dominio") requerido' });
    }
    const ok = await svc.deactivateAsync(valor);
    if (!ok) return res.status(404).json({ error: 'No encontrado' });
    res.status(200).json({ message: 'Fuente desactivada' });
  } catch (e) {
    console.error('Error desactivando Fuente:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// GET /api/Fuentes/ayuda
// Endpoint de ayuda que explica cómo funcionan las Fuentes
router.get('/ayuda', async (req, res) => {
  try {
    res.status(200).json({
      titulo: 'Cómo funcionan las Fuentes',
      descripcion: 'Las fuentes son dominios de sitios web de noticias que el sistema utiliza para buscar y procesar noticias sobre climatech.',
      comoFunciona: {
        agregar: {
          metodo: 'POST /api/Fuentes',
          descripcion: 'Puedes agregar nuevas fuentes enviando un POST con el campo "fuente" (o "dominio") y opcionalmente "categoria".',
          ejemplo: {
            body: {
              fuente: 'techcrunch.com',
              categoria: 'Tecnología'
            }
          },
          nota: 'Si la fuente ya existe, recibirás un mensaje indicándolo. El sistema buscará noticias de todas las fuentes activas.'
        },
        listar: {
          metodo: 'GET /api/Fuentes',
          descripcion: 'Obtiene todas las fuentes registradas en el sistema.',
          respuesta: 'Array de objetos con { fuente, categoria, activo, id }'
        },
        eliminar: {
          metodo: 'DELETE /api/Fuentes?dominio=example.com',
          descripcion: 'Elimina (desactiva) una fuente del sistema.',
          nota: 'Una vez eliminada, el sistema dejará de buscar noticias de esa fuente.'
        }
      },
      procesamiento: {
        automatico: 'El sistema busca noticias automáticamente de todas las fuentes activas en español e inglés.',
        frecuencia: 'Las búsquedas se ejecutan periódicamente (configurado en GitHub Actions o cron).',
        filtrado: 'Solo se procesan noticias relacionadas con climatech, medio ambiente y sostenibilidad.',
        traduccion: 'Las noticias en inglés se traducen automáticamente al español antes de ser procesadas.'
      },
      fuentesRecomendadas: [
        'techcrunch.com - Tecnología y startups',
        'wired.com - Tecnología e innovación',
        'reuters.com - Noticias generales confiables',
        'bloomberg.com - Finanzas y negocios',
        'cleantechnica.com - Especializado en cleantech',
        'carbonbrief.org - Cambio climático',
        'elpais.com - Noticias en español',
        'elconfidencial.com - Noticias en español'
      ]
    });
  } catch (e) {
    console.error('Error en endpoint de ayuda:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;


