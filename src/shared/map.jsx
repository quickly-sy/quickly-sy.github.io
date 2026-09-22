import { useEffect } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export const DEFAULT_CENTER = [33.5138, 36.2765]; // دمشق

// أيقونات بالإيموجي — تتجنب مشكلة صور Leaflet الافتراضية مع Vite
const pin = (emoji, cls = '') =>
  L.divIcon({ html: `<div class="map-pin ${cls}">${emoji}</div>`, className: '', iconSize: [38, 38], iconAnchor: [19, 19] });

export const icons = {
  vendor: pin('🏪'),
  home: pin('🏠'),
  bank: pin('🏦'),
  driver: pin('🛵', 'driver'),
  // للوحة الإدارة: لون الإطار حسب حالة السائق
  driverAvailable: pin('🛵', 'driver available'),
  driverBusy: pin('🛵', 'driver busy'),
  driverOffline: pin('🛵', 'driver offline'),
};

export function BaseMap({ center, zoom = 13, height = 340, children }) {
  return (
    <MapContainer center={center || DEFAULT_CENTER} zoom={zoom} style={{ height, width: '100%' }} className="map">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {children}
    </MapContainer>
  );
}

// الضغط على الخريطة يرجّع [lat, lng]
export function ClickPicker({ onPick }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) });
  return null;
}

// يضبط التكبير ليشمل كل النقاط (يتحرك فقط عند تغيّر عدد النقاط، مو مع كل حركة للسائق)
export function FitBounds({ points }) {
  const map = useMap();
  const valid = points.filter(Boolean);
  useEffect(() => {
    if (valid.length > 1) map.fitBounds(valid, { padding: [40, 40] });
    else if (valid.length === 1) map.setView(valid[0], 15);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid.length]);
  return null;
}
