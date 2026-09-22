import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker } from 'react-leaflet';
import { supabase, run, rpc, subscribe } from '../shared/supabase';
import { BaseMap, FitBounds, icons, DEFAULT_CENTER } from '../shared/map';
import { STATUS, DRIVER_STATUS, ACTIVE_STATUSES, money, toPoint, playBeep } from '../shared/utils';
import { watchLocation, sendLocation, isNativeApp, openAppSettings } from './location';

// توفير رسائل Realtime: كل 5 ثواني أثناء التوصيل، وكل 30 ثانية وأنت فاضي
const EVERY_ACTIVE_MS = 5000;
const EVERY_IDLE_MS = 30000;

const directionsUrl = (from, to) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.join(',')};${to.join(',')}`;

export default function Dashboard({ profile }) {
  const [me, setMe] = useState(null);
  const [offers, setOffers] = useState([]);
  const [active, setActive] = useState([]);
  const [pos, setPos] = useState(null);
  const [simulate, setSimulate] = useState(false);
  const [error, setError] = useState('');

  const posRef = useRef(null);
  const simRef = useRef(false);
  const activeRef = useRef([]);
  simRef.current = simulate;
  activeRef.current = active;

  const load = useCallback(async () => {
    try {
      const m = await run(supabase.from('drivers').select('*').eq('user_id', profile.id).single());
      const [o, a] = await Promise.all([
        m.status === 'available' ? run(supabase.from('order_offers').select('*').order('order_id')) : [],
        run(supabase.from('orders').select('*, order_items(*)').eq('driver_id', m.id).in('status', ACTIVE_STATUSES).order('id')),
      ]);
      setMe(m);
      setOffers(o);
      setActive(a);
      if (!posRef.current) {
        posRef.current = toPoint(m.current_lat, m.current_lng) || DEFAULT_CENTER;
        setPos(posRef.current);
      }
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, [profile.id]);

  // عروض جديدة + تحديث احتياطي كل 30 ثانية (لو الأدمن نقل طلباً منك)
  useEffect(() => {
    load();
    const unsub = subscribe([{ event: '*', table: 'order_offers' }], (payload) => {
      if (payload.eventType === 'INSERT') playBeep();
      load();
    });
    const timer = setInterval(load, 30000);
    return () => { unsub(); clearInterval(timer); };
  }, [load]);

  // تغييرات طلباتي (المتجر جهّز، الأدمن عيّنني...)
  const myId = me?.id;
  useEffect(() => {
    if (!myId) return;
    return subscribe([{ event: '*', table: 'orders', filter: `driver_id=eq.${myId}` }], load);
  }, [myId, load]);

  const online = !!me && me.status !== 'offline';
  const hasActive = active.length > 0;

  // إبقاء الشاشة مضاءة أثناء التوصيل (Screen Wake Lock) — بدونها الموبايل يطفي الشاشة ويتوقف إرسال الموقع
  const [awake, setAwake] = useState(false);
  useEffect(() => {
    if (!hasActive || !('wakeLock' in navigator)) return;
    let lock = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (cancelled) return lock.release();
        setAwake(true);
        lock.addEventListener('release', () => setAwake(false));
      } catch {
        setAwake(false);
      }
    };
    // المتصفح يلغي القفل عند مغادرة الصفحة، فنطلبه من جديد عند الرجوع
    const onVisible = () => document.visibilityState === 'visible' && request();
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
      setAwake(false);
    };
  }, [hasActive]);

  // GPS الحقيقي (بالتطبيق: يستمر بالخلفية ويرسل الموقع مباشرة من هنا)
  useEffect(() => {
    if (!online) return;
    return watchLocation((p) => {
      if (simRef.current) return;
      posRef.current = p;
      maybeSend();
    });
  }, [online]);

  // إرسال الموقع: كل 5 ثواني أثناء التوصيل، وكل 30 ثانية وأنت فاضي
  const lastSentRef = useRef(0);
  const everyRef = useRef(EVERY_IDLE_MS);
  everyRef.current = hasActive ? EVERY_ACTIVE_MS : EVERY_IDLE_MS;

  function maybeSend(force = false) {
    const p = posRef.current;
    if (!p) return;
    const now = Date.now();
    if (!force && now - lastSentRef.current < everyRef.current - 500) return;
    lastSentRef.current = now;
    setPos([...p]);
    sendLocation(p).catch(() => {});
  }

  useEffect(() => {
    if (!online) return;
    const tick = () => {
      if (simRef.current) moveTowardTarget();
      maybeSend(simRef.current);
    };
    maybeSend(true);
    const timer = setInterval(tick, hasActive ? EVERY_ACTIVE_MS : EVERY_IDLE_MS);
    return () => clearInterval(timer);
  }, [online, hasActive]);

  // وضع المحاكاة: يقرّب السائق 25% نحو هدفه بكل تحديث (للتجربة من الكمبيوتر)
  function moveTowardTarget() {
    const order = activeRef.current[0];
    const p = posRef.current;
    if (!order || !p) return;
    const target = order.status === 'picked'
      ? toPoint(order.customer_lat, order.customer_lng)
      : toPoint(order.vendor_lat, order.vendor_lng);
    if (!target) return;
    posRef.current = [p[0] + (target[0] - p[0]) * 0.25, p[1] + (target[1] - p[1]) * 0.25];
  }

  async function act(fn) {
    try {
      await fn();
    } catch (e) {
      alert(e.message);
    }
    load();
  }

  if (error && !me) return <div className="error">{error}</div>;
  if (!me) return <p className="muted">جاري التحميل...</p>;

  return (
    <div className="stack">
      {!me.is_active && <div className="error">حسابك موقوف حالياً. تواصل مع إدارة Quickly.</div>}

      <section className="panel stack">
        <div className="row between">
          <div>
            <h3>حالتك الآن: <span className={`badge ${me.status}`}>{DRIVER_STATUS[me.status]}</span></h3>
            <div className="muted">
              {online ? (hasActive ? 'موقعك يُرسل كل 5 ثواني.' : 'موقعك يُرسل كل 30 ثانية.') : 'أنت غير متصل، لن تصلك عروض.'}
            </div>
            {isNativeApp && (
              <div className="row" style={{ marginTop: 8 }}>
                <span className="notice">موقعك يُتابَع حتى والشاشة مطفية.</span>
                <button className="ghost sm" onClick={openAppSettings}>إعدادات التطبيق</button>
              </div>
            )}
            {hasActive && !isNativeApp && (
              <div className={awake ? 'notice' : 'error'} style={{ marginTop: 8 }}>
                {awake
                  ? 'الشاشة ستبقى مضاءة حتى تسليم الطلب. لا تغلق هذه الصفحة.'
                  : 'أبقِ هذه الصفحة مفتوحة والشاشة مضاءة حتى التسليم، وإلا يتوقف تتبّع موقعك.'}
              </div>
            )}
          </div>
          <div className="row">
            {['available', 'busy', 'offline'].map((s) => (
              <button key={s} className={me.status === s ? '' : 'ghost'}
                      onClick={() => act(() => rpc('driver_set_availability', { p_status: s }))}>
                {DRIVER_STATUS[s]}
              </button>
            ))}
          </div>
        </div>
        <label className="row" style={{ margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
          وضع المحاكاة: حرّك السائق تلقائياً نحو المتجر ثم الزبون (للتجربة فقط)
        </label>
      </section>

      {active.map((o) => {
        const vendorPoint = toPoint(o.vendor_lat, o.vendor_lng);
        const homePoint = toPoint(o.customer_lat, o.customer_lng);
        const target = o.status === 'picked' ? homePoint : vendorPoint;
        return (
          <section key={o.id} className="panel stack">
            <div className="row between">
              <h2>طلب #{o.id}</h2>
              <span className={`badge ${o.status}`}>{STATUS[o.status]}</span>
            </div>
            <div className="split wide">
              <BaseMap height={320}>
                <FitBounds points={[vendorPoint, homePoint]} />
                {vendorPoint && <Marker position={vendorPoint} icon={icons.vendor} />}
                {homePoint && <Marker position={homePoint} icon={icons.home} />}
                {pos && <Marker position={pos} icon={icons.driver} />}
              </BaseMap>
              <div className="stack">
                <div>
                  <label>الاستلام من</label>
                  <strong>{o.vendor_name}</strong>
                  <div className="muted">{o.vendor_address}</div>
                </div>
                <div>
                  <label>التسليم إلى</label>
                  <strong>{o.customer_name}</strong> <a href={`tel:${o.customer_phone}`} dir="ltr">{o.customer_phone}</a>
                  <div className="muted">{o.customer_address}</div>
                </div>
                <div>
                  {o.order_items.map((i) => <div key={i.id} className="muted">{i.quantity} × {i.product_name}</div>)}
                </div>
                {o.notes && <div className="muted">ملاحظة: {o.notes}</div>}
                <div className="row between">
                  <span>تحصيل من الزبون</span>
                  <span className="price">{money(Number(o.total) + Number(o.delivery_fee))}</span>
                </div>
                {pos && target && <a href={directionsUrl(pos, target)} target="_blank" rel="noreferrer">افتح المسار في OpenStreetMap</a>}
                {o.status === 'picked' ? (
                  <button className="ok" onClick={() => act(() => rpc('driver_set_order_status', { p_order_id: o.id, p_status: 'delivered' }))}>
                    تم التسليم للزبون
                  </button>
                ) : (
                  <button disabled={o.status !== 'ready'}
                          onClick={() => act(() => rpc('driver_set_order_status', { p_order_id: o.id, p_status: 'picked' }))}>
                    {o.status === 'ready' ? 'استلمت الطلب من المتجر' : 'بانتظار تجهيز المتجر...'}
                  </button>
                )}
              </div>
            </div>
          </section>
        );
      })}

      {me.status === 'available' && (
        <section className="stack">
          <h2>عروض الطلبات</h2>
          {!offers.length ? (
            <div className="empty">لا توجد عروض الآن. ستسمع تنبيهاً عند وصول عرض.</div>
          ) : (
            <div className="grid">
              {offers.map((o) => (
                <div key={o.order_id} className="panel stack">
                  <div className="row between">
                    <h3>#{o.order_id} {o.vendor_name}</h3>
                    <span className={`badge ${o.status}`}>{STATUS[o.status]}</span>
                  </div>
                  <div className="muted">من: {o.vendor_address}</div>
                  <div className="muted">إلى: {o.customer_address}</div>
                  <div className="row between">
                    <span>{o.items_count} قطع</span>
                    <span className="price">أجرة التوصيل {money(o.delivery_fee)}</span>
                  </div>
                  <button onClick={() => act(() => rpc('driver_accept_order', { p_order_id: o.order_id }))}>قبول الطلب</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
