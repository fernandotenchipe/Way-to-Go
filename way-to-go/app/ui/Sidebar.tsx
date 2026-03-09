'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  HomeIcon, 
  TruckIcon, 
  MapPinIcon, 
  ChatBubbleLeftRightIcon,
  DocumentMagnifyingGlassIcon,
  ClockIcon,
  ChartBarIcon,
  UserGroupIcon,
  FolderIcon
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Tracking', href: '/tracking', icon: MapPinIcon, badge: 6 },
  { name: 'Chats', href: '/chats', icon: ChatBubbleLeftRightIcon, badge: 3 },
];

const requestMenu = [
  { name: 'Trucks', href: '/request/trucks', icon: TruckIcon },
  { name: 'Order', href: '/request/order', icon: DocumentMagnifyingGlassIcon, badge: 1 },
  { name: 'Repair', href: '/request/repair', icon: FolderIcon },
  { name: 'Drivers', href: '/request/drivers', icon: UserGroupIcon },
  { name: 'Reports', href: '/request/reports', icon: FolderIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex flex-col w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200">
        <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-red-500 rounded-full flex items-center justify-center">
          <TruckIcon className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Way to Go</h1>
          <p className="text-xs text-gray-500">george.davidson@email.com</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-3 mb-6">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  flex items-center justify-between px-3 py-2.5 rounded-lg mb-1 transition-colors
                  ${isActive 
                    ? 'bg-pink-50 text-pink-600' 
                    : 'text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{item.name}</span>
                </div>
                {item.badge && (
                  <span className="bg-pink-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Request Section */}
        <div className="px-3">
          <div className="flex items-center justify-between px-3 mb-2">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Request
            </h2>
            <button className="text-pink-500 hover:text-pink-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
          {requestMenu.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  flex items-center justify-between px-3 py-2.5 rounded-lg mb-1 transition-colors
                  ${isActive 
                    ? 'bg-pink-50 text-pink-600' 
                    : 'text-gray-700 hover:bg-gray-50'
                  }
                `}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium text-sm">{item.name}</span>
                </div>
                {item.badge && (
                  <span className="bg-pink-500 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Analysis & History */}
        <div className="px-3 mt-6">
          <Link
            href="/analysis"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50 mb-1"
          >
            <ChartBarIcon className="w-5 h-5" />
            <span className="font-medium text-sm">Analysis</span>
            <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </Link>
          <Link
            href="/history"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            <ClockIcon className="w-5 h-5" />
            <span className="font-medium text-sm">History</span>
          </Link>
        </div>
      </nav>

      {/* Create New Request Button */}
      <div className="p-4 border-t border-gray-200">
        <button className="w-full bg-gradient-to-r from-pink-500 to-red-500 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-shadow">
          Create new request
        </button>
      </div>
    </div>
  );
}
