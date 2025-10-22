// Script simple para verificar la tabla Fuentes
import DBConfig from './DBConfig.js';
import pkg from 'pg';
const { Client } = pkg;

async function verificarFuentes() {
  const client = new Client(DBConfig);
  
  try {
    await client.connect();
    console.log('✅ Conectado a la BD');

    // Verificar si la tabla existe
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'Fuentes'
      );
    `);
    
    console.log('Tabla Fuentes existe:', tableCheck.rows[0].exists);

    if (tableCheck.rows[0].exists) {
      // Contar registros
      const count = await client.query('SELECT COUNT(*) FROM "Fuentes"');
      console.log('Total de registros:', count.rows[0].count);
      
      // Mostrar registros
      const records = await client.query('SELECT * FROM "Fuentes" LIMIT 5');
      console.log('Registros:', records.rows);
    } else {
      console.log('❌ La tabla Fuentes NO existe');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

verificarFuentes();
