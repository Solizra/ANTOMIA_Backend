import DBConfig from '../DBConfig.js';
import pkg from 'pg';
const { Client } = pkg;

export default class FuentesRepository {
  // Repositorio de Fuentes
  // Esquema esperado en la tabla: id (SERIAL/auto), "fuente" (VARCHAR), "Categoria" (VARCHAR)
  // La UI espera objetos con { fuente, categoria, activo }
  // Nota: Usamos búsquedas case-insensitive para evitar duplicados por mayúsculas/minúsculas

 

  // Lista todas las fuentes registradas (ordenadas por id descendente)
  async listAsync() {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const sql = `
        SELECT "id", "fuente", "Categoria"
        FROM "Fuentes"
        ORDER BY id DESC
      `;
      const result = await client.query(sql);
      return (result.rows || [])
        .map(r => ({
          fuente: String(r.fuente || '').trim(),
          categoria: String(r.Categoria || '').trim(),
          activo: true,
          id: r.id
        }))
        .filter(r => r.fuente.length > 0);
    } catch (err) {
      console.error('Error listando Fuentes:', err);
      throw err;
    } finally {
      await client.end();
    }
  }

  //  si encuentra registro, no intenta insertar y responde el mensaje de “ya está en la base de datos”.
  async getByFuenteAsync(fuente) {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const sql = `
        SELECT id, "fuente", COALESCE("Categoria", '') AS "Categoria"
        FROM "Fuentes"
        WHERE lower("fuente") = $1
        LIMIT 1
      `;
      const result = await client.query(sql, [String(fuente || '').trim().toLowerCase()]);
      return result.rows[0] || null;
    } catch (err) {
      console.error('Error buscando fuente por valor:', err);
      throw err;
    } finally {
      await client.end();
    }
  }

  // Agrega una nueva fuente si no existe; si existe, indica existed=true
  async addAsync({ fuente, categoria }) {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const cleanFuente = String(fuente || '').trim().toLowerCase();
      const cleanCategoria = String(categoria || '').trim();
      if (!cleanFuente) {
        throw new Error('Fuente requerida');
      }
      // 1) Verificar existencia
      const existsSql = `
        SELECT id, "fuente", COALESCE("Categoria", '') AS "Categoria"
        FROM "Fuentes"
        WHERE lower("fuente") = $1
        LIMIT 1
      `;
      const exists = await client.query(existsSql, [cleanFuente]);
      if (exists.rows.length > 0) {
        const row = exists.rows[0];
        return { existed: true, id: row.id, fuente: row.fuente, categoria: row.Categoria, activo: true };
      }

      // 2) Insertar cuando no existe
      const insertSql = `
        INSERT INTO "Fuentes" ("fuente", "Categoria")
        VALUES ($1, NULLIF($2, ''))
        RETURNING id, "fuente", COALESCE("Categoria", '') AS "Categoria"
      `;
      const ins = await client.query(insertSql, [cleanFuente, cleanCategoria]);
      const row = ins.rows[0];
      return { existed: false, id: row.id, fuente: row.fuente, categoria: row.Categoria, activo: true };
    } catch (err) {
      console.error('Error agregando fuente:', err);
      throw err;
    } finally {
      await client.end();
    }
  }

  // Elimina la fuente (desactivar) por valor case-insensitive.
  async deactivateAsync(fuente) {
    const client = new Client(DBConfig);
    try {
      await client.connect();
      const cleanFuente = String(fuente || '').trim().toLowerCase();
      if (!cleanFuente) {
        throw new Error('Fuente requerida');
      }
      const sql = `
        DELETE FROM "Fuentes" 
        WHERE lower("fuente") = $1
        RETURNING id
      `;
      const result = await client.query(sql, [cleanFuente]);
      return result.rowCount > 0;
    } catch (err) {
      console.error('Error desactivando fuente:', err);
      throw err;
    } finally {
      await client.end();
    }
  }
}


