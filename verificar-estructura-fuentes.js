// Script para verificar estructura exacta de la tabla Fuentes
import DBConfig from './DBConfig.js';
import pkg from 'pg';
const { Client } = pkg;

async function verificarEstructuraFuentes() {
  const client = new Client(DBConfig);
  
  try {
    await client.connect();
    console.log('✅ Conectado a la BD');

    // Verificar estructura exacta
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'Fuentes'
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Estructura de la tabla Fuentes:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    console.log('');

    // Verificar algunos registros con todas las columnas
    const records = await client.query('SELECT * FROM "Fuentes" LIMIT 3');
    console.log('📊 Registros de ejemplo:');
    records.rows.forEach((row, index) => {
      console.log(`   ${index + 1}.`, row);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

verificarEstructuraFuentes();
