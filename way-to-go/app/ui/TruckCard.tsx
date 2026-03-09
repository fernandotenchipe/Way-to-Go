'use client';

import { TruckIcon, MapPinIcon, SignalIcon } from '@heroicons/react/24/outline';

interface Truck {
  id: number;
  plate: string;
  model?: string;
  status: string;
  capacity_percentage?: number;
  current_driver?: string;
  gps_status?: string;
  camera_status?: string;
  location?: {
    latitude: number;
    longitude: number;
    speed: number;
  };
}

interface TruckCardProps {
  truck: Truck;
  onClick?: () => void;
  isSelected?: boolean;
}

export default function TruckCard({ truck, onClick, isSelected }: TruckCardProps) {
  const isOnRoute = truck.status === 'active' && truck.gps_status === 'active';
  const isInactive = truck.status === 'inactive';

  return (
    <div
      onClick={onClick}
      className={`
        bg-white border-2 rounded-xl p-4 cursor-pointer transition-all hover:shadow-lg
        ${isSelected ? 'border-pink-500 shadow-lg' : 'border-gray-200'}
        ${isInactive ? 'opacity-60' : ''}
      `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="font-bold text-gray-900 text-lg">{truck.plate}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {truck.model || 'Modelo no especificado'}
          </p>
        </div>
        <div className={`
          flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
          ${isOnRoute ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}
        `}>
          <div className={`w-2 h-2 rounded-full ${isOnRoute ? 'bg-green-500' : 'bg-gray-400'}`}></div>
          {isOnRoute ? 'On Route' : 'Inactive'}
        </div>
      </div>

      {/* Truck Image */}
      <div className="relative mb-4 bg-gray-50 rounded-lg p-4 flex items-center justify-center h-32">
        <TruckIcon className="w-20 h-20 text-gray-400" />
        {truck.capacity_percentage && truck.capacity_percentage > 0 && (
          <div className="absolute top-2 right-2 bg-white rounded-lg px-2 py-1 shadow-sm">
            <span className="text-xs font-semibold text-gray-700">
              {truck.capacity_percentage}%
            </span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Time</span>
          <span className="font-medium text-gray-900">
            {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Driver</span>
          <span className="font-medium text-gray-900">
            {truck.current_driver || 'No asignado'}
          </span>
        </div>
        {truck.location && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Speed</span>
            <span className="font-medium text-gray-900">
              {truck.location.speed.toFixed(0)} km/h
            </span>
          </div>
        )}
      </div>

      {/* Status Icons */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
        <div className={`flex items-center gap-1 text-xs ${
          truck.gps_status === 'active' ? 'text-green-600' : 'text-gray-400'
        }`}>
          <MapPinIcon className="w-4 h-4" />
          <span>GPS</span>
        </div>
        <div className={`flex items-center gap-1 text-xs ${
          truck.camera_status === 'active' ? 'text-green-600' : 'text-gray-400'
        }`}>
          <SignalIcon className="w-4 h-4" />
          <span>Cam</span>
        </div>
        {truck.location && (
          <div className="ml-auto text-xs text-gray-500">
            {truck.location.speed > 0 ? 'En movimiento' : 'Detenido'}
          </div>
        )}
      </div>
    </div>
  );
}
