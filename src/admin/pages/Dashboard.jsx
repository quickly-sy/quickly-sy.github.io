import { useCallback, useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { supabase, run, rpc, subscribe } from '../../shared/supabase';
import { BaseMap, icons } from '../../shared/map';
import { DRIVER_STATUS, money, toPoint } from '../../shared/utils';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    rpc('admin_stats').then(setStats).catch((e) => setError(e.message));
    run(supabase.from('vendors').select('id, name, lat, lng')).then(setVendors).catch(() => {});
    run(supabase.from('drivers').select('id, status, current_lat, current_lng, profile:profiles(name)')).then(setDrivers).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const offOrders = subscribe([{ event: '*', table: 'orders' }], () => rpc('admin_stats').then(setStats).catch(() => {}));
    // حركة السائقين مباشرة على الخريطة
    const offDrivers = subscribe([{ event: 'UPDATE', table: 'drivers' }], ({ new: d }) =>
      setDrivers((list) => list.map((x) => (x.id === d.id ? { ...x, ...d } : x)))
    );
    return () => { offOrders(); offDrivers(); };
  }, [load]);

  if (error) return <div className="error">{error}</div>;
  if (!stats) return <p className="muted">جاري التحميل...</p>;

  const cards = [
    ['طلبات اليوم', stats.orders_today],
    ['طلبات جارية', stats.active_orders],
    ['تحتاج متابعة', stats.need_attention],
    ['مبيعات اليوم المسلّمة', money(stats.revenue_today)],
    ['متاجر مفتوحة', stats.open_vendors],
    ['سائقون متاحون', stats.available_drivers],
  ];

  return (
    <div className="stack">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
        {cards.map(([label, value]) => (
          <div key={label} className="panel stat"><b>{value}</b><span className="muted">{label}</span></div>
        ))}
      </div>
      {Number(stats.need_attention) > 0 && (
        <div className="error">يوجد {stats.need_attention} طلب بانتظار قبول المتجر أو تعيين سائق — راجع صفحة الطلبات.</div>
      )}
      <section className="panel stack">
        <h3>الخريطة المباشرة</h3>
        <BaseMap height={440}>
          {vendors.map((v) => {
            const p = toPoint(v.lat, v.lng);
            return p && <Marker key={`v${v.id}`} position={p} icon={icons.vendor}><Popup>{v.name}</Popup></Marker>;
          })}
          {drivers.filter((d) => d.status !== 'offline').map((d) => {
            const p = toPoint(d.current_lat, d.current_lng);
            return p && (
              <Marker key={`d${d.id}`} position={p} icon={icons.driver}>
                <Popup>{d.profile?.name} — {DRIVER_STATUS[d.status]}</Popup>
              </Marker>
            );
          })}
        </BaseMap>
      </section>
    </div>
  );
}
