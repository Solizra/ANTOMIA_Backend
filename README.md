## Estado del Backend y Control Manual

[![Backend](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fantomia-backend.onrender.com%2Fapi%2Fhealth&label=backend&query=%24.status&cacheSeconds=60)](#)
[![Run Auto-Update](https://img.shields.io/badge/Run-Auto--Update-blue?logo=githubactions)](../../actions/workflows/auto-update.yml)

- El badge "backend" lee `https://antomia-backend.onrender.com/api/health` y muestra su estado.
- El botón "Run Auto-Update" abre la página del workflow `auto-update.yml` para lanzarlo manualmente (botón "Run workflow").

## Notificaciones de nuevos Trends

- Configura los destinatarios fijos con la variable `TREND_ALERT_RECIPIENTS` (separados por comas). Si no se define, se usa `sassonindiana@gmail.com` como valor por defecto.
- Para personalizar el enlace de acceso rápido incluido en el correo puedes definir `TREND_ALERT_PAGE_BASE_URL` y, opcionalmente, `TREND_ALERT_PAGE_PATH` (por defecto `/trends`). Si no se configuran, se intenta construir el enlace con `FRONTEND_URL` y, como último recurso, se usa el link original del trend.
- Existe la variable `NEW_TREND_QUICK_LINK` si solo necesitas establecer un enlace fijo personalizado (tiene prioridad sobre los demás).


