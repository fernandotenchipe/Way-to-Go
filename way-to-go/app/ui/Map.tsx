'use client';

import { useEffect, useRef, useState } from 'react';

interface MapProps {
  trucks: Array<{
    id: number;
    plate: string;
    latitude: number;
    longitude: number;
    status: string;
  }>;
  selectedTruckId?: number;
  onTruckClick?: (truckId: number) => void;
}

export default function MapComponent({ trucks, selectedTruckId, onTruckClick }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    // Cargar Leaflet dinámicamente
    if (typeof window !== 'undefined' && !mapLoaded) {
      import('leaflet').then((L) => {
        import('leaflet/dist/leaflet.css');
        
        if (mapRef.current && !mapRef.current.hasChildNodes()) {
          const map = L.map(mapRef.current).setView([51.505, -0.09], 13);
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
          }).addTo(map);

          // Agregar marcadores para cada camión
          trucks.forEach(truck => {
            const icon = L.divIcon({
              className: 'custom-truck-marker',
              html: `
                <div class="${selectedTruckId === truck.id ? 'selected' : ''}" style="
                  background: ${truck.status === 'active' ? '#ec4899' : '#9ca3af'};
                  width: 32px;
                  height: 32px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  color: white;
                  font-weight: bold;
                  font-size: 12px;
                  border: 3px solid ${selectedTruckId === truck.id ? '#be185d' : 'white'};
                  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                  cursor: pointer;
                ">
                  🚛
                </div>
              `,
              iconSize: [32, 32],
              iconAnchor: [16, 16],
            });

            const marker = L.marker([truck.latitude, truck.longitude], { icon })
              .addTo(map)
              .bindPopup(`<b>${truck.plate}</b>`);
            
            marker.on('click', () => {
              if (onTruckClick) {
                onTruckClick(truck.id);
              }
            });
          });

          // Ajustar vista para mostrar todos los camiones
          if (trucks.length > 0) {
            const bounds = L.latLngBounds(
              trucks.map(t => [t.latitude, t.longitude] as [number, number])
            );
            map.fitBounds(bounds, { padding: [50, 50] });
          }

          setMapLoaded(true);
        }
      });
    }
  }, [trucks, selectedTruckId, onTruckClick, mapLoaded]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full rounded-lg" />
      
      {/* Map Controls */}
      <div className="absolute top-4 right-4 z-[1000] space-y-2">
        <button className="bg-white p-2 rounded-lg shadow-lg hover:bg-gray-50 transition-colors">
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
        <button className="bg-white p-2 rounded-lg shadow-lg hover:bg-gray-50 transition-colors">
          <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
          </svg>
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow-lg p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Estado</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-pink-500"></div>
            <span className="text-xs text-gray-600">Activo</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-400"></div>
            <span className="text-xs text-gray-600">Inactivo</span>
          </div>
        </div>
      </div>
    </div>
  );
}
