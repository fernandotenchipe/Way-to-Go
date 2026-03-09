import { WS_URL } from '../config/config';

export type WSMessage = {
  type: string;
  data?: unknown;
  message?: string;
};

export type WSCallback = (message: WSMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private url: string;
  private callbacks: Set<WSCallback> = new Set();
  private reconnectInterval: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.url = WS_URL;
  }

  connect() {
    if (typeof window === 'undefined') return;

    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          this.callbacks.forEach(callback => callback(message));
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      console.log('Attempting to reconnect WebSocket...');
      this.connect();
    }, this.reconnectInterval);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: WSMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }

  subscribe(callback: WSCallback) {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  ping() {
    this.send({ type: 'ping' });
  }

  subscribeTrucks(truckIds: number[]) {
    this.send({ type: 'subscribe', data: { truckIds } });
  }
}

export const wsService = new WebSocketService();
