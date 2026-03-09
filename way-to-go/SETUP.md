# Guía de Instalación y Configuración Paso a Paso

## ⚠️ Pre-requisitos

Antes de comenzar, asegúrate de tener instalado:

1. **Node.js** (versión 18 o superior)
   - Descargar de: https://nodejs.org/
   - Verificar instalación: `node --version`

2. **PostgreSQL** (versión 14 o superior)
   - Windows: https://www.postgresql.org/download/windows/
   - Verificar instalación: `psql --version`

3. **PostGIS** (extensión para PostgreSQL)
   - Generalmente incluido en el instalador de PostgreSQL
   - Si no, instalar desde: https://postgis.net/install/

4. **Git** (opcional, para clonar el repositorio)
   - Descargar de: https://git-scm.com/

---

## 📦 Paso 1: Obtener el Código

```bash
# Si tienes Git instalado
git clone https://github.com/tu-usuario/way-to-go.git
cd way-to-go

# O descargar manualmente y extraer el ZIP
```

---

## 🗄️ Paso 2: Configurar la Base de Datos

### Crear la Base de Datos

Abre una terminal (PowerShell o CMD) y ejecuta:

```powershell
# Crear la base de datos
createdb -U postgres fleet_tracking

# O usando psql
psql -U postgres
CREATE DATABASE fleet_tracking;
\q
```

### Habilitar PostGIS

```powershell
psql -U postgres -d fleet_tracking -c "CREATE EXTENSION postgis;"
```

### Ejecutar el Schema

```powershell
cd backend
psql -U postgres -d fleet_tracking -f src/database/schema.sql
```

**Nota:** Si te pide contraseña, es la que configuraste al instalar PostgreSQL.

---

## 🔧 Paso 3: Configurar Backend

### Instalar Dependencias

```powershell
cd backend
npm install
```

### Configurar Variables de Entorno

1. Copiar el archivo de ejemplo:
```powershell
copy .env.example .env
```

2. Editar `.env` con tu editor favorito (Notepad, VS Code, etc.):
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=fleet_tracking
DB_USER=postgres
DB_PASSWORD=tu_contraseña_de_postgres

# Server
PORT=3001
NODE_ENV=development

# JWT
JWT_SECRET=tu_clave_secreta_muy_segura_123

# CORS
FRONTEND_URL=http://localhost:3000
```

### Iniciar el Backend

```powershell
npm run dev
```

Deberías ver:
```
╔════════════════════════════════════════════╗
║   Fleet Tracking API Server                ║
║   Running on port 3001                     ║
║   Environment: development                 ║
╚════════════════════════════════════════════╝
```

¡Perfecto! El backend está funcionando en `http://localhost:3001`

---

## 💻 Paso 4: Configurar Frontend

Abre una **nueva terminal** (deja la anterior corriendo el backend).

### Instalar Dependencias

```powershell
cd ..  # Volver al directorio raíz
npm install
```

Esto instalará:
- Next.js
- React
- Tailwind CSS
- Heroicons
- Leaflet (para mapas)
- TypeScript

### Iniciar el Frontend

```powershell
npm run dev
```

Deberías ver:
```
  ▲ Next.js 16.1.6
  - Local:        http://localhost:3000
  ✓ Ready in 2.5s
```

¡Excelente! Abre tu navegador en `http://localhost:3000`

---

## ✅ Verificar la Instalación

### 1. Verificar Backend

Abre tu navegador o usa curl:
```
http://localhost:3001/health
```

Deberías ver:
```json
{
  "status": "ok",
  "timestamp": "2026-03-09T...",
  "service": "fleet-tracking-api"
}
```

### 2. Verificar Frontend

Navega a `http://localhost:3000`

Deberías ver:
- El dashboard se carga automáticamente
- Sidebar a la izquierda con el logo "Way to Go"
- Mapa en el centro
- Lista de camiones en el lado izquierdo

### 3. Verificar Base de Datos

```powershell
psql -U postgres -d fleet_tracking
```

Dentro de psql:
```sql
-- Ver tablas
\dt

-- Ver camiones de ejemplo
SELECT * FROM trucks;

-- Salir
\q
```

---

## 🎨 Probar la Aplicación

### Ver Tracking de Camiones

1. La página principal redirige automáticamente a `/tracking`
2. Verás 6 camiones de ejemplo en el mapa
3. Haz clic en un camión para ver sus detalles
4. Usa los filtros para filtrar por estado (Active/Inactive/All)

### Enviar Posiciones GPS (Simulación)

Puedes simular envío de GPS usando curl o Postman:

```bash
curl -X POST http://localhost:3001/api/gps/position \
  -H "Content-Type: application/json" \
  -d '{
    "imei": "123456789012345",
    "latitude": 51.505,
    "longitude": -0.09,
    "speed": 60,
    "heading": 180
  }'
```

Primero necesitas crear el dispositivo GPS:
```sql
psql -U postgres -d fleet_tracking
INSERT INTO gps_devices (imei, truck_id, status) VALUES ('123456789012345', 1, 'active');
```

---

## 🔧 Solución de Problemas Comunes

### Error: "Cannot connect to database"

**Problema:** El backend no puede conectarse a PostgreSQL

**Solución:**
1. Verifica que PostgreSQL esté corriendo:
   ```powershell
   # Ver servicios de Windows
   Get-Service -Name postgresql*
   ```
2. Verifica las credenciales en `.env`
3. Intenta conectarte manualmente:
   ```powershell
   psql -U postgres -d fleet_tracking
   ```

### Error: "Port 3000 is already in use"

**Problema:** El puerto 3000 está ocupado

**Solución:**
```powershell
# Encontrar qué proceso usa el puerto 3000
netstat -ano | findstr :3000

# Matar el proceso (reemplaza PID con el número que aparece)
taskkill /PID <PID> /F

# O usar otro puerto
$env:PORT=3002; npm run dev
```

### Error: "Module not found" o dependencias

**Problema:** Faltan dependencias

**Solución:**
```powershell
# Eliminar node_modules y reinstalar
rm -r node_modules
npm install

# O limpiar caché
npm cache clean --force
npm install
```

### Error: "PostGIS not found"

**Problema:** La extensión PostGIS no está instalada

**Solución:**
1. Reinstala PostgreSQL con Stack Builder
2. Marca la opción "PostGIS" durante la instalación
3. O descarga PostGIS desde https://postgis.net/

### El mapa no se carga

**Problema:** Leaflet no carga correctamente

**Solución:**
1. Verifica que `leaflet` esté instalado:
   ```powershell
   npm list leaflet
   ```
2. Si no está, instálalo:
   ```powershell
   npm install leaflet @types/leaflet
   ```

---

## 🚀 Siguientes Pasos

1. **Personalizar datos**: Edita los camiones de ejemplo en `schema.sql`

2. **Integrar GPS real**: Conecta dispositivos GPS reales al endpoint `/api/gps/position`

3. **Agregar video**: Configura URLs RTSP en la tabla `cameras`

4. **Deploy**: 
   - Backend: Railway, Render, o DigitalOcean
   - Frontend: Vercel o Netlify
   - DB: Supabase, Railway, o AWS RDS

5. **Agregar autenticación**: La API ya tiene JWT, solo falta la UI de login

---

## 📞 ¿Necesitas Ayuda?

Si tienes problemas:
1. Revisa los logs del backend y frontend
2. Verifica que todos los servicios estén corriendo
3. Consulta la documentación en `README.md`
4. Abre un issue en GitHub

---

## 🎉 ¡Listo!

Tu sistema de trackeo de flotas está funcionando. Ahora puedes:
- Agregar más camiones
- Integrar GPS reales
- Personalizar el UI
- Agregar nuevas funcionalidades

¡Disfruta de Way to Go! 🚛📍
