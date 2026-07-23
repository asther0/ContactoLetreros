"use client";

import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

export type MapOpportunity = {
  id: string;
  title: string;
  location: string;
  locationKind?: "exact" | "approximate";
  latitude?: number;
  longitude?: number;
  favorite?: boolean;
};

const lima: [number, number] = [-12.0464, -77.0428];

function FitMarkers({ items }: { items: MapOpportunity[] }) {
  const map = useMap();

  useEffect(() => {
    if (!items.length) {
      map.setView(lima, 12);
      return;
    }

    if (items.length === 1) {
      map.setView([items[0].latitude!, items[0].longitude!], 15);
      return;
    }

    map.fitBounds(items.map((item) => [item.latitude!, item.longitude!] as [number, number]), { padding: [32, 32], maxZoom: 15 });
  }, [items, map]);

  return null;
}

export default function OpportunityMap({ items, onSelect }: { items: MapOpportunity[]; onSelect: (id: string) => void }) {
  return <MapContainer aria-label="Mapa de oportunidades con ubicación" center={lima} className="leaflet-map" scrollWheelZoom={false} zoom={12}>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <FitMarkers items={items} />
    {items.map((item) => {
      const exact = item.locationKind === "exact";
      return <CircleMarker center={[item.latitude!, item.longitude!]} color={exact ? "#1d4935" : "#a56b2c"} fillColor={exact ? "#1d4935" : "#fffdf8"} fillOpacity={1} key={item.id} radius={exact ? 10 : 9} weight={3}>
        <Popup><strong>{item.favorite ? "♥ " : ""}{item.title}</strong><br />{item.location || "Ubicación guardada"}<br /><button className="map-popup-action" onClick={() => onSelect(item.id)} type="button">Ver oportunidad</button></Popup>
      </CircleMarker>;
    })}
  </MapContainer>;
}
