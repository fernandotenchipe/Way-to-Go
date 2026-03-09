# Scripts Útiles para Way to Go

Este archivo contiene comandos útiles para el desarrollo y mantenimiento del proyecto.

## 🚀 Desarrollo

### Iniciar todo el proyecto (Backend + Frontend)

**PowerShell:**
```powershell
# Terminal 1 - Backend
cd backend; npm run dev

# Terminal 2 - Frontend (en otra terminal)
npm run dev
```

**Bash (Git Bash / WSL):**
```bash
# Iniciar backend en background
cd backend && npm run dev &

# Iniciar frontend
cd .. && npm run dev
```

## 🗄️ Base de Datos

### Recrear base de datos desde cero
```powershell
# Eliminar y recrear
dropdb -U postgres fleet_tracking
createdb -U postgres fleet_tracking
psql -U postgres -d fleet_tracking -c "CREATE EXTENSION postgis;"
psql -U postgres -d fleet_tracking -f backend/src/database/schema.sql
```

### Backup de base de datos
```powershell
# Crear backup
pg_dump -U postgres fleet_tracking > backup_$(Get-Date -Format "yyyyMMdd_HHmmss").sql

# Restaurar backup
psql -U postgres fleet_tracking < backup_20260309_120000.sql
```

### Ver datos en DB
```sql
-- Conectar
psql -U postgres -d fleet_tracking

-- Ver todos los camiones
SELECT * FROM trucks;

-- Ver últimas posiciones GPS
SELECT t.plate, gp.latitude, gp.longitude, gp.speed, gp.created_at
FROM gps_positions gp
JOIN gps_devices gd ON gp.device_id = gd.id
JOIN trucks t ON gd.truck_id = t.id
ORDER BY gp.created_at DESC
LIMIT 10;

-- Ver alertas activas
SELECT a.*, t.plate FROM alerts a
JOIN trucks t ON a.truck_id = t.id
WHERE a.status = 'active';
```

## 📦 Dependencias

### Actualizar dependencias
```powershell
# Frontend
npm update

# Backend
cd backend; npm update
```

### Verificar dependencias obsoletas
```powershell
npm outdated
```

## 🧪 Testing

### Probar endpoints de API

**Login:**
```powershell
curl -X POST http://localhost:3001/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"admin@example.com\",\"password\":\"admin123\"}'
```

**Obtener camiones:**
```powershell
curl http://localhost:3001/api/trucks
```

**Enviar posición GPS:**
```powershell
curl -X POST http://localhost:3001/api/gps/position `
  -H "Content-Type: application/json" `
  -d '{\"imei\":\"123456789012345\",\"latitude\":51.505,\"longitude\":-0.09,\"speed\":60}'
```

**Crear alerta:**
```powershell
curl -X POST http://localhost:3001/api/alerts `
  -H "Content-Type: application/json" `
  -d '{\"truck_id\":1,\"type\":\"speed_limit\",\"description\":\"Exceso de velocidad\",\"severity\":\"high\"}'
```

## 🔧 Mantenimiento

### Limpiar node_modules
```powershell
# Frontend
rm -r node_modules; npm install

# Backend
cd backend; rm -r node_modules; npm install
```

### Limpiar cache de Next.js
```powershell
rm -r .next
npm run dev
```

## 📊 Monitoreo

### Ver logs del backend
Los logs se muestran en la terminal donde corre `npm run dev`

### Ver logs de PostgreSQL (Windows)
```powershell
# Ubicación típica
Get-Content "C:\Program Files\PostgreSQL\14\data\log\*.log" -Tail 50
```

## 🚢 Deploy

### Build para producción

**Frontend:**
```powershell
npm run build
npm run start
```

**Backend:**
```powershell
cd backend
$env:NODE_ENV="production"; node src/index.js
```

### Variables de entorno para producción

**Backend (.env):**
```env
NODE_ENV=production
PORT=3001
DB_HOST=tu-servidor-db.com
DB_NAME=fleet_tracking
DB_USER=tu_usuario
DB_PASSWORD=tu_password_seguro
JWT_SECRET=clave_super_secreta_produccion
FRONTEND_URL=https://tu-dominio.com
```

**Frontend (.env.local):**
```env
NEXT_PUBLIC_API_URL=https://api.tu-dominio.com
NEXT_PUBLIC_WS_URL=wss://api.tu-dominio.com/ws
```

## 🐳 Docker (Opcional)

### Crear Dockerfile para Backend
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["node", "src/index.js"]
```

### Crear Dockerfile para Frontend
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["npm", "start"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  db:
    image: postgis/postgis:14-3.3
    environment:
      POSTGRES_DB: fleet_tracking
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
  
  backend:
    build: ./backend
    environment:
      DB_HOST: db
      DB_NAME: fleet_tracking
      DB_USER: postgres
      DB_PASSWORD: postgres
    ports:
      - "3001:3001"
    depends_on:
      - db
  
  frontend:
    build: .
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXT_PUBLIC_WS_URL: ws://localhost:3001/ws
    ports:
      - "3000:3000"
    depends_on:
      - backend
```

## 📝 Agregar nuevos datos de prueba

```sql
-- Agregar un nuevo camión
INSERT INTO trucks (plate, model, year, status, current_driver)
VALUES ('XYZ-123456', 'Volvo FH16', 2023, 'active', 'John Doe');

-- Agregar dispositivo GPS para el camión
INSERT INTO gps_devices (imei, truck_id, status)
VALUES ('999888777666555', (SELECT id FROM trucks WHERE plate = 'XYZ-123456'), 'active');

-- Agregar cámara
INSERT INTO cameras (truck_id, rtsp_url, status)
VALUES ((SELECT id FROM trucks WHERE plate = 'XYZ-123456'), 'rtsp://example.com/stream', 'active');

-- Agregar posición GPS
INSERT INTO gps_positions (device_id, latitude, longitude, location, speed, heading)
VALUES (
  (SELECT id FROM gps_devices WHERE imei = '999888777666555'),
  51.505,
  -0.09,
  ST_SetSRID(ST_MakePoint(-0.09, 51.505), 4326)::geography,
  65.5,
  180
);
```

## 🔍 Debugging

### Backend
```powershell
# Modo debug con inspección
node --inspect src/index.js
```

### Frontend
Abre Chrome DevTools en `http://localhost:3000`

### PostgreSQL
```sql
-- Ver queries lentas
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;

-- Ver conexiones activas
SELECT * FROM pg_stat_activity;
```

## 🎯 Aliases útiles (PowerShell Profile)

Agrega a tu `$PROFILE`:

```powershell
function Start-WayToGo {
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD\backend'; npm run dev"
    npm run dev
}

function Reset-WTGDatabase {
    dropdb -U postgres fleet_tracking
    createdb -U postgres fleet_tracking
    psql -U postgres -d fleet_tracking -c "CREATE EXTENSION postgis;"
    psql -U postgres -d fleet_tracking -f "$PWD\backend\src\database\schema.sql"
}

Set-Alias wtg Start-WayToGo
Set-Alias wtg-reset Reset-WTGDatabase
```

Luego solo ejecuta:
```powershell
wtg  # Inicia todo
wtg-reset  # Resetea la DB
```
