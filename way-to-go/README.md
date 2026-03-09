# Way to Go - Sistema de Trackeo de Flotas

Sistema completo de monitoreo y tracking de flotas de camiones con GPS y video en tiempo real.

![Dashboard](https://img.shields.io/badge/Status-In_Development-yellow)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-blue)

## 📋 Características

### Backend
- ✅ **API REST** completa con Node.js + Express
- ✅ **WebSocket** para actualizaciones en tiempo real
- ✅ **PostgreSQL + PostGIS** para datos geoespaciales
- ✅ **JWT Authentication** para seguridad
- ✅ **Gestión de camiones**, GPS devices, cámaras y alertas
- ✅ **Historial de rutas** y posiciones

### Frontend
- ✅ **Dashboard interactivo** con Next.js 16
- ✅ **Mapa en tiempo real** con Leaflet
- ✅ **Vista de tracking** con tarjetas de camiones
- ✅ **Filtros avanzados** por estado y categoría
- ✅ **Interfaz responsive** con Tailwind CSS
- ✅ **Actualización en tiempo real** vía WebSocket

## 🚀 Inicio Rápido

### Requisitos Previos

- **Node.js** 18+ 
- **PostgreSQL** 14+ con PostGIS
- **npm** o **yarn**

### Instalación

#### 1. Clonar el repositorio
```bash
git clone https://github.com/tu-usuario/way-to-go.git
cd way-to-go
```

#### 2. Configurar Backend

```bash
cd backend

# Instalar dependencias
npm install

# Configurar base de datos
createdb fleet_tracking
psql fleet_tracking -c "CREATE EXTENSION postgis;"
psql fleet_tracking < src/database/schema.sql

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar servidor
npm run dev
```

El backend estará en `http://localhost:3001`

#### 3. Configurar Frontend

```bash
cd ..  # volver al directorio raíz

# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

El frontend estará en `http://localhost:3000`

## 📁 Estructura del Proyecto

```
way-to-go/
├── backend/                    # API Backend
│   ├── src/
│   │   ├── routes/            # Endpoints REST
│   │   │   ├── trucks.js      # Gestión de camiones
│   │   │   ├── gps.js         # Posiciones GPS
│   │   │   ├── alerts.js      # Sistema de alertas
│   │   │   └── auth.js        # Autenticación
│   │   ├── database/          # DB config y schemas
│   │   ├── websocket/         # WebSocket server
│   │   └── index.js           # Entry point
│   └── package.json
│
├── app/                        # Frontend Next.js 16
│   ├── tracking/              # Página de tracking
│   ├── ui/                    # Componentes UI
│   │   ├── Sidebar.tsx        # Navegación lateral
│   │   ├── Header.tsx         # Cabecera
│   │   ├── TruckCard.tsx      # Tarjeta de camión
│   │   ├── Map.tsx            # Componente de mapa
│   │   └── DashboardLayout.tsx
│   ├── services/              # Servicios API/WS
│   ├── config/                # Configuración
│   ├── layout.tsx             # Layout principal
│   └── page.tsx               # Home
│
└── README.md
```

## 🗄️ Base de Datos

### Tablas Principales

- **users** - Usuarios del sistema
- **trucks** - Camiones de la flota
- **gps_devices** - Dispositivos GPS
- **cameras** - Cámaras en camiones
- **gps_positions** - Historial de posiciones (PostGIS)
- **alerts** - Alertas del sistema
- **routes** - Rutas planificadas

## 📡 API Endpoints

### Autenticación
```
POST /api/auth/login       - Iniciar sesión
POST /api/auth/register    - Registrar usuario
```

### Camiones
```
GET    /api/trucks              - Listar camiones
GET    /api/trucks/:id          - Obtener camión
POST   /api/trucks              - Crear camión
PUT    /api/trucks/:id          - Actualizar camión
GET    /api/trucks/:id/location - Ubicación actual
GET    /api/trucks/:id/history  - Historial
```

### GPS
```
POST /api/gps/position          - Recibir posición
GET  /api/gps/positions         - Posiciones recientes
GET  /api/gps/latest-positions  - Últimas de todos
```

### Alertas
```
GET /api/alerts               - Listar alertas
POST /api/alerts              - Crear alerta
PUT /api/alerts/:id/resolve   - Resolver alerta
```

## 🔌 WebSocket

Endpoint: `ws://localhost:3001/ws`

### Eventos del Servidor
- `gps_update` - Nueva posición GPS
- `new_alert` - Nueva alerta
- `connection` - Confirmación

### Comandos del Cliente
```json
{ "type": "ping" }
{ "type": "subscribe", "truckIds": [1, 2, 3] }
```

## 🎨 Capturas de Pantalla

### Dashboard de Tracking
Vista principal con mapa interactivo y lista de camiones en tiempo real.

### Vista de Camión Individual
Detalles completos: ubicación, velocidad, conductor, capacidad de carga.

## 🛠️ Tecnologías

### Backend
- Node.js + Express
- PostgreSQL + PostGIS
- WebSocket (ws)
- JWT
- bcryptjs

### Frontend
- Next.js 16
- React 19
- TypeScript
- Tailwind CSS
- Leaflet
- Heroicons

## 📊 Escalamiento Futuro

Para mayor escala, considera:

- **Kafka/MQTT** para ingesta de GPS
- **Redis** para cache de posiciones
- **TimescaleDB** para históricos
- **Media Server** (Janus/Ant Media) para video
- **Microservicios** independientes
- **Kubernetes** para orquestación

## 🔐 Seguridad

- Autenticación JWT
- Contraseñas hasheadas con bcrypt
- CORS configurado
- Validación de inputs
- Prepared statements (SQL injection)

## 🤝 Contribuir

1. Fork el proyecto
2. Crea tu Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push al Branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la Licencia MIT.

