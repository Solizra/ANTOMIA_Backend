# Ejemplos de Frontend para Recuperación de Contraseña - ANTOMIA

## Configuración para tu Frontend

Tu frontend está en: **https://solizra.github.io/ANTOMIA_Frontend**

El enlace de recuperación será: **https://solizra.github.io/ANTOMIA_Frontend/change-password?token=ABC123...**

## 1. Página de "Olvidé mi Contraseña"

```html
<!-- forgot-password.html -->
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recuperar Contraseña - ANTOMIA</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
        }
        .logo {
            text-align: center;
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 30px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            color: #555;
            font-weight: 500;
        }
        input[type="email"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input[type="email"]:focus {
            outline: none;
            border-color: #3498db;
        }
        .btn {
            width: 100%;
            padding: 12px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        .btn:hover {
            background: #2980b9;
        }
        .btn:disabled {
            background: #bdc3c7;
            cursor: not-allowed;
        }
        .message {
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
            text-align: center;
        }
        .success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .back-link {
            text-align: center;
            margin-top: 20px;
        }
        .back-link a {
            color: #3498db;
            text-decoration: none;
        }
        .back-link a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">ANTOMIA</div>
        
        <div id="message" class="message" style="display: none;"></div>
        
        <form id="forgotPasswordForm">
            <div class="form-group">
                <label for="email">Email:</label>
                <input type="email" id="email" name="email" required>
            </div>
            
            <button type="submit" class="btn" id="submitBtn">
                Enviar Enlace de Recuperación
            </button>
        </form>
        
        <div class="back-link">
            <a href="login.html">← Volver al Login</a>
        </div>
    </div>

    <script>
        // IMPORTANTE: Cambia esta URL por la de tu backend
        const API_BASE_URL = 'https://tu-backend-url.com/api/auth';
        
        document.getElementById('forgotPasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const submitBtn = document.getElementById('submitBtn');
            const messageDiv = document.getElementById('message');
            
            // Deshabilitar botón y mostrar loading
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';
            
            try {
                const response = await fetch(`${API_BASE_URL}/forgot-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ email })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage(data.message, 'success');
                    document.getElementById('forgotPasswordForm').reset();
                } else {
                    showMessage(data.error || 'Error enviando solicitud', 'error');
                }
            } catch (error) {
                showMessage('Error de conexión. Intenta nuevamente.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Enviar Enlace de Recuperación';
            }
        });
        
        function showMessage(text, type) {
            const messageDiv = document.getElementById('message');
            messageDiv.textContent = text;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            
            // Ocultar mensaje después de 5 segundos
            setTimeout(() => {
                messageDiv.style.display = 'none';
            }, 5000);
        }
    </script>
</body>
</html>
```

## 2. Página de Cambiar Contraseña (change-password.html)

Esta es la página que debe estar en tu frontend en la ruta `/change-password`:

```html
<!-- change-password.html -->
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cambiar Contraseña - ANTOMIA</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 15px 35px rgba(0,0,0,0.1);
            width: 100%;
            max-width: 400px;
        }
        .logo {
            text-align: center;
            font-size: 28px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 30px;
        }
        .user-info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            text-align: center;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            color: #555;
            font-weight: 500;
        }
        input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        input[type="password"]:focus {
            outline: none;
            border-color: #3498db;
        }
        .password-strength {
            margin-top: 5px;
            font-size: 12px;
        }
        .strength-weak { color: #e74c3c; }
        .strength-medium { color: #f39c12; }
        .strength-strong { color: #27ae60; }
        .btn {
            width: 100%;
            padding: 12px;
            background: #3498db;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        .btn:hover {
            background: #2980b9;
        }
        .btn:disabled {
            background: #bdc3c7;
            cursor: not-allowed;
        }
        .message {
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 20px;
            text-align: center;
        }
        .success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .requirements {
            background: #e9ecef;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        .requirements ul {
            margin: 0;
            padding-left: 20px;
        }
        .requirements li {
            margin-bottom: 5px;
        }
        .requirement-met {
            color: #27ae60;
        }
        .requirement-not-met {
            color: #e74c3c;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">ANTOMIA</div>
        
        <div id="message" class="message" style="display: none;"></div>
        
        <div id="userInfo" class="user-info" style="display: none;">
            <strong>Cambiando contraseña para:</strong><br>
            <span id="userEmail"></span>
        </div>
        
        <div class="requirements">
            <strong>Requisitos de contraseña:</strong>
            <ul>
                <li id="req-length">Mínimo 8 caracteres</li>
                <li id="req-uppercase">Al menos una letra mayúscula</li>
                <li id="req-lowercase">Al menos una letra minúscula</li>
                <li id="req-number">Al menos un número</li>
                <li id="req-special">Al menos un carácter especial</li>
            </ul>
        </div>
        
        <form id="changePasswordForm">
            <div class="form-group">
                <label for="newPassword">Nueva Contraseña:</label>
                <input type="password" id="newPassword" name="newPassword" required>
                <div id="passwordStrength" class="password-strength"></div>
            </div>
            
            <div class="form-group">
                <label for="confirmPassword">Confirmar Contraseña:</label>
                <input type="password" id="confirmPassword" name="confirmPassword" required>
            </div>
            
            <button type="submit" class="btn" id="submitBtn">
                Cambiar Contraseña
            </button>
        </form>
    </div>

    <script>
        // IMPORTANTE: Cambia esta URL por la de tu backend
        const API_BASE_URL = 'https://tu-backend-url.com/api/auth';
        
        // Obtener token de la URL
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        if (!token) {
            showMessage('Token de recuperación no válido', 'error');
        } else {
            // Verificar token al cargar la página
            verifyToken();
        }
        
        async function verifyToken() {
            try {
                const response = await fetch(`${API_BASE_URL}/verify-reset-token/${token}`);
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('userEmail').textContent = data.user.email;
                    document.getElementById('userInfo').style.display = 'block';
                } else {
                    showMessage('Token inválido o expirado', 'error');
                }
            } catch (error) {
                showMessage('Error verificando token', 'error');
            }
        }
        
        // Validar contraseña en tiempo real
        document.getElementById('newPassword').addEventListener('input', function() {
            validatePassword(this.value);
        });
        
        function validatePassword(password) {
            const requirements = {
                length: password.length >= 8,
                uppercase: /[A-Z]/.test(password),
                lowercase: /[a-z]/.test(password),
                number: /\d/.test(password),
                special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
            };
            
            // Actualizar indicadores visuales
            document.getElementById('req-length').className = requirements.length ? 'requirement-met' : 'requirement-not-met';
            document.getElementById('req-uppercase').className = requirements.uppercase ? 'requirement-met' : 'requirement-not-met';
            document.getElementById('req-lowercase').className = requirements.lowercase ? 'requirement-met' : 'requirement-not-met';
            document.getElementById('req-number').className = requirements.number ? 'requirement-met' : 'requirement-not-met';
            document.getElementById('req-special').className = requirements.special ? 'requirement-met' : 'requirement-not-met';
            
            // Mostrar fortaleza de contraseña
            const strengthDiv = document.getElementById('passwordStrength');
            const metCount = Object.values(requirements).filter(Boolean).length;
            
            if (metCount < 3) {
                strengthDiv.textContent = 'Contraseña débil';
                strengthDiv.className = 'password-strength strength-weak';
            } else if (metCount < 5) {
                strengthDiv.textContent = 'Contraseña media';
                strengthDiv.className = 'password-strength strength-medium';
            } else {
                strengthDiv.textContent = 'Contraseña fuerte';
                strengthDiv.className = 'password-strength strength-strong';
            }
        }
        
        document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const newPassword = document.getElementById('newPassword').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const submitBtn = document.getElementById('submitBtn');
            
            if (newPassword !== confirmPassword) {
                showMessage('Las contraseñas no coinciden', 'error');
                return;
            }
            
            // Deshabilitar botón y mostrar loading
            submitBtn.disabled = true;
            submitBtn.textContent = 'Cambiando...';
            
            try {
                const response = await fetch(`${API_BASE_URL}/reset-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        token: token,
                        newPassword: newPassword,
                        confirmPassword: confirmPassword
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    showMessage('¡Contraseña cambiada exitosamente! Redirigiendo al login...', 'success');
                    setTimeout(() => {
                        window.location.href = '/login';
                    }, 3000);
                } else {
                    showMessage(data.error || 'Error cambiando contraseña', 'error');
                }
            } catch (error) {
                showMessage('Error de conexión. Intenta nuevamente.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Cambiar Contraseña';
            }
        });
        
        function showMessage(text, type) {
            const messageDiv = document.getElementById('message');
            messageDiv.textContent = text;
            messageDiv.className = `message ${type}`;
            messageDiv.style.display = 'block';
            
            // Ocultar mensaje después de 5 segundos (excepto para éxito)
            if (type !== 'success') {
                setTimeout(() => {
                    messageDiv.style.display = 'none';
                }, 5000);
            }
        }
    </script>
</body>
</html>
```

## 3. Configuración para tu Frontend

### Variables que necesitas cambiar:

1. **En el archivo `change-password.html`:**
   ```javascript
   const API_BASE_URL = 'https://tu-backend-url.com/api/auth';
   ```
   Cambia `tu-backend-url.com` por la URL real de tu backend.

2. **En el archivo `forgot-password.html`:**
   ```javascript
   const API_BASE_URL = 'https://tu-backend-url.com/api/auth';
   ```
   Cambia `tu-backend-url.com` por la URL real de tu backend.

### Estructura de archivos en tu frontend:

```
ANTOMIA_Frontend/
├── index.html
├── login.html
├── forgot-password.html
├── change-password.html  ← Esta es la página importante
└── assets/
    ├── css/
    └── js/
```

## 4. Flujo Completo

1. **Usuario hace clic en "Olvidé mi contraseña"** → Va a `forgot-password.html`
2. **Usuario ingresa su email** → Se envía POST a `/api/auth/forgot-password`
3. **Sistema envía email** con enlace: `https://solizra.github.io/ANTOMIA_Frontend/change-password?token=ABC123...`
4. **Usuario hace clic en el enlace** → Va a `change-password.html`
5. **Usuario ingresa nueva contraseña** → Se envía POST a `/api/auth/reset-password`
6. **Contraseña se actualiza** → Usuario es redirigido al login

## 5. Notas Importantes

- ✅ El enlace del email ya está configurado para apuntar a tu frontend
- ✅ La ruta es `/change-password` como solicitaste
- ✅ Solo necesitas cambiar la URL del backend en los archivos HTML
- ✅ El token se pasa como parámetro en la URL
- ✅ La página valida el token antes de mostrar el formulario

¡Ya está todo configurado para que funcione con tu frontend en GitHub Pages! 🎉
