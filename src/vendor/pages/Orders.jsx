import { useCallback, useEffect, useState } from 'react';
import { supabase, run, rpc, subscribe } from '../../shared/supabase';
import { STATUS, money, formatTime } from '../../shared/utils';
import { startAlarm, stopAlarm, isMuted, setMuted } from '../../shared/alarm';

const ACTIONS = {
  pending: [
    { to: 'confirmed', label: 'قبول الطلب', cls: 'ok' },
    { to: 'cancelled', label: 'رفض', cls: 'danger' },
  ],
  confirmed: [
    { to: 'preparing', label: 'بدء التحضير' },
    { to: 'cancelled', label: 'إلغاء', cls: 'ghost' },
  ],
  preparing: [{ to: 'ready', label: 'الطلب جاهز للسائق', cls: 'ok' }],
};

export default function Orders({ vendorId }) {
  const [scope, setScope] = useState('active');
  const [orders, setOrders] = useState([]);
  const [fresh, setFresh] = useState([]);
  const [muted, setMutedState] = useState(isMuted());
  const [error, setError] = useState('');

  const load = useCallback(() => {
    let q = supabase.from('orders').select('*, order_items(*)').eq('vendor_id', vendorId);
    q = scope === 'active'
      ? q.in('status', ['pending', 'confirmed', 'preparing', 'ready']).order('id')
      : q.in('status', ['picked', 'delivered', 'cancelled']).order('id', { ascending: false }).limit(50);
    run(q).then((rows) => { setOrders(rows); setError(''); }).catch((e) => setError(e.message));
  }, [scope, vendorId]);

  useEffect(() => {
    load();
    return subscribe([{ event: '*', table: 'orders', filter: `vendor_id=eq.${vendorId}` }], (payload) => {
      if (payload.eventType === 'INSERT') {
        setFresh((f) => [...f, payload.new.id]);
        document.title = `🔔 طلب جديد #${payload.new.id}`;
        setTimeout(() => (document.title = 'Quickly — المتجر'), 5000);
      }
      load();
    });
  }, [load, vendorId]);

  // يرن حتى يقبل المتجر الطلب أو يرفضه
  const hasPending = orders.some((o) => o.status === 'pending');
  useEffect(() => {
    if (hasPending && !muted) startAlarm();
    else stopAlarm();
    return stopAlarm;
  }, [hasPending, muted]);

  function toggleMute() {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  }

  async function setStatus(order, to) {
    if (to === 'cancelled' && !window.confirm(`تأكيد رفض الطلب #${order.id}؟`)) return;
    try {
      await rpc('vendor_set_order_status', { p_order_id: order.id, p_status: to });
      setFresh((f) => f.filter((id) => id !== order.id));
      load();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="stack">
      <div className="row between">
        <h2>{scope === 'active' ? 'الطلبات الحالية' : 'الطلبات السابقة'}</h2>
        <div className="row">
          {hasPending && !muted && <button className="ghost sm" onClick={stopAlarm}>🔇 إسكات هذا التنبيه</button>}
          <button className="ghost sm" onClick={toggleMute} title={muted ? 'تشغيل صوت التنبيه' : 'كتم صوت التنبيه'}>
            {muted ? '🔕' : '🔔'}
          </button>
          <div className="tabs">
            <button className={scope === 'active' ? 'on' : ''} onClick={() => setScope('active')}>الحالية</button>
            <button className={scope === 'history' ? 'on' : ''} onClick={() => setScope('history')}>السابقة</button>
          </div>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {scope === 'active' && (
        <div className="notice">
          {muted
            ? 'صوت التنبيه مكتوم. اضغط 🔕 لتشغيله.'
            : 'التنبيه يبقى يرن حتى تقبل الطلب أو ترفضه. انقر على الصفحة مرة بعد فتحها حتى يسمح المتصفح بالصوت.'}
        </div>
      )}

      {!orders.length ? (
        <div className="empty">{scope === 'active' ? 'لا توجد طلبات الآن. سيصلك تنبيه صوتي عند وصول طلب.' : 'لا توجد طلبات سابقة.'}</div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {orders.map((o) => (
            <article key={o.id} className={`panel stack ${fresh.includes(o.id) ? 'fresh' : ''}`}>
              <div className="row between">
                <h3>طلب #{o.id}</h3>
                <span className={`badge ${o.status}`}>{STATUS[o.status]}</span>
              </div>
              <div className="muted">{formatTime(o.created_at)}، {o.customer_name}</div>
              <div>
                {o.order_items.map((i) => (
                  <div key={i.id} className="item-line">
                    <span className="row" style={{ gap: 8 }}>
                      {i.variant_image && <img className="row-thumb sm" src={i.variant_image} alt="" loading="lazy" />}
                      <span>
                        <strong>{i.quantity}×</strong> {i.product_name}
                        {i.variant_label && <span className="vtag">{i.variant_label}</span>}
                      </span>
                    </span>
                    <span className="price">{money(Number(i.price) * i.quantity)}</span>
                  </div>
                ))}
              </div>
              {o.notes && <div className="muted">ملاحظة: {o.notes}</div>}
              <div className="row between">
                <span className="muted">
                  {o.driver_name ? `السائق: ${o.driver_name}` : o.status === 'pending' ? '' : 'بانتظار سائق'}
                </span>
                <span className="price">{money(o.total)}</span>
              </div>
              {ACTIONS[o.status] && (
                <div className="row">
                  {ACTIONS[o.status].map((a) => (
                    <button key={a.to} className={a.cls || ''} onClick={() => setStatus(o, a.to)}>{a.label}</button>
                  ))}
                </div>
              )}
              {o.status === 'ready' && <div className="muted">سلّم الطلب للسائق عند وصوله.</div>}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
