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
    const res = await fetch(FEED_URL, {
      agent: httpsAgent,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    // RSS items
    const items = $('channel > item');
    const entries = [];
    if (items && items.length) {
      items.each((_, el) => {
        const title = $(el).find('title').first().text().trim();
        const link = $(el).find('link').first().text().trim();
        if (title && link) entries.push({ title, link });
      });
    } else {
      // Atom fallback
      $('feed > entry').each((_, el) => {
        const title = $(el).find('title').first().text().trim();
        const linkEl = $(el).find('link[rel="alternate"]').first();
        const link = (linkEl.attr('href') || '').trim();
        if (title && link) entries.push({ title, link });
      });
    }

    total = entries.length;
    for (const { title, link } of entries) {
      try {
        // Dominio permitido
        const u = new URL(link);
        if (u.hostname.toLowerCase() !== 'pulsobyantom.substack.com') {
          continue;
        }
        // Resumir rápido
        const { titulo: t2, resumen } = await resumirDesdeUrl(link);
        const tituloFinal = title || t2 || '';
        const created = await svc.createOrIgnoreAsync({ link, Resumen: resumen || '', titulo: tituloFinal });
        if (created?.duplicated) {
          duplicados += 1;
        } else {
          nuevos += 1;
        }
      } catch (e) {
        // continuar con el siguiente
      }
    }
  } catch (e) {
    throw e;
  }

  return { total, nuevos, duplicados };
}

let substackTimer = null;
export function scheduleSubstackImport() {
  // Cada 14 días
  const intervalMs = 14 * 24 * 60 * 60 * 1000;
  if (substackTimer) clearInterval(substackTimer);
  substackTimer = setInterval(async () => {
    try {
      await importSubstackFeed();
    } catch {}
  }, intervalMs);
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

// Si se ejecuta directamente este archivo, ejecutar la importación
if (process.argv[1] && process.argv[1].includes('importSubstack.mjs')) {
  ejecutarImportSubstack();
}

