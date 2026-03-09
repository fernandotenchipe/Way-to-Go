'use client';

import { useState } from 'react';
import DashboardLayout from '../ui/DashboardLayout';
import TruckCard from '../ui/TruckCard';
import MapComponent from '../ui/Map';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';

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

const mockTrucks: Truck[] = [
  {
    id: 1,
    plate: 'RE-746R453T85',
    model: 'Volvo FH16',
    status: 'active',
    capacity_percentage: 0,
    current_driver: 'John Smith',
    gps_status: 'active',
    camera_status: 'active',
    location: { latitude: 51.505, longitude: -0.09, speed: 60 }
  },
  {
    id: 2,
    plate: 'YR-340FR734W2',
    model: 'Scania R500',
    status: 'active',
    capacity_percentage: 82,
    current_driver: 'Mike Johnson',
    gps_status: 'active',
    camera_status: 'active',
    location: { latitude: 51.515, longitude: -0.1, speed: 45 }
  },
  {
    id: 3,
    plate: 'BW-847H1748R',
    model: 'Mercedes Actros',
    status: 'active',
    capacity_percentage: 0,
    current_driver: 'Sarah Williams',
    gps_status: 'active',
    camera_status: 'inactive',
    location: { latitude: 51.525, longitude: -0.08, speed: 0 }
  },
  {
    id: 4,
    plate: 'AQ-297D614HE',
    model: 'MAN TGX',
    status: 'inactive',
    capacity_percentage: 0,
    current_driver: undefined,
    gps_status: 'inactive',
    camera_status: 'inactive',
    location: { latitude: 51.495, longitude: -0.12, speed: 0 }
  },
  {
    id: 5,
    plate: 'BD-687R6698R',
    model: 'Iveco Stralis',
    status: 'active',
    capacity_percentage: 0,
    current_driver: 'David Brown',
    gps_status: 'active',
    camera_status: 'active',
    location: { latitude: 51.535, longitude: -0.07, speed: 70 }
  },
  {
    id: 6,
    plate: 'CV-494R5856R',
    model: 'DAF XF',
    status: 'active',
    capacity_percentage: 0,
    current_driver: 'Emma Davis',
    gps_status: 'active',
    camera_status: 'active',
    location: { latitude: 51.485, longitude: -0.11, speed: 55 }
  },
];

const filterOptions = [
  { id: 'all', label: 'All', count: 6 },
  { id: 'virginia', label: 'Virginia - For Packages', count: 6, color: 'pink' },
  { id: 'roombus', label: 'Roombus', count: 6, color: 'orange' },
  { id: 'posthawk', label: 'Post Hawk', count: 2, color: 'yellow' },
  { id: 'logistics', label: 'Logistics', count: 3, color: 'purple' },
  { id: 'forwarder', label: 'Forwarder', count: 1, color: 'teal' },
  { id: 'lagapalm', label: 'Laga Pálm', count: 1, color: 'blue' },
  { id: 'roomstar', label: 'Roomsstar', count: 3, color: 'green' },
];

const statusFilters = [
  { id: 'active', label: 'Active', count: 4, color: 'green' },
  { id: 'inactive', label: 'Inactive', count: 2, color: 'gray' },
  { id: 'all', label: 'All', count: 6, color: 'blue' },
];

export default function TrackingPage() {
  const [selectedTruck, setSelectedTruck] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(true);

  const filteredTrucks = mockTrucks.filter(truck => {
    if (statusFilter !== 'all' && truck.status !== statusFilter) {
      return false;
    }
    return true;
  });

  const trucksWithLocation = filteredTrucks
    .filter(truck => truck.location)
    .map(truck => ({
      id: truck.id,
      plate: truck.plate,
      latitude: truck.location!.latitude,
      longitude: truck.location!.longitude,
      status: truck.status,
    }));

  return (
    <DashboardLayout title="Tracking" subtitle="Filter by Partners">
      <div className="h-full flex">
        {/* Left Panel - Truck List */}
        <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
          {/* Filters Section */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Show</h3>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="text-gray-500 hover:text-gray-700"
              >
                <FunnelIcon className="w-5 h-5" />
              </button>
            </div>

            {showFilters && (
              <>
                {/* Category Filters */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {filterOptions.map(filter => (
                    <button
                      key={filter.id}
                      className={`
                        px-3 py-1.5 rounded-full text-xs font-medium transition-all
                        ${filter.id === 'all' || filter.id === 'virginia'
                          ? 'bg-pink-100 text-pink-700 border-2 border-pink-300'
                          : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:border-gray-300'
                        }
                      `}
                    >
                      {filter.label} {filter.count}
                    </button>
                  ))}
                </div>

                {/* Status Filters */}
                <div className="flex gap-2">
                  {statusFilters.map(filter => (
                    <button
                      key={filter.id}
                      onClick={() => setStatusFilter(filter.id)}
                      className={`
                        flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all
                        ${statusFilter === filter.id
                          ? filter.color === 'green' 
                            ? 'bg-green-100 text-green-700 border-2 border-green-300'
                            : filter.color === 'gray'
                            ? 'bg-gray-100 text-gray-700 border-2 border-gray-300'
                            : 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                          : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:border-gray-200'
                        }
                      `}
                    >
                      {filter.label} {filter.count}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Truck Cards */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredTrucks.map(truck => (
              <TruckCard
                key={truck.id}
                truck={truck}
                isSelected={selectedTruck === truck.id}
                onClick={() => setSelectedTruck(truck.id)}
              />
            ))}
          </div>
        </div>

        {/* Right Panel - Map and Details */}
        <div className="flex-1 flex flex-col">
          {/* Truck Details Panel (when selected) */}
          {selectedTruck && (
            <div className="bg-white border-b border-gray-200 p-6">
              {(() => {
                const truck = filteredTrucks.find(t => t.id === selectedTruck);
                if (!truck) return null;
                
                return (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-gradient-to-br from-pink-500 to-red-500 rounded-lg p-4">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">{truck.plate}</h2>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="text-sm text-gray-500">{truck.model}</span>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            truck.status === 'active' 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {truck.status === 'active' ? 'On Route' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {truck.capacity_percentage && truck.capacity_percentage > 0 && (
                      <div className="text-right">
                        <div className="text-3xl font-bold text-pink-500">
                          {truck.capacity_percentage}%
                        </div>
                        <div className="text-sm text-gray-500">Current Truck Capacity</div>
                      </div>
                    )}

                    <button
                      onClick={() => setSelectedTruck(null)}
                      className="ml-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <XMarkIcon className="w-6 h-6 text-gray-500" />
                    </button>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Map */}
          <div className="flex-1">
            <MapComponent
              trucks={trucksWithLocation}
              selectedTruckId={selectedTruck || undefined}
              onTruckClick={setSelectedTruck}
            />
          </div>

          {/* Bottom Info Panel */}
          {selectedTruck && (
            <div className="bg-white border-t border-gray-200 p-6">
              {(() => {
                const truck = filteredTrucks.find(t => t.id === selectedTruck);
                if (!truck || !truck.location) return null;
                
                return (
                  <div className="grid grid-cols-4 gap-6">
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Driver</div>
                      <div className="font-semibold text-gray-900">
                        {truck.current_driver || 'No asignado'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Speed</div>
                      <div className="font-semibold text-gray-900">
                        {truck.location.speed} km/h
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Location</div>
                      <div className="font-semibold text-gray-900">
                        {truck.location.latitude.toFixed(4)}, {truck.location.longitude.toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-1">Status</div>
                      <div className="flex gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          truck.gps_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          GPS
                        </span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          truck.camera_status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          CAM
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
