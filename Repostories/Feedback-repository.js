import DBConfig from '../DBConfig.js';
import pkg from 'pg';
const { Client } = pkg;

export default class FeedbackRepository {
  async createAsync(record) {
    const client = new Client(DBConfig);
    try {
      console.log('🗄️ FeedbackRepository: Conectando a BD para insertar feedback');
      await client.connect();
      
      // Construir SQL dinámicamente para manejar trendId null
      const hasTrendId = record.trendId && Number.isFinite(Number(record.trendId));
      
      const sql = hasTrendId ? `
        INSERT INTO "Feedback" (
          "trendId", "action", "reason", "feedback", "trendData", "timestamp"
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING "id", "trendId", "action", "reason", "feedback", "trendData", "timestamp", "createdAt";
      ` : `
        INSERT INTO "Feedback" (
          "action", "reason", "feedback", "trendData", "timestamp"
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING "id", "trendId", "action", "reason", "feedback", "trendData", "timestamp", "createdAt";
      `;
      
      const params = hasTrendId ? [
        Number(record.trendId),
        String(record.action || '').trim(),
        record.reason ?? null,
        record.feedback ?? null,
        record.trendData ?? null,
        record.timestamp ?? null
      ] : [
        String(record.action || '').trim(),
        record.reason ?? null,
        record.feedback ?? null,
        record.trendData ?? null,
        record.timestamp ?? null
      ];
      
      console.log('🗄️ FeedbackRepository: Ejecutando INSERT con parámetros:', params);
      const result = await client.query(sql, params);
      
      if (result.rows && result.rows.length > 0) {
        console.log('✅ FeedbackRepository: INSERT exitoso, ID creado:', result.rows[0].id);
        return result.rows[0];
      } else {
        console.error('❌ FeedbackRepository: INSERT no devolvió filas');
        throw new Error('No se pudo insertar el feedback');
      }
    } catch (err) {
      console.error('❌ FeedbackRepository: Error insertando Feedback:', err?.message || err);
      console.error('❌ FeedbackRepository: Detalles del error:', {
        code: err?.code,
        detail: err?.detail,
        constraint: err?.constraint
      });
      throw err;
    } finally {
      await client.end();
    }
  }

  async hasNegativeForLinkOrPair({ trendLink, newsletterId = null }) {
    if (!trendLink) return false;
    const client = new Client(DBConfig);
    try {
      await client.connect();
      
      // Consulta SQL corregida con casting explícito para evitar errores de tipo
      const sql = `
        SELECT 1
        FROM "Feedback"
        WHERE "trendData" IS NOT NULL
          AND lower(COALESCE(("trendData"::jsonb->>'trendLink')::text, '')) = lower($1)
          AND lower(COALESCE("feedback", '')) = 'negative'
          AND (
            $2::text IS NULL OR COALESCE(("trendData"::jsonb->>'newsletterId')::text, 'null') = $2
          )
        LIMIT 1;
      `;
      
      const result = await client.query(sql, [String(trendLink), newsletterId == null ? null : String(newsletterId)]);
      return result.rows.length > 0;
    } catch (err) {
      console.error('Error consultando Feedback negativo por link/par:', err);
      // En caso de error, devolver false para no bloquear el flujo
      return false;
    } finally {
      await client.end();
    }
  }

  async getRecentNegatives({ limit = 100 } = {}) {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const sql = `
        SELECT "id", "action", "reason", "trendData", "createdAt"
        FROM "Feedback"
        WHERE lower(COALESCE("feedback", '')) = 'negative'
        ORDER BY "createdAt" DESC
        LIMIT $1;
      `;
      const result = await client.query(sql, [limit]);
      return result.rows || [];
    } catch (err) {
      console.error('Error obteniendo Feedback negativos recientes:', err);
      return [];
    } finally {
      await client.end();
    }
  }
}


