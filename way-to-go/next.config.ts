import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
  async redirects() {
    return [
      { source: '/tracking', destination: '/rastreo/en-vivo', permanent: true },
      { source: '/transporte', destination: '/rastreo/dashboard', permanent: true },
      { source: '/transporte/dashboard', destination: '/rastreo/dashboard', permanent: true },
      { source: '/transporte/tracking', destination: '/rastreo/en-vivo', permanent: true },
      { source: '/transporte/alertas', destination: '/rastreo/alertas', permanent: true },
      { source: '/transporte/ordenes', destination: '/rastreo/ordenes', permanent: true },
      { source: '/transporte/viajes', destination: '/logistica/viajes', permanent: true },
      { source: '/transporte/evidencias', destination: '/logistica/evidencias', permanent: true },
      { source: '/transporte/reportes', destination: '/logistica/reportes', permanent: true },
      { source: '/transporte/clientes', destination: '/logistica/clientes', permanent: true },
      { source: '/transporte/costos', destination: '/logistica/costos', permanent: true },
      { source: '/transporte/facturacion', destination: '/logistica/facturacion', permanent: true },
      { source: '/transporte/flota', destination: '/logistica/flota', permanent: true },
      { source: '/transporte/operadores', destination: '/logistica/operadores', permanent: true },
    ];
  },
};

export default nextConfig;
