# API de Autenticación - ANTOMIA

## Descripción
Sistema completo de autenticación y recuperación de contraseñas para la plataforma ANTOMIA.

## Configuración Inicial

### 1. Variables de Entorno
Agrega las siguientes variables a tu archivo `.env`:

```env
# Configuración de Email para recuperación de contraseña
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=tu_email@gmail.com
EMAIL_PASSWORD=tu_app_password_aqui
EMAIL_FROM=tu_email@gmail.com

# Configuración de JWT para tokens
JWT_SECRET=tu_jwt_secret_muy_seguro_aqui
JWT_EXPIRES_IN=1h

# URL del frontend para enlaces de recuperación
FRONTEND_URL=https://solizra.github.io/ANTOMIA_Frontend
```

### 2. Configurar Base de Datos
Ejecuta el script de configuración:
```bash
# Windows
setup-auth-database.bat

# Linux/Mac
psql -U postgres -d climatetech_db -f auth-database-setup.sql
```

### 3. Configurar Email (Gmail)
1. Habilita la verificación en 2 pasos en tu cuenta de Google
2. Genera una "Contraseña de aplicación" específica para esta aplicación
3. Usa esa contraseña en la variable `EMAIL_PASSWORD`

## Endpoints Disponibles

### 1. Registrar Usuario
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "usuario@ejemplo.com",
  "password": "MiPassword123!",
  "confirmPassword": "MiPassword123!",
  "nombre": "Juan",
  "apellido": "Pérez"
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Usuario registrado exitosamente",
  "user": {
    "id": 1,
    "email": "usuario@ejemplo.com",
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

### 2. Iniciar Sesión
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "usuario@ejemplo.com",
  "password": "MiPassword123!"
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Autenticación exitosa",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "usuario@ejemplo.com",
    "nombre": "Juan",
    "apellido": "Pérez",
    "email_verificado": false
  }
}
```

### 3. Solicitar Recuperación de Contraseña
```http
POST /api/auth/forgot-password
Content-Type: application/json

{
  "email": "usuario@ejemplo.com"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Si el email está registrado, recibirás un enlace de recuperación"
}
```

### 4. Verificar Token de Recuperación
```http
GET /api/auth/verify-reset-token/{token}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "usuario@ejemplo.com",
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

### 5. Cambiar Contraseña (con token)
```http
POST /api/auth/reset-password
Content-Type: application/json

{
  "token": "abc123def456...",
  "newPassword": "NuevaPassword123!",
  "confirmPassword": "NuevaPassword123!"
}
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Contraseña actualizada exitosamente",
  "user": {
    "id": 1,
    "email": "usuario@ejemplo.com",
    "nombre": "Juan",
    "apellido": "Pérez"
  }
}
```

### 6. Cambiar Contraseña (usuario autenticado)
```http
POST /api/auth/change-password
Content-Type: application/json
Authorization: Bearer {jwt_token}

{
  "currentPassword": "PasswordActual123!",
  "newPassword": "NuevaPassword123!",
  "confirmPassword": "NuevaPassword123!"
}
```

### 7. Validar Fortaleza de Contraseña
```http
POST /api/auth/validate-password
Content-Type: application/json

{
  "password": "MiPassword123!"
}
```

**Respuesta:**
```json
{
  "success": true,
  "isValid": true,
  "errors": []
}
```

### 8. Limpiar Tokens Expirados
```http
POST /api/auth/cleanup-tokens
```

### 9. Verificar Estado del Servicio
```http
GET /api/auth/health
```

## Flujo de Recuperación de Contraseña

1. **Usuario solicita recuperación:**
   - Frontend envía POST a `/api/auth/forgot-password`
   - Sistema genera token seguro y lo guarda en BD
   - Se envía email con enlace de recuperación

2. **Usuario hace clic en enlace:**
   - Frontend verifica token con GET `/api/auth/verify-reset-token/{token}`
   - Si es válido, muestra formulario de nueva contraseña

3. **Usuario envía nueva contraseña:**
   - Frontend envía POST a `/api/auth/reset-password`
   - Sistema valida token, hashea nueva contraseña y la guarda
   - Se envía email de confirmación

## Validaciones de Contraseña

Las contraseñas deben cumplir:
- Mínimo 8 caracteres
- Al menos una letra mayúscula
- Al menos una letra minúscula
- Al menos un número
- Al menos un carácter especial (!@#$%^&*(),.?":{}|<>)

## Seguridad

- Tokens de recuperación expiran en 1 hora
- Contraseñas se hashean con bcrypt (12 salt rounds)
- Tokens se invalidan después de uso
- Emails de recuperación no revelan si el email existe
- Limpieza automática de tokens expirados

## Manejo de Errores

Todos los endpoints devuelven respuestas consistentes:

**Error:**
```json
{
  "success": false,
  "error": "Descripción del error"
}
```

**Éxito:**
```json
{
  "success": true,
  "message": "Descripción del éxito",
  "data": { ... }
}
```

## Usuario de Prueba

Se crea automáticamente un usuario de prueba:
- **Email:** admin@antomia.com
- **Password:** password123

## Notas Importantes

1. **Configuración de Email:** Asegúrate de configurar correctamente las credenciales de email
2. **JWT Secret:** Usa un secret fuerte y único en producción
3. **Frontend URL:** Actualiza la URL del frontend según tu entorno
4. **HTTPS:** En producción, usa HTTPS para todos los endpoints
5. **Rate Limiting:** Considera implementar rate limiting para prevenir abuso
