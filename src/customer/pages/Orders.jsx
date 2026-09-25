import { useEffect, useState } from 'react';
import { supabase, run, subscribe } from '../../shared/supabase';
import { readCache, writeCache } from '../../shared/cache';
import { STATUS, money, formatTime } from '../../shared/utils';

export default function Orders({ profile, onTrack }) {
  const [orders, setOrders] = useState(() => readCache(`orders:${profile.id}`));

  useEffect(() => {
    const load = () =>
      run(
        supabase.from('orders')
          .select('id, status, total, delivery_fee, vendor_name, created_at, order_items(id)')
          .eq('customer_id', profile.id).order('id', { ascending: false }).limit(50)
      )
        .then((rows) => { setOrders(rows); writeCache(`orders:${profile.id}`, rows); })
        .catch(() => setOrders((o) => o || []));
    load();
    return subscribe([{ event: '*', table: 'orders', filter: `customer_id=eq.${profile.id}` }], load);
  }, [profile.id]);

  if (!orders) return <p className="muted">جاري التحميل...</p>;
  if (!orders.length) return <div className="empty">لم تطلب شيئاً بعد.</div>;

  return (
    <div className="stack">
      <h2>طلباتي</h2>
      {orders.map((o) => (
        <div key={o.id} className="panel row between">
          <div>
            <strong>طلب #{o.id} من {o.vendor_name}</strong>
            <div className="muted">{formatTime(o.created_at)}، {o.order_items.length} منتجات</div>
          </div>
          <div className="row">
            <span className={`badge ${o.status}`}>{STATUS[o.status]}</span>
            <span className="price">{money(Number(o.total) + Number(o.delivery_fee))}</span>
            <button className="sm" onClick={() => onTrack(o.id)}>تتبّع</button>
          </div>
        </div>
      ))}
    </div>
  );
}
