# API de Administración de Usuarios - ANTOMIA

## Descripción

Sistema completo de administración de usuarios con verificación de supervisor para la plataforma ANTOMIA. Permite agregar usuarios nuevos con validación de que el supervisor existe en la base de datos y asegura que las contraseñas se almacenan de forma segura.

## Endpoints Disponibles

### 1. Verificar Supervisor
Verifica que un email de supervisor existe en la base de datos antes de agregar nuevos usuarios.

**Endpoint:** `POST /api/auth/verify-supervisor`

**Request Body:**
```json
{
  "supervisorEmail": "supervisor@antomia.com"
}
```

**Response (Éxito):**
```json
{
  "success": true,
  "supervisor": {
    "id": 1,
    "email": "supervisor@antomia.com",
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "El supervisor especificado no existe en la base de datos"
}
```

### 2. Registrar Usuario con Validación de Supervisor
Registra un nuevo usuario validando primero que el supervisor existe. La contraseña se hashea de forma segura antes de almacenarse.

**Endpoint:** `POST /api/auth/register-with-supervisor`

**Request Body:**
```json
{
  "email": "nuevo@example.com",
  "password": "Password123!",
  "confirmPassword": "Password123!",
  "nombre": "Carlos",
  "apellido": "García",
  "supervisorEmail": "supervisor@antomia.com"
}
```

**Validaciones de Contraseña:**
- Mínimo 8 caracteres
- Al menos una letra mayúscula
- Al menos una letra minúscula
- Al menos un número
- Al menos un carácter especial

**Response (Éxito):**
```json
{
  "success": true,
  "message": "Usuario registrado exitosamente con contraseña segura",
  "user": {
    "id": 5,
    "email": "nuevo@example.com",
    "nombre": "Carlos",
    "apellido": "García"
  },
  "supervisorVerified": true
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "El supervisor especificado no existe en la base de datos"
}
```

### 3. Listar Todos los Usuarios
Obtiene una lista de todos los usuarios registrados en el sistema.

**Endpoint:** `GET /api/auth/users`

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": 1,
      "email": "admin@antomia.com",
      "nombre": "Admin",
      "apellido": "Antomia",
      "activo": true,
      "email_verificado": true,
      "fecha_creacion": "2024-01-15T10:30:00.000Z"
    },
    {
      "id": 2,
      "email": "supervisor@antomia.com",
      "nombre": "Juan",
      "apellido": "Pérez",
      "activo": true,
      "email_verificado": false,
      "fecha_creacion": "2024-01-20T14:20:00.000Z"
    }
  ],
  "total": 2
}
```

### 4. Desactivar Usuario
Desactiva un usuario en el sistema.

**Endpoint:** `POST /api/auth/users/:userId/deactivate`

**Response:**
```json
{
  "success": true,
  "message": "Usuario desactivado exitosamente",
  "user": {
    "id": 2,
    "email": "usuario@example.com",
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

### 5. Activar Usuario
Activa un usuario que estaba desactivado.

**Endpoint:** `POST /api/auth/users/:userId/activate`

**Response:**
```json
{
  "success": true,
  "message": "Usuario activado exitosamente",
  "user": {
    "id": 2,
    "email": "usuario@example.com",
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

## Ejemplo de Uso Completo en Frontend

```javascript
// Paso 1: Verificar supervisor
async function verifySupervisor(supervisorEmail) {
  const response = await fetch('https://antomia-backend.onrender.com/api/auth/verify-supervisor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      supervisorEmail: supervisorEmail
    })
  });
  return await response.json();
}

// Paso 2: Registrar usuario con validación
async function registerUserWithSupervisor(userData, supervisorEmail) {
  const response = await fetch('https://antomia-backend.onrender.com/api/auth/register-with-supervisor', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: userData.email,
      password: userData.password,
      confirmPassword: userData.confirmPassword,
      nombre: userData.nombre,
      apellido: userData.apellido,
      supervisorEmail: supervisorEmail
    })
  });
  return await response.json();
}

// Ejemplo de uso
async function addNewUser() {
  try {
    // 1. Verificar supervisor
    const supervisorCheck = await verifySupervisor('supervisor@antomia.com');
    
    if (!supervisorCheck.success) {
      alert('Error: ' + supervisorCheck.error);
      return;
    }
    
    console.log('Supervisor verificado:', supervisorCheck.supervisor);
    
    // 2. Registrar nuevo usuario
    const newUser = {
      email: 'nuevo@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      nombre: 'Carlos',
      apellido: 'García'
    };
    
    const result = await registerUserWithSupervisor(newUser, 'supervisor@antomia.com');
    
    if (result.success) {
      console.log('Usuario creado exitosamente:', result.user);
      alert('Usuario agregado exitosamente!');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('Error al agregar usuario');
  }
}
```

## Ejemplo HTML

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Administración de Usuarios - ANTOMIA</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
        }
        input {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 5px;
            box-sizing: border-box;
        }
        button {
            background: #007bff;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background: #0056b3;
        }
        .success {
            color: #28a745;
            margin-top: 10px;
        }
        .error {
            color: #dc3545;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <h1>Administración de Usuarios - ANTOMIA</h1>
    
    <form id="userForm">
        <div class="form-group">
            <label>Email del Supervisor:</label>
            <input type="email" id="supervisorEmail" required 
                   placeholder="supervisor@antomia.com">
        </div>
        
        <div class="form-group">
            <label>Email del Nuevo Usuario:</label>
            <input type="email" id="userEmail" required 
                   placeholder="usuario@example.com">
        </div>
        
        <div class="form-group">
            <label>Nombre:</label>
            <input type="text" id="nombre" required 
                   placeholder="Juan">
        </div>
        
        <div class="form-group">
            <label>Apellido:</label>
            <input type="text" id="apellido" required 
                   placeholder="Pérez">
        </div>
        
        <div class="form-group">
            <label>Contraseña:</label>
            <input type="password" id="password" required 
                   placeholder="Password123!">
        </div>
        
        <div class="form-group">
            <label>Confirmar Contraseña:</label>
            <input type="password" id="confirmPassword" required 
                   placeholder="Password123!">
        </div>
        
        <button type="submit">Agregar Usuario</button>
        
        <div id="message"></div>
    </form>

    <script>
        document.getElementById('userForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const messageDiv = document.getElementById('message');
            messageDiv.innerHTML = '';
            
            const supervisorEmail = document.getElementById('supervisorEmail').value;
            const email = document.getElementById('userEmail').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const nombre = document.getElementById('nombre').value;
            const apellido = document.getElementById('apellido').value;
            
            try {
                // Verificar supervisor
                const supervisorCheck = await fetch('https://antomia-backend.onrender.com/api/auth/verify-supervisor', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ supervisorEmail })
                });
                
                const supervisorData = await supervisorCheck.json();
                
                if (!supervisorData.success) {
                    messageDiv.innerHTML = `<p class="error">Error: ${supervisorData.error}</p>`;
                    return;
                }
                
                // Registrar usuario
                const response = await fetch('https://antomia-backend.onrender.com/api/auth/register-with-supervisor', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email,
                        password,
                        confirmPassword,
                        nombre,
                        apellido,
                        supervisorEmail
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    messageDiv.innerHTML = `<p class="success">✅ Usuario agregado exitosamente! ID: ${result.user.id}</p>`;
                    document.getElementById('userForm').reset();
                } else {
                    messageDiv.innerHTML = `<p class="error">Error: ${result.error}</p>`;
                }
            } catch (error) {
                messageDiv.innerHTML = `<p class="error">Error de conexión: ${error.message}</p>`;
            }
        });
    </script>
</body>
</html>
```

## Estructura de Base de Datos

Los usuarios se almacenan en la tabla `Users` con la siguiente estructura:

```sql
CREATE TABLE IF NOT EXISTS "Users" (
    "id" SERIAL PRIMARY KEY,
    "email" VARCHAR(255) UNIQUE NOT NULL,
    "password" VARCHAR(255) NOT NULL,  -- Hasheado con bcrypt
    "nombre" VARCHAR(100),
    "apellido" VARCHAR(100),
    "activo" BOOLEAN DEFAULT TRUE,
    "email_verificado" BOOLEAN DEFAULT FALSE,
    "fecha_creacion" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Seguridad

- Las contraseñas se hashean usando bcrypt con 12 rounds
- Validación de formato de email
- Validación de fortaleza de contraseña
- Verificación de supervisor antes de crear usuarios
- Los usuarios pueden ser activados/desactivados

## Notas Importantes

1. **Supervisor Requerido**: Todos los usuarios nuevos deben ser agregados por un supervisor existente
2. **Contraseñas Seguras**: Las contraseñas deben cumplir con los requisitos de seguridad mínimos
3. **Email Único**: No se pueden registrar dos usuarios con el mismo email
4. **Usuarios Inactivos**: Los usuarios inactivos no pueden iniciar sesión

