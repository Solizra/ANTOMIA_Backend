# 📋 Uso de Constants.js en el Backend

El archivo `constants.js` centraliza la configuración de URLs del backend, similar al `constants.js` del frontend.

## 🎯 Cómo Usar

### **Importar las constantes**
```javascript
import { apiURL, getBackendUrl, urls } from '../constants.js';
```

### **Usar URL fija**
```javascript
// Usar la URL de producción directamente
const response = await fetch(`${apiURL}/api/Newsletter`);
```

### **Usar URL dinámica**
```javascript
// Detectar automáticamente el entorno
const baseUrl = getBackendUrl();
const response = await fetch(`${baseUrl}/api/Newsletter`);
```

### **Usar URLs predefinidas**
```javascript
// Usar URLs específicas
const response = await fetch(urls.newsletter);
const eventsUrl = urls.events;
```

## 🔧 Configuración

### **Para Desarrollo Local**
```javascript
// En constants.js, comentar la línea de producción y descomentar local:
// export const apiURL = 'https://antomia-backend.onrender.com';
export const apiURL = 'http://localhost:3000';
```

### **Para Producción (Render)**
```javascript
// En constants.js, usar la URL de producción:
export const apiURL = 'https://antomia-backend.onrender.com';
// export const apiURL = 'http://localhost:3000';
```

## 📝 Ejemplos de Uso

### **En Agent/main.js**
```javascript
import { getBackendUrl } from '../constants.js';

// Obtener newsletters
const baseUrl = getBackendUrl();
const response = await fetch(`${baseUrl}/api/Newsletter?limit=10000&page=1`);
```

### **En APIs/buscarNoticias.mjs**
```javascript
import { urls } from '../constants.js';

// Usar endpoint específico
const response = await fetch(urls.searchNow, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
});
```

### **En APIs/importSubstack.mjs**
```javascript
import { getBackendUrl } from '../constants.js';

// Importar newsletter
const baseUrl = getBackendUrl();
const response = await fetch(`${baseUrl}/api/Newsletter/import-fast`, {
  method: 'POST',
  body: JSON.stringify({ link, titulo })
});
```

## 🔄 Detección Automática

La función `getBackendUrl()` detecta automáticamente el entorno:

1. **Variables de entorno específicas** (`BACKEND_URL`, `API_URL`)
2. **Detección de Render** (`RENDER=true`)
3. **Detección de producción** (`NODE_ENV=production`)
4. **Fallback a localhost** para desarrollo

## 📊 URLs Disponibles

```javascript
import { urls } from '../constants.js';

console.log(urls.backend);        // https://antomia-backend.onrender.com
console.log(urls.newsletter);    // https://antomia-backend.onrender.com/api/Newsletter
console.log(urls.trends);         // https://antomia-backend.onrender.com/api/Trends
console.log(urls.events);         // https://antomia-backend.onrender.com/api/events
console.log(urls.health);         // https://antomia-backend.onrender.com/api/health
```

## 🚀 Ventajas

- ✅ **Consistencia** con el frontend
- ✅ **Detección automática** del entorno
- ✅ **URLs centralizadas** y fáciles de cambiar
- ✅ **Fallback robusto** a base de datos
- ✅ **Logs informativos** para debugging
