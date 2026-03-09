import { API_URL } from '../config/config';

export interface Truck {
  id: number;
  plate: string;
  model?: string;
  year?: number;
  status: string;
  capacity_percentage?: number;
  current_driver?: string;
  gps_status?: string;
  camera_status?: string;
  imei?: string;
  rtsp_url?: string;
}

export interface TruckLocation {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  created_at: string;
  plate: string;
  model?: string;
}

export interface Alert {
  id: number;
  truck_id: number;
  type: string;
  description: string;
  severity: string;
  status: string;
  created_at: string;
  resolved_at?: string;
  plate?: string;
  model?: string;
}

class ApiService {
  private baseUrl: string;
  private token: string | null = null;

  constructor() {
    this.baseUrl = API_URL;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  private async fetch(endpoint: string, options: RequestInit = {}) {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(this.token && { Authorization: `Bearer ${this.token}` }),
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    if (data.success && data.data.token) {
      this.token = data.data.token;
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', data.data.token);
      }
    }
    
    return data;
  }

  async register(name: string, email: string, password: string) {
    return this.fetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  }

  // Trucks
  async getTrucks(): Promise<{ success: boolean; data: Truck[] }> {
    return this.fetch('/api/trucks');
  }

  async getTruck(id: number): Promise<{ success: boolean; data: Truck }> {
    return this.fetch(`/api/trucks/${id}`);
  }

  async createTruck(truck: Partial<Truck>) {
    return this.fetch('/api/trucks', {
      method: 'POST',
      body: JSON.stringify(truck),
    });
  }

  async updateTruck(id: number, truck: Partial<Truck>) {
    return this.fetch(`/api/trucks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(truck),
    });
  }

  async getTruckLocation(id: number): Promise<{ success: boolean; data: TruckLocation }> {
    return this.fetch(`/api/trucks/${id}/location`);
  }

  async getTruckHistory(id: number, hours: number = 24) {
    return this.fetch(`/api/trucks/${id}/history?hours=${hours}`);
  }

  // GPS
  async sendGPSPosition(imei: string, latitude: number, longitude: number, speed?: number, heading?: number) {
    return this.fetch('/api/gps/position', {
      method: 'POST',
      body: JSON.stringify({ imei, latitude, longitude, speed, heading }),
    });
  }

  async getLatestPositions() {
    return this.fetch('/api/gps/latest-positions');
  }

  async getGPSPositions(limit: number = 100, hours: number = 1) {
    return this.fetch(`/api/gps/positions?limit=${limit}&hours=${hours}`);
  }

  // Alerts
  async getAlerts(status: string = 'active', limit: number = 50): Promise<{ success: boolean; data: Alert[] }> {
    return this.fetch(`/api/alerts?status=${status}&limit=${limit}`);
  }

  async createAlert(alert: { truck_id: number; type: string; description: string; severity?: string }) {
    return this.fetch('/api/alerts', {
      method: 'POST',
      body: JSON.stringify(alert),
    });
  }

  async resolveAlert(id: number) {
    return this.fetch(`/api/alerts/${id}/resolve`, {
      method: 'PUT',
    });
  }

  // Health check
  async healthCheck() {
    return this.fetch('/health');
  }
}

export const apiService = new ApiService();
