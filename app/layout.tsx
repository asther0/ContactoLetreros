import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contacto Letreros",
  description: "Captura letreros y contacta por WhatsApp con contexto.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
