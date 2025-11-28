// ESTE ERA EL MAIN2.JS QUE AHORA ES MAIN PARA QUE USE ESTE

import https from 'https';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import readline from 'readline';
import { fileURLToPath } from 'url';
import TrendsService from '../Services/Trends-services.js';
import FeedbackService from '../Services/Feedback-service.js';
import eventBus from '../EventBus.js';
import { getBackendUrl } from '../constants.js';

import OpenAI from "openai";
// Configuración
const DEBUG = false;
// Desactivar rechazo de certificados a nivel de proceso (entornos con MITM/proxy)
try { process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; } catch {}
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Si estás detrás de un proxy con certificado self-signed, puedes habilitar
// ALLOW_INSECURE_OPENAI=1 para que el SDK use el mismo httpsAgent permisivo
const allowInsecureOpenAI = process.env.ALLOW_INSECURE_OPENAI === '1';
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: allowInsecureOpenAI ? (url, init = {}) => fetch(url, { ...init, agent: httpsAgent }) : undefined
});
// Cliente inseguro para retry puntual si se detecta SELF_SIGNED_CERT_IN_CHAIN
const insecureClient = allowInsecureOpenAI ? client : new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: (url, init = {}) => fetch(url, { ...init, agent: httpsAgent })
});

// (httpsAgent ya fue definido antes)


// Utilidad: espera asíncrona
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -------------------- EMBEDDING CACHE (disco + memoria) --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EMBEDDING_CACHE_FILE = path.join(__dirname, 'embeddings-cache.json');
let embeddingCache = new Map(); // key -> array<number>
let saveTimeout = null;

function simpleHash(text) {
  try {
    let h = 2166136261;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16);
  } catch {
    return String(text || '').slice(0, 64);
  }
}

function loadEmbeddingCache() {
  try {
    if (fs.existsSync(EMBEDDING_CACHE_FILE)) {
      const raw = fs.readFileSync(EMBEDDING_CACHE_FILE, 'utf8');
      const obj = raw ? JSON.parse(raw) : {};
      embeddingCache = new Map(Object.entries(obj));
    }
  } catch (e) {
    console.log('⚠️ No se pudo cargar caché de embeddings:', e?.message || e);
    embeddingCache = new Map();
  }
}

function scheduleSaveEmbeddingCache() {
  try {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      try {
        const obj = Object.fromEntries(embeddingCache);
        fs.writeFileSync(EMBEDDING_CACHE_FILE, JSON.stringify(obj));
      } catch (e) {
        console.log('⚠️ No se pudo guardar caché de embeddings:', e?.message || e);
      }
    }, 500);
  } catch {}
}

async function getEmbeddingCached(text) {
  try {
    if (!client) return null;
    const key = simpleHash(text);
    if (embeddingCache.has(key)) {
      const arr = embeddingCache.get(key);
      return Array.isArray(arr) ? arr : null;
    }
    const resp = await client.embeddings.create({ model: 'text-embedding-3-small', input: text });
    const vec = resp?.data?.[0]?.embedding || null;
    if (vec) {
      embeddingCache.set(key, vec);
      if (embeddingCache.size > 5000) {
        // recorte simple: mantener últimos ~5000
        const keys = [...embeddingCache.keys()];
        const toDelete = keys.slice(0, Math.floor(keys.length * 0.2));
        for (const k of toDelete) embeddingCache.delete(k);
      }
      scheduleSaveEmbeddingCache();
    }
    return vec;
  } catch (e) {
    return null;
  }
}

loadEmbeddingCache();

// Helper robusto para llamadas a Chat con reintentos y fallback a cliente inseguro
async function chatCompletionJSON(messages, { model = "gpt-4o-mini", maxRetries = 3 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const useInsecure = attempt > 1; // probar cliente inseguro desde el segundo intento
    try {
      const cli = useInsecure ? insecureClient : client;
      const resp = await cli.chat.completions.create({ model, messages });
      const content = resp?.choices?.[0]?.message?.content?.trim?.() || "";
      if (typeof content === 'string' && content.length > 0) {
        return content;
      }
      lastError = new Error('Respuesta vacía del modelo');
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || err || '');
      const isConn = msg.includes('Connection error') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') || msg.includes('ENOTFOUND') || msg.includes('SELF_SIGNED_CERT_IN_CHAIN');
      if (!isConn && attempt === maxRetries) break;
    }
    // backoff exponencial simple
    await sleep(400 * attempt);
  }
  throw lastError || new Error('Fallo desconocido en chatCompletionJSON');
}


// Palabras clave para detectar Climatech - MEJORADAS y sincronizadas
const CLIMATECH_KEYWORDS = [
  // Energías renovables
  'solar', 'eólica', 'hidroeléctrica', 'renovable', 'energía limpia', 'paneles solares',
  'turbinas eólicas', 'energía verde', 'sostenible', 'sustentable',
  
  // Eficiencia energética
  'eficiencia energética', 'ahorro energético', 'consumo energético', 'optimización',
  'edificios verdes', 'certificación energética',
  
  // Captura de carbono
  'carbono', 'CO2', 'emisiones', 'captura', 'secuestro', 'neutralidad',
  'huella de carbono', 'compensación', 'reducción emisiones',
  
  // Movilidad sostenible
  'vehículo eléctrico', 'coche eléctrico', 'transporte público', 'bicicleta',
  'movilidad sostenible', 'transporte limpio', 'autobús eléctrico',
  
  // Agricultura sostenible
  'agricultura sostenible', 'agricultura orgánica', 'permacultura',
  'agricultura regenerativa', 'cultivo orgánico',
  
  // Tecnologías ambientales
  'monitoreo ambiental', 'sensores', 'IoT ambiental', 'tecnología verde',
  'innovación ambiental', 'tech climático',
  
  // Políticas climáticas
  'cambio climático', 'política climática', 'acuerdo de parís', 'COP',
  'regulación ambiental', 'normativa verde', 'impuestos verdes',
  
  // Materiales sostenibles
  'materiales sostenibles', 'biodegradable', 'reciclable', 'economía circular',
  'reutilización', 'sostenibilidad', 'materiales verdes',
  
  // Términos generales
  'clima', 'medio ambiente', 'sostenibilidad', 'verde', 'ecológico',
  'ambiental', 'sustentable', 'climatech', 'cleantech',
  
  // NUEVOS: Términos ambientales y de sostenibilidad
  'impacto ambiental', 'conservación ambiental', 'desarrollo sostenible',
  'biodiversidad', 'ecosistemas', 'humedales', 'conservación natural',
  'recursos naturales', 'protección ambiental', 'gestión ambiental',
  'minería sostenible', 'minería verde', 'minería responsable',
  'litio', 'baterías', 'energía limpia', 'transición energética',
  'adaptación climática', 'mitigación climática', 'energías alternativas',
  'agua', 'gestión hídrica', 'sequía', 'desertificación',
  'construcción verde', 'edificios sostenibles', 'arquitectura bioclimática',
  'logística verde', 'industria 4.0', 'tecnología limpia',
  'economía verde', 'empleos verdes', 'inversión responsable',
  'ESG', 'criterios ambientales', 'finanzas verdes', 'incendio forestal',
  'política ambiental', 'regulación climática', 'acuerdos ambientales'
];

// Stopwords básicas en español para mejorar la similitud
const STOPWORDS_ES = new Set([
  'a','acá','ahi','al','algo','algunas','algunos','allá','alli','allí','ambos','ante','antes','aquel','aquella','aquellas','aquello','aquellos','aqui','aquí','arriba','asi','aun','aunque','bajo','bastante','bien','cada','casi','como','cómo','con','contra','cual','cuales','cualquier','cualquiera','cualquieras','cuan','cuando','cuanta','cuantas','cuanto','cuantos','de','dejar','del','demasiado','demás','dentro','desde','donde','dos','el','él','ella','ellas','ellos','empleais','emplean','emplear','empleas','en','encima','entonces','entre','era','eramos','eran','eras','eres','es','esa','esas','ese','eso','esos','esta','estaba','estaban','estado','estais','estamos','estan','estar','estas','este','esto','estos','estoy','fin','fue','fueron','fui','fuimos','gueno','ha','hace','haceis','hacemos','hacen','hacer','haces','hacia','hasta','incluso','intenta','intentais','intentamos','intentan','intentar','intentas','ir','jamás','junto','juntos','la','lado','las','le','les','lo','los','luego','mal','mas','más','me','menos','mi','mia','mias','mientras','mio','mios','mis','misma','mismas','mismo','mismos','modo','mucha','muchas','muchísima','muchísimas','muchísimo','muchísimos','mucho','muchos','muy','nada','ni','ninguna','ningunas','ninguno','ningunos','no','nos','nosotras','nosotros','nuestra','nuestras','nuestro','nuestros','nunca','os','otra','otras','otro','otros','para','parecer','pero','poca','pocas','poco','pocos','por','porque','primero','puede','pueden','pues','que','qué','querer','quien','quién','quienes','quiénes','quiza','quizas','sabe','sabeis','sabemos','saben','saber','sabes','se','segun','ser','si','sí','siempre','siendo','sin','sino','so','sobre','sois','solamente','solo','somos','son','soy','su','sus','suya','suyas','suyo','suyos','tal','también','tampoco','tan','tanta','tantas','tanto','tantos','te','teneis','tenemos','tener','tengo','ti','tiempo','tiene','tienen','toda','todas','todavia','todavía','todo','todos','tomar','trabaja','trabajais','trabajamos','trabajan','trabajar','trabajas','tras','tu','tus','tuya','tuyas','tuyo','tuyos','un','una','unas','uno','unos','usa','usais','usamos','usan','usar','usas','usted','ustedes','va','vais','valor','vamos','van','varias','varios','vaya','verdad','verdadera','verdadero','vosotras','vosotros','voy','yo'
]);

function removeDiacritics(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenize(text) {
  const clean = removeDiacritics(String(text || '').toLowerCase())
    .replace(/[^a-z0-9áéíóúñü\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = clean.split(' ').filter(t => t.length > 1 && !STOPWORDS_ES.has(t));
  return tokens;
}

function buildTermFreq(tokens) {
  const tf = new Map();
  for (const tok of tokens) {
    tf.set(tok, (tf.get(tok) || 0) + 1);
  }
  return tf;
}
function jaccard(setA, setB) { //COMPARA LA SIMILUTUD
  const inter = new Set([...setA].filter(x => setB.has(x))).size;
  const uni = new Set([...setA, ...setB]).size;
  if (uni === 0) return 0;
  return inter / uni;
}

// Detectar plataforma a partir del host
function detectarPlataforma(urlString) {
  try {
    const url = new URL(urlString);
    const host = url.hostname.toLowerCase();
    if (host.includes('twitter.com') || host.includes('x.com')) return 'Twitter/X';
    if (host.includes('instagram.com')) return 'Instagram';
    if (host.includes('tiktok.com')) return 'TikTok';
    if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
    if (host.includes('facebook.com')) return 'Facebook';
    return host;
  } catch {
    return '';
  }
}
 
// Mapa de temas y sinónimos para mejorar coincidencias semánticas
const THEMATIC_SYNONYMS = {
  ia: ['ia', 'inteligencia artificial', 'ai', 'machine learning', 'aprendizaje automático'],
  agua: ['agua', 'hídrica', 'hidrica', 'hídrico', 'hidrico', 'water', 'recurso hídrico', 'huella hídrica', 'huella hidrica', 'consumo de agua', 'refrigeración', 'refrigeracion', 'enfriamiento', 'torres de enfriamiento', 'torres de refrigeración', 'torres de refrigeracion'],
  energia: ['energía', 'energia', 'renovable', 'renovables', 'energías renovables', 'solar', 'eólica', 'hidroeléctrica', 'hidroelectrica', 'geotérmica', 'geotermica'],
  carbono: ['carbono', 'co2', 'captura de carbono', 'secuestro de carbono', 'emisiones', 'neutralidad de carbono'],
  movilidad: ['vehículo eléctrico', 'vehiculos eléctricos', 'coche eléctrico', 'movilidad sostenible', 'transporte limpio'],
  agricultura: ['agricultura sostenible', 'agricultura regenerativa', 'permacultura', 'cultivo orgánico', 'agtech'],
  biodiversidad: ['biodiversidad', 'créditos de biodiversidad', 'conservación', 'conservacion'],
  hidrogeno: ['hidrógeno', 'hidrogeno', 'h2', 'hidrógeno verde', 'hidrogeno verde'],
};

function normalizeText(text) {
  return removeDiacritics(String(text || '').toLowerCase());
}

function extractThematicTags(text) {
  const norm = normalizeText(text);
  const tags = new Set();
  for (const [tag, synonyms] of Object.entries(THEMATIC_SYNONYMS)) {
    for (const syn of synonyms) {
      const synNorm = normalizeText(syn);
      if (norm.includes(synNorm)) {
        tags.add(tag);
        break;
      }
    }
  }
  return tags;
}
 
// Conjuntos temáticos para co-ocurrencia IA+Agua/Energía
const AI_TERMS = new Set(['ia','inteligencia artificial','ai','machine learning','chatgpt','modelo de lenguaje','modelos de lenguaje','openai','microsoft','google']);
const WATER_TERMS = new Set(['agua','hídrica','hidrica','huella hídrica','huella hidrica','consumo de agua','refrigeración','refrigeracion','enfriamiento','torres de enfriamiento','torres de refrigeración','torres de refrigeracion','centros de datos','data center']);
const ENERGY_TERMS = new Set(['energía','energia','kwh','electricidad','consumo energético','consumo energetico','centros de datos','data center']);

function hasAnyTerm(normText, termsSet) {
  for (const t of termsSet) { if (normText.includes(t)) return true; }
  return false;
}

// Función para extraer contenido de noticias desde URLs
export async function extraerContenidoNoticia(url) {
  try {
    console.log(`🔗 Extrayendo contenido de: ${url}`);
    
    // Helper: intento de fetch con headers "reales"
    async function fetchWithHeaders(targetUrl, attempt = 1) {
      const commonHeaders = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1'
      };
      // Forzar httpsAgent para evitar fallos por cadenas de certificados (self-signed)
      try {
        return await fetch(targetUrl, { agent: httpsAgent, headers: commonHeaders });
      } catch (err) {
        const msg = String(err?.message || err || '').toUpperCase();
        if (msg.includes('SELF_SIGNED_CERT_IN_CHAIN') || msg.includes('CERTIFICATE')) {
          // Señalamos al caller para que use fallback
          err._certIssue = true;
        }
        throw err;
      }
    }

    // 1) Intento directo (con httpsAgent)
    let res;
    try {
      res = await fetchWithHeaders(url, 1);
    } catch (err) {
      if (err?._certIssue) {
        console.log('⚠️ Problema de certificado detectado. Usando fallback lector.');
      } else {
        throw err;
      }
    }
    let html = '';
    // 2) Fallback: lector remoto si bloqueado/cert o status no OK
    if (!res || !res.ok) {
      const statusInfo = res ? `${res.status} ${res.statusText}` : 'sin respuesta';
      console.log(`⚠️ Fetch directo falló (${statusInfo}). Usando fallback de lector (r.jina.ai).`);
      const encodedUrl = encodeURI(url);
      const safeUrl = encodedUrl.startsWith('https://')
        ? `https://r.jina.ai/${encodedUrl}`
        : `https://r.jina.ai/http://${encodedUrl.replace(/^https?:\/\//, '')}`;
      const proxyRes = await fetch(safeUrl, { agent: httpsAgent });
      if (!proxyRes.ok) {
        throw new Error(`Error HTTP: ${res ? res.status : proxyRes.status} ${res ? res.statusText : proxyRes.statusText}`);
      }
      html = await proxyRes.text();
    } else {
      html = await res.text();
    }
    const $ = cheerio.load(html);

    // Limpiar elementos no deseados
    $('script, style, noscript, iframe, img, video, audio, form, nav, header, footer, aside, .ad, .advertisement, .social, .share, .comments, .related, .sidebar').remove();

    // Extraer título con múltiples estrategias
    let titulo = '';
    
    // 1. Meta tags de Open Graph
    titulo = $('meta[property="og:title"]').attr('content') || 
             $('meta[name="twitter:title"]').attr('content') || '';
    
    // 2. Meta tags estándar
    if (!titulo) {
      titulo = $('meta[name="title"]').attr('content') || 
               $('title').text().trim() || '';
    }
    
    // 3. H1 principal
    if (!titulo) {
      titulo = $('h1').first().text().trim() || '';
    }
    
    // 4. H2 si no hay H1
    if (!titulo) {
      titulo = $('h2').first().text().trim() || '';
    }

    // Limpiar título
    titulo = titulo.replace(/\s+/g, ' ').trim();
    if (titulo.length > 200) titulo = titulo.substring(0, 200) + '...';

    // Metadatos
    const siteName = $('meta[property="og:site_name"]').attr('content') || 
                     $('meta[name="application-name"]').attr('content') || 
                     $('meta[name="publisher"]').attr('content') || '';
    
    const author = $('meta[name="author"]').attr('content') || 
                   $('meta[property="article:author"]').attr('content') || 
                   $('meta[name="byline"]').attr('content') || 
                   $('.author, .byline, [class*="author"], [class*="byline"]').first().text().trim() || '';
    
    const published = $('meta[property="article:published_time"]').attr('content') || 
                      $('meta[name="date"]').attr('content') || 
                      $('meta[itemprop="datePublished"]').attr('content') || 
                      $('meta[name="publish_date"]').attr('content') || '';

    // Estrategia mejorada para extraer contenido principal
    let contenido = '';
    let parrafos = [];

    // Helper: detectar si un elemento está dentro de bloques de relacionados/recomendados
    function estaEnBloqueRelacionado(el) {
      try {
        const parents = $(el).parents().toArray();
        for (const p of parents) {
          const attrs = $(p).attr() || {};
          const joined = [attrs.class, attrs.id, Object.values(attrs).join(' ')].join(' ').toLowerCase();
          if (/related|recomend|recommend|sidebar|more|te\s+puede\s+interesar|mir[aá]\s+tambi[ée]n|seg[uú]i\s+leyendo/.test(joined)) {
            return true;
          }
        }
      } catch {}
      return false;
    }

    // Helper: filtrar texto no deseado (cta, políticas, copys de módulos)
    function textoNoDeseado(texto) {
      const t = (texto || '').toLowerCase();
      if (t.length <= 30) return false; // permitir títulos internos razonables
      return (
        t.includes('cookie') ||
        t.includes('privacy') ||
        t.includes('advertisement') ||
        t.includes('subscribe') ||
        t.includes('newsletter') ||
        t.includes('follow us') ||
        t.includes('share this') ||
        t.includes('comment') ||
        t.includes('©') ||
        t.includes('all rights reserved') ||
        t.includes('terms of service') ||
        t.includes('privacy policy') ||
        /^mir[aá]\s+tambi[ée]n/.test(t) ||
        t.includes('te puede interesar') ||
        t.includes('seguí leyendo') ||
        t.includes('segui leyendo')
      );
    }

    // Detectar host para aplicar selectores específicos
    let hostname = '';
    try { hostname = (new URL(url)).hostname.toLowerCase(); } catch {}

    // Estrategia 1: Buscar en contenedores específicos de artículos
    const articleSelectors = (
      hostname.includes('lanacion.com.ar')
        ? [
            // Selectores típicos de cuerpo de nota en La Nación
            '.com-article__content',
            '.com-article__body',
            'article .com-paragraph',
            'article'
          ]
        : [
            'article',
            '.article',
            '.post',
            '.entry',
            '.content',
            '.story',
            '.news',
            '.main-content',
            '.post-content',
            '.article-content',
            '.entry-content',
            '.story-content',
            '.news-content',
            '[role="main"]',
            'main'
          ]
    );

    for (const selector of articleSelectors) {
      const article = $(selector);
      if (article.length > 0) {
        console.log(`📰 Encontrado contenedor: ${selector}`);
        
        // Extraer párrafos del artículo (sin li para evitar listas de relacionados)
        const articleParrafos = article.find('p, h2, h3, h4, h5, h6, blockquote')
          .map((_, el) => {
            const texto = $(el).text().trim();
            if (!texto || textoNoDeseado(texto)) return '';
            if (estaEnBloqueRelacionado(el)) return '';
            return texto;
          })
          .get()
          .filter(texto => texto && texto.length > 30);
        
        if (articleParrafos.length > 0) {
          parrafos = articleParrafos;
          break;
        }
      }
    }

    // Estrategia 2: Si no se encontró en contenedores específicos, buscar en todo el body
    if (parrafos.length === 0) {
      console.log(`🔍 Buscando en todo el body...`);
      
      parrafos = $('body p, body h2, body h3, body h4, body h5, body h6, body blockquote')
        .map((_, el) => {
          const texto = $(el).text().trim();
          if (!texto || textoNoDeseado(texto)) return '';
          if (estaEnBloqueRelacionado(el)) return '';
          return texto;
        })
        .get()
        .filter(texto => texto && texto.length > 30);
    }

    // Estrategia 3: Si aún no hay contenido, buscar en cualquier párrafo largo
    if (parrafos.length === 0) {
      console.log(`🔍 Último recurso: buscando párrafos largos...`);
      
      parrafos = $('p')
        .map((_, el) => {
          const texto = $(el).text().trim();
          return texto;
        })
        .get()
        .filter(texto => texto.length > 50);
    }

    // Filtrar y limpiar párrafos
    parrafos = parrafos
      .filter(texto => {
        // Eliminar texto que parece ser CSS, JavaScript o HTML
        const hasCSS = /[{}\s]*[a-z-]+:\s*[^;]+;/.test(texto);
        const hasJS = /function|var|let|const|console\.|document\.|window\./.test(texto);
        const hasHTML = /<[^>]+>/.test(texto);
        const hasURL = /https?:\/\/[^\s]+/.test(texto);
        const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(texto);
        
        return !hasCSS && !hasJS && !hasHTML && !hasURL && !hasEmail;
      })
      .map(texto => {
        // Limpiar texto
        return texto
          .replace(/\s+/g, ' ')  // Normalizar espacios
          .replace(/[^\w\s.,!?;:()áéíóúñüÁÉÍÓÚÑÜ]/g, '')  // Solo texto y puntuación básica
          .trim();
      })
      .filter(texto => texto.length > 20);  // Solo párrafos significativos

    if (parrafos.length === 0) {
      // Si venimos del fallback r.jina.ai, el contenido suele venir como texto plano
      // Intentar usar todo el body como contenido si no se extrajo nada con selectores
      try {
        const bodyText = $('body').text().trim();
        if (bodyText && bodyText.length > 100) {
          parrafos = bodyText.split(/\n+/).map(s => s.trim()).filter(s => s.length > 50).slice(0, 200);
        }
      } catch {}
      if (parrafos.length === 0) {
        throw new Error('No se pudo extraer contenido útil de la página');
      }
    }

    // Unir párrafos (sin recortar para maximizar contexto)
    contenido = parrafos.join('\n\n');
    
    console.log(`✅ Contenido extraído: ${contenido.length} caracteres`);
    console.log(`📝 Primeros 200 caracteres: "${contenido.substring(0, 200)}..."`);
    
    return {
      titulo: titulo || 'Sin título',
      contenido: contenido,
      url: url,
      sitio: siteName || (new URL(url)).hostname,
      autor: author,
      fechaPublicacion: published
    };
  } catch (error) {
    console.error(`❌ Error extrayendo contenido: ${error.message}`);
    throw error;
  }
}

// Función para generar resumen usando Chat Completions de OpenAI
export async function generarResumenIA(contenido) { //de donde sale el contenido?? ()
  try {
    console.log(`📝 Generando resumen inteligente de toda la noticia...`);
    
    // Limpiar contenido
    const contenidoLimpio = contenido
      .replace(/\s+/g, ' ')  // Normalizar espacios
      .replace(/[^\w\s.,!?;:()áéíóúñüÁÉÍÓÚÑÜ]/g, '')  // Solo texto y puntuación
      .trim();
    
    // Dividir en oraciones usando múltiples delimitadores
    const oraciones = contenidoLimpio
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 20 && s.length < 1000);  // Oraciones de longitud razonable
    
    if (oraciones.length === 0) {
      console.log(`⚠️ No se pudieron dividir oraciones, usando texto completo`);
      return contenidoLimpio.substring(0, 500) + '...';
    }
    
    console.log(`📊 Total de oraciones encontradas: ${oraciones.length}`);
    
    // Seleccionar oraciones clave y luego agrupar SIEMPRE en párrafos
    const oracionesSeleccionadas = [];
    if (oraciones.length <= 3) {
      // Con pocas oraciones, tomar todas
      oracionesSeleccionadas.push(...oraciones);
    } else {
      // primera + media + última + algunas del medio
      oracionesSeleccionadas.push(oraciones[0]);
      const medio = Math.floor(oraciones.length / 2);
      const rangoMedio = Math.floor(oraciones.length * 0.3);
      for (let i = Math.max(1, medio - rangoMedio); i < Math.min(oraciones.length - 1, medio + rangoMedio); i++) {
        if (oraciones[i].length > 30) {
          oracionesSeleccionadas.push(oraciones[i]);
        }
      }
      if (oraciones.length > 1) {
        oracionesSeleccionadas.push(oraciones[oraciones.length - 1]);
      }
      let caracteresAcumulados = oracionesSeleccionadas.reduce((sum, o) => sum + o.length, 0);
      if (caracteresAcumulados < 500) {
        for (let i = 1; i < oraciones.length - 1; i++) {
          if (caracteresAcumulados >= 500) break;
          const o = oraciones[i];
          if (o.length > 30 && !oracionesSeleccionadas.includes(o)) {
            oracionesSeleccionadas.push(o);
            caracteresAcumulados += o.length;
          }
        }
      }
      oracionesSeleccionadas.sort((a, b) => oraciones.indexOf(a) - oraciones.indexOf(b));
    }

    // Agrupar en párrafos legibles SIEMPRE
    let resumen = '';
    const paragraphs = [];
    let current = [];
    let currentLen = 0;
    const maxCharsPerParagraph = 600;
    const maxSentencesPerParagraph = 5;
    for (const sentence of oracionesSeleccionadas) {
      const addLen = sentence.length + 2;
      const willOverflow = currentLen + addLen > maxCharsPerParagraph || current.length >= maxSentencesPerParagraph;
      if (willOverflow && current.length > 0) {
        const p = current.join('. ');
        paragraphs.push(p.endsWith('.') ? p : p + '.');
        current = [];
        currentLen = 0;
      }
      current.push(sentence);
      currentLen += addLen;
    }
    if (current.length > 0) {
      const p = current.join('. ');
      paragraphs.push(p.endsWith('.') ? p : p + '.');
    }

    // Garantizar al menos 2 párrafos si el texto es lo suficientemente largo
    const totalChars = oracionesSeleccionadas.reduce((s, o) => s + o.length, 0);
    if (paragraphs.length < 2 && (oracionesSeleccionadas.length > 2 || totalChars > 250)) {
      const mid = Math.max(1, Math.ceil(oracionesSeleccionadas.length / 2));
      const p1 = oracionesSeleccionadas.slice(0, mid).join('. ');
      const p2 = oracionesSeleccionadas.slice(mid).join('. ');
      resumen = [p1, p2].map(x => (x && !x.endsWith('.') ? x + '.' : x)).filter(Boolean).join('\n\n');
    } else {
      resumen = paragraphs.join('\n\n');
    }
    
    // Limpiar espacios intra-párrafo pero preservar saltos
    resumen = resumen
      .split(/\n\n+/)
      .map(p => p.replace(/\s+/g, ' ').trim())
      .filter(p => p.length > 0)
      .map(p => (p.endsWith('.') ? p : p + '.'))
      .join('\n\n');
    
    // Garantizar mínimo de 500 caracteres
    if (resumen.length < 500) {
      console.log(`⚠️ Resumen muy corto (${resumen.length} chars), expandiendo...`);
      
      // Agregar más oraciones manteniendo párrafos
      const existingSentences = new Set(
        resumen.replace(/\n\n/g, ' ').split('.').map(s => s.trim()).filter(Boolean)
      );
      const extra = [];
      let cur = [];
      let len = 0;
      for (const s of oraciones) {
        const st = s.trim();
        if (st.length <= 30) continue;
        if (existingSentences.has(st)) continue;
        if (len + st.length > 600 || cur.length >= 5) {
          extra.push(cur.join('. ') + '.');
          cur = [];
          len = 0;
        }
        cur.push(st);
        len += st.length + 2;
        if ((resumen + extra.join(' ')).length >= 500) break;
      }
      if (cur.length) extra.push(cur.join('. ') + '.');
      if (extra.length) resumen = [resumen, ...extra].filter(Boolean).join('\n\n');
    }
    
    // No limitar longitud máxima: mantener todo el resumen para comparaciones completas
    console.log(`✅ Resumen inteligente generado: ${resumen.length} caracteres (sin recorte máximo)`);
    console.log(`📝 Resumen: "${resumen}"`);
    
    return resumen;
  } catch (error) {
    console.error(`❌ Error generando resumen: ${error.message}`);
    // Fallback: devolver el contenido completo limpio (hasta el límite de extracción)
    return contenido;
  }
}

// Función para determinar si es Climatech usando análisis de palabras clave
function determinarSiEsClimatechLocal(contenido) {
  try {
    console.log(`🔍 Evaluando si es Climatech (análisis local)...`);
    
    const contenidoLower = contenido.toLowerCase();
    let puntuacion = 0;
    const palabrasEncontradas = [];
    
    // Contar coincidencias de palabras clave
    CLIMATECH_KEYWORDS.forEach(keyword => {
      if (contenidoLower.includes(keyword.toLowerCase())) {
        puntuacion += 1;
        palabrasEncontradas.push(keyword);
      }
    });
    return puntuacion > 0;
  } catch (error) {
    console.error(`❌ Error determinando si es Climatech: ${error.message}`);
    return false;
  }
}

// Función para determinar si es Climatech usando un modelo heurístico ponderado
async function esClimatechIA(contenido) {
  try {
    console.log("Entre a esClimatechIA");
    const textoAnalisis = typeof contenido === 'string' ? contenido : String(contenido || '');
    const previewEntrada = textoAnalisis.substring(0, 220) + (textoAnalisis.length > 220 ? '…' : '');
    console.log(`[esClimatechIA] Longitud del texto a evaluar: ${textoAnalisis.length}`);
    console.log(`[esClimatechIA] Preview del texto a evaluar: ${previewEntrada}`);

    const messages = [
      { role: "system", content: "Eres un experto en sostenibilidad, medio ambiente y tecnologías/climatech." },
      { role: "user", content: `Tu tarea es decidir si una noticia está relacionada con CLIMATECH.
      
      Definición ampliada (clasificar como CLIMATECH si cumple AL MENOS uno):
      1) Relación entre TECNOLOGÍA (cualquier tipo: digital, IA, telecomunicaciones, producción/almacenamiento de energía, sensores, satélites, materiales, etc.) y MEDIO AMBIENTE o CAMBIO CLIMÁTICO.
      2) Temas SOLO de MEDIO AMBIENTE/CLIMA/SOSTENIBILIDAD con impacto relevante (p.ej.: transición energética, conservación, biodiversidad, agua, emisiones, políticas/regulación climática, economía circular, incendios/mitigación/adaptación).
      3) Startups/empresas/emprendimientos del rubro climático/cleantech (incluye rondas de inversión, aceleradoras/incubadoras, lanzamientos) aunque no se mencione explícitamente una tecnología.
      
      Ejemplos que SON CLIMATECH:
      - "La IA aumenta el consumo de agua en data centers" (tecnología + ambiente)
      - "Nueva ronda Serie A para startup de captura de carbono" (startup climática)
      - "Conservación de humedales clave para la mitigación" (tema ambiental relevante)
      
      Instrucciones:
      1. Si cumple la definición ampliada, responde con "SI".
      2. Si no cumple, responde con "NO".
      3. Luego, independientemente de 'SI' o 'NO', da una breve explicación (1-3 frases) justificando.
      
      Noticia a evaluar:
      ${textoAnalisis}` }
    ];

    console.log(`[esClimatechIA] Enviando prompt al modelo (gpt-4o-mini).`);
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages
    });
    const salida = resp?.choices?.[0]?.message?.content?.trim?.() || "";
    console.log(`[esClimatechIA] Respuesta RAW del modelo: ${salida}`);
    // Detectar si es climatech de forma más robusta
    const salidaLower = salida.toLowerCase().trim();
    // Normalizar: quitar acentos para comparación
    const salidaNormalizada = salidaLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Verificar múltiples patrones que indican "SÍ es climatech"
    const patronesPositivos = [
      /^si[\s.,:;!?]/i,  // Empieza con "si" seguido de puntuación/espacio
      /^si\b/i,          // Empieza con "si" como palabra completa
      /\bes climatech\b/i,  // Contiene "es climatech"
      /\best[aá] relacionada con climatech/i,  // "está relacionada con climatech"
      /\best[aá] relacionada.*climatech/i,  // "está relacionada... climatech"
      /\bsi.*climatech/i,  // "si... climatech" en cualquier parte
      /\besta noticia.*si.*relacionada/i,  // "esta noticia... sí... relacionada"
    ];
    
    // Verificar patrones negativos que indican claramente "NO"
    const patronesNegativos = [
      /^no[\s.,:;!?]/i,  // Empieza con "no"
      /\bno\b\s+es\s+climatech\b/i,  // "no es climatech"
      /\bno\b.*\brelacionad[ao]s?.*climatech/i,  // "no... relacionada... climatech"
    ];
    
    // Si hay un patrón negativo claro, es NO
    const tieneNegativo = patronesNegativos.some(patron => patron.test(salidaNormalizada));
    if (tieneNegativo) {
      console.log(`[esClimatechIA] Patrón negativo detectado: NO es Climatech`);
      return { esClimatech: false, razon: salida };
    }
    
    // Si hay un patrón positivo, es SÍ
    const tienePositivo = patronesPositivos.some(patron => patron.test(salidaNormalizada));
    
    // Fallback: si no hay patrón claro pero la respuesta contiene indicadores positivos de climatech
    // (evitando falsos positivos con palabras como "no es climatech")
    const contienePalabra = (texto, palabra) => {
      if (!palabra) return false;
      const escaped = palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      return regex.test(texto);
    };
    const contienePalabraNo = contienePalabra(salidaNormalizada, 'no');
    const tieneIndicadoresPositivos = !tienePositivo && (
      (salidaNormalizada.includes("climatech") && !salidaNormalizada.includes("no es climatech")) ||
      (salidaNormalizada.includes("relacionada") && salidaNormalizada.includes("climatech") && !contienePalabraNo) ||
      (contienePalabra(salidaNormalizada, "si") && salidaNormalizada.includes("relacionada") && salidaNormalizada.length < 200)
    );
    
    const esClimatech = tienePositivo || tieneIndicadoresPositivos;
    
    if (tieneIndicadoresPositivos) {
      console.log(`[esClimatechIA] Indicadores positivos detectados (fallback): SÍ es Climatech`);
    }
    
    console.log(`[esClimatechIA] Decisión calculada: ${esClimatech ? 'SI' : 'NO'}`);
    return { esClimatech, razon: salida };
  } catch (err) {
    if (err?.cause?.code === 'SELF_SIGNED_CERT_IN_CHAIN' || err?.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
      try {
        console.log('[esClimatechIA] Reintentando con cliente inseguro debido a SELF_SIGNED_CERT_IN_CHAIN');
        const resp2 = await insecureClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Eres un experto en sostenibilidad, medio ambiente y tecnologías/climatech." },
            { role: "user", content: `Tu tarea es decidir si una noticia está relacionada con CLIMATECH.
      
      Definición ampliada (clasificar como CLIMATECH si cumple AL MENOS uno):
      1) Relación entre TECNOLOGÍA (cualquier tipo: digital, IA, telecomunicaciones, producción/almacenamiento de energía, sensores, satélites, materiales, etc.) y MEDIO AMBIENTE o CAMBIO CLIMÁTICO.
      2) Temas SOLO de MEDIO AMBIENTE/CLIMA/SOSTENIBILIDAD con impacto relevante (p.ej.: transición energética, conservación, biodiversidad, agua, emisiones, políticas/regulación climática, economía circular, incendios/mitigación/adaptación).
      3) Startups/empresas/emprendimientos del rubro climático/cleantech (incluye rondas de inversión, aceleradoras/incubadoras, lanzamientos) aunque no se mencione explícitamente una tecnología.
      
      Ejemplos que SON CLIMATECH:
      - "La IA aumenta el consumo de agua en data centers" (tecnología + ambiente)
      - "Nueva ronda Serie A para startup de captura de carbono" (startup climática)
      - "Conservación de humedales clave para la mitigación" (tema ambiental relevante)
      
      Instrucciones:
      1. Si cumple la definición ampliada, responde con "SI".
      2. Si no cumple, responde con "NO".
      3. Luego, independientemente de 'SI' o 'NO', da una breve explicación (1-3 frases) justificando.
      
      Noticia a evaluar:
      ${typeof contenido === 'string' ? contenido : String(contenido || '')}` }
          ]
        });
        const salida2 = resp2?.choices?.[0]?.message?.content?.trim?.() || "";
        console.log(`[esClimatechIA] Respuesta RAW del modelo (retry): ${salida2}`);
        // Detectar si es climatech de forma más robusta
        const salida2Lower = salida2.toLowerCase().trim();
        const salida2Normalizada = salida2Lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        
        // Verificar múltiples patrones que indican "SÍ es climatech"
        const patronesPositivos2 = [
          /^si[\s.,:;!?]/i,
          /^si\b/i,
          /\bes climatech\b/i,
          /\best[aá] relacionada con climatech/i,
          /\best[aá] relacionada.*climatech/i,
          /\bsi.*climatech/i,
          /\besta noticia.*si.*relacionada/i,
        ];
        
        // Verificar patrones negativos
        const patronesNegativos2 = [
          /^no[\s.,:;!?]/i,
          /\bno\b\s+es\s+climatech\b/i,
          /\bno\b.*\brelacionad[ao]s?.*climatech/i,
        ];
        
        // Si hay un patrón negativo claro, es NO
        const tieneNegativo2 = patronesNegativos2.some(patron => patron.test(salida2Normalizada));
        if (tieneNegativo2) {
          console.log(`[esClimatechIA] Patrón negativo detectado (retry): NO es Climatech`);
          return { esClimatech: false, razon: salida2 };
        }
        
        // Si hay un patrón positivo, es SÍ
        const tienePositivo2 = patronesPositivos2.some(patron => patron.test(salida2Normalizada));
        
        // Fallback: si no hay patrón claro pero la respuesta contiene indicadores positivos de climatech
        const contienePalabra2 = (texto, palabra) => {
          if (!palabra) return false;
          const escaped = palabra.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, 'i');
          return regex.test(texto);
        };
        const contienePalabraNo2 = contienePalabra2(salida2Normalizada, 'no');
        const tieneIndicadoresPositivos2 = !tienePositivo2 && (
          (salida2Normalizada.includes("climatech") && !salida2Normalizada.includes("no es climatech")) ||
          (salida2Normalizada.includes("relacionada") && salida2Normalizada.includes("climatech") && !contienePalabraNo2) ||
          (contienePalabra2(salida2Normalizada, "si") && salida2Normalizada.includes("relacionada") && salida2Normalizada.length < 200)
        );
        
        const esClimatech2 = tienePositivo2 || tieneIndicadoresPositivos2;
        
        if (tieneIndicadoresPositivos2) {
          console.log(`[esClimatechIA] Indicadores positivos detectados (retry, fallback): SÍ es Climatech`);
        }
        
        console.log(`[esClimatechIA] Decisión calculada (retry): ${esClimatech2 ? 'SI' : 'NO'}`);
        return { esClimatech: esClimatech2, razon: salida2 };
      } catch (err2) {
        console.error("Error en clasificación IA (retry inseguro):", err2);
      }
    }
    console.error("Error al clasificar climatec hIA:", err);
    return { esClimatech: false, razon: "⚠️ Error en clasificación IA" };
  }
}


// Función para detectar si un texto está principalmente en inglés
export function detectarIdioma(texto) {
  try {
    if (!texto || typeof texto !== 'string' || texto.trim().length === 0) {
      return 'es'; // Por defecto español
    }
    
    // Palabras comunes en inglés vs español
    const palabrasIngles = ['the', 'and', 'is', 'are', 'was', 'were', 'this', 'that', 'with', 'for', 'from', 'have', 'has', 'had', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'been', 'being', 'their', 'there', 'these', 'those', 'which', 'what', 'when', 'where', 'why', 'how', 'who', 'whom', 'whose'];
    const palabrasEspanol = ['el', 'la', 'los', 'las', 'de', 'del', 'en', 'un', 'una', 'unos', 'unas', 'es', 'son', 'era', 'eran', 'fue', 'fueron', 'ser', 'estar', 'tener', 'haber', 'hacer', 'poder', 'deber', 'querer', 'decir', 'ver', 'saber', 'conocer', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella', 'aquellos', 'aquellas', 'que', 'cual', 'cuales', 'quien', 'quienes', 'cuando', 'donde', 'como', 'porque', 'por que'];
    
    const textoLower = texto.toLowerCase();
    const palabras = textoLower.split(/\s+/).filter(p => p.length > 2);
    
    if (palabras.length === 0) return 'es';
    
    let contadorIngles = 0;
    let contadorEspanol = 0;
    
    palabras.forEach(palabra => {
      const palabraLimpia = palabra.replace(/[^a-záéíóúñü]/g, '');
      if (palabrasIngles.includes(palabraLimpia)) contadorIngles++;
      if (palabrasEspanol.includes(palabraLimpia)) contadorEspanol++;
    });
    
    // Si hay más palabras en inglés que en español, probablemente es inglés
    if (contadorIngles > contadorEspanol * 1.5) {
      return 'en';
    }
    
    // También verificar patrones comunes de inglés
    const patronesIngles = /\b(the|and|is|are|was|were|this|that|with|for|from|have|has|had|will|would|could|should)\b/gi;
    const patronesEspanol = /\b(el|la|los|las|de|del|en|un|una|es|son|era|eran|fue|fueron|con|por|para|que|cual)\b/gi;
    
    const matchesIngles = (texto.match(patronesIngles) || []).length;
    const matchesEspanol = (texto.match(patronesEspanol) || []).length;
    
    if (matchesIngles > matchesEspanol * 1.5) {
      return 'en';
    }
    
    return 'es';
  } catch (error) {
    console.error('Error detectando idioma:', error);
    return 'es'; // Por defecto español
  }
}

// Función para traducir texto de inglés a español usando OpenAI
export async function traducirInglesAEspanol(texto) {
  try {
    if (!texto || typeof texto !== 'string' || texto.trim().length === 0) {
      return texto;
    }
    
    console.log(`🌐 Traduciendo texto de inglés a español (${texto.length} caracteres)...`);
    
    // Si el texto es muy largo, dividirlo en chunks
    const maxChunkSize = 3000; // Caracteres por chunk
    if (texto.length <= maxChunkSize) {
      // Traducción directa
      const messages = [
        { role: "system", content: "Eres un traductor profesional especializado en traducción técnica y de noticias. Traduce el texto del inglés al español manteniendo el significado exacto, la terminología técnica y el contexto. No agregues información adicional, solo traduce fielmente." },
        { role: "user", content: `Traduce el siguiente texto del inglés al español. Mantén la terminología técnica y el contexto exacto:\n\n${texto}` }
      ];
      
      const resp = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.3
      });
      
      const traducido = resp?.choices?.[0]?.message?.content?.trim?.() || texto;
      console.log(`✅ Traducción completada (${traducido.length} caracteres)`);
      return traducido;
    } else {
      // Dividir en chunks y traducir cada uno
      console.log(`📦 Texto largo detectado, dividiendo en chunks...`);
      const chunks = [];
      for (let i = 0; i < texto.length; i += maxChunkSize) {
        chunks.push(texto.substring(i, i + maxChunkSize));
      }
      
      const traducciones = [];
      for (let i = 0; i < chunks.length; i++) {
        console.log(`🔄 Traduciendo chunk ${i + 1}/${chunks.length}...`);
        const messages = [
          { role: "system", content: "Eres un traductor profesional especializado en traducción técnica y de noticias. Traduce el texto del inglés al español manteniendo el significado exacto, la terminología técnica y el contexto. No agregues información adicional, solo traduce fielmente." },
          { role: "user", content: `Traduce el siguiente fragmento del inglés al español. Mantén la terminología técnica y el contexto exacto:\n\n${chunks[i]}` }
        ];
        
        const resp = await client.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.3
        });
        
        const traducido = resp?.choices?.[0]?.message?.content?.trim?.() || chunks[i];
        traducciones.push(traducido);
        // Pequeña pausa entre chunks para evitar rate limiting
        if (i < chunks.length - 1) {
          await sleep(200);
        }
      }
      
      const traducidoCompleto = traducciones.join(' ');
      console.log(`✅ Traducción completada (${traducidoCompleto.length} caracteres)`);
      return traducidoCompleto;
    }
  } catch (err) {
    console.error('Error traduciendo texto:', err);
    // En caso de error, devolver el texto original
    console.warn('⚠️ No se pudo traducir, usando texto original');
    return texto;
  }
}

async function explicarRelacionIA(noticia, newsletter) {
  try {
    console.log("Entre a: explicarRelacionIA");
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Eres un analista experto que encuentra similitudes específicas y detalladas entre textos. Tu explicación debe ser concreta, mencionando nombres de empresas, tecnologías, lugares, temas específicos compartidos, aspectos técnicos o de negocio que los conectan, y por qué la relación es relevante. Evita generalidades." },
        { role: "user", content: `Noticia:\n${noticia}\n\nNewsletter:\n${newsletter}\n\n
           Proporciona una explicación DETALLADA, ESPECÍFICA y DIVIDIDA EN PÁRRAFOS de 4 a 8 oraciones sobre por qué están relacionados. Incluye: 1) Breve explicacion de la noticia 2)Que en especifico nombra que se nombra también en el Newsletter 4)Nombres concretos de empresas, tecnologías, productos o lugares mencionados en ambos textos,  5) Aspectos técnicos o de negocio que los conectan, 6) Contexto o implicaciones específicas de la relación, 7) Por qué esta relación es relevante. Que sea detallado e incluya párrafos separados y coherentes.` }
      ]
    });
    return { explicacion: resp?.choices?.[0]?.message?.content?.trim?.() || "" };
  } catch (err) {
    if (err?.cause?.code === 'SELF_SIGNED_CERT_IN_CHAIN' || err?.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
      try {
        const resp2 = await insecureClient.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Eres un analista experto que encuentra similitudes específicas y detalladas entre textos. Tu explicación debe ser concreta, mencionando nombres de empresas, tecnologías, lugares, temas específicos compartidos, aspectos técnicos o de negocio que los conectan, y por qué la relación es relevante. Evita generalidades." },
            { role: "user", content: `Noticia:\n${noticia}\n\nNewsletter:\n${newsletter}\n\n
            Proporciona una explicación DETALLADA y ESPECÍFICA de 4 a 8 oraciones sobre por qué están relacionados. Incluye: 1) Nombres concretos de empresas, tecnologías, productos o lugares mencionados en ambos textos, 2) Temas específicos que comparten, 3) Aspectos técnicos o de negocio que los conectan, 4) Contexto o implicaciones específicas de la relación, 5) Por qué esta relación es relevante. Evita explicaciones genéricas.` }
          ]
        });
        return { explicacion: resp2?.choices?.[0]?.message?.content?.trim?.() || "" };
      } catch (err2) {
        console.error("Error en explicación IA (retry inseguro):", err2);
      }
    }
    console.error("Error en explicación IA:", err);
    return { explicacion: "⚠️ No se pudo generar explicación con IA." };
  }
}

function formatIaExplanationText(text) {
  if (typeof text !== 'string') return text || '';

  const normalizeSpaces = (segment) => segment.replace(/\s+/g, ' ').trim();
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  const byDoubleBreak = normalized
    .split(/\n{2,}/)
    .map(part => normalizeSpaces(part))
    .filter(Boolean);
  if (byDoubleBreak.length > 1) {
    return byDoubleBreak.join('\n\n');
  }

  const lines = normalized
    .split('\n')
    .map(line => normalizeSpaces(line))
    .filter(Boolean);
  if (lines.length > 1) {
    return lines.join('\n\n');
  }

  const sentences = normalized.match(/[^.!?]+[.!?]?/g) || [normalized];
  const paragraphs = [];
  let buffer = [];

  sentences.forEach((sentence) => {
    const cleanSentence = normalizeSpaces(sentence);
    if (!cleanSentence) return;
    buffer.push(cleanSentence);
    if (buffer.length >= 2 || cleanSentence.length > 180) {
      paragraphs.push(buffer.join(' '));
      buffer = [];
    }
  });

  if (buffer.length) {
    paragraphs.push(buffer.join(' '));
  }

  return paragraphs.join('\n\n');
}


// Función para obtener newsletters de la base de datos
export async function obtenerNewslettersBDD() {
  try {
    console.log(`Entre a: obtenerNewslettersBDD de main2.js`);
    
    // Verificar si el servidor está disponible
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos de timeout
    
      try {
        // Determinar la URL del backend
        const baseUrl = getBackendUrl();
        const apiUrl = `${baseUrl}/api/Newsletter?limit=10000&page=1`;
        
        console.log(`📡 Solicitando newsletters desde: ${apiUrl}`);
        
        // Solicitar todos los newsletters sin límite de paginación
        const response = await fetch(apiUrl, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status} ${response.statusText}`);
      }
      
      const newsletters = await response.json();
      
      // Verificar que newsletters sea un array
      if (!Array.isArray(newsletters)) {
        console.error(`❌ Error: La respuesta no es un array. Tipo recibido: ${typeof newsletters}`);
        console.error(`❌ Contenido de la respuesta:`, newsletters);
        return [];
      }
      
      console.log(`✅ Se obtuvieron ${newsletters.length} newsletters de la BDD`);
      
      // Validar que hay newsletters disponibles
      if (newsletters.length === 0) {
        console.error(`❌ No se encontraron newsletters en la base de datos. El proceso no puede continuar.`);
        throw new Error('No hay newsletters disponibles para el análisis');
      }
          
      return newsletters;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    console.error(`❌ Error obteniendo newsletters: ${error.message}`);
    console.log(`🔄 Intentando obtener newsletters directamente de la base de datos...`);
    
    // Fallback: obtener newsletters directamente de la base de datos
    try {
      const { Pool } = await import('pg');
      const pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT,
      });
      
      const client = await pool.connect();
      const result = await client.query('SELECT * FROM "Newsletter" ORDER BY "fecha_creacion" DESC');
      await client.release();
      await pool.end();
      
      console.log(`✅ Obtenidos ${result.rows.length} newsletters directamente de la base de datos`);
      
      // Validar que hay newsletters disponibles
      if (result.rows.length === 0) {
        console.error(`❌ No se encontraron newsletters en la base de datos. El proceso no puede continuar.`);
        throw new Error('No hay newsletters disponibles para el análisis');
      }
      
      return result.rows;
    } catch (dbError) {
      console.error('❌ Error también al acceder directamente a la base de datos:', dbError);
      console.log(`💡 Asegúrate de que el servidor backend esté ejecutándose`);
      console.log(`💡 Verifica que la base de datos tenga newsletters registrados`);
      return [];
    }
  }
}

// Función para filtrar newsletters por palabras clave antes del análisis de IA
function filtrarNewslettersPorPalabrasClave(resumenNoticia, newsletters, opciones = {}) {
  try {
    console.log(`🔍 [FILTRO POR NOTICIA] Filtrando newsletters por palabras clave antes del análisis de IA...`);
    
    if (!Array.isArray(newsletters) || newsletters.length === 0) {
      return [];
    }

    const resumen = typeof resumenNoticia === 'string' ? resumenNoticia : String(resumenNoticia || '');
    const resumenNormalizado = removeDiacritics(resumen.toLowerCase());
    const limite = Math.max(1, Math.min(Number(opciones?.limiteTop) || 15, 30));
    
    // Extraer tokens del resumen de la noticia
    const tokensNoticia = tokenize(resumen);
    const tokensNoticiaSet = new Set(tokensNoticia);
    
    // Si no hay suficientes tokens en la noticia, no tiene sentido filtrar
    if (tokensNoticia.length < 10) {
      console.log(`⚠️ [FILTRO] Noticia muy corta (${tokensNoticia.length} tokens), filtrando menos estricto`);
    }
    
    const candidatos = [];
    
    for (const newsletter of newsletters) {
      const textoNewsletter = `${newsletter.titulo || ''}\n\n${newsletter.Resumen || ''}`.trim();
      const tokensNewsletter = tokenize(textoNewsletter);
      const tokensNewsletterSet = new Set(tokensNewsletter);
      
      const coincidenciasTokens = [...tokensNoticiaSet].filter(token => 
        tokensNewsletterSet.has(token) && token.length > 3
      );
      
      // Calcular coincidencias de palabras clave específicas de climatech
      // Contar solo keywords completos que aparezcan en AMBOS textos
      let coincidenciasClave = 0;
      const keywordsEncontrados = [];
      for (const keyword of CLIMATECH_KEYWORDS) {
        const keywordNormalizado = removeDiacritics(keyword.toLowerCase());
        const keywordEnNoticia = resumenNormalizado.includes(keywordNormalizado);
        const keywordEnNewsletter = removeDiacritics(textoNewsletter.toLowerCase()).includes(keywordNormalizado);
        
        if (keywordEnNoticia && keywordEnNewsletter) {
          coincidenciasClave++;
          keywordsEncontrados.push(keyword);
        }
      }
      
      const condicionTokensKeywords = coincidenciasTokens.length >= 15 && coincidenciasClave >= 2;
      const condicionSoloTokens = coincidenciasTokens.length >= 20;
      const esCandidato = condicionTokensKeywords || condicionSoloTokens;

      if (esCandidato) {
        const ranking = coincidenciasClave * 100 + coincidenciasTokens;
        candidatos.push({
          ...newsletter,
          _scoreFiltro: {
            coincidenciasTokens: coincidenciasTokens.length,
            coincidenciasClave,
            score: ranking,
            keywordsEncontrados: keywordsEncontrados.slice(0, 5) // Limitar a 5 para logging
          }
        });

        console.log(`✅ Candidato: ${newsletter.titulo} (tokens: ${coincidenciasTokens.length}, claves: ${coincidenciasClave}, keywords: ${keywordsEncontrados.slice(0, 3).join(', ')})`);
      } else {
        // Solo loggear si está cerca de pasar (para debugging)
        if (coincidenciasTokens.length >= 6 || coincidenciasClave >= 1) {
          console.log(`❌ Newsletter descartado: ${newsletter.titulo} (tokens: ${coincidenciasTokens.length}, claves: ${coincidenciasClave})`);
        }
      }
    }
    
    // Ordenar por score descendente y limitar al top N
    const ordenados = candidatos.sort((a,b) => (b?._scoreFiltro?.score || 0) - (a?._scoreFiltro?.score || 0));
    const top = ordenados.slice(0, limite);

    console.log(`📊 [FILTRO POR NOTICIA] Seleccionados top ${top.length}/${newsletters.length} newsletters (límite=${limite}) para análisis IA (filtro simplificado)`);
    return top;
    
  } catch (error) {
    console.error(`❌ Error en filtro de palabras clave: ${error.message}`);
    // Si hay error en el filtro, devolver todos los newsletters para que la IA los procese
    return newsletters;
  }
}

// Función para comparar noticia con newsletters usando IA (Chat)
export async function compararConNewslettersLocal(resumenNoticia, newsletters, urlNoticia = '') {
  try {
    const resumen = typeof resumenNoticia === 'string' ? resumenNoticia : String(resumenNoticia || '');

    if (!Array.isArray(newsletters) || newsletters.length === 0) {
      console.log(`⚠️ No hay newsletters en la base de datos para comparar`);
      return { relacionados: [], motivoSinRelacion: 'No hay newsletters disponibles para comparar.' };
    }

    // APLICAR FILTRO DE PALABRAS CLAVE ANTES DEL ANÁLISIS DE IA (MÁS ESTRICTO)
    const newslettersFiltrados = filtrarNewslettersPorPalabrasClave(resumen, newsletters, { limiteTop: 8 });
    
    if (newslettersFiltrados.length === 0) {
      console.log(`⚠️ Ningún newsletter pasó el filtro de palabras clave`);
      return { relacionados: [], motivoSinRelacion: 'No hay newsletters con palabras clave relevantes para esta noticia.' };
    }

    console.log(`📊 [ANÁLISIS IA POR NOTICIA] Procesando ${newslettersFiltrados.length} newsletters filtrados (de ${newsletters.length} total) con IA para esta noticia...`);

    // Embeddings: recopilar ejemplos negativos para penalización previa
    let negExamples = [];
    try {
      const fbSvcTmp = new FeedbackService();
      negExamples = await fbSvcTmp.getNegativePairExamples({ limit: 100 });
    } catch {}
    const negVecs = [];
    try {
      if (Array.isArray(negExamples) && negExamples.length > 0) {
        const batch = [resumen, ...negExamples.slice(0, 20)];
        for (let idx = 0; idx < batch.length; idx++) {
          const vec = await getEmbeddingCached(batch[idx]);
          if (idx > 0 && vec) negVecs.push(vec);
        }
      }
    } catch (e) {
      console.log('⚠️ Embeddings no disponibles, se continúa sin penalización previa');
    }

    const cosSim = (a, b) => {
      if (!a || !b || a.length !== b.length) return 0;
      let dot = 0, na = 0, nb = 0;
      for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
      if (!na || !nb) return 0;
      return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
    };

    const relacionados = [];
    const noRelacionRazones = [];
    for (let i = 0; i < newslettersFiltrados.length; i++) {
      const nl = newslettersFiltrados[i];
      const textoDoc = `${nl.titulo || ''}\n\n${nl.Resumen || ''}`.trim();
      // Incluir pistas del feedback negativo para ayudar a no repetir errores de relación
      let feedbackHints = '';
      try {
        const { topReasons } = await (new FeedbackService()).getNegativeReasonsStats({ limit: 300 });
        const razonesTop = (topReasons || []).slice(0, 3).map(r => r.reason).join(', ');
        if (razonesTop) {
          feedbackHints = `\n\nContexto histórico: Evita falsos positivos similares a razones previas: ${razonesTop}.`;
        }
      } catch {}

      const prompt = `Debes decidir si el resumen de una noticia está relacionado con el resumen de un newsletter. 

IMPORTANTE: Rechaza relaciones GENÉRICAS o VAGAS. Solo marca como relacionado si hay una conexión ESPECÍFICA y CONCRETA.

CRITERIOS PARA RECHAZAR (marcar como NO relacionado):
- Si solo comparten temas muy generales como "ambos hablan de energía", "ambos mencionan sostenibilidad", "ambos tratan de cambio climático" sin detalles específicos
- Si el newsletter es muy genérico y cubre muchos temas sin profundizar en ninguno específico de la noticia
- Si no hay menciones concretas de empresas, tecnologías, productos, lugares, métricas o casos específicos compartidos
- Si la relación es solo temática superficial sin conexión técnica o de negocio específica

CRITERIOS PARA ACEPTAR (marcar como SI relacionado):
- Menciones específicas de la misma empresa, startup, tecnología o producto en ambos textos
- Mismos lugares geográficos, proyectos específicos, o casos de estudio concretos
- Mismas métricas, números, porcentajes o datos específicos mencionados
- Misma tecnología específica (ej: "captura de carbono post-combustión en acerías", no solo "captura de carbono")
- Mismo sector industrial específico con detalles técnicos compartidos
- Mismos eventos, anuncios, rondas de inversión o lanzamientos específicos

Responde SOLO con JSON válido con estas claves: 
- relacionado (\"SI\" o \"NO\")
- razon (explicación DETALLADA y ESPECÍFICA de 5 a 10 oraciones que DEBE incluir: 1) Nombres EXACTOS de empresas/startups/tecnologías/productos mencionados en AMBOS textos (si no hay nombres específicos compartidos, explica por qué aún así están relacionados), 2) Temas ESPECÍFICOS que comparten con detalles concretos (ej: "ambos tratan sobre captura de carbono post-combustión en plantas siderúrgicas de Europa", NO "ambos hablan de captura de carbono"), 3) Aspectos técnicos o de negocio ESPECÍFICOS que los conectan (tecnologías, procesos, modelos de negocio, métricas), 4) Contexto o implicaciones ESPECÍFICAS de la relación (por qué esta conexión particular es relevante), 5) Evidencia concreta de la relación (citas, datos, casos mencionados). Si no puedes proporcionar estos detalles específicos, la relación probablemente es genérica y debes marcar como NO relacionado), 
- score (0-100, donde 0-40 = relación genérica/vaga, 41-70 = relación moderada con algunos detalles, 71-100 = relación muy específica con muchos detalles concretos)
${feedbackHints}

Resumen de noticia:
${resumen}

Newsletter:
${textoDoc}`;

      try {
        console.log(`\n🧪 [EVALUACIÓN IA] Evaluando newsletter ${i + 1}/${newslettersFiltrados.length} para esta noticia: ${nl.titulo || 'Sin título'}`);
        // Penalización previa por similitud con negativos
        let prePenalty = 0;
        if (negVecs.length) {
          try {
            const nlVec = await getEmbeddingCached(textoDoc);
            if (nlVec) {
              let maxSim = 0;
              for (const nv of negVecs) { if (!nv) continue; maxSim = Math.max(maxSim, cosSim(nlVec, nv)); }
              if (maxSim > 0.83) prePenalty = 12; else if (maxSim > 0.78) prePenalty = 8; else if (maxSim > 0.73) prePenalty = 4;
            }
          } catch {}
        }
        const content = await chatCompletionJSON([
          { role: "system", content: "Responde solo con JSON válido. RECHAZA relaciones genéricas o vagas. La explicación en 'razon' debe ser MUY DETALLADA y ESPECÍFICA, mencionando nombres EXACTOS de empresas/startups/tecnologías/productos compartidos, lugares específicos, métricas concretas, aspectos técnicos o de negocio específicos, y evidencia concreta. Si no puedes proporcionar estos detalles específicos, marca como NO relacionado. El score debe reflejar la especificidad: 0-40 = genérico (rechazar), 41-70 = moderado, 71-100 = muy específico. Ejemplo de relación ESPECÍFICA aceptable: {\\\"relacionado\\\":\\\"SI\\\",\\\"razon\\\":\\\"Ambos textos tratan sobre la implementación de sistemas de captura de carbono post-combustión en plantas siderúrgicas europeas. La noticia menciona específicamente a la empresa ArcelorMittal y su proyecto piloto en Gijón, España, con una inversión de 50 millones de euros. El newsletter analiza las mismas tecnologías de captura post-combustión (CCS) aplicadas específicamente a la industria del acero, mencionando el mismo rango de reducción de emisiones (30-40% de CO2) y los mismos desafíos técnicos de costos (200-300 euros por tonelada) y escalabilidad. Ambos mencionan el mismo contexto regulatorio europeo (ETS) y las mismas empresas proveedoras de tecnología (Carbon Clean, Climeworks). La relación es relevante porque conecta un caso específico de implementación concreta con un análisis técnico detallado del mismo sector y tecnología.\\\",\\\"score\\\":92}. Ejemplo de relación GENÉRICA a rechazar: {\\\"relacionado\\\":\\\"NO\\\",\\\"razon\\\":\\\"Aunque ambos textos mencionan temas de sostenibilidad y cambio climático, no hay detalles específicos compartidos. El newsletter es muy general y cubre múltiples verticales sin profundizar en los aspectos específicos mencionados en la noticia. No hay menciones de las mismas empresas, tecnologías, lugares o métricas concretas.\\\",\\\"score\\\":25}" },
          { role: "user", content: prompt }
        ]);
        console.log(`🔎 Respuesta RAW del modelo: ${content}`);
        let parsed = null;
        try { parsed = JSON.parse(content); } catch { parsed = null; }
        let score = Math.max(0, Math.min(100, Number(parsed?.score ?? 0)));
        if (prePenalty > 0) score = Math.max(0, score - prePenalty);
        const razon = typeof parsed?.razon === 'string' ? parsed.razon : '';
        const relacionado = String(parsed?.relacionado || '').toUpperCase() === 'SI';
        
        // Validación post-procesamiento: detectar y rechazar relaciones genéricas
        const esRelacionGenerica = (razonText, scoreValue) => {
          if (!razonText || razonText.length < 50) return true; // Muy corta = probablemente genérica
          
          const razonLower = razonText.toLowerCase();
          
          // Patrones que indican relación genérica
          const patronesGenericos = [
            /ambos hablan de/i,
            /ambos mencionan/i,
            /ambos tratan de/i,
            /ambos se relacionan con/i,
            /temas similares/i,
            /temas relacionados/i,
            /temática similar/i,
            /temática relacionada/i,
            /sin detalles específicos/i,
            /no hay menciones específicas/i,
            /relación general/i,
            /conexión general/i,
            /muy general/i,
            /demasiado general/i,
            /cubre muchos temas/i,
            /múltiples verticales/i
          ];
          
          // Contar cuántos patrones genéricos aparecen
          const matchesGenericos = patronesGenericos.filter(p => p.test(razonText)).length;
          
          // Detectar si menciona nombres específicos (empresas, tecnologías, lugares)
          const tieneNombresEspecificos = /(?:empresa|startup|tecnología|producto|proyecto|planta|instalación|país|ciudad|región|empresas como|tecnologías como|proyectos como|startups como)/i.test(razonText);
          
          // Detectar si menciona métricas o números específicos
          const tieneMetricas = /(?:\d+%|\d+\s*(?:millones?|miles?|euros?|dólares?|toneladas?|MW|GW|kWh|CO2|emisiones)|rango|reducción de|inversión de)/i.test(razonText);
          
          // Detectar si menciona tecnologías específicas (no solo términos generales)
          const tieneTecnologiasEspecificas = /(?:CCS|captura post-combustión|captura pre-combustión|electrólisis|hidrólisis|baterías de|paneles|turbinas|reactores|filtros|membranas|algoritmos|modelos|sistemas de)/i.test(razonText);
          
          // Si tiene muchos patrones genéricos Y no tiene detalles específicos, es genérica
          if (matchesGenericos >= 2 && !tieneNombresEspecificos && !tieneMetricas) {
            return true;
          }
          
          // Si el score es bajo (genérico según el prompt), rechazar
          if (scoreValue < 41) {
            return true;
          }
          
          // Si no tiene al menos 2 de: nombres específicos, métricas, tecnologías específicas
          const detallesEspecificos = [tieneNombresEspecificos, tieneMetricas, tieneTecnologiasEspecificas].filter(Boolean).length;
          if (detallesEspecificos < 2 && scoreValue < 60) {
            return true;
          }
          
          return false;
        };
        
        if (relacionado) {
          // Validar si es genérica antes de agregar
          const esGenerica = esRelacionGenerica(razon, score);
          
          if (esGenerica) {
            console.log(`⚠️ Relación genérica detectada y rechazada (score=${Math.round(score)}): ${razon.substring(0, 100)}...`);
            noRelacionRazones.push(`Relación genérica rechazada: ${razon.substring(0, 150)}`);
          } else {
            let explicacionRelacion = razon;
            try {
              const explicacionIA = await explicarRelacionIA(resumen, textoDoc);
              if (explicacionIA?.explicacion) {
                explicacionRelacion = explicacionIA.explicacion;
              }
            } catch (expErr) {
              console.error('⚠️ Error generando explicación detallada con explicarRelacionIA:', expErr?.message || expErr);
            }
            explicacionRelacion = formatIaExplanationText(explicacionRelacion);
            relacionados.push({
              ...nl,
              puntuacion: isNaN(score) ? undefined : Math.round(score),
              analisisRelacion: explicacionRelacion,
              Relacionado: true,
              detalleRelacionInicial: razon
            });
            console.log(`✅ Relacionado (score=${isNaN(score) ? 'N/D' : Math.round(score)}): ${explicacionRelacion.substring(0, 150)}...`);
          }
        } else {
          noRelacionRazones.push(razon || 'No comparten tema/entidades clave.');
          console.log(`❌ No relacionado: ${razon || 'Sin motivo'}`);
        }
      } catch (err) {
        noRelacionRazones.push('No se pudo evaluar relación con IA.');
        console.log(`⚠️ Error evaluando relación con IA: ${err?.message || err}`);
      }
    }

    // Filtrar relaciones con score muy bajo (probablemente genéricas que pasaron el filtro)
    const relacionadosFiltrados = relacionados.filter(r => {
      const score = typeof r.puntuacion === 'number' ? r.puntuacion : 0;
      // Solo mantener relaciones con score >= 50 (moderado o mejor)
      if (score < 50) {
        console.log(`⚠️ Relación con score bajo rechazada (score=${score}): ${r.titulo}`);
        return false;
      }
      return true;
    });
    
    const topRelacionados = relacionadosFiltrados
      .sort((a, b) => (typeof b.puntuacion === 'number' ? b.puntuacion : -1) - (typeof a.puntuacion === 'number' ? a.puntuacion : -1))
      .slice(0, 3);

    const resumenNormalizado = resumen?.trim() || '';
    const resumenParaMotivo = resumenNormalizado;
    const motivoBase = noRelacionRazones[0] || 'No hay coincidencias temáticas claras entre la noticia y los newsletters.';
    const motivoSinRelacion = topRelacionados.length === 0
      ? [motivoBase, resumenParaMotivo ? `📝 Resumen IA: ${resumenParaMotivo}` : null].filter(Boolean).join('\n')
      : '';

    console.log(`\n📊 [RESULTADO FINAL POR NOTICIA] Newsletter relacionados encontrados: ${topRelacionados.length}`);
    topRelacionados.forEach((nl, idx) => {
      console.log(`   ${idx + 1}. ${nl.titulo} (puntuación: ${nl.puntuacion ?? 'N/D'}) | Motivo: ${nl.analisisRelacion || ''}`);
    });
    if (topRelacionados.length === 0 && motivoSinRelacion) {
      console.log(`ℹ️ [RESULTADO POR NOTICIA] Motivo sin relación: ${motivoSinRelacion}`);
    }

    return { relacionados: topRelacionados, motivoSinRelacion };
  } catch (error) {
    console.error(`❌ Error comparando newsletters (chat): ${error.message}`);
    return { relacionados: [], motivoSinRelacion: 'Error al comparar con IA.' };
  }
}

// Función para determinar tema principal usando análisis de texto
function determinarTemaPrincipalLocal(contenido) {
  try {
    console.log(`📋 Determinando tema principal (análisis local)... MODIFICAR: CREO QUE NO HACE FALTA LA FUNCION (determinarTemaPrincipalLocal)`);
    
    const contenidoLower = contenido.toLowerCase();
    const temas = {
      'tecnología': ['tecnología', 'tech', 'innovación', 'startup', 'app', 'software', 'digital'],
      'deportes': ['fútbol', 'futbol', 'deportes', 'liga', 'equipo', 'jugador', 'partido', 'gol'],
      'política': ['gobierno', 'política', 'elecciones', 'presidente', 'ministro', 'congreso', 'ley'],
      'economía': ['economía', 'mercado', 'inversión', 'bolsa', 'empresa', 'finanzas', 'dólar'],
      'entretenimiento': ['película', 'pelicula', 'música', 'musica', 'actor', 'actriz', 'cine', 'teatro'],
      'salud': ['salud', 'médico', 'medico', 'hospital', 'enfermedad', 'tratamiento', 'vacuna'],
      'educación': ['educación', 'educacion', 'universidad', 'escuela', 'estudiante', 'profesor', 'académico']
    };
    
    let mejorTema = 'general';
    let mejorPuntuacion = 0;
    
    Object.entries(temas).forEach(([tema, palabras]) => {
      let puntuacion = 0;
      palabras.forEach(palabra => {
        if (contenidoLower.includes(palabra)) {
          puntuacion += 1;
        }
      });
      
      if (puntuacion > mejorPuntuacion) {
        mejorPuntuacion = puntuacion;
        mejorTema = tema;
      }
    });
    
    console.log(`✅ Tema principal detectado: ${mejorTema}`);
    return mejorTema;
  } catch (error) {
    console.error(`❌ Error determinando tema: ${error.message}`);
    return 'general';
  }
}

// Función principal para analizar noticias (devuelve mensaje para CLI)
async function analizarNoticia(input) {
  console.log(`🚀 Entre a : (analizarNoticia)`);
  
  try {
    let contenido, titulo;
    const cleaned = (typeof input === 'string') ? input.trim().replace(/^[@\s]+/, '') : input;
    
    // PASO 1: Extraer contenido desde URL o usar texto directo
    if (typeof cleaned === 'string' && cleaned.startsWith('http')) {
      console.log("PASO 1: Entrar a extraerContenidoNoticia")
      const resultadoExtraccion = await extraerContenidoNoticia(cleaned);
        contenido = resultadoExtraccion.contenido;
        titulo = resultadoExtraccion.titulo;
    } else {
      contenido = cleaned;
      titulo = 'Texto proporcionado';
      }

      // PASO 1.5: Detectar idioma y traducir si es necesario
      console.log("PASO 1.5: Detectar idioma y traducir si es necesario")
      const idioma = detectarIdioma(contenido);
      console.log(`✅ Idioma detectado: ${idioma === 'en' ? 'Inglés' : 'Español'}`);
      
      if (idioma === 'en') {
        console.log(`🔄 Traduciendo contenido al español...`);
        contenido = await traducirInglesAEspanol(contenido);
        
        // También traducir el título si es necesario
        if (titulo && detectarIdioma(titulo) === 'en') {
          console.log(`🔄 Traduciendo título al español...`);
          titulo = await traducirInglesAEspanol(titulo);
        }
        
        console.log(`✅ Contenido traducido: ${contenido.length} caracteres`);
      }

      // PASO 2: Generar resumen
      console.log("PASO 2: Entrar a generarResumenIA")
    const resumen = await generarResumenIA(contenido);

      // PASO 3: Determinar si es Climatech
      console.log("PASO 3: Entrar a esClimatechIA")
    const esClimatech = await esClimatechIA(contenido);

      if (!esClimatech.esClimatech) {
        // PASO 3.1: Si no es Climatech, informar tema principal
        console.log("PASO 3.1: Entrar a determinarTemaPrincipalLocal por si no es climatech")
      const temaPrincipal = determinarTemaPrincipalLocal(contenido);

      return `❌ Esta noticia NO está relacionada con Climatech.

📰 Título: ${titulo}
📋 Tema principal: ${temaPrincipal}
📝 Razón: ${esClimatech.razon}

💡 Tip: Las noticias sobre Climatech incluyen energías renovables, eficiencia energética, captura de carbono, movilidad sostenible, agricultura sostenible, tecnologías ambientales, políticas climáticas, etc.`;
      }

      // PASO 4: Obtener newsletters de la BDD
      console.log(`\n PASO 4: entrar a obtenerNewslettersBDD`);
      const newsletters = await obtenerNewslettersBDD();

      // PASO 5: Comparar noticia con newsletters
      console.log(`\n🔍 PASO 5: Entrar a: compararConNewslettersLocal (el resumen  se esta mandando de una linea de abajo pero no de la funcion que genera el resumen)`);
      console.log(`📊 Total de newsletters obtenidos: ${newsletters.length}`);
      console.log(`🔗 URL a comparar: ${input}`);
      console.log(`📝 Resumen a comparar: ${typeof resumen === 'string' ? resumen.substring(0, 150) + (resumen.length > 150 ? '...' : '') : 'Resumen no disponible'}`);
      
      const { relacionados: newslettersRelacionados, motivoSinRelacion } = await compararConNewslettersLocal(typeof resumen === 'string' ? resumen : 'Resumen no disponible', newsletters, input);

      // PASO 6: Preparar respuesta final
      console.log(`\n📋 PASO 6: Preparando respuesta final...`);
      console.log(`🎯 Newsletters relacionados encontrados: ${newslettersRelacionados.length}`);
      if (newslettersRelacionados.length === 0 && motivoSinRelacion) {
        console.log(`ℹ️ Motivo: ${motivoSinRelacion}`);
      }
      
      let mensaje = `✅ Esta noticia SÍ está relacionada con Climatech.

📰 Título: ${titulo}
Resumen: ${resumen}

`;

      if (newslettersRelacionados.length > 0) {
      mensaje += `📧 Newsletters relacionados encontrados:
`;
        newslettersRelacionados.forEach((nl, index) => {
        mensaje += `${index + 1}. ${nl.titulo} (puntuación: ${nl.puntuacion ?? 'N/D'})\n   📌 Motivo: ${nl.analisisRelacion || ''}
`;
        });
      } else {
        mensaje += `⚠️ No se encontraron newsletters con temática similar en la base de datos.\n   📌 Motivo: ${motivoSinRelacion || 'No hay coincidencias temáticas claras.'}`;
      }

    return mensaje;

    } catch (error) {
      console.error(`❌ Error en análisis completo: ${error.message}`);
    return `❌ Error durante el análisis: ${error.message}`;
  }
}

// Función para analizar noticia y devolver estructura para API
export async function analizarNoticiaEstructurada(url) {
  console.log(`\n🔍 INICIANDO ANÁLISIS INDIVIDUAL DE NOTICIA: ${url}`);
  
  const extraido = await extraerContenidoNoticia(url);
  if (!extraido) return null;

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

  // IA
  console.log(`\n🤖 GENERANDO RESUMEN CON IA...`);
  const resumen = await generarResumenIA(textoNoticia);
  console.log(`✅ Resumen generado: ${typeof resumen === 'string' ? resumen.substring(0, 100) + '...' : 'No disponible'}`);

  console.log(`\n🌱 CLASIFICANDO SI ES CLIMATECH CON IA...`);
  const clasificacion = await esClimatechIA(textoNoticia);
  console.log(`✅ Clasificación: ${clasificacion.esClimatech ? 'SÍ es Climatech' : 'NO es Climatech'}`);
  if (!clasificacion.esClimatech) {
    console.log(`📋 Motivo: ${clasificacion.razon || 'Sin motivo'}`);
    return {
      url,
      titulo: extraido.titulo || '',
      autor: extraido.autor || '',
      resumen,
      esClimatech: false,
      razonClimatech: clasificacion.razon || '',
      newslettersRelacionados: [],
      motivoSinRelacion: 'No es Climatech'
    };
  }

  // BD
  console.log(`\n📊 OBTENIENDO NEWSLETTERS DE LA BASE DE DATOS...`);
  const newsletters = await obtenerNewslettersBDD();

  // Comparación local: obtener top relacionados desde el comparador
  console.log(`\n🔍 INICIANDO FILTRADO DE PALABRAS CLAVE + ANÁLISIS IA PARA ESTA NOTICIA...`);
  const { relacionados, motivoSinRelacion } = Array.isArray(newsletters)
    ? await compararConNewslettersLocal(typeof resumen === 'string' ? resumen : textoNoticia, newsletters, url)
    : { relacionados: [], motivoSinRelacion: 'No hay newsletters para comparar.' };

  console.log(`\n✅ ANÁLISIS COMPLETADO PARA ESTA NOTICIA`);
  console.log(`📊 Newsletters relacionados encontrados: ${relacionados.length}`);

  // Adaptar salida a lo que esperan los consumidores aguas abajo
  return {
    url,
    titulo: tituloNoticia || extraido.titulo || '',
    autor: extraido.autor || '',
    resumen,
    esClimatech: !!clasificacion?.esClimatech,
    razonClimatech: clasificacion?.razon || '',
    newslettersRelacionados: Array.isArray(relacionados) ? relacionados.map(nl => ({
      id: nl.id ?? null,
      titulo: nl.titulo || '',
      link: nl.link || nl._linkDoc || '',
      puntuacion: nl.puntuacion ?? null,
      analisisRelacion: nl.analisisRelacion || '',
    })) : [],
    motivoSinRelacion
  };
}

// Función para verificar si una URL ya existe en la base de datos
async function verificarDuplicadoPorURL(url) {
  try {
    const { Pool } = await import('pg');
    const pool = new Pool({
      user: process.env.DB_USER,
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
    });
    
    const client = await pool.connect();
    
    try {
      // Normalizar URL para comparación
      const normalizeLink = (url) => {
        try {
          const u = new URL(String(url || '').trim());
          // Remover parámetros de tracking comunes
          const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
          paramsToRemove.forEach(param => u.searchParams.delete(param));
          return u.toString();
        } catch {
          return String(url || '').trim();
        }
      };
      
      const normalizedUrl = normalizeLink(url);
      
      // Buscar URLs similares en los últimos 30 días
      const sql = `
        SELECT "id", "Link_del_Trend"
        FROM "Trends"
        WHERE "Fecha_Relación" > NOW() - INTERVAL '30 days'
        AND (
          lower("Link_del_Trend") = lower($1) OR
          lower("Link_del_Trend") = lower($2)
        )
        LIMIT 1
      `;
      
      const result = await client.query(sql, [url, normalizedUrl]);
      
      if (result.rows.length > 0) {
        console.log(`🔍 Duplicado encontrado para URL: ${url} (ID: ${result.rows[0].id})`);
        return true;
      }
      
      console.log(`✅ URL no duplicada: ${url}`);
      return false;
      
    } finally {
      client.release();
      await pool.end();
    }
  } catch (error) {
    console.error('Error verificando duplicado por URL:', error);
    // En caso de error, asumir que no es duplicado para no bloquear el flujo
    return false;
  }
}

// Procesar un conjunto de URLs: analizar y persistir en Trends si corresponde
export async function procesarUrlsYPersistir(items = []) {
  console.log(`🚀 INICIANDO PROCESAMIENTO DE URLS:`);
  console.log(`📊 Total de items recibidos: ${items.length}`);
  console.log(`📋 Items:`, items);
  
  if (!Array.isArray(items) || items.length === 0) {
    console.log(`❌ No hay items para procesar`);
    return [];
  }

  console.log(`\n🚀 INICIANDO PROCESAMIENTO DE ${items.length} NOTICIAS INDIVIDUALMENTE`);
  console.log(`📋 Cada noticia será analizada por separado con filtrado de palabras clave + IA\n`);

  const trendsSvc = new TrendsService();
  const feedbackSvc = new FeedbackService();
  const resultados = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(`\n🔄 PROCESANDO ITEM ${i + 1}/${items.length}:`, item);
    
    const url = (typeof item === 'string') ? item : (item?.url || '');
    const tituloTrend = (typeof item === 'object') ? (item?.title || item?.titulo || 'Sin título') : 'Sin título';
    
    console.log(`🔗 URL extraída: ${url}`);
    console.log(`📝 Título extraído: ${tituloTrend}`);
    
    if (!url) {
      console.log(`❌ No se pudo extraer URL del item, saltando...`);
      continue;
    }

    console.log(`\n📰 PROCESANDO NOTICIA ${i + 1}/${items.length}: ${tituloTrend}`);
    console.log(`🔗 URL: ${url}`);

    try {
      // PRIMERO: Verificar si la URL ya existe en la base de datos (duplicado)
      console.log(`🔍 Verificando si la URL ya existe en la base de datos...`);
      const isDuplicate = await verificarDuplicadoPorURL(url);
      
      if (isDuplicate) {
        console.log(`⛔ URL duplicada detectada: ${url}. Saltando análisis de IA.`);
        resultados.push({
          url,
          resultado: null,
          insertado: false,
          trendsCreados: 0,
          duplicado: true
        });
        continue;
      }
      
      console.log(`✅ URL no duplicada. Procediendo con análisis de IA...`);
      
      // SEGUNDO: Analizar noticia con IA
      console.log(`🔍 Analizando noticia: ${url}`);
      const resultado = await analizarNoticiaEstructurada(url);
      
      console.log(`✅ Análisis completado para: ${url}`);
      console.log(`📊 Resultado del análisis:`, {
        esClimatech: resultado?.esClimatech,
        titulo: resultado?.titulo,
        resumen: resultado?.resumen ? `${resultado.resumen.substring(0, 100)}...` : 'Sin resumen',
        newslettersRelacionados: resultado?.newslettersRelacionados?.length || 0
      });
      
      // Inicializar el resultado con información básica
      const resultadoItem = { 
        url, 
        resultado, 
        insertado: false, 
        trendsCreados: 0 
      };
      
      if (!resultado?.esClimatech) {
        console.log(`❌ Noticia NO es Climatech, saltando...`);
        resultados.push(resultadoItem);
        continue;
      }

      console.log(`✅ Noticia SÍ es Climatech, procesando...`);
      const relacionados = Array.isArray(resultado.newslettersRelacionados)
        ? resultado.newslettersRelacionados
        : [];
      
      console.log(`📧 Newsletters relacionados encontrados: ${relacionados.length}`);
      
      // Crear trends para TODAS las noticias climatech, tengan o no newsletters relacionados
      let trendsInsertados = 0;
      
      if (relacionados.length > 0) {
        // Si hay newsletters relacionados, crear trends con esas relaciones
        for (const nl of relacionados) {
        try {
            // Saltar relación specifica si hay feedback negativo previo para el par link|newsletter
            try {
              const skipPair = await feedbackSvc.hasNegativeForLinkOrPair({ trendLink: url, newsletterId: nl.id ?? null });
              if (skipPair) {
                console.log(`⛔ Feedback negativo previo para par link|newsletter → saltando relación con NL ${nl.id}`);
                continue;
              }
            } catch {}
          const payload = {
              id_newsletter: nl.id ?? null,
              Título_del_Trend: resultado.titulo || tituloTrend,
              Link_del_Trend: url,
              Nombre_Newsletter_Relacionado: nl.titulo || '',
              Fecha_Relación: nl.fechaRelacion || new Date().toISOString(),
              Relacionado: true,
              Analisis_relacion: nl.analisisRelacion || ''
            };
            const createdTrend = await trendsSvc.createAsync(payload);
            
            // Verificar si es un duplicado
            if (createdTrend?.duplicated) {
              console.log(`⛔ Trend duplicado detectado para ${url} con newsletter ${nl.id}. Saltando esta relación específica.`);
              continue; // Saltar solo esta relación, continuar con las demás
            }
            
            if (createdTrend && createdTrend.id) {
              trendsInsertados++;
              
              // Notificar nuevo trend agregado a través del EventBus
              const trendData = {
                id: createdTrend.id,
                newsletterTitulo: nl.titulo || '',
                newsletterId: nl.id ?? '',
                fechaRelacion: nl.fechaRelacion || new Date().toISOString(),
                trendTitulo: resultado.titulo || tituloTrend,
                trendLink: url,
                relacionado: true,
                newsletterLink: nl.link || '',
                analisisRelacion: nl.analisisRelacion || '',
                resumenFama: resultado.resumenBreve || resultado.resumenFama || '',
                autor: resultado.autor || '',
              };
              
              try {
                eventBus.notifyNewTrend(trendData);
                console.log(`📡 Nuevo trend notificado: ${trendData.trendTitulo}`);
              } catch (eventError) {
                console.error('Error notificando nuevo trend:', eventError);
              }
            }
          } catch (e) {
            console.error(`Error creando trend para ${url}:`, e?.message || e);
            // continuar con el siguiente sin romper el flujo
          }
        }
      } else {
        // Si NO hay newsletters relacionados, crear trend SIN relación
        try {
          const payload = {
            id_newsletter: null, // Sin newsletter relacionado
            Título_del_Trend: resultado.titulo || tituloTrend,
            Link_del_Trend: url,
            Nombre_Newsletter_Relacionado: '', // Vacío
            Fecha_Relación: new Date().toISOString(),
            Relacionado: false, // No relacionado
            Analisis_relacion: (resultado.motivoSinRelacion || '').trim() || 'Noticia climatech sin newsletters relacionados'
          };
          const createdTrend = await trendsSvc.createAsync(payload);
          
          // Verificar si es un duplicado
          if (createdTrend?.duplicated) {
            console.log(`⛔ Trend duplicado detectado para ${url} sin newsletter. Saltando esta noticia específica.`);
            continue; // Saltar solo esta noticia, continuar con las demás
          }
          
          if (createdTrend && createdTrend.id) {
            trendsInsertados++;
            
            // Notificar nuevo trend agregado a través del EventBus
            const trendData = {
              id: createdTrend.id,
              newsletterTitulo: '', // Sin newsletter
              newsletterId: '', // Sin newsletter
              fechaRelacion: new Date().toISOString(),
              trendTitulo: resultado.titulo || tituloTrend,
              trendLink: url,
              relacionado: false, // No relacionado
              newsletterLink: '',
              analisisRelacion: 'Noticia climatech sin newsletters relacionados',
              resumenFama: resultado.resumenBreve || resultado.resumenFama || '',
              autor: resultado.autor || '',
            };
            
            try {
              eventBus.notifyNewTrend(trendData);
              console.log(`📡 Nuevo trend sin newsletter notificado: ${trendData.trendTitulo}`);
            } catch (eventError) {
              console.error('Error notificando nuevo trend:', eventError);
            }
          }
        } catch (e) {
          console.error(`Error creando trend sin newsletter para ${url}:`, e?.message || e);
        }
      }


      
      // Marcar si se insertaron trends y cuántos
      if (trendsInsertados > 0) {
        resultadoItem.insertado = true;
        resultadoItem.trendsCreados = trendsInsertados;
        console.log(`✅ Se crearon ${trendsInsertados} trends para: ${tituloTrend}`);
      }
      
      resultados.push(resultadoItem);
      
      console.log(`✅ Item ${i + 1} procesado completamente. Trends creados: ${trendsInsertados}`);
      
    } catch (e) {
      console.error(`❌ Error procesando ${url}:`, e?.message || e);
      console.error(`🔍 Stack trace completo:`, e?.stack || 'No disponible');
      // continuar con el siguiente sin romper el flujo
      resultados.push({
        url,
        resultado: null,
        insertado: false,
        trendsCreados: 0,
        error: e?.message || String(e)
      });
    }
  }

  console.log(`\n🎯 PROCESAMIENTO COMPLETADO:`);
  console.log(`📊 Total de items procesados: ${items.length}`);
  console.log(`✅ Items exitosos: ${resultados.filter(r => r.insertado).length}`);
  console.log(`❌ Items fallidos: ${resultados.filter(r => !r.insertado).length}`);
  console.log(`📈 Total de trends creados: ${resultados.reduce((sum, r) => sum + r.trendsCreados, 0)}`);

  return resultados;
}

// Fast-path: solo extraer y resumir una URL (sin clasificar ni comparar)
export async function resumirDesdeUrl(url) {
  try {
    const extraido = await extraerContenidoNoticia(url);
    const texto = extraido?.contenido || '';
    const resumen = await generarResumenIA(texto);
    return {
      titulo: extraido?.titulo || '',
      resumen: resumen || ''
    };
  } catch (e) {
    return { titulo: '', resumen: '' };
  }
}

// Función para manejar el chat interactivo
async function empezarChat() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

const mensajeBienvenida = `
🌱 CLIMATECH NEWS ANALYZER (SIN LLM)
=====================================

Soy un asistente especializado en analizar noticias sobre Climatech.
Esta versión funciona completamente sin LLM, usando análisis de texto local.

📋 Mi proceso:
1. Extraigo el contenido de la noticia desde el link
2. Genero un resumen usando análisis de texto local
3. Determino si es Climatech usando palabras clave
4. Si es Climatech, busco newsletters relacionados en la base de datos
5. Te muestro los resultados

🔗 Para empezar, pega el link de una noticia.
💡 También puedes escribir 'exit' para salir.

¿Qué noticia quieres analizar?
`;

  console.log(mensajeBienvenida);

  const pregunta = () => {
    rl.question('> ', async (input) => {
      if (input.toLowerCase() === 'exit') {
        console.log('👋 ¡Hasta luego!');
        rl.close();
        return;
      }

      if (input.trim() === '') {
        console.log('💡 Por favor, ingresa un link de noticia o texto para analizar.');
        pregunta();
        return;
      }

      try {
        const resultado = await analizarNoticia(input);
        console.log('\n' + resultado + '\n');
      } catch (error) {
        console.log(`❌ Error procesando la solicitud: ${error.message}`);
        console.log('💡 Intenta con otro link o escribe "exit" para salir.\n');
      }

      pregunta();
    });
  };

  pregunta();
}

// Iniciar el chat
const isDirectRun = (() => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    return process.argv[1] && (process.argv[1] === thisFile || process.argv[1].endsWith('main.js'));
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  empezarChat();
}

