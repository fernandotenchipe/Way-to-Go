import { WebSocketServer } from 'ws';

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  
  // Hacer el wss accesible globalmente para otros módulos
  global.wss = wss;
  
  wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection from:', req.socket.remoteAddress);
    
    // Enviar mensaje de bienvenida
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to Fleet Tracking WebSocket'
    }));
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log('Received message:', data);
        
        // Aquí puedes manejar diferentes tipos de mensajes del cliente
        switch(data.type) {
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
          
          case 'subscribe':
            // Implementar lógica de suscripción a camiones específicos
            ws.subscribedTrucks = data.truckIds || [];
            break;
          
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
  
  // Heartbeat para mantener conexiones vivas
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
  
  wss.on('close', () => {
    clearInterval(interval);
  });
  
  console.log('WebSocket server is running on path /ws');
  
  return wss;
}
