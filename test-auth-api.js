import fetch from 'node-fetch';

const API_BASE_URL = 'http://localhost:3000/api/auth';

// Colores para console
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testAPI() {
  log('\n🧪 INICIANDO PRUEBAS DE API DE AUTENTICACIÓN', 'blue');
  log('=' .repeat(50), 'blue');

  const testEmail = 'test@antomia.com';
  const testPassword = 'TestPassword123!';
  let resetToken = '';

  try {
    // 1. Probar registro de usuario
    log('\n1️⃣ Probando registro de usuario...', 'yellow');
    try {
      const registerResponse = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword,
          confirmPassword: testPassword,
          nombre: 'Test',
          apellido: 'User'
        })
      });
      
      const registerData = await registerResponse.json();
      if (registerData.success) {
        log('✅ Registro exitoso', 'green');
      } else {
        log(`⚠️ Registro falló: ${registerData.error}`, 'yellow');
      }
    } catch (error) {
      log(`❌ Error en registro: ${error.message}`, 'red');
    }

    // 2. Probar login
    log('\n2️⃣ Probando login...', 'yellow');
    try {
      const loginResponse = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: testEmail,
          password: testPassword
        })
      });
      
      const loginData = await loginResponse.json();
      if (loginData.success) {
        log('✅ Login exitoso', 'green');
        log(`   Token: ${loginData.token.substring(0, 20)}...`, 'blue');
      } else {
        log(`❌ Login falló: ${loginData.error}`, 'red');
      }
    } catch (error) {
      log(`❌ Error en login: ${error.message}`, 'red');
    }

    // 3. Probar solicitud de recuperación de contraseña
    log('\n3️⃣ Probando solicitud de recuperación...', 'yellow');
    try {
      const forgotResponse = await fetch(`${API_BASE_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail })
      });
      
      const forgotData = await forgotResponse.json();
      if (forgotData.success) {
        log('✅ Solicitud de recuperación enviada', 'green');
        log(`   Mensaje: ${forgotData.message}`, 'blue');
      } else {
        log(`❌ Solicitud falló: ${forgotData.error}`, 'red');
      }
    } catch (error) {
      log(`❌ Error en solicitud: ${error.message}`, 'red');
    }

    // 4. Probar validación de contraseña
    log('\n4️⃣ Probando validación de contraseña...', 'yellow');
    try {
      const validateResponse = await fetch(`${API_BASE_URL}/validate-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'Weak123' })
      });
      
      const validateData = await validateResponse.json();
      if (validateData.success) {
        log('✅ Validación de contraseña funcionando', 'green');
        log(`   Es válida: ${validateData.isValid}`, 'blue');
        if (validateData.errors.length > 0) {
          log(`   Errores: ${validateData.errors.join(', ')}`, 'yellow');
        }
      } else {
        log(`❌ Validación falló: ${validateData.error}`, 'red');
      }
    } catch (error) {
      log(`❌ Error en validación: ${error.message}`, 'red');
    }

    // 5. Probar health check
    log('\n5️⃣ Probando health check...', 'yellow');
    try {
      const healthResponse = await fetch(`${API_BASE_URL}/health`);
      const healthData = await healthResponse.json();
      if (healthData.success) {
        log('✅ Health check exitoso', 'green');
        log(`   Servicios: ${Object.keys(healthData.services).join(', ')}`, 'blue');
      } else {
        log(`❌ Health check falló: ${healthData.error}`, 'red');
      }
    } catch (error) {
      log(`❌ Error en health check: ${error.message}`, 'red');
    }

    // 6. Probar limpieza de tokens
    log('\n6️⃣ Probando limpieza de tokens...', 'yellow');
    try {
      const cleanupResponse = await fetch(`${API_BASE_URL}/cleanup-tokens`, {
        method: 'POST'
      });
      
      const cleanupData = await cleanupResponse.json();
      if (cleanupData.success) {
        log('✅ Limpieza de tokens exitosa', 'green');
        log(`   Tokens eliminados: ${cleanupData.deletedCount}`, 'blue');
      } else {
        log(`❌ Limpieza falló: ${cleanupData.error}`, 'red');
      }
    } catch (error) {
      log(`❌ Error en limpieza: ${error.message}`, 'red');
    }

    log('\n🎉 PRUEBAS COMPLETADAS', 'green');
    log('=' .repeat(50), 'green');
    
    log('\n📋 PRÓXIMOS PASOS:', 'blue');
    log('1. Configura las variables de entorno en .env', 'yellow');
    log('2. Ejecuta setup-auth-database.bat para configurar la BD', 'yellow');
    log('3. Inicia el servidor con: npm start', 'yellow');
    log('4. Prueba los endpoints con Postman o el frontend', 'yellow');
    log('5. Revisa la documentación en docs/AUTH_API_USAGE.md', 'yellow');

  } catch (error) {
    log(`\n❌ ERROR GENERAL: ${error.message}`, 'red');
  }
}

// Ejecutar pruebas
testAPI();
