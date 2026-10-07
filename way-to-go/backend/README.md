# Way to Go API

El backend comparte servidor y PostgreSQL, con rutas y tablas separadas por módulo:

```text
backend/src/
├── index.js                 # servidor y montaje de módulos
├── shared/database/         # conexión PostgreSQL compartida
└── modules/
    ├── rastreo/             # GPS, camiones, alertas y WebSocket existentes
    ├── logistica/           # API TMS, permisos y esquema nuevos
    └── finanzas/            # espacio reservado, aún sin lógica
```

Rastreo conserva sus rutas históricas (`/api/trucks`, `/api/gps`, `/api/alerts`). Logística usa `/api/logistica`. Finanzas queda separada para trabajo posterior.

## Iniciar

```bash
cd backend
npm install
npm run dev
```

Configura las variables de `backend/.env.example` en `backend/.env`. El servidor utiliza PostgreSQL y escucha en `http://localhost:3001` por defecto. El SQL TMS es una instalación inicial de una sola ejecución; no lo ejecutes sobre tablas existentes. En este trabajo quedó copiado como referencia, pero no se aplicó a ninguna base.

## Next.js

La aplicación Next expone un proxy en `/api/logistica/*` que reenvía al backend Express. Por defecto usa `http://localhost:3001`; puedes cambiarlo con `LOGISTICA_BACKEND_URL` en el entorno del servidor Next. Rastreo conserva su conexión actual por `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_WS_URL`.

Consulta [modules/logistica/README.md](src/modules/logistica/README.md) para rutas, evidencias y permisos. Rastreo GPS continúa separado y no comparte tablas con el esquema `tms`.
