// Configuración de URLs para ANTOMIA Backend
// Similar al constants.js del frontend

// URL de producción (Render)
export const apiURL = 'https://antomia-backend.onrender.com';

// URL de desarrollo local (comentada por defecto)
// export const apiURL = 'http://localhost:3000';

// Función para obtener la URL del backend
export function getBackendUrl() {
  // Si hay una variable de entorno específica, usarla
  if (process.env.BACKEND_URL) {
    console.log(`🌐 Usando BACKEND_URL configurada: ${process.env.BACKEND_URL}`);
    return process.env.BACKEND_URL;
  }
  
  // Si hay una variable de entorno de API, usarla
  if (process.env.API_URL) {
    console.log(`🌐 Usando API_URL configurada: ${process.env.API_URL}`);
    return process.env.API_URL;
  }
  
  // Detectar si estamos en Render
  if (process.env.RENDER) {
    console.log(`🌐 Detectado entorno Render, usando: ${apiURL}`);
    return apiURL;
  }
  
  // Detectar si estamos en producción
  if (process.env.NODE_ENV === 'production' || (process.env.PORT && process.env.PORT !== '3000')) {
    console.log(`🌐 Detectado entorno de producción, usando: ${apiURL}`);
    return apiURL;
  }
  
  // Por defecto, usar localhost para desarrollo
  console.log(`🌐 Usando entorno local: http://localhost:3000`);
  return 'http://localhost:3000';
}

// URLs específicas para diferentes servicios
export const urls = {
  // URL base del backend
  backend: apiURL,
  
  // Endpoints específicos
  newsletter: `${apiURL}/api/Newsletter`,
  trends: `${apiURL}/api/Trends`,
  fuentes: `${apiURL}/api/Fuentes`,
  feedback: `${apiURL}/api/Feedback`,
  events: `${apiURL}/api/events`,
  health: `${apiURL}/api/health`,
  
  // Endpoints de análisis
  analizar: `${apiURL}/api/Newsletter/analizar`,
  searchNow: `${apiURL}/api/news/search-now`,
  importSubstack: `${apiURL}/api/newsletters/import-substack-now`
};

// Función para obtener URL dinámica basada en el entorno
export function getUrl(service = 'backend') {
  const baseUrl = getBackendUrl();
  
  if (service === 'backend') {
    return baseUrl;
  }
  
  return `${baseUrl}/api/${service}`;
}
