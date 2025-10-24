// Script de diagnóstico para verificar el estado de la base de datos
import fetch from 'node-fetch';
import { apiURL } from '../constants';

async function diagnosticarBD() {
  
  try {
    // 1. Verificar si el servidor está ejecutándose
    const response = await fetch(`${apiURL}/api/Newsletter?limit=1&page=1`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    
    if (!response.ok) {
      throw new Error(`Servidor no responde correctamente: ${response.status} ${response.statusText}`);
    }
    
    // 2. Verificar respuesta de la API
    const data = await response.json();
    
    if (Array.isArray(data)) {
      console.log(`📧 Total de newsletters: ${data.length}`);
      
      if (data.length > 0) {
        console.log('\n3️⃣ Estructura del primer newsletter:');
        const firstNL = data[0];
        console.log(`   Título: ${firstNL.titulo || 'Sin título'}`);
        console.log(`   Link: ${firstNL.link || 'Sin link'}`);
    
      } else {
        console.log('\n⚠️ PROBLEMA: No hay newsletters en la base de datos');
      }
    } else {

      console.log('📄 Contenido de la respuesta:', data);
    }
    
    const response2 = await fetch(`${apiURL}/api/Newsletter?limit=10000&page=1`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
      //limite alto
    if (response2.ok) {
      const data2 = await response2.json();
    } else {
      console.log(`❌ Error con límite alto: ${response2.status}`);
    }
    
    // 4. Resumen del diagnóstico
    console.log('\n📋 RESUMEN DEL BACK:');
    if (Array.isArray(data) && data.length > 0) {
      console.log('✅ Base de datos funcionando correctamente');
      console.log('✅ Hay newsletters disponibles');
      console.log('✅ API respondiendo correctamente');
    } else if (Array.isArray(data) && data.length === 0) {
      console.log('⚠️ Base de datos conectada pero sin newsletters');
      console.log('💡 Necesitas insertar datos de prueba');
    } else {
      console.log('❌ Problema con la estructura de datos');
    }
    
  } catch (error) {
    console.error('\n❌ ERROR EN EL DIAGNÓSTICO:', error.message);
  }
}

// Ejecutar diagnóstico
diagnosticarBD();
