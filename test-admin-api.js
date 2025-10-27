/**
 * Script de prueba para la API de administración de usuarios
 * Este script prueba los nuevos endpoints de administración con validación de supervisor
 */

const apiUrl = 'https://antomia-backend.onrender.com/api/auth';

async function testAdminAPI() {
  console.log('🧪 Iniciando pruebas de API de Administración de Usuarios...\n');

  // Test 1: Verificar supervisor existente
  console.log('1️⃣ Test: Verificar supervisor existente');
  try {
    const supervisorResponse = await fetch(`${apiUrl}/verify-supervisor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supervisorEmail: 'admin@antomia.com' })
    });
    const supervisorData = await supervisorResponse.json();
    console.log('✅ Respuesta:', JSON.stringify(supervisorData, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 2: Intentar verificar supervisor inexistente
  console.log('\n2️⃣ Test: Verificar supervisor inexistente');
  try {
    const supervisorResponse = await fetch(`${apiUrl}/verify-supervisor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supervisorEmail: 'noexiste@antomia.com' })
    });
    const supervisorData = await supervisorResponse.json();
    console.log('✅ Respuesta esperada (error):', JSON.stringify(supervisorData, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 3: Registrar usuario con supervisor válido
  console.log('\n3️⃣ Test: Registrar usuario con supervisor válido');
  try {
    const timestamp = Date.now();
    const registerResponse = await fetch(`${apiUrl}/register-with-supervisor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `test${timestamp}@example.com`,
        password: 'Test123!@#',
        confirmPassword: 'Test123!@#',
        nombre: 'Test',
        apellido: 'User',
        supervisorEmail: 'admin@antomia.com'
      })
    });
    const registerData = await registerResponse.json();
    console.log('✅ Respuesta:', JSON.stringify(registerData, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 4: Listar todos los usuarios
  console.log('\n4️⃣ Test: Listar todos los usuarios');
  try {
    const usersResponse = await fetch(`${apiUrl}/users`);
    const usersData = await usersResponse.json();
    console.log('✅ Total de usuarios:', usersData.total);
    console.log('✅ Primeros usuarios:', JSON.stringify(usersData.users?.slice(0, 3), null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 5: Validar contraseña
  console.log('\n5️⃣ Test: Validar contraseña');
  try {
    const validateResponse = await fetch(`${apiUrl}/validate-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'Test123!@#' })
    });
    const validateData = await validateResponse.json();
    console.log('✅ Validación de contraseña:', JSON.stringify(validateData, null, 2));
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n✨ Pruebas completadas!');
}

// Ejecutar pruebas
testAdminAPI().catch(console.error);

