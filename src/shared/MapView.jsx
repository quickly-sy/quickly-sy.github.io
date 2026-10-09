// خريطة تُحمّل عند الحاجة فقط — تبقى مكتبة Leaflet خارج الحزمة الأساسية
import { useMemo, useRef } from 'react';
import { Circle, Marker, Polyline, Popup } from 'react-leaflet';
import { BaseMap, ClickPicker, FitBounds, icons, DEFAULT_CENTER } from './map';

export { DEFAULT_CENTER };

/*
  markers: [{ point, icon: 'vendor'|'home'|'driver'|'bank'|..., popup, draggable, onDragEnd, zIndex }]
  circle:  { center, radius }
  line:    [[lat,lng], ...]                       — خط واحد (كما كان)
  lines:   [{ points, color, weight, opacity, dashed }]  — عدة خطوط، والقيم الفاضية بتنشطب
*/
const LINE_DEFAULT = { color: '#1c64d6', weight: 5, opacity: 0.8 };

export default function MapView({
  height = 320,
  center,
  zoom = 13,
  fit = [],
  markers = [],
  circle,
  line,
  lines = [],
  onPick,
}) {
  const points = useMemo(() => fit.filter(Boolean), [fit]);
  const allLines = [
    ...(line && line.length > 1 ? [{ points: line }] : []),
    ...lines,
  ]
    .filter((l) => l && Array.isArray(l.points) && l.points.filter(Boolean).length > 1);
  return (
    <BaseMap center={center || DEFAULT_CENTER} zoom={zoom} height={height}>
      {onPick && <ClickPicker onPick={onPick} />}
      {points.length > 0 && <FitBounds points={points} />}
      {circle?.center && (
        <Circle center={circle.center} radius={circle.radius} pathOptions={{ color: '#d8a811', weight: 1, fillOpacity: 0.12 }} />
      )}
      {allLines.map((l, i) => (
        <Polyline
          key={l.key ?? i}
          positions={l.points.filter(Boolean)}
          pathOptions={{
            ...LINE_DEFAULT,
            ...(l.color ? { color: l.color } : {}),
            ...(l.weight ? { weight: l.weight } : {}),
            ...(l.opacity != null ? { opacity: l.opacity } : {}),
            ...(l.dashed ? { dashArray: '8 8' } : {}),
          }}
        />
      ))}
      {markers.filter((m) => m && m.point).map((m, i) => (
        <Pin key={m.key ?? i} {...m} />
      ))}
    </BaseMap>
  );
}

function Pin({ point, icon = 'home', popup, draggable, onDragEnd, zIndex }) {
  const ref = useRef(null);
  const handlers = useMemo(
    () => ({
      dragend() {
        const ll = ref.current?.getLatLng();
        if (ll && onDragEnd) onDragEnd([ll.lat, ll.lng]);
      },
    }),
    [onDragEnd]
  );
  return (
    <Marker
      position={point}
      icon={icons[icon] || icons.home}
      draggable={!!draggable}
      eventHandlers={draggable ? handlers : undefined}
      ref={ref}
      zIndexOffset={zIndex}
    >
      {popup && <Popup>{popup}</Popup>}
    </Marker>
  );
}
