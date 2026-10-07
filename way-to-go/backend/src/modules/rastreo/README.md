# Módulo Rastreo GPS

Este directorio conserva el backend GPS existente, agrupado por módulo para separar su responsabilidad de Logística / TMS.

- `routes/`: autenticación existente, camiones, posiciones GPS y alertas.
- `websocket/`: actualizaciones GPS y conexión en tiempo real.
- `database/schema.sql`: tablas GPS originales.

La lógica de estas rutas no forma parte del trabajo de Logística. El servidor común de `src/index.js` registra sus rutas existentes y las nuevas rutas bajo prefijos distintos.
