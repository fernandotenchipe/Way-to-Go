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

## Usuario TMS temporal para pruebas locales

Ejecuta manualmente en Supabase el archivo [local_tms_dev_user.sql](src/modules/logistica/database/manual/local_tms_dev_user.sql). El script reutiliza `tms.usuarios`, roles y permisos; se puede repetir sin duplicar registros. No crea una cuenta en `auth.users`, no instala un inicio de sesión y no concede permisos de timbrado o cancelación. Si alguna clave de permiso aún no existe, detiene la transacción para que se revise el esquema.

En `backend/.env` configura:

```dotenv
NODE_ENV=development
LOGISTICA_AUTH_DISABLED=false
LOGISTICA_LOCAL_TMS_ACCESS=true
LOGISTICA_LOCAL_TMS_USER_EMAIL=dev.tms.local@example.invalid
FRONTEND_URL=http://127.0.0.1:3000
PORT=3001
```

El correo debe coincidir con `dev_email` del SQL. Conserva las variables `DB_*` habituales. Reinicia el backend después de cambiar `.env`. Con este modo, Express solo escucha en `127.0.0.1`; rechaza conexiones no locales y utiliza el UUID y los permisos efectivos del usuario TMS. No se activa en producción ni puede combinarse con `LOGISTICA_AUTH_DISABLED=true`.

En el frontend configura `LOGISTICA_BACKEND_URL=http://127.0.0.1:3001` y ejecútalo también ligado a loopback (`npm run dev -- --hostname 127.0.0.1` o `npm run start -- --hostname 127.0.0.1`). El proxy Next reenvía solicitudes al backend desde la máquina local; por eso **no expongas el frontend ni uses un túnel o proxy público mientras este modo esté activo**.

Para comprobar la sesión, abre `http://127.0.0.1:3000/logistica/flota` y consulta `/api/logistica/session` desde el mismo origen. Debe devolver `validActor: true`, `canEditFleet: true` y `demoFleetOnly: false`. Luego prueba el alta de caja, su asignación desde Viajes y la carga y descarga de documentos. Esas operaciones aún requieren que el SQL haya sido aplicado manualmente y que PostgreSQL esté accesible.
