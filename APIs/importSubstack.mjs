import https from 'https';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import NewsletterService from '../Services/Newsletter-services.js';
import { resumirDesdeUrl } from '../Agent/main.js';

const FEED_URL = 'https://pulsobyantom.substack.com/feed';
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

export async function importSubstackFeed() {
  const svc = new NewsletterService();
  let total = 0;
  let nuevos = 0;
  let duplicados = 0;

  try {
    console.log('🔍 Intentando acceder al feed de Substack...');
    const res = await fetch(FEED_URL, {
      agent: httpsAgent,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      timeout: 30000  // 30 segundos de timeout
    });
    
    if (!res.ok) {
      console.error(`❌ Error HTTP ${res.status}: ${res.statusText}`);
      console.error('📋 Headers de respuesta:', Object.fromEntries(res.headers.entries()));
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    console.log('✅ Feed obtenido exitosamente');
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

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
