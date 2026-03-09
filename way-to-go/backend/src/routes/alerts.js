import express from 'express';
import { query } from '../database/db.js';

const router = express.Router();

// GET - Obtener todas las alertas
router.get('/', async (req, res) => {
  try {
    const { status = 'active', limit = 50 } = req.query;
    
    const result = await query(`
      SELECT 
        a.*,
        t.plate,
        t.model
      FROM alerts a
      JOIN trucks t ON a.truck_id = t.id
      WHERE a.status = $1
      ORDER BY a.created_at DESC
      LIMIT $2
    `, [status, limit]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener alertas'
    });
  }
});

// POST - Crear una nueva alerta
router.post('/', async (req, res) => {
  try {
    const { truck_id, type, description, severity } = req.body;
    
    const result = await query(`
      INSERT INTO alerts (truck_id, type, description, severity, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING *
    `, [truck_id, type, description, severity || 'medium']);
    
    // Emitir evento via WebSocket
    if (global.wss) {
      global.wss.clients.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'new_alert',
            data: result.rows[0]
          }));
        }
      });
    }
    
    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating alert:', error);
    res.status(500).json({
      success: false,
      error: 'Error al crear alerta'
    });
  }
});

// PUT - Resolver una alerta
router.put('/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      UPDATE alerts 
      SET status = 'resolved', resolved_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Alerta no encontrada'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error resolving alert:', error);
    res.status(500).json({
      success: false,
      error: 'Error al resolver alerta'
    });
  }
});

export default router;
