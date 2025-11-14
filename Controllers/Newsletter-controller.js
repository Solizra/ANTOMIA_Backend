import { Router } from 'express';
import NewsletterService from '../Services/Newsletter-services.js';
import { analizarNoticiaEstructurada, resumirDesdeUrl, extraerContenidoNoticia, generarResumenIA, obtenerNewslettersBDD, compararConNewslettersLocal, detectarIdioma, traducirInglesAEspanol } from '../Agent/main.js';
import TrendsService from '../Services/Trends-services.js';
import FeedbackService from '../Services/Feedback-service.js';
import eventBus from '../EventBus.js';
const router = Router();
const svc = new NewsletterService();

router.get('/', async (req, res) => {
  try {
    const data = await svc.getAllAsync(req.query);
    console.log(`📧 Newsletters obtenidos: ${data.length}`);
    res.status(200).json(data);
  } catch (e) {
    console.error('❌ Error en Newsletter-controller.getAllAsync:', e);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /api/Newsletter/ayuda
// Endpoint de ayuda que explica cómo funcionan los Newsletters
router.get('/ayuda', async (req, res) => {
  try {
    res.status(200).json({
      titulo: 'Cómo funcionan los Newsletters',
      descripcion: 'Los newsletters son publicaciones de Pulso by Antom que el sistema utiliza para relacionar con noticias sobre climatech.',
      comoFunciona: {
        agregar: {
          metodo: 'POST /api/Newsletter',
          descripcion: 'Puedes agregar nuevos newsletters enviando un POST con el campo "link" (debe ser de pulsobyantom.substack.com).',
          ejemplo: {
            body: {
              link: 'https://pulsobyantom.substack.com/p/titulo-del-newsletter'
            }
          },
          nota: 'El sistema extraerá automáticamente el título y generará un resumen del newsletter.'
        },
        importar: {
          metodo: 'POST /api/Newsletter/import',
          descripcion: 'Importa un newsletter desde Substack, extrayendo contenido y generando resumen automáticamente.',
          ejemplo: {
            body: {
              link: 'https://pulsobyantom.substack.com/p/titulo',
              titulo: 'Título opcional'
            }
          }
        },
        importarRapido: {
          metodo: 'POST /api/Newsletter/import-fast',
          descripcion: 'Versión rápida que solo extrae y resume, sin clasificar ni comparar.',
          nota: 'Útil para actualizar resúmenes de newsletters existentes.'
        },
        listar: {
          metodo: 'GET /api/Newsletter',
          descripcion: 'Obtiene todos los newsletters registrados en el sistema.',
          respuesta: 'Array de objetos con { id, link, titulo, Resumen, fecha_creacion }'
        },
        eliminar: {
          metodo: 'DELETE /api/Newsletter/:id',
          descripcion: 'Elimina un newsletter del sistema por ID.'
        }
      },
      relacionConNoticias: {
        proceso: 'Cuando se analiza una noticia, el sistema compara automáticamente su contenido con todos los newsletters registrados.',
        criterios: 'Se buscan coincidencias temáticas, palabras clave relacionadas con climatech, y similitudes semánticas.',
        resultado: 'Si encuentra relación, se crea un "Trend" que vincula la noticia con el newsletter relacionado.',
        explicacion: 'Cada relación incluye una explicación detallada de por qué están relacionados, mencionando empresas, tecnologías y temas específicos.'
      },
      analisis: {
        metodo: 'POST /api/Newsletter/analizar',
        descripcion: 'Analiza una noticia (URL) y busca newsletters relacionados automáticamente.',
        ejemplo: {
          body: {
            input: 'https://ejemplo.com/noticia-climatech'
          }
        },
        respuesta: {
          esClimatech: 'boolean - Si la noticia es sobre climatech',
          newslettersRelacionados: 'Array de newsletters relacionados con explicaciones detalladas',
          inserts: 'Array de trends creados en la base de datos'
        }
      }
    });
  } catch (e) {
    console.error('Error en endpoint de ayuda:', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

// Endpoint para obtener un newsletter por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const newsletter = await svc.getByIdAsync(id);
    if (!newsletter) {
      return res.status(404).json({ error: 'Newsletter no encontrado' });
    }
    res.status(200).json(newsletter);
  } catch (e) {
    console.error('❌ Error en Newsletter-controller.getById:', e);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.put('/:id/resumen', async (req, res) => {
  try {
    const { id } = req.params;
    const { Resumen } = req.body || {};
    if (Resumen !== null && Resumen !== undefined && typeof Resumen !== 'string') {
      return res.status(400).json({ error: '"Resumen" debe ser string o null' });
    }
    const updated = await svc.updateResumenByIdOrLinkAsync({ id, Resumen: Resumen ?? null });
    if (!updated) return res.status(404).json({ error: 'Newsletter no encontrado' });
    res.status(200).json({ message: '✅ Resumen actualizado', data: updated });
  } catch (e) {
    console.error('❌ Error actualizando resumen:', e);
    res.status(500).json({ error: 'Error interno del servidor', details: e.message });
  }
});

// Alternativa con query: PUT /api/Newsletter/resumen?id=123
router.put('/resumen', async (req, res) => {
  try {
    const { id, link } = req.query || {};
    const { Resumen } = req.body || {};
    if (!id && !link) return res.status(400).json({ error: 'Parámetro "id" o "link" requerido' });
    if (Resumen !== null && Resumen !== undefined && typeof Resumen !== 'string') {
      return res.status(400).json({ error: '"Resumen" debe ser string o null' });
    }
    const updated = await svc.updateResumenByIdOrLinkAsync({ id, link, Resumen: Resumen ?? null });
    if (!updated) return res.status(404).json({ error: 'Newsletter no encontrado' });
    res.status(200).json({ message: '✅ Resumen actualizado', data: updated });
  } catch (e) {
    console.error('❌ Error actualizando resumen (query):', e);
    res.status(500).json({ error: 'Error interno del servidor', details: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { link } = req.body || {};
    if (!link || typeof link !== 'string') {
      return res.status(400).json({ error: 'Falta el campo "link" en el body.' });
    }
    const ALLOWED_PREFIX = 'https://pulsobyantom.substack.com/p';
    if (!link.startsWith(ALLOWED_PREFIX)) {
      return res.status(400).json({ error: `El link debe ser un newsletter válido de Pulso by Antom (${ALLOWED_PREFIX}...)` });
    }
    // Chequear duplicado exacto
    const exists = await svc.existsByLink(link);
    if (exists) {
      return res.status(409).json({ message: '⛔ El newsletter ya existe', data: exists });
    }
    // Usar helper ligero: extraer y resumir sin clasificar ni comparar
    let titulo = '';
    let Resumen = '';
    try {
      const { titulo: t2, resumen } = await resumirDesdeUrl(link);
      titulo = t2 || '';
      Resumen = resumen || '';
    } catch (agentErr) {
      console.warn('⚠️ No se pudo extraer/resumir (fast path):', agentErr?.message || agentErr);
    }

    const created = await svc.createAsync({ link, titulo, Resumen });
    // Si el repositorio igualmente devuelve duplicated por carrera
    if (created && created.duplicated) {
      return res.status(409).json({ message: '⛔ El newsletter ya existe', data: created.data });
    }
    return res.status(201).json({ message: '✅ Newsletter agregado', data: created });
  } catch (e) {
    console.error('❌ Error en Newsletter-controller.createAsync:', e);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await svc.deleteAsync(id);
    if (!ok) return res.status(404).json({ error: 'Newsletter no encontrado' });
    return res.status(200).json({ message: '🗑️ Newsletter eliminado' });
  } catch (e) {
    console.error('❌ Error en Newsletter-controller.deleteAsync:', e);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

router.delete('/', async (req, res) => {
  try {
    const { id, link } = req.query || {};
    if (!id && !link) return res.status(400).json({ error: 'Parámetro "id" o "link" requerido' });
    const ok = await svc.deleteByIdOrLink({ id, link });
    if (!ok) return res.status(404).json({ error: 'Newsletter no encontrado' });
    return res.status(200).json({ message: '🗑️ Newsletter eliminado' });
  } catch (e) {
    console.error('❌ Error en Newsletter-controller.deleteAsync (query):', e);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: e.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Analizar noticia con el agente (sin LLM)
router.post('/analizar', async (req, res) => {
  try {
    const { input } = req.body || {};
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'Falta el campo "input" (URL o texto) en el body.' });
    }
    // Normalizar: si parece URL pero sin esquema, anteponer https://
    const trimmed = input.trim();
    let urlForAnalyze = trimmed;
    const looksLikeUrl = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/[^\s]*)?$/i.test(trimmed);
    if (looksLikeUrl && !/^https?:\/\//i.test(trimmed)) {
      urlForAnalyze = `https://${trimmed}`;
    }
    // Validar URL final
    try { new URL(urlForAnalyze); } catch {
      return res.status(400).json({ error: 'El input no es una URL válida.' });
    }

    const resultado = await analizarNoticiaEstructurada(urlForAnalyze);
    console.log('🔍 Resultado del análisis:', {
      esClimatech: resultado.esClimatech,
      url: resultado.url,
      titulo: resultado.titulo,
      newslettersRelacionados: resultado.newslettersRelacionados?.length || 0,
      motivoSinRelacion: resultado.motivoSinRelacion
    });

    // Guardado en BDD:
    // - Si esClimatech y link válido y hay relacionados -> guardar cada relación
    // - Si esClimatech y link válido y NO hay relacionados -> guardar una fila con Relacionado=false
    const trendsSvc = new TrendsService();
    const inserts = [];
    const tieneLinkValido = resultado.url && /^https?:\/\//i.test(resultado.url);
    if (resultado.esClimatech && tieneLinkValido && Array.isArray(resultado.newslettersRelacionados) && resultado.newslettersRelacionados.length > 0) {
      console.log(`📦 Preparando inserciones de relaciones (${resultado.newslettersRelacionados.length})`);
      for (const nl of resultado.newslettersRelacionados) {
        const payload = {
          id_newsletter: nl.id || null,
          Título_del_Trend: resultado.titulo || '',
          Link_del_Trend: resultado.url || '',
          Nombre_Newsletter_Relacionado: nl.titulo || '',
          Fecha_Relación: nl.fechaRelacion || new Date().toISOString(),
          Relacionado: true,
          Analisis_relacion: nl.analisisRelacion || '',
        };
        console.log('📝 Insert payload (relacionado=true):', payload);
        const created = await trendsSvc.createAsync(payload); // devuelve fila completa o { duplicated: true }
        if (!created?.duplicated) {
          // Preferir valores devueltos por BDD (normalizados) si existen
          inserts.push({
            id: created?.id,
            id_newsletter: created?.id_newsletter ?? payload.id_newsletter,
            Título_del_Trend: created?.['Título_del_Trend'] ?? payload.Título_del_Trend,
            Link_del_Trend: created?.['Link_del_Trend'] ?? payload.Link_del_Trend,
            Nombre_Newsletter_Relacionado: created?.['Nombre_Newsletter_Relacionado'] ?? payload.Nombre_Newsletter_Relacionado,
            Fecha_Relación: created?.['Fecha_Relación'] ?? payload.Fecha_Relación,
            Relacionado: created?.['Relacionado'] ?? payload.Relacionado,
            Analisis_relacion: created?.['Analisis_relacion'] ?? payload.Analisis_relacion,
            newsletterLink: nl.link || ''
          });
        } else {
          console.log('⛔ Relación duplicada evitada (controller):', payload.Link_del_Trend, payload.id_newsletter, payload.Nombre_Newsletter_Relacionado);
        }
      }
    } else if (resultado.esClimatech && tieneLinkValido) {
      const payload = {
        id_newsletter: null,
        Título_del_Trend: resultado.titulo || '',
        Link_del_Trend: resultado.url || '',
        Nombre_Newsletter_Relacionado: '',
        Fecha_Relación: new Date().toISOString(),
        Relacionado: false,
        Analisis_relacion: (resultado.motivoSinRelacion || '').trim() || 'Sin newsletter relacionado, pero clasificado como Climatech',
      };
      console.log('📝 Insert payload (relacionado=false):', payload);
      const created = await trendsSvc.createAsync(payload); // devuelve fila completa
      inserts.push({
        id: created?.id,
        id_newsletter: created?.id_newsletter ?? payload.id_newsletter,
        Título_del_Trend: created?.['Título_del_Trend'] ?? payload.Título_del_Trend,
        Link_del_Trend: created?.['Link_del_Trend'] ?? payload.Link_del_Trend,
        Nombre_Newsletter_Relacionado: created?.['Nombre_Newsletter_Relacionado'] ?? payload.Nombre_Newsletter_Relacionado,
        Fecha_Relación: created?.['Fecha_Relación'] ?? payload.Fecha_Relación,
        Relacionado: created?.['Relacionado'] ?? payload.Relacionado,
        Analisis_relacion: created?.['Analisis_relacion'] ?? payload.Analisis_relacion,
        newsletterLink: ''
      });
    }

    console.log('📊 Resultado final del controller:', {
      insertsCount: inserts.length,
      inserts: inserts.map(i => ({ id: i.id, titulo: i.Título_del_Trend, relacionado: i.Relacionado }))
    });

    res.status(200).json({
      ...resultado,
      inserts
    });
  } catch (e) {
    console.error('Error en /api/Newsletter/analizar:', e);
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('403') || msg.includes('forbidden') || msg.includes('429')) {
      return res.status(502).json({ error: 'La fuente bloqueó la extracción (403/429). Intenta otra URL o más tarde.' });
    }
    if (msg.includes('no se pudo extraer contenido')) {
      return res.status(422).json({ error: 'No se pudo extraer contenido útil de la página.' });
    }
    res.status(500).json({ error: e?.message || 'Error interno.' });
  }
});

// Endpoint para forzar una noticia como climatech (cuando la IA dijo que no lo era)
router.post('/forzarClimatech', async (req, res) => {
  try {
    // Aceptar múltiples alias para la URL: url, link, trendLink, querystring o body texto plano
    let rawUrl = null;
    try {
      if (req.body && typeof req.body === 'object') {
        rawUrl = req.body.url || req.body.link || req.body.trendLink || req.body?.resultado?.url || null;
      }
      if (!rawUrl && req.query) {
        rawUrl = req.query.url || req.query.link || req.query.trendLink || null;
      }
      // Si el body vino como string (text/plain o urlencoded atípico)
      if (!rawUrl && req.body && typeof req.body === 'string') {
        const txt = req.body.trim();
        // Intentar JSON
        try { const parsed = JSON.parse(txt); rawUrl = parsed?.url || parsed?.link || parsed?.trendLink || null; } catch {}
        // Intentar urlencoded
        if (!rawUrl) {
          try { const p = new URLSearchParams(txt); rawUrl = p.get('url') || p.get('link') || p.get('trendLink'); } catch {}
        }
        // Si parece URL, usarla directo
        if (!rawUrl && /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/[^\s]*)?$/i.test(txt)) rawUrl = txt;
      }
    } catch {}

    const razonIA = (req.body && typeof req.body === 'object') ? req.body.razonIA : undefined;

    if (!rawUrl || typeof rawUrl !== 'string') {
      console.warn('⚠️ /forzarClimatech sin url válida. Body recibido (keys):', req.body && typeof req.body === 'object' ? Object.keys(req.body) : typeof req.body);
      return res.status(400).json({ error: 'Falta el campo "url" (URL de la noticia) en el body o query.' });
    }

    // Normalizar URL
    const trimmed = rawUrl.trim();
    let urlForAnalyze = trimmed;
    const looksLikeUrl = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/[^\s]*)?$/i.test(trimmed);
    if (looksLikeUrl && !/^https?:\/\//i.test(trimmed)) {
      urlForAnalyze = `https://${trimmed}`;
    }

    // Validar URL final
    try { 
      new URL(urlForAnalyze); 
    } catch {
      return res.status(400).json({ error: 'El campo "url" no es una URL válida.' });
    }

    console.log(`🔧 [FORZAR CLIMATECH] Procesando noticia forzada como climatech: ${urlForAnalyze}`, { razonIA: razonIA || null });

    // Extraer contenido de la noticia
    const extraido = await extraerContenidoNoticia(urlForAnalyze);
    if (!extraido) {
      return res.status(422).json({ error: 'No se pudo extraer contenido de la URL.' });
    }

    let textoNoticia = extraido.contenido || '';
    let tituloNoticia = extraido.titulo || '';
    console.log(`📝 Título extraído: ${tituloNoticia}`);
    console.log(`📄 Contenido extraído: ${textoNoticia.length} caracteres`);

    // Detectar idioma y traducir si es necesario
    console.log(`\n🌐 DETECTANDO IDIOMA...`);
    const idioma = detectarIdioma(textoNoticia);
    console.log(`✅ Idioma detectado: ${idioma === 'en' ? 'Inglés' : 'Español'}`);
    
    if (idioma === 'en') {
      console.log(`🔄 Traduciendo contenido al español...`);
      textoNoticia = await traducirInglesAEspanol(textoNoticia);
      
      // También traducir el título si es necesario
      if (tituloNoticia && detectarIdioma(tituloNoticia) === 'en') {
        console.log(`🔄 Traduciendo título al español...`);
        tituloNoticia = await traducirInglesAEspanol(tituloNoticia);
      }
      
      console.log(`✅ Contenido traducido: ${textoNoticia.length} caracteres`);
    }

    // Generar resumen con IA (sin clasificar si es climatech)
    console.log(`\n🤖 GENERANDO RESUMEN CON IA...`);
    const resumen = await generarResumenIA(textoNoticia);
    console.log(`✅ Resumen generado: ${typeof resumen === 'string' ? resumen.substring(0, 100) + '...' : 'No disponible'}`);

    // Obtener newsletters de la BD y buscar relaciones (como si fuera climatech)
    console.log(`\n📊 OBTENIENDO NEWSLETTERS DE LA BASE DE DATOS...`);
    const newsletters = await obtenerNewslettersBDD();

    // Comparar con newsletters (forzando como climatech)
    console.log(`\n🔍 BUSCANDO NEWSLETTERS RELACIONADOS (FORZADO COMO CLIMATECH)...`);
    const { relacionados, motivoSinRelacion } = Array.isArray(newsletters)
      ? await compararConNewslettersLocal(typeof resumen === 'string' ? resumen : textoNoticia, newsletters, urlForAnalyze)
      : { relacionados: [], motivoSinRelacion: 'No hay newsletters para comparar.' };

    console.log(`\n✅ BÚSQUEDA COMPLETADA`);
    console.log(`📊 Newsletters relacionados encontrados: ${relacionados.length}`);

    // Guardar en Trends como climatech (forzado)
    const trendsSvc = new TrendsService();
    const feedbackSvc = new FeedbackService();
    const inserts = [];

    if (Array.isArray(relacionados) && relacionados.length > 0) {
      // Si hay newsletters relacionados, crear trends con esas relaciones
      console.log(`📦 Preparando inserciones de relaciones forzadas (${relacionados.length})`);
      for (const nl of relacionados) {
        const payload = {
          id_newsletter: nl.id || null,
          Título_del_Trend: tituloNoticia || extraido.titulo || '',
          Link_del_Trend: urlForAnalyze,
          Nombre_Newsletter_Relacionado: nl.titulo || '',
          Fecha_Relación: nl.fechaRelacion || new Date().toISOString(),
          Relacionado: true,
          Analisis_relacion: `[FORZADO_COMO_CLIMATECH] ${nl.analisisRelacion || 'Noticia forzada como climatech por el usuario'}`,
        };
        console.log('📝 Insert payload (forzado, relacionado=true):', payload);
        const created = await trendsSvc.createAsync(payload);
        if (!created?.duplicated) {
          inserts.push({
            id: created?.id,
            id_newsletter: created?.id_newsletter ?? payload.id_newsletter,
            Título_del_Trend: created?.['Título_del_Trend'] ?? payload.Título_del_Trend,
            Link_del_Trend: created?.['Link_del_Trend'] ?? payload.Link_del_Trend,
            Nombre_Newsletter_Relacionado: created?.['Nombre_Newsletter_Relacionado'] ?? payload.Nombre_Newsletter_Relacionado,
            Fecha_Relación: created?.['Fecha_Relación'] ?? payload.Fecha_Relación,
            Relacionado: created?.['Relacionado'] ?? payload.Relacionado,
            Analisis_relacion: created?.['Analisis_relacion'] ?? payload.Analisis_relacion,
            newsletterLink: nl.link || '',
            forzado: true
          });

          // Notificar al EventBus
          try {
            const trendData = {
              id: created?.id,
              newsletterTitulo: nl.titulo || '',
              newsletterId: nl.id ?? '',
              fechaRelacion: nl.fechaRelacion || new Date().toISOString(),
              trendTitulo: tituloNoticia || extraido.titulo || '',
              trendLink: urlForAnalyze,
              relacionado: true,
              newsletterLink: nl.link || '',
              analisisRelacion: nl.analisisRelacion || '',
              resumenFama: resumen || '',
              autor: extraido.autor || '',
              forzado: true
            };
            eventBus.notifyNewTrend(trendData);
            console.log(`📡 Nuevo trend forzado notificado: ${trendData.trendTitulo}`);
          } catch (eventError) {
            console.error('Error notificando trend forzado:', eventError);
          }
        } else {
          console.log('⛔ Relación duplicada evitada (forzar):', payload.Link_del_Trend, payload.id_newsletter);
        }
      }
    } else {
      // Si NO hay newsletters relacionados, crear trend SIN relación pero marcado como forzado
      const payload = {
        id_newsletter: null,
        Título_del_Trend: tituloNoticia || extraido.titulo || '',
        Link_del_Trend: urlForAnalyze,
        Nombre_Newsletter_Relacionado: '',
        Fecha_Relación: new Date().toISOString(),
        Relacionado: false,
        Analisis_relacion: `[FORZADO_COMO_CLIMATECH] Noticia forzada como climatech por el usuario. ${motivoSinRelacion || 'Sin newsletter relacionado'}`,
      };
      console.log('📝 Insert payload (forzado, relacionado=false):', payload);
      const created = await trendsSvc.createAsync(payload);
      if (!created?.duplicated) {
        inserts.push({
          id: created?.id,
          id_newsletter: created?.id_newsletter ?? payload.id_newsletter,
          Título_del_Trend: created?.['Título_del_Trend'] ?? payload.Título_del_Trend,
          Link_del_Trend: created?.['Link_del_Trend'] ?? payload.Link_del_Trend,
          Nombre_Newsletter_Relacionado: created?.['Nombre_Newsletter_Relacionado'] ?? payload.Nombre_Newsletter_Relacionado,
          Fecha_Relación: created?.['Fecha_Relación'] ?? payload.Fecha_Relación,
          Relacionado: created?.['Relacionado'] ?? payload.Relacionado,
          Analisis_relacion: created?.['Analisis_relacion'] ?? payload.Analisis_relacion,
          newsletterLink: '',
          forzado: true
        });

        // Notificar al EventBus
        try {
          const trendData = {
            id: created?.id,
            newsletterTitulo: '',
            newsletterId: '',
            fechaRelacion: new Date().toISOString(),
            trendTitulo: tituloNoticia || extraido.titulo || '',
            trendLink: urlForAnalyze,
            relacionado: false,
            newsletterLink: '',
            analisisRelacion: 'Noticia forzada como climatech por el usuario',
            resumenFama: resumen || '',
            autor: extraido.autor || '',
            forzado: true
          };
          eventBus.notifyNewTrend(trendData);
          console.log(`📡 Nuevo trend forzado sin newsletter notificado: ${trendData.trendTitulo}`);
        } catch (eventError) {
          console.error('Error notificando trend forzado:', eventError);
        }
      }
    }

    // Enviar feedback negativo a /api/Feedback indicando que la IA se equivocó
    try {
      const feedbackPayload = {
        trendId: inserts.length > 0 ? inserts[0].id : null,
        action: 'force_climatech',
        reason: 'ia_error',
        feedback: 'negative',
        trendData: {
          trendTitulo: extraido.titulo || '',
          trendLink: urlForAnalyze,
          newsletterId: inserts.length > 0 && inserts[0].id_newsletter ? inserts[0].id_newsletter : null,
          newsletterTitulo: inserts.length > 0 ? inserts[0].Nombre_Newsletter_Relacionado : ''
        },
        timestamp: new Date().toISOString()
      };
      
      const feedbackCreated = await feedbackSvc.createAsync(feedbackPayload);
      console.log(`✅ Feedback negativo registrado:`, {
        id: feedbackCreated?.id,
        action: feedbackCreated?.action,
        reason: feedbackCreated?.reason
      });
    } catch (feedbackError) {
      console.error('⚠️ Error registrando feedback negativo:', feedbackError?.message || feedbackError);
      // No fallar la operación si el feedback falla
    }

    console.log('📊 Resultado final del forzar climatech:', {
      insertsCount: inserts.length,
      inserts: inserts.map(i => ({ id: i.id, titulo: i.Título_del_Trend, relacionado: i.Relacionado }))
    });

    res.status(200).json({
      success: true,
      message: 'Noticia forzada como climatech exitosamente',
      url: urlForAnalyze,
      titulo: tituloNoticia || extraido.titulo || '',
      resumen: resumen,
      newslettersRelacionados: relacionados.map(nl => ({
        id: nl.id ?? null,
        titulo: nl.titulo || '',
        link: nl.link || '',
        puntuacion: nl.puntuacion ?? null,
        analisisRelacion: nl.analisisRelacion || '',
      })),
      inserts: inserts,
      forzado: true
    });
  } catch (e) {
    console.error('Error en /api/Newsletter/forzarClimatech:', e);
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('403') || msg.includes('forbidden') || msg.includes('429')) {
      return res.status(502).json({ error: 'La fuente bloqueó la extracción (403/429). Intenta otra URL o más tarde.' });
    }
    if (msg.includes('no se pudo extraer contenido')) {
      return res.status(422).json({ error: 'No se pudo extraer contenido útil de la página.' });
    }
    res.status(500).json({ error: e?.message || 'Error interno.' });
  }
});


export default router;

// Nuevo endpoint: importar/upsert newsletter con resumen
router.post('/import', async (req, res) => {
  try {
    const { link, titulo } = req.body || {};
    if (!link || typeof link !== 'string') {
      return res.status(400).json({ error: 'link requerido' });
    }

    // Validar dominio: solo Substack de pulso
    try {
      const u = new URL(link);
      if (u.hostname.toLowerCase() !== 'pulsobyantom.substack.com') {
        return res.status(400).json({ error: 'Solo se aceptan links de pulsobyantom.substack.com' });
      }
    } catch {
      return res.status(400).json({ error: 'link inválido' });
    }

    // Usar agente para extraer y resumir
    const analizado = await analizarNoticiaEstructurada(link);
    const resumen = analizado?.resumen || '';
    const tituloFinal = titulo || analizado?.titulo || '';

    const svc = new NewsletterService();
    const created = await svc.createOrIgnoreAsync({ link, Resumen: resumen, titulo: tituloFinal });
    if (created?.duplicated) {
      return res.status(200).json({ duplicated: true, existing: created.existing });
    }
    return res.status(201).json({ created });
  } catch (e) {
    console.error('Error en Newsletter-controller.import:', e);
    res.status(500).json({ error: e?.message || 'Error interno' });
  }
});

// Endpoint rápido: solo extraer+resumir y upsert (sin clasificar/comparar)
router.post('/import-fast', async (req, res) => {
  try {
    const { link, titulo } = req.body || {};
    if (!link || typeof link !== 'string') {
      return res.status(400).json({ error: 'link requerido' });
    }

    try {
      const u = new URL(link);
      if (u.hostname.toLowerCase() !== 'pulsobyantom.substack.com') {
        return res.status(400).json({ error: 'Solo se aceptan links de pulsobyantom.substack.com' });
      }
    } catch {
      return res.status(400).json({ error: 'link inválido' });
    }

    const { titulo: t2, resumen } = await resumirDesdeUrl(link);
    const tituloFinal = titulo || t2 || '';

    const svc = new NewsletterService();
    const created = await svc.createOrIgnoreAsync({ link, Resumen: resumen, titulo: tituloFinal });
    if (created?.duplicated) {
      return res.status(200).json({ duplicated: true, existing: created.existing });
    }
    return res.status(201).json({ created });
  } catch (e) {
    console.error('Error en Newsletter-controller.import-fast:', e);
    res.status(500).json({ error: e?.message || 'Error interno' });
  }
});