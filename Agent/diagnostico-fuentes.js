// Script para diagnosticar la tabla Fuentes
import DBConfig from '../DBConfig.js';
import pkg from 'pg';
const { Client } = pkg;

async function diagnosticarFuentes() {
  console.log('🔍 DIAGNÓSTICO DE LA TABLA FUENTES');
  console.log('=====================================\n');

  const client = new Client(DBConfig);
  
  try {
    await client.connect();
    console.log('✅ Conexión a la base de datos exitosa\n');

    // 1. Verificar si la tabla existe
    console.log('1️⃣ Verificando si la tabla Fuentes existe...');
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'Fuentes'
      );
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('❌ La tabla "Fuentes" NO existe en la base de datos');
      console.log('💡 Necesitas crear la tabla primero\n');
      
      // Mostrar cómo crear la tabla
      console.log('📝 Para crear la tabla, ejecuta este SQL:');
      console.log(`
CREATE TABLE "Fuentes" (
  id SERIAL PRIMARY KEY,
  "dominio" VARCHAR(255) UNIQUE NOT NULL,
  "categoria" VARCHAR(255),
  "activo" BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
      `);
      return;
    }
    
    console.log('✅ La tabla "Fuentes" existe\n');

    // 2. Verificar estructura de la tabla
    console.log('2️⃣ Verificando estructura de la tabla...');
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'Fuentes'
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Columnas encontradas:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });
    console.log('');

    // 3. Contar registros
    console.log('3️⃣ Contando registros...');
    const count = await client.query('SELECT COUNT(*) as total FROM "Fuentes"');
    const total = parseInt(count.rows[0].total);
    console.log(`📊 Total de fuentes: ${total}\n`);

    if (total === 0) {
      console.log('⚠️ La tabla está vacía');
      console.log('💡 Puedes agregar fuentes desde la página web o ejecutar este SQL:');
      console.log(`
INSERT INTO "Fuentes" ("dominio", "categoria", "activo") VALUES
('reuters.com', 'Internacional', true),
('bloomberg.com', 'Finanzas', true),
('techcrunch.com', 'Tecnología', true),
('elpais.com', 'Español', true);
      `);
    } else {
      // 4. Mostrar algunos registros
      console.log('4️⃣ Mostrando registros existentes...');
      const records = await client.query(`
        SELECT "dominio", "categoria", "activo", fecha_creacion
        FROM "Fuentes"
        ORDER BY fecha_creacion DESC
        LIMIT 5
      `);
      
      records.rows.forEach((row, index) => {
        console.log(`   ${index + 1}. ${row.dominio} (${row.categoria || 'Sin categoría'}) - ${row.activo ? 'Activo' : 'Inactivo'}`);
      });
    }

    console.log('\n📋 RESUMEN DEL DIAGNÓSTICO:');
    console.log('✅ Base de datos funcionando');
    console.log(`${tableExists.rows[0].exists ? '✅' : '❌'} Tabla Fuentes ${tableExists.rows[0].exists ? 'existe' : 'NO existe'}`);
    console.log(`📊 Registros: ${total}`);

  } catch (error) {
    console.error('❌ Error durante el diagnóstico:', error.message);
    console.error('🔍 Detalles:', error);
  } finally {
    await client.end();
  }
}

// Ejecutar diagnóstico
diagnosticarFuentes().catch(console.error);
