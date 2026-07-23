import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Contacto Letreros",
    short_name: "Letreros",
    description: "Organiza oportunidades de vivienda encontradas en la calle y en línea.",
    display: "standalone",
    start_url: "/",
    background_color: "#f4f1e9",
    theme_color: "#1d4935",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
