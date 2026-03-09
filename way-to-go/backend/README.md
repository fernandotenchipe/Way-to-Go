# Fleet Tracking Backend

Backend API para sistema de trackeo de camiones con GPS y video en tiempo real.

## 🚀 Características

- **API REST** completa para gestión de camiones, GPS y alertas
- **WebSocket** para actualizaciones en tiempo real
- **PostgreSQL + PostGIS** para datos geoespaciales
- **JWT** para autenticación
- **CORS** configurado para frontend

## 📋 Requisitos

- Node.js 18+
- PostgreSQL 14+ con extensión PostGIS
- npm o yarn

## 🛠️ Instalación

1. Instalar dependencias:
```bash
cd backend
npm install
```

2. Configurar base de datos PostgreSQL:
```bash
# Crear base de datos
createdb fleet_tracking

# Habilitar PostGIS
psql fleet_tracking -c "CREATE EXTENSION postgis;"

# Ejecutar schema
psql fleet_tracking < src/database/schema.sql
```

3. Configurar variables de entorno:
```bash
cp .env.example .env
# Editar .env con tus credenciales
```

4. Iniciar servidor:
```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3001`

## 📡 API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrar usuario

### Camiones
- `GET /api/trucks` - Listar todos los camiones
- `GET /api/trucks/:id` - Obtener un camión
- `POST /api/trucks` - Crear camión
- `PUT /api/trucks/:id` - Actualizar camión
- `GET /api/trucks/:id/location` - Ubicación actual
- `GET /api/trucks/:id/history` - Historial de ubicaciones

### GPS
- `POST /api/gps/position` - Recibir posición GPS
- `GET /api/gps/positions` - Obtener posiciones recientes
- `GET /api/gps/latest-positions` - Últimas posiciones de todos

### Alertas
- `GET /api/alerts` - Listar alertas
- `POST /api/alerts` - Crear alerta
- `PUT /api/alerts/:id/resolve` - Resolver alerta

## 🔌 WebSocket

Conectar a: `ws://localhost:3001/ws`

### Eventos enviados:
- `gps_update` - Nueva posición GPS
- `new_alert` - Nueva alerta creada
- `connection` - Confirmación de conexión

### Comandos del cliente:
```json
{ "type": "ping" }
{ "type": "subscribe", "truckIds": [1, 2, 3] }
```

## 🗄️ Estructura de Base de Datos

- **users** - Usuarios del sistema
- **trucks** - Camiones de la flota
- **gps_devices** - Dispositivos GPS
- **cameras** - Cámaras en camiones
- **gps_positions** - Historial de posiciones (con PostGIS)
- **alerts** - Alertas del sistema
- **routes** - Rutas planificadas

## 🔐 Autenticación

Usar JWT en header Authorization:
```
Authorization: Bearer <token>
```

Usuario por defecto:
- Email: `admin@example.com`
- Password: `admin123` (hash en DB)

## 📦 Dependencias Principales

- **express** - Framework web
- **pg** - Cliente PostgreSQL
- **ws** - WebSocket
- **bcryptjs** - Hash de contraseñas
- **jsonwebtoken** - JWT
- **cors** - CORS middleware
- **dotenv** - Variables de entorno
