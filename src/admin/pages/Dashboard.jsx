import { useCallback, useEffect, useState } from 'react';
import { Marker, Popup } from 'react-leaflet';
import { supabase, run, rpc, subscribe } from '../../shared/supabase';
import { BaseMap, icons } from '../../shared/map';
import { DRIVER_STATUS, money, toPoint } from '../../shared/utils';

// "منذ 5 دقائق" — مهم للسائق غير المتصل لأن موقعه قديم
function sinceText(t) {
  if (!t) return 'غير معروف';
  const min = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (min < 1) return 'الآن';
  if (min < 60) return `منذ ${min} دقيقة`;
  const h = Math.round(min / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  return `منذ ${Math.round(h / 24)} يوم`;
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    rpc('admin_stats').then(setStats).catch((e) => setError(e.message));
    run(supabase.from('vendors').select('id, name, lat, lng')).then(setVendors).catch(() => {});
    run(supabase.from('drivers').select('id, status, is_active, current_lat, current_lng, location_at, profile:profiles(name, phone)')).then(setDrivers).catch(() => {});
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
        <div className="row between">
          <h3>الخريطة المباشرة</h3>
          <div className="legend">
            <span><i style={{ borderColor: '#1d8a4e' }} />متاح</span>
            <span><i style={{ borderColor: '#e67700' }} />مشغول</span>
            <span><i style={{ borderColor: '#c8322b' }} />غير متصل (آخر موقع معروف)</span>
          </div>
        </div>
        <BaseMap height={440}>
          {vendors.map((v) => {
            const p = toPoint(v.lat, v.lng);
            return p && <Marker key={`v${v.id}`} position={p} icon={icons.vendor}><Popup>{v.name}</Popup></Marker>;
          })}
          {drivers.filter((d) => d.is_active).map((d) => {
            const p = toPoint(d.current_lat, d.current_lng);
            const icon = { available: icons.driverAvailable, busy: icons.driverBusy, offline: icons.driverOffline }[d.status];
            return p && (
              <Marker key={`d${d.id}`} position={p} icon={icon} zIndexOffset={d.status === 'offline' ? -100 : 100}>
                <Popup>
                  <strong>{d.profile?.name}</strong> — {DRIVER_STATUS[d.status]}
                  <br />
                  <a href={`tel:${d.profile?.phone}`} dir="ltr">{d.profile?.phone}</a>
                  <br />
                  {d.status === 'offline' ? 'آخر موقع معروف' : 'آخر تحديث'}: {sinceText(d.location_at)}
                </Popup>
              </Marker>
            );
          })}
        </BaseMap>
      </section>
    </div>
  );
}
