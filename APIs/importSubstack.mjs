import https from 'https';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import NewsletterService from '../Services/Newsletter-services.js';
import { resumirDesdeUrl } from '../Agent/main.js';

const FEED_URL = 'https://pulsobyantom.substack.com/feed';
const FEED_URL_ALT = 'https://pulsobyantom.substack.com/feed.xml'; // URL alternativa
const MAIN_URL = 'https://pulsobyantom.substack.com/'; // URL principal como fallback
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Función de fallback para extraer artículos de la página principal
async function extractFromMainPage() {
  console.log('🔄 Intentando extraer artículos de la página principal...');
  try {
    const res = await fetchWithRetry(MAIN_URL);
    const html = await res.text();
    const $ = cheerio.load(html);
    
    const entries = [];
    // Buscar enlaces de artículos en la página principal
    $('a[href*="/p/"]').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim();
      if (href && title && href.includes('/p/')) {
        const fullUrl = href.startsWith('http') ? href : `https://pulsobyantom.substack.com${href}`;
        entries.push({ title, link: fullUrl });
      }
    });
    
    console.log(`📊 Encontrados ${entries.length} artículos en página principal`);
    return entries;
  } catch (error) {
    console.error('❌ Error extrayendo de página principal:', error.message);
    return [];
  }
}

// Función para hacer petición con retry y manejo de Cloudflare
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Intento ${attempt}/${maxRetries} de acceso al feed...`);
      
      const res = await fetch(url, {
        ...options,
        agent: httpsAgent,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
          'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          ...options.headers
        },
        timeout: 30000
      });
      
      if (res.ok) {
        console.log('✅ Feed obtenido exitosamente');
        return res;
      }
      
      console.error(`❌ Error HTTP ${res.status}: ${res.statusText}`);
      
      // Si es un error 403 y no es el último intento, esperar y reintentar
      if (res.status === 403 && attempt < maxRetries) {
        const waitTime = attempt * 5000; // 5s, 10s, 15s
        console.log(`⏳ Esperando ${waitTime/1000}s antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      // Si es el último intento o no es 403, mostrar headers y fallar
      console.error('📋 Headers de respuesta:', Object.fromEntries(res.headers.entries()));
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`⚠️ Error en intento ${attempt}: ${error.message}`);
      const waitTime = attempt * 3000; // 3s, 6s
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

export async function importSubstackFeed() {
  const svc = new NewsletterService();
  let total = 0;
  let nuevos = 0;
  let duplicados = 0;

  try {
    console.log('🔍 Intentando acceder al feed de Substack...');
    
    let res;
    let xml;
    let $;
    
    // Intentar con la URL principal primero
    try {
      res = await fetchWithRetry(FEED_URL);
      xml = await res.text();
      $ = cheerio.load(xml, { xmlMode: true });
      console.log('✅ Feed principal obtenido exitosamente');
    } catch (error) {
      console.log('⚠️ Falló el feed principal, intentando URL alternativa...');
      try {
        res = await fetchWithRetry(FEED_URL_ALT);
        xml = await res.text();
        $ = cheerio.load(xml, { xmlMode: true });
        console.log('✅ Feed alternativo obtenido exitosamente');
      } catch (altError) {
        console.log('⚠️ Ambas URLs de feed fallaron, intentando extracción de página principal...');
        const fallbackEntries = await extractFromMainPage();
        if (fallbackEntries.length > 0) {
          console.log('✅ Fallback exitoso: usando artículos de página principal');
          // Simular el procesamiento normal con las entradas del fallback
          total = fallbackEntries.length;
          console.log(`📊 Total de entradas encontradas: ${total}`);
          
          for (const { title, link } of fallbackEntries) {
            try {
              const u = new URL(link);
              if (u.hostname.toLowerCase() !== 'pulsobyantom.substack.com') {
                console.log(`⏭️ Saltando entrada de dominio diferente: ${u.hostname}`);
                continue;
              }

              console.log(`🔄 Procesando: ${title}`);
              const { titulo: t2, resumen } = await resumirDesdeUrl(link);
              const tituloFinal = title || t2 || '';
              const created = await svc.createOrIgnoreAsync({ link, Resumen: resumen || '', titulo: tituloFinal });
              if (created?.duplicated) {
                duplicados += 1;
                console.log(`⛔ Duplicado: ${title}`);
              } else {
                nuevos += 1;
                console.log(`✅ Nuevo: ${title}`);
              }
            } catch (e) {
              console.error('❌ Error procesando link:', link, e?.message || e);
            }
          }
          
          console.log(`📈 Resumen final: ${nuevos} nuevos, ${duplicados} duplicados de ${total} total`);
          return { total, nuevos, duplicados };
        } else {
          console.error('❌ Todos los métodos de acceso fallaron');
          console.error('Error principal:', error.message);
          console.error('Error alternativo:', altError.message);
          throw new Error(`No se pudo acceder al feed: ${error.message}`);
        }
      }
    }

    const items = $('channel > item');
    const entries = [];
    if (items && items.length) {
      items.each((_, el) => {
        const title = $(el).find('title').first().text().trim();
        const link = $(el).find('link').first().text().trim();
        if (title && link) entries.push({ title, link });
      });
    } else {
      $('feed > entry').each((_, el) => {
        const title = $(el).find('title').first().text().trim();
        const linkEl = $(el).find('link[rel="alternate"]').first();
        const link = (linkEl.attr('href') || '').trim();
        if (title && link) entries.push({ title, link });
      });
    }

    total = entries.length;
    console.log(`📊 Total de entradas encontradas: ${total}`);
    
    for (const { title, link } of entries) {
      try {
        const u = new URL(link);
        if (u.hostname.toLowerCase() !== 'pulsobyantom.substack.com') {
          console.log(`⏭️ Saltando entrada de dominio diferente: ${u.hostname}`);
          continue;
        }

        console.log(`🔄 Procesando: ${title}`);
        const { titulo: t2, resumen } = await resumirDesdeUrl(link);
        const tituloFinal = title || t2 || '';
        const created = await svc.createOrIgnoreAsync({ link, Resumen: resumen || '', titulo: tituloFinal });
        if (created?.duplicated) {
          duplicados += 1;
          console.log(`⛔ Duplicado: ${title}`);
        } else {
          nuevos += 1;
          console.log(`✅ Nuevo: ${title}`);
        }
      } catch (e) {
        console.error('❌ Error procesando link:', link, e?.message || e);
      }
    }
    
    console.log(`📈 Resumen final: ${nuevos} nuevos, ${duplicados} duplicados de ${total} total`);
  } catch (e) {
    console.error('❌ Error general importando feed:', e?.message || e);
    throw e; // esto hará que el workflow marque failure
  }

  return { total, nuevos, duplicados };
}

// Función para ejecutar desde línea de comandos
async function ejecutarImportSubstack() {
  try {
    console.log('🚀 Ejecutando importación de Substack desde GitHub Actions...');
    const result = await importSubstackFeed();
    console.log('✅ Importación completada:', result);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en importación de Substack:', error);
    process.exit(1);
  }
}

// Ejecutar solo si se corre directamente desde Node
if (process.argv[1] && process.argv[1].includes('importSubstack.mjs')) {
  ejecutarImportSubstack();
}
