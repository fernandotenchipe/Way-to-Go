import express from 'express';
import { query } from '../database/db.js';

const router = express.Router();

// GET - Obtener todos los camiones
router.get('/', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        t.*,
        gd.imei,
        gd.status as gps_status,
        c.rtsp_url,
        c.status as camera_status
      FROM trucks t
      LEFT JOIN gps_devices gd ON t.id = gd.truck_id
      LEFT JOIN cameras c ON t.id = c.truck_id
      ORDER BY t.created_at DESC
    `);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching trucks:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener camiones'
    });
  }
});

// GET - Obtener un camión específico
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      SELECT 
        t.*,
        gd.imei,
        gd.status as gps_status,
        c.rtsp_url,
        c.status as camera_status
      FROM trucks t
      LEFT JOIN gps_devices gd ON t.id = gd.truck_id
      LEFT JOIN cameras c ON t.id = c.truck_id
      WHERE t.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Camión no encontrado'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching truck:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener camión'
    });
  }
});

// GET - Obtener última ubicación de un camión
router.get('/:id/location', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      SELECT 
        gp.latitude,
        gp.longitude,
        gp.speed,
        gp.heading,
        gp.created_at,
        t.plate,
        t.model
      FROM gps_positions gp
      JOIN gps_devices gd ON gp.device_id = gd.id
      JOIN trucks t ON gd.truck_id = t.id
      WHERE t.id = $1
      ORDER BY gp.created_at DESC
      LIMIT 1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No se encontró ubicación para este camión'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching location:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener ubicación'
    });
  }
});

// GET - Obtener historial de ubicaciones
router.get('/:id/history', async (req, res) => {
  try {
    const { id } = req.params;
    const { hours = 24 } = req.query;
    
    const result = await query(`
      SELECT 
        gp.latitude,
        gp.longitude,
        gp.speed,
        gp.heading,
        gp.created_at
      FROM gps_positions gp
      JOIN gps_devices gd ON gp.device_id = gd.id
      JOIN trucks t ON gd.truck_id = t.id
      WHERE t.id = $1
        AND gp.created_at > NOW() - INTERVAL '${hours} hours'
      ORDER BY gp.created_at ASC
    `, [id]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener historial'
    });
  }
});

// POST - Crear un nuevo camión
router.post('/', async (req, res) => {
  try {
    const { plate, model, year, current_driver } = req.body;
    
    const result = await query(`
      INSERT INTO trucks (plate, model, year, current_driver, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING *
    `, [plate, model, year, current_driver]);
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating truck:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear camión'
    });
  }
});

// PUT - Actualizar un camión
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { plate, model, year, status, current_driver, capacity_percentage } = req.body;
    
    const result = await query(`
      UPDATE trucks 
      SET plate = COALESCE($1, plate),
          model = COALESCE($2, model),
          year = COALESCE($3, year),
          status = COALESCE($4, status),
          current_driver = COALESCE($5, current_driver),
          capacity_percentage = COALESCE($6, capacity_percentage)
      WHERE id = $7
      RETURNING *
    `, [plate, model, year, status, current_driver, capacity_percentage, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Camión no encontrado'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating truck:', error);
    res.status(500).json({
      success: false,
      error: 'Error al actualizar camión'
    });
  }
});

export default router;
