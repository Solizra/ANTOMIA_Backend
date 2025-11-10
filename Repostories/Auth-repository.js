import DBConfig from '../DBConfig.js';
import pkg from 'pg';
const { Pool } = pkg;

class AuthRepository {
  constructor() {
    this.pool = new Pool(DBConfig);
    this.userSource = null; // { type: 'custom' | 'supabase', table: string }
  }

  // Detectar y cachear fuente de usuarios: tabla app "Users" o Supabase "auth.users"
  async resolveUserSource() {
    if (this.userSource) return this.userSource;
    try {
      const checkCustom = await this.pool.query(`SELECT to_regclass('public."Users"') AS exists_ref`);
      const existsCustom = !!checkCustom.rows[0]?.exists_ref;
      if (existsCustom) {
        this.userSource = { type: 'custom', table: `public."Users"` };
        return this.userSource;
      }
    } catch {}
    // Fallback a Supabase
    this.userSource = { type: 'supabase', table: 'auth.users' };
    return this.userSource;
  }

  // Buscar usuario por email
  async findUserByEmail(email) {
    try {
      const source = await this.resolveUserSource();
      if (source.type === 'custom') {
        const query = 'SELECT * FROM "Users" WHERE email = $1 AND activo = true';
        const result = await this.pool.query(query, [email]);
        return result.rows[0] || null;
      } else {
        const result = await this.pool.query(
          `SELECT id, email, raw_user_meta_data, email_confirmed_at, created_at FROM auth.users WHERE email = $1`,
          [email]
        );
        const row = result.rows[0];
        if (!row) return null;
        const meta = row.raw_user_meta_data || {};
        return {
          id: row.id,
          email: row.email,
          nombre: meta.nombre || meta.first_name || null,
          apellido: meta.apellido || meta.last_name || null,
          activo: true,
          email_verificado: !!row.email_confirmed_at,
          fecha_creacion: row.created_at
        };
      }
    } catch (error) {
      console.error('Error en findUserByEmail:', error);
      throw error;
    }
  }

  // Crear nuevo usuario
  async createUser(userData) {
    try {
      const { email, password, nombre, apellido } = userData;
      const query = `
        INSERT INTO "Users" (email, password, nombre, apellido, email_verificado)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, email, nombre, apellido, email_verificado, fecha_creacion
      `;
      const result = await this.pool.query(query, [email, password, nombre, apellido, false]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en createUser:', error);
      throw error;
    }
  }

  // Actualizar campos de un usuario (admin)
  async updateUser(userId, updates) {
    try {
      const allowedFields = ['email', 'password', 'nombre', 'apellido', 'activo', 'email_verificado'];
      const entries = Object.entries(updates).filter(([key]) => allowedFields.includes(key));
      if (entries.length === 0) {
        throw new Error('No hay campos válidos para actualizar');
      }

      const setFragments = entries.map(([key], index) => `${key} = $${index + 1}`);
      const values = entries.map(([, value]) => value);
      values.push(userId);

      const query = `
        UPDATE "Users"
        SET ${setFragments.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
        RETURNING id, email, nombre, apellido, activo, email_verificado, fecha_creacion
      `;

      const result = await this.pool.query(query, values);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error en updateUser:', error);
      throw error;
    }
  }

  // Registrar relación en UsuariosAgregados
  async insertUsuarioAgregado(usuarioAgregadoId, usuarioJefeId) {
    try {
      const query = `
        INSERT INTO "UsuariosAgregados" ("UsuarioAgregado", "UsuarioJefe")
        VALUES ($1, $2)
        RETURNING id, "UsuarioAgregado", "UsuarioJefe"
      `;
      const result = await this.pool.query(query, [usuarioAgregadoId, usuarioJefeId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en insertUsuarioAgregado:', error);
      throw error;
    }
  }

  // Listar usuarios agregados por un jefe (dueño)
  async listUsuariosAgregadosByJefe(usuarioJefeId) {
    try {
      const query = `
        SELECT u.id, u.email, u.nombre, u.apellido, u.activo, u.email_verificado, u.fecha_creacion
        FROM "UsuariosAgregados" ua
        JOIN "Users" u ON ua."UsuarioAgregado" = u.id
        WHERE ua."UsuarioJefe" = $1
        ORDER BY u.fecha_creacion DESC
      `;
      const result = await this.pool.query(query, [usuarioJefeId]);
      return result.rows;
    } catch (error) {
      console.error('Error en listUsuariosAgregadosByJefe:', error);
      throw error;
    }
  }

  // Eliminar usuario definitivamente (admin)
  async deleteUser(userId) {
    try {
      // Ejecutar en transacción para mantener consistencia referencial
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Eliminar relaciones de UsuariosAgregados donde el usuario
        // sea agregado o jefe para evitar violaciones de FK
        try {
          await client.query(
            `DELETE FROM "UsuariosAgregados" WHERE "UsuarioAgregado" = $1 OR "UsuarioJefe" = $1`,
            [userId]
          );
        } catch (e) {
          // Si la tabla no existe en este entorno, ignorar y continuar
          if (!(e && e.code === '42P01')) throw e;
        }

        // Eliminar tokens de reseteo de contraseña asociados
        try {
          await client.query(
            `DELETE FROM "PasswordResetTokens" WHERE user_id = $1`,
            [userId]
          );
        } catch (e) {
          if (!(e && e.code === '42P01')) throw e;
        }

        // Finalmente eliminar el usuario
        const deleteUserResult = await client.query(
          `DELETE FROM "Users" WHERE id = $1 RETURNING id, email`,
          [userId]
        );

        await client.query('COMMIT');
        return deleteUserResult.rows[0] || null;
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error en deleteUser:', error);
      throw error;
    }
  }

  // Eliminar usuario por email (admin)
  async deleteUserByEmail(email) {
    try {
      const source = await this.resolveUserSource();
      if (source.type === 'custom') {
        // Ejecutar en transacción para mantener consistencia referencial
        const client = await this.pool.connect();
        try {
          await client.query('BEGIN');

          // Obtener ID del usuario por email (sin filtrar por activo)
          const userResult = await client.query(`SELECT id FROM "Users" WHERE email = $1`, [email]);
          const userRow = userResult.rows[0];
          if (!userRow) {
            await client.query('ROLLBACK');
            return null;
          }
          const userId = userRow.id;

          // Eliminar relaciones de UsuariosAgregados
          try {
            await client.query(
              `DELETE FROM "UsuariosAgregados" WHERE "UsuarioAgregado" = $1 OR "UsuarioJefe" = $1`,
              [userId]
            );
          } catch (e) {
            if (!(e && e.code === '42P01')) throw e;
          }

          // Eliminar tokens de reseteo
          try {
            await client.query(`DELETE FROM "PasswordResetTokens" WHERE user_id = $1`, [userId]);
          } catch (e) {
            if (!(e && e.code === '42P01')) throw e;
          }

          // Eliminar usuario
          const deleteUserResult = await client.query(
            `DELETE FROM "Users" WHERE id = $1 RETURNING id, email`,
            [userId]
          );

          await client.query('COMMIT');
          return deleteUserResult.rows[0] || null;
        } catch (txError) {
          await client.query('ROLLBACK');
          throw txError;
        } finally {
          client.release();
        }
      } else {
        // Supabase: eliminar directamente de auth.users por email
        const result = await this.pool.query(
          `DELETE FROM auth.users WHERE email = $1 RETURNING id, email`,
          [email]
        );
        return result.rows[0] || null;
      }
    } catch (error) {
      console.error('Error en deleteUserByEmail:', error);
      throw error;
    }
  }

  // Actualizar contraseña del usuario
  async updateUserPassword(userId, newPassword) {
    try {
      const query = `
        UPDATE "Users" 
        SET password = $1, fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING id, email, nombre, apellido
      `;
      const result = await this.pool.query(query, [newPassword, userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en updateUserPassword:', error);
      throw error;
    }
  }

  // Crear token de recuperación de contraseña
  async createPasswordResetToken(userId, token, expiresAt) {
    try {
      // Primero invalidar tokens anteriores del usuario
      await this.invalidateUserPasswordResetTokens(userId);
      
      const query = `
        INSERT INTO "PasswordResetTokens" (user_id, token, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id, token, expires_at, created_at
      `;
      const result = await this.pool.query(query, [userId, token, expiresAt]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en createPasswordResetToken:', error);
      throw error;
    }
  }

  // Buscar token de recuperación válido
  async findValidPasswordResetToken(token) {
    try {
      const query = `
        SELECT prt.*, u.email, u.nombre, u.apellido
        FROM "PasswordResetTokens" prt
        JOIN "Users" u ON prt.user_id = u.id
        WHERE prt.token = $1 
        AND prt.expires_at > NOW() 
        AND prt.used = false
        AND u.activo = true
      `;
      const result = await this.pool.query(query, [token]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error en findValidPasswordResetToken:', error);
      throw error;
    }
  }

  // Marcar token como usado
  async markPasswordResetTokenAsUsed(token) {
    try {
      const query = `
        UPDATE "PasswordResetTokens" 
        SET used = true 
        WHERE token = $1
        RETURNING id
      `;
      const result = await this.pool.query(query, [token]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en markPasswordResetTokenAsUsed:', error);
      throw error;
    }
  }

  // Invalidar todos los tokens de recuperación de un usuario
  async invalidateUserPasswordResetTokens(userId) {
    try {
      const query = `
        UPDATE "PasswordResetTokens" 
        SET used = true 
        WHERE user_id = $1 AND used = false
      `;
      await this.pool.query(query, [userId]);
    } catch (error) {
      console.error('Error en invalidateUserPasswordResetTokens:', error);
      throw error;
    }
  }

  // Limpiar tokens expirados
  async cleanupExpiredTokens() {
    try {
      const query = `
        DELETE FROM "PasswordResetTokens" 
        WHERE expires_at < NOW()
      `;
      const result = await this.pool.query(query);
      return result.rowCount;
    } catch (error) {
      console.error('Error en cleanupExpiredTokens:', error);
      throw error;
    }
  }

  // Verificar si el email ya existe
  async emailExists(email) {
    try {
      const source = await this.resolveUserSource();
      if (source.type === 'custom') {
        const result = await this.pool.query('SELECT id FROM "Users" WHERE email = $1', [email]);
        return result.rows.length > 0;
      } else {
        const result = await this.pool.query('SELECT id FROM auth.users WHERE email = $1', [email]);
        return result.rows.length > 0;
      }
    } catch (error) {
      console.error('Error en emailExists:', error);
      throw error;
    }
  }

  // Obtener usuario por ID
  async findUserById(userId) {
    try {
      const query = 'SELECT id, email, nombre, apellido, activo, email_verificado FROM "Users" WHERE id = $1';
      const result = await this.pool.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error en findUserById:', error);
      throw error;
    }
  }

  // Buscar usuario por ID sin filtrar por activo
  async findUserByIdAnyStatus(userId) {
    try {
      const query = 'SELECT * FROM "Users" WHERE id = $1';
      const result = await this.pool.query(query, [userId]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error en findUserByIdAnyStatus:', error);
      throw error;
    }
  }

  // Verificar si existe un usuario supervisor
  async checkSupervisorExists(supervisorEmail) {
    try {
      const query = 'SELECT id, email, nombre, apellido FROM "Users" WHERE email = $1 AND activo = true';
      const result = await this.pool.query(query, [supervisorEmail]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error en checkSupervisorExists:', error);
      throw error;
    }
  }

  // Listar todos los usuarios (para administración)
  async listAllUsers() {
    try {
      const source = await this.resolveUserSource();
      if (source.type === 'custom') {
        const result = await this.pool.query(
          'SELECT id, email, nombre, apellido, activo, email_verificado, fecha_creacion FROM "Users" ORDER BY fecha_creacion DESC'
        );
        return result.rows;
      } else {
        const result = await this.pool.query(
          'SELECT id, email, raw_user_meta_data, email_confirmed_at, created_at FROM auth.users ORDER BY created_at DESC'
        );
        return result.rows.map(row => {
          const meta = row.raw_user_meta_data || {};
          return {
            id: row.id,
            email: row.email,
            nombre: meta.nombre || meta.first_name || null,
            apellido: meta.apellido || meta.last_name || null,
            activo: true,
            email_verificado: !!row.email_confirmed_at,
            fecha_creacion: row.created_at
          };
        });
      }
    } catch (error) {
      console.error('Error en listAllUsers:', error);
      throw error;
    }
  }

  // Desactivar usuario
  async deactivateUser(userId) {
    try {
      const query = `
        UPDATE "Users" 
        SET activo = false, fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, email, nombre, apellido
      `;
      const result = await this.pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en deactivateUser:', error);
      throw error;
    }
  }

  // Activar usuario
  async activateUser(userId) {
    try {
      const query = `
        UPDATE "Users" 
        SET activo = true, fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, email, nombre, apellido
      `;
      const result = await this.pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      console.error('Error en activateUser:', error);
      throw error;
    }
  }

  // Cerrar conexión
  async close() {
    await this.pool.end();
  }
}

export default AuthRepository;
