import DBConfig from '../DBConfig.js';
import pkg from 'pg';
const { Client } = pkg;

export default class NewsletterRepository {
  getAllAsync = async ({ id, link, Resumen, titulo, page, limit }) => {
    let newsletters = [];
    const client = new Client(DBConfig);
    
    // Si el límite es muy alto (>1000), ignorar paginación y traer todos
    const usePagination = limit && limit <= 1000;
    const offset = usePagination ? (page - 1) * limit : 0;

    try {
      await client.connect();
      let sql = `
        SELECT id, link, "Resumen", titulo
        FROM "Newsletter"
        WHERE 1=1
      `;
      const params = [];

      if (id) {
        sql += ` AND id = $${params.length + 1}`;
        params.push(id);
      }
      if (link) {
        sql += ` AND link ILIKE $${params.length + 1}`;
        params.push(`%${link}%`);
      }
      if (Resumen) {
        // Columna tiene comillas mayúsculas en el esquema: "Resumen"
        sql += ` AND "Resumen" ILIKE $${params.length + 1}`;
        params.push(`%${Resumen}%`);
      }
      if (titulo) {
        sql += ` AND titulo ILIKE $${params.length + 1}`;
        params.push(`%${titulo}%`);
      }

      sql += ` ORDER BY id DESC`;
      
      // Solo aplicar LIMIT y OFFSET si se usa paginación
      if (usePagination) {
        sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
      }

      const result = await client.query(sql, params);
      newsletters = result.rows;
    } catch (err) {
      console.error('Error al obtener newsletters:', err);
      throw err; // Re-lanzar el error para que el servicio lo maneje
    } finally {
      await client.end();
    }

    return newsletters;
  };

  existsByLinkExact = async (link) => {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const sql = `
        SELECT id, link, "Resumen", titulo
        FROM "Newsletter"
        WHERE link = $1
        LIMIT 1
      `;
      const result = await client.query(sql, [link]);
      return result.rows?.[0] || null;
    } catch (err) {
      console.error('Error comprobando existencia de newsletter por link:', err);
      throw err;
    } finally {
      await client.end();
    }
  };

  createAsync = async ({ link, Resumen, titulo }) => {
    if (!link || typeof link !== 'string') {
      throw new Error('El campo "link" es obligatorio');
    }

    const client = new Client(DBConfig);
    try {
      await client.connect();
      // Verificar duplicado exacto antes de insertar
      const existing = await client.query(
        'SELECT id, link, "Resumen", titulo FROM "Newsletter" WHERE link = $1 LIMIT 1',
        [link]
      );
      if (existing.rows && existing.rows.length > 0) {
        return { duplicated: true, data: existing.rows[0] };
      }
      const ins = await client.query(
        'INSERT INTO "Newsletter" (link, "Resumen", titulo) VALUES ($1, $2, $3) RETURNING id, link, "Resumen", titulo',
        [link, Resumen || '', titulo || '']
      );
      return ins.rows && ins.rows[0] ? ins.rows[0] : null;
    } catch (err) {
      console.error('Error creando newsletter (createAsync):', err);
      throw err;
    } finally {
      await client.end();
    }
  };

  createOrIgnoreAsync = async ({ link, Resumen, titulo }) => {
    if (!link || typeof link !== 'string') {
      throw new Error('El campo "link" es obligatorio');
    }

    const client = new Client(DBConfig);
    try {
      await client.connect();
      // Verificar duplicado exacto antes de insertar
      const existing = await client.query(
        'SELECT id, link, "Resumen", titulo FROM "Newsletter" WHERE link = $1 LIMIT 1',
        [link]
      );
      if (existing.rows && existing.rows.length > 0) {
        return { duplicated: true, existing: existing.rows[0] };
      }
      const ins = await client.query(
        'INSERT INTO "Newsletter" (link, "Resumen", titulo) VALUES ($1, $2, $3) RETURNING id, link, "Resumen", titulo',
        [link, Resumen || '', titulo || '']
      );
      return ins.rows && ins.rows[0] ? ins.rows[0] : null;
    } catch (err) {
      console.error('Error creando newsletter:', err);
      throw err;
    } finally {
      await client.end();
    }
  };

  deleteByIdAsync = async (id) => {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new Error('ID inválido');
    }
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const res = await client.query('DELETE FROM "Newsletter" WHERE id = $1', [numericId]);
      return res.rowCount > 0;
    } catch (err) {
      console.error('Error eliminando newsletter:', err);
      throw err;
    } finally {
      await client.end();
    }
  };

  deleteByLinkExact = async (link) => {
    if (!link || typeof link !== 'string') {
      throw new Error('Link inválido');
    }
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const res = await client.query('DELETE FROM "Newsletter" WHERE link = $1', [link]);
      return res.rowCount > 0;
    } catch (err) {
      console.error('Error eliminando newsletter por link:', err);
      throw err;
    } finally {
      await client.end();
    }
  };

  deleteByIdOrLink = async ({ id, link }) => {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const where = [];
      const params = [];
      const numericId = Number(id);
      if (Number.isInteger(numericId) && numericId > 0) {
        where.push(`id = $${params.length + 1}`);
        params.push(numericId);
      }
      if (typeof link === 'string' && link.trim()) {
        where.push(`link = $${params.length + 1}`);
        params.push(link.trim());
      }
      if (where.length === 0) {
        throw new Error('Parámetros inválidos para borrar');
      }
      const sql = `DELETE FROM "Newsletter" WHERE ${where.join(' OR ')}`;
      const res = await client.query(sql, params);
      return res.rowCount > 0;
    } catch (err) {
      console.error('Error eliminando newsletter (id o link):', err);
      throw err;
    } finally {
      await client.end();
    }
  };

  updateResumenByIdAsync = async (id, Resumen) => {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      throw new Error('ID inválido');
    }
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const sql = 'UPDATE "Newsletter" SET "Resumen" = $1 WHERE id = $2 RETURNING id, link, "Resumen", titulo';
      const result = await client.query(sql, [Resumen ?? null, numericId]);
      return result.rows?.[0] || null;
    } catch (err) {
      console.error('Error actualizando resumen de newsletter:', err);
      throw err;
    } finally {
      await client.end();
    }
  };

  updateResumenByLinkExactAsync = async (link, Resumen) => {
    if (!link || typeof link !== 'string') {
      throw new Error('Link inválido');
    }
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const sql = 'UPDATE "Newsletter" SET "Resumen" = $1 WHERE link = $2 RETURNING id, link, "Resumen", titulo';
      const result = await client.query(sql, [Resumen ?? null, link]);
      return result.rows?.[0] || null;
    } catch (err) {
      console.error('Error actualizando resumen por link:', err);
      throw err;
    } finally {
      await client.end();
    }
  };

  updateResumenByIdOrLinkAsync = async ({ id, link, Resumen }) => {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const numericId = Number(id);
      const params = [];
      let whereParts = [];
      if (Number.isInteger(numericId) && numericId > 0) {
        whereParts.push(`id = $${params.length + 2}`);
        params.push(numericId);
      }
      if (typeof link === 'string' && link.trim()) {
        whereParts.push(`link = $${params.length + 2}`);
        params.push(link.trim());
      }
      if (whereParts.length === 0) return null;
      const sql = `UPDATE "Newsletter" SET "Resumen" = $1 WHERE ${whereParts.join(' OR ')} RETURNING id, link, "Resumen", titulo`;
      const result = await client.query(sql, [Resumen ?? null, ...params]);
      return result.rows?.[0] || null;
    } catch (err) {
      console.error('Error actualizando resumen (id OR link):', err);
      throw err;
    } finally {
      await client.end();
    }
  };

  // Obtener newsletter por ID
  getByIdAsync = async (id) => {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const sql = 'SELECT id, link, "Resumen", titulo FROM "Newsletter" WHERE id = $1 LIMIT 1';
      const result = await client.query(sql, [id]);
      return result.rows[0] || null;
    } catch (err) {
      console.error('Error obteniendo newsletter por ID:', err);
      throw err;
    } finally {
      await client.end();
    }
  };
}
