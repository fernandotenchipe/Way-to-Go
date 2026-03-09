import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./ui/globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Way to Go - Fleet Tracking",
  description: "Sistema de monitoreo y tracking de flotas en tiempo real",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} antialiased bg-gray-50`}>
        {children}
      </body>
    </html>
  );
}
