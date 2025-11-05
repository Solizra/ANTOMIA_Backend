import DBConfig from '../DBConfig.js';
import pkg from 'pg';
const { Client } = pkg;

export default class TrendsRepository {
  async createAsync(record) {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      // Normalizar URL para evitar duplicados por tracking (utm, fbclid, etc.)
      const normalizeLink = (url) => {
        try {
          const u = new URL(String(url || '').trim());
          // borrar parámetros de tracking comunes
          const params = u.searchParams;
          const toDelete = [];
          params.forEach((_, k) => {
            const kLow = k.toLowerCase();
            if (kLow.startsWith('utm_') || kLow === 'fbclid' || kLow === 'gclid' || kLow === 'ref' || kLow === 'source' || kLow === 'mc_cid' || kLow === 'mc_eid') {
              toDelete.push(k);
            }
          });
          toDelete.forEach(k => u.searchParams.delete(k));
          u.hash = '';
          // path sin slash final
          if (u.pathname.endsWith('/') && u.pathname.length > 1) {
            u.pathname = u.pathname.replace(/\/+$/, '');
          }
          return u.toString();
        } catch {
          return String(url || '').trim();
        }
      };
      // Normalización y coerción de payload para evitar valores incorrectos en BDD
      const coerceBoolean = (v) => {
        if (typeof v === 'boolean') return v;
        if (typeof v === 'number') return v !== 0;
        const s = String(v || '').trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes';
      };
      const coerceIntOrNull = (v) => {
        const n = Number(v);
        return Number.isInteger(n) ? n : null;
      };
      const safeText = (v) => String(v ?? '').trim();
      const safeDateISO = (v) => {
        try {
          const d = v ? new Date(v) : new Date();
          const t = d.getTime();
          if (Number.isFinite(t)) return new Date(t).toISOString();
          return new Date().toISOString();
        } catch {
          return new Date().toISOString();
        }
      };

      // Construir un registro saneado para uso interno
      const clean = {
        id_newsletter: coerceIntOrNull(record.id_newsletter),
        Título_del_Trend: safeText(record.Título_del_Trend),
        Link_del_Trend: normalizeLink(safeText(record.Link_del_Trend)),
        Nombre_Newsletter_Relacionado: safeText(record.Nombre_Newsletter_Relacionado),
        Fecha_Relación: safeDateISO(record.Fecha_Relación),
        Relacionado: coerceBoolean(record.Relacionado),
        Analisis_relacion: safeText(record.Analisis_relacion)
      };
      // Validar que el newsletter existe si se proporciona id_newsletter
      if (clean.id_newsletter != null) {
        try {
          const nlRes = await client.query('SELECT "id", "titulo" FROM "Newsletter" WHERE "id" = $1 LIMIT 1', [clean.id_newsletter]);
          if (nlRes.rows.length === 0) {
            console.warn(`⚠️ Newsletter con ID ${clean.id_newsletter} no existe. Estableciendo id_newsletter a null.`);
            clean.id_newsletter = null;
          } else {
            // Completar nombre de newsletter si viene vacío
            if (!clean.Nombre_Newsletter_Relacionado || clean.Nombre_Newsletter_Relacionado.trim() === '') {
              const t = nlRes.rows[0].titulo;
              if (t) clean.Nombre_Newsletter_Relacionado = t;
            }
          }
        } catch (e) {
          console.error('Error validando newsletter:', e.message);
          console.warn(`⚠️ Error validando newsletter ID ${clean.id_newsletter}. Estableciendo a null.`);
          clean.id_newsletter = null;
        }
      }
      // Chequeo de duplicados: misma noticia (Link_del_Trend) y mismo newsletter (id_newsletter o nombre relacionado)
      // Nota: NO consideramos el flag "Relacionado" para evitar duplicados con distinto valor del flag
      try {
        const checkSql = `
          SELECT "id"
          FROM "Trends"
          WHERE lower("Link_del_Trend") = lower($1::text)
            AND (
              ($2::int IS NOT NULL AND "id_newsletter" = $2::int)
              OR (
                $2::int IS NULL AND $3::text <> '' AND lower(COALESCE("Nombre_Newsletter_Relacionado", '')) = lower($3::text)
              )
              OR (
                $2::int IS NULL AND $3::text = '' AND "id_newsletter" IS NULL AND COALESCE("Nombre_Newsletter_Relacionado", '') = ''
              )
            )
          LIMIT 1;
        `;
        const checkParams = [
          clean.Link_del_Trend,
          clean.id_newsletter,
          clean.Nombre_Newsletter_Relacionado
        ];
        const existing = await client.query(checkSql, checkParams);
        if (existing.rows.length > 0) {
          console.log('⛔ Duplicado detectado:', {
            link: clean.Link_del_Trend,
            id_newsletter: clean.id_newsletter,
            nombre: clean.Nombre_Newsletter_Relacionado,
            existingId: existing.rows[0].id
          });
          return { id: existing.rows[0].id, duplicated: true };
        }
      } catch (dupErr) {
        console.error('Error comprobando duplicados en Trends:', dupErr);
      }

      // Comprobación adicional: evitar recrear la misma noticia (mismo link normalizado) en los últimos 10 días
      try {
        const recentSql = `
          SELECT "id", "Link_del_Trend", "id_newsletter", "Nombre_Newsletter_Relacionado", "Fecha_Relación"
          FROM "Trends"
          WHERE "Fecha_Relación" > NOW() - INTERVAL '10 days'
        `;
        const recent = await client.query(recentSql);
        const same = recent.rows.find(r => {
          try {
            const existingNorm = normalizeLink(r['Link_del_Trend']);
            const sameLink = existingNorm.toLowerCase() === clean.Link_del_Trend.toLowerCase();
            if (!sameLink) return false;
            // mismas reglas de newsletter del check previo
            const sameNewsletterId = (clean.id_newsletter != null) && (r['id_newsletter'] === clean.id_newsletter);
            const sameNewsletterName = (clean.id_newsletter == null) && (clean.Nombre_Newsletter_Relacionado || '').trim() !== '' && (String(r['Nombre_Newsletter_Relacionado'] || '').trim().toLowerCase() === clean.Nombre_Newsletter_Relacionado.trim().toLowerCase());
            const bothNullNewsletter = (clean.id_newsletter == null) && ((clean.Nombre_Newsletter_Relacionado || '').trim() === '') && (r['id_newsletter'] == null) && (String(r['Nombre_Newsletter_Relacionado'] || '').trim() === '');
            return sameNewsletterId || sameNewsletterName || bothNullNewsletter;
          } catch { return false; }
        });
        if (same) {
          console.log('⛔ Repetición evitada (ventana 10 días) para link normalizado:', clean.Link_del_Trend);
          return { id: same.id, duplicated: true };
        }
      } catch (e) {
        console.error('Error comprobando repetición por ventana de 10 días:', e);
      }
      const sql = `
        INSERT INTO "Trends" (
          "id_newsletter",
          "Título_del_Trend",
          "Link_del_Trend",
          "Nombre_Newsletter_Relacionado",
          "Fecha_Relación",
          "Relacionado",
          "Analisis_relacion"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING "id", "id_newsletter", "Título_del_Trend", "Link_del_Trend", "Nombre_Newsletter_Relacionado", "Fecha_Relación", "Relacionado", "Analisis_relacion";
      `;
      const params = [
        clean.id_newsletter,
        clean.Título_del_Trend,
        clean.Link_del_Trend,
        clean.Nombre_Newsletter_Relacionado,
        clean.Fecha_Relación,
        clean.Relacionado,
        clean.Analisis_relacion
      ];
      const result = await client.query(sql, params);
      const inserted = result.rows[0] || { id: null };
      console.log('✅ Trend insertado exitosamente:', {
        id: inserted.id,
        titulo: inserted['Título_del_Trend'],
        relacionado: inserted.Relacionado,
        id_newsletter: inserted.id_newsletter
      });
      // Devolver el registro completo insertado (útil para front y validación)
      return inserted;
    } catch (err) {
      console.error('Error insertando en Trends:', err);
      throw err;
    } finally {
      await client.end();
    }
  }

  async getByIdAsync(id) {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const sql = `
        SELECT "id", "id_newsletter", "Título_del_Trend", "Link_del_Trend",
               "Nombre_Newsletter_Relacionado", "Fecha_Relación", "Relacionado", "Analisis_relacion"
        FROM "Trends"
        WHERE "id" = $1
      `;
      const result = await client.query(sql, [id]);
      return result.rows[0] || null;
    } catch (err) {
      console.error('Error obteniendo Trend por id:', err);
      throw err;
    } finally {
      await client.end();
    }
  }

  async listAsync({ page = 1, limit = 1000 } = {}) {
    const client = new Client(DBConfig);
    const offset = (page - 1) * limit;
    try {
      await client.connect();
      // Devolver todos los trends ordenados por fecha más reciente
      const sql = `
        SELECT t."id", t."id_newsletter", t."Título_del_Trend", t."Link_del_Trend",
               t."Nombre_Newsletter_Relacionado", t."Fecha_Relación", t."Relacionado", t."Analisis_relacion"
        FROM "Trends" t
        ORDER BY t."Fecha_Relación" DESC, t."id" DESC
        LIMIT $1 OFFSET $2
      `;
      const result = await client.query(sql, [limit, offset]);
      return result.rows;
    } catch (err) {
      console.error('Error listando Trends:', err);
      throw err;
    } finally {
      await client.end();
    }
  }

  async deleteAsync(id) {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      // Eliminar solo el trend; preservar feedback histórico asociado
      const sql = `DELETE FROM "Trends" WHERE "id" = $1 RETURNING "id";`;
      const result = await client.query(sql, [id]);
      const deleted = result.rowCount > 0;
      
      if (deleted) {
        console.log(`✅ Trend eliminado exitosamente: ID ${id}`);
      } else {
        console.log(`ℹ️ Trend no encontrado para eliminar: ID ${id}`);
      }
      
      return deleted; //aaa
    } catch (err) {
      console.error('Error eliminando Trend:', err);
      throw err;
    } finally {
      await client.end();
    }
  }
  
  async deleteOlderThanDays(days = 30) {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const sql = `DELETE FROM "Trends" WHERE "Fecha_Relación" < NOW() - INTERVAL '${Math.max(1, Number(days))} days' RETURNING "id";`;
      const result = await client.query(sql);
      return result.rowCount || 0;
    } catch (err) {
      console.error('Error eliminando Trends antiguos:', err);
      throw err;
    } finally {
      await client.end();
    }
  }
  
  
}


