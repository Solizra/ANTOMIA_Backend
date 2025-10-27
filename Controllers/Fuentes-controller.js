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

export default router;


