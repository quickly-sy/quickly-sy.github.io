import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase, run, rpc, subscribe } from '../../shared/supabase';
import { STATUS, ACTIVE_STATUSES, money, toPoint } from '../../shared/utils';
import { Stars } from '../../shared/Stars';
import { useSaver } from '../../shared/saver';

const MapView = lazy(() => import('../../shared/MapView'));

const STEPS = ['confirmed', 'preparing', 'ready', 'picked', 'delivered'];

export default function Track({ orderId, onBack }) {
  const [order, setOrder] = useState(null);
  const [driverPos, setDriverPos] = useState(null);
  const [error, setError] = useState('');
  const [saver] = useSaver();
  const [showMap, setShowMap] = useState(!saver);

  // الطلب + تحديثاته المباشرة
  useEffect(() => {
    run(supabase.from('orders').select('*, order_items(*)').eq('id', orderId).single())
      .then(setOrder)
      .catch((e) => setError(e.message));
    return subscribe([{ event: 'UPDATE', table: 'orders', filter: `id=eq.${orderId}` }], ({ new: row }) =>
      setOrder((o) => ({ ...o, ...row }))
    );
  }, [orderId]);

  // موقع السائق المباشر (فقط بعد تعيين سائق وطول ما الطلب نشط)
  const driverId = order?.driver_id;
  const tracking = !!driverId && ACTIVE_STATUSES.includes(order?.status);
  useEffect(() => {
    if (!tracking) return;
    run(supabase.from('drivers').select('current_lat, current_lng').eq('id', driverId).single())
      .then((d) => setDriverPos(toPoint(d.current_lat, d.current_lng)))
      .catch(() => {});
    return subscribe([{ event: 'UPDATE', table: 'drivers', filter: `id=eq.${driverId}` }], ({ new: d }) =>
      setDriverPos(toPoint(d.current_lat, d.current_lng))
    );
  }, [driverId, tracking]);

  async function cancel() {
    if (!window.confirm('إلغاء الطلب؟')) return;
    try {
      await rpc('customer_cancel_order', { p_order_id: orderId });
      setOrder((o) => ({ ...o, status: 'cancelled' }));
    } catch (e) {
      alert(e.message);
    }
  }

  if (error) return <div className="error">{error}</div>;
  if (!order) return <p className="muted">جاري التحميل...</p>;

  if (order.status === 'delivered') return <Delivered order={order} onBack={onBack} />;

  const vendorPoint = toPoint(order.vendor_lat, order.vendor_lng);
  const homePoint = toPoint(order.customer_lat, order.customer_lng);
  const stepIndex = STEPS.indexOf(order.status);

  return (
    <div className="stack">
      <button className="ghost sm" onClick={onBack}>كل طلباتي</button>
      <div className="split wide">
        <section className="panel stack">
          <div className="row between">
            <h2>طلب #{order.id}</h2>
            <span className={`badge ${order.status}`}>{STATUS[order.status]}</span>
          </div>
          {order.status !== 'cancelled' && (
            <div className="progress" aria-label={STATUS[order.status]}>
              {STEPS.map((s, i) => <span key={s} className={i <= stepIndex ? 'done' : ''} />)}
            </div>
          )}
          {showMap ? (
            <Suspense fallback={<span className="sk" style={{ height: 380 }} />}>
              <MapView
                height={380}
                fit={[vendorPoint, homePoint]}
                markers={[
                  vendorPoint && { point: vendorPoint, icon: 'vendor', popup: order.vendor_name },
                  homePoint && { point: homePoint, icon: 'home', popup: 'موقعك' },
                  tracking && driverPos && { point: driverPos, icon: 'driver', popup: order.driver_name },
                ]}
              />
            </Suspense>
          ) : (
            <button type="button" className="ghost" onClick={() => setShowMap(true)}>🗺️ اعرض الخريطة</button>
          )}
          {order.status === 'picked' && <p className="muted">موقع السائق يتحدث مباشرة.</p>}
        </section>

        <section className="panel stack">
          <h3>{order.vendor_name}</h3>
          {order.driver_id ? (
            <div>
              السائق: <strong>{order.driver_name}</strong>{' '}
              <a href={`tel:${order.driver_phone}`} dir="ltr">{order.driver_phone}</a>
            </div>
          ) : (
            order.status !== 'cancelled' && <div className="muted">لم يُعيَّن سائق بعد.</div>
          )}
          <div>
            {(order.order_items || []).map((i) => (
              <div key={i.id} className="item-line">
                <span className="row" style={{ gap: 8 }}>
                  {i.variant_image && <img className="row-thumb sm" src={i.variant_image} alt="" loading="lazy" />}
                  <span>
                    {i.quantity} × {i.product_name}
                    {i.variant_label && <span className="vtag">{i.variant_label}</span>}
                  </span>
                </span>
                <span className="price">{money(Number(i.price) * i.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="row between"><span>التوصيل</span><span className="price">{money(order.delivery_fee)}</span></div>
          <div className="row between">
            <strong>المجموع</strong>
            <span className="price">{money(Number(order.total) + Number(order.delivery_fee))}</span>
          </div>
          <div className="muted">إلى: {order.customer_address}</div>
          {order.status === 'pending' && <button className="danger" onClick={cancel}>إلغاء الطلب</button>}
        </section>
      </div>
    </div>
  );
}

// بعد الاستلام: شكراً + تقييم المتجر وكابتن التوصيل
function Delivered({ order, onBack }) {
  const [vendorStars, setVendorStars] = useState(0);
  const [driverStars, setDriverStars] = useState(0);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    run(supabase.from('ratings').select('*').eq('order_id', order.id).maybeSingle())
      .then((r) => {
        if (!r) return;
        setVendorStars(r.vendor_stars || 0);
        setDriverStars(r.driver_stars || 0);
        setComment(r.comment || '');
        setSaved(true);
      })
      .catch(() => {});
  }, [order.id]);

  async function send() {
    setError('');
    if (!vendorStars && !driverStars) return setError('اختر عدد النجوم أولاً');
    setBusy(true);
    try {
      await rpc('customer_rate_order', {
        p_order_id: order.id,
        p_vendor_stars: vendorStars || null,
        p_driver_stars: driverStars || null,
        p_comment: comment || null,
      });
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <button className="ghost sm" onClick={onBack}>كل طلباتي</button>
      <section className="panel stack" style={{ textAlign: 'center' }}>
        <h2>وصل طلبك 🎉</h2>
        <p className="muted" style={{ margin: 0 }}>
          طلب #{order.id} من {order.vendor_name} — {money(Number(order.total) + Number(order.delivery_fee))}
        </p>
      </section>

      <section className="panel stack">
        <h3>{saved ? 'شكراً لتقييمك' : 'كيف كانت تجربتك؟'}</h3>
        <Stars label={`المتجر: ${order.vendor_name}`} value={vendorStars} onChange={setVendorStars} />
        {order.driver_name && (
          <Stars label={`كابتن التوصيل: ${order.driver_name}`} value={driverStars} onChange={setDriverStars} />
        )}
        <div>
          <label>ملاحظة (اختياري)</label>
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="ما الذي أعجبك أو يمكن تحسينه؟" />
        </div>
        {error && <div className="error">{error}</div>}
        <button onClick={send} disabled={busy}>{busy ? 'جاري الإرسال...' : saved ? 'تعديل التقييم' : 'أرسل التقييم'}</button>
      </section>
    </div>
  );
}
