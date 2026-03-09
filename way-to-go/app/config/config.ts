// API configuration
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

// Map configuration
export const MAP_CONFIG = {
  defaultCenter: { lat: 51.505, lng: -0.09 },
  defaultZoom: 13,
  tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap contributors'
};

// App configuration
export const APP_CONFIG = {
  name: 'Way to Go',
  description: 'Fleet Tracking System',
  refreshInterval: 5000, // 5 seconds
};
