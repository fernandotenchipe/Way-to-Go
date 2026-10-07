-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Tabla: usuarios
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: camiones
CREATE TABLE IF NOT EXISTS trucks (
    id SERIAL PRIMARY KEY,
    plate VARCHAR(50) UNIQUE NOT NULL,
    model VARCHAR(100),
    year INTEGER,
    status VARCHAR(50) DEFAULT 'active',
    capacity_percentage INTEGER DEFAULT 0,
    current_driver VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: dispositivos GPS
CREATE TABLE IF NOT EXISTS gps_devices (
    id SERIAL PRIMARY KEY,
    imei VARCHAR(50) UNIQUE NOT NULL,
    truck_id INTEGER REFERENCES trucks(id) ON DELETE CASCADE,
    last_connection TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: cámaras
CREATE TABLE IF NOT EXISTS cameras (
    id SERIAL PRIMARY KEY,
    truck_id INTEGER REFERENCES trucks(id) ON DELETE CASCADE,
    rtsp_url VARCHAR(500),
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: posiciones GPS (la más importante)
CREATE TABLE IF NOT EXISTS gps_positions (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES gps_devices(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location GEOGRAPHY(POINT, 4326),
    speed DOUBLE PRECISION DEFAULT 0,
    heading DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índice geoespacial
CREATE INDEX IF NOT EXISTS idx_gps_positions_location ON gps_positions USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_gps_positions_device_time ON gps_positions(device_id, created_at DESC);

-- Tabla: alertas
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    truck_id INTEGER REFERENCES trucks(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    description TEXT,
    severity VARCHAR(50) DEFAULT 'medium',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

-- Tabla: rutas
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    truck_id INTEGER REFERENCES trucks(id) ON DELETE CASCADE,
    name VARCHAR(255),
    start_location VARCHAR(255),
    end_location VARCHAR(255),
    distance_km DOUBLE PRECISION,
    estimated_duration_minutes INTEGER,
    status VARCHAR(50) DEFAULT 'planned',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar datos de ejemplo
INSERT INTO users (name, email, password_hash, role) 
VALUES ('Admin User', 'admin@example.com', '$2a$10$8K1p/a0dL3LKzxDRkqNXieCWrY.sYJ3L.dTkZZQsJPRKL7YzxKKOe', 'admin')
ON CONFLICT (email) DO NOTHING;

-- Insertar camiones de ejemplo
INSERT INTO trucks (plate, model, year, status, capacity_percentage, current_driver) 
VALUES 
    ('RE-746R453T85', 'Volvo FH16', 2022, 'active', 0, 'John Smith'),
    ('YR-340FR734W2', 'Scania R500', 2021, 'active', 82, 'Mike Johnson'),
    ('BW-847H1748R', 'Mercedes Actros', 2023, 'active', 0, 'Sarah Williams'),
    ('AQ-297D614HE', 'MAN TGX', 2020, 'inactive', 0, NULL),
    ('BD-687R6698R', 'Iveco Stralis', 2022, 'active', 0, 'David Brown'),
    ('CV-494R5856R', 'DAF XF', 2021, 'active', 0, 'Emma Davis')
ON CONFLICT (plate) DO NOTHING;
