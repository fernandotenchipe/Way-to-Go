import express from 'express';
import { query } from '../database/db.js';

const router = express.Router();

// POST - Recibir nueva posición GPS
router.post('/position', async (req, res) => {
  try {
    const { imei, latitude, longitude, speed, heading } = req.body;
    
    if (!imei || !latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Faltan parámetros requeridos (imei, latitude, longitude)'
      });
    }
    
    // Verificar que el dispositivo existe
    const deviceResult = await query(
      'SELECT id, truck_id FROM gps_devices WHERE imei = $1',
      [imei]
    );
    
    if (deviceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Dispositivo GPS no encontrado'
      });
    }
    
    const deviceId = deviceResult.rows[0].id;
    const truckId = deviceResult.rows[0].truck_id;
    
    // Insertar nueva posición
    const result = await query(`
      INSERT INTO gps_positions (
        device_id, 
        latitude, 
        longitude, 
        location,
        speed, 
        heading
      )
      VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4, $5)
      RETURNING *
    `, [deviceId, latitude, longitude, speed || 0, heading || 0]);
    
    // Actualizar última conexión del dispositivo
    await query(
      'UPDATE gps_devices SET last_connection = NOW() WHERE id = $1',
      [deviceId]
    );
    
    // Emitir evento via WebSocket (se implementará después)
    if (global.wss) {
      global.wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify({
            type: 'gps_update',
            data: {
              truckId,
              latitude,
              longitude,
              speed,
              heading,
              timestamp: new Date()
            }
          }));
        }
      });
    }
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error saving GPS position:', error);
    res.status(500).json({
      success: false,
      error: 'Error al guardar posición GPS'
    });
  }
});

// GET - Obtener todas las posiciones recientes
router.get('/positions', async (req, res) => {
  try {
    const { limit = 100, hours = 1 } = req.query;
    
    const result = await query(`
      SELECT 
        gp.*,
        gd.imei,
        t.id as truck_id,
        t.plate,
        t.model
      FROM gps_positions gp
      JOIN gps_devices gd ON gp.device_id = gd.id
      JOIN trucks t ON gd.truck_id = t.id
      WHERE gp.created_at > NOW() - INTERVAL '${hours} hours'
      ORDER BY gp.created_at DESC
      LIMIT $1
    `, [limit]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener posiciones'
    });
  }
});

// GET - Obtener últimas posiciones de todos los camiones
router.get('/latest-positions', async (req, res) => {
  try {
    const result = await query(`
      WITH latest_positions AS (
        SELECT DISTINCT ON (gd.truck_id)
          gp.latitude,
          gp.longitude,
          gp.speed,
          gp.heading,
          gp.created_at,
          t.id as truck_id,
          t.plate,
          t.model,
          t.status as truck_status,
          t.capacity_percentage,
          t.current_driver
        FROM gps_positions gp
        JOIN gps_devices gd ON gp.device_id = gd.id
        JOIN trucks t ON gd.truck_id = t.id
        WHERE t.status = 'active'
        ORDER BY gd.truck_id, gp.created_at DESC
      )
      SELECT * FROM latest_positions
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching latest positions:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener posiciones'
    });
  }
});

export default router;
