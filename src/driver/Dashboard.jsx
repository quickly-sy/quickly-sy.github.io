import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker } from 'react-leaflet';
import { supabase, run, rpc, subscribe } from '../shared/supabase';
import { BaseMap, FitBounds, icons, DEFAULT_CENTER } from '../shared/map';
import { STATUS, DRIVER_STATUS, ACTIVE_STATUSES, TASK_STATUS, TASK_BADGE, TASK_RUNNING, money, toPoint } from '../shared/utils';
import { startAlarm, stopAlarm, isMuted, setMuted } from '../shared/alarm';
import { Rating } from '../shared/Stars';

// رسائل تظهر لكابتن التوصيل بعد كل تسليم
const CHEERS = [
  'تسليم نظيف 👏',
  'أحسنت، زبون آخر وصله طلبه في وقته 🚀',
  'شغل ممتاز، استمر 💪',
  'طلب آخر في الطريق الصحيح ✅',
  'سرعتك هي سمعة Quickly 🏅',
];
import { watchLocation, sendLocation, isNativeApp, openAppSettings } from './location';

// توفير رسائل Realtime: كل 5 ثواني أثناء التوصيل، وكل 30 ثانية وأنت فاضي
const EVERY_ACTIVE_MS = 5000;
const EVERY_IDLE_MS = 30000;

const directionsUrl = (from, to) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${from.join(',')};${to.join(',')}`;

export default function Dashboard({ profile }) {
  const [me, setMe] = useState(null);
  const [offers, setOffers] = useState([]);
  const [declined, setDeclined] = useState([]); // عروض رفضتها (تختفي من شاشتي فقط)
  const reportedRef = useRef(new Set()); // عروض سجّلنا أنك شاهدتها
  const [active, setActive] = useState([]);
  const [tasks, setTasks] = useState([]); // مهمات السائق الخاص
  const [pos, setPos] = useState(null);
  const [simulate, setSimulate] = useState(false);
  const [error, setError] = useState('');
  const [muted, setMutedState] = useState(isMuted());
  const [cheer, setCheer] = useState(null); // { text, count } بعد كل تسليم

  const posRef = useRef(null);
  const simRef = useRef(false);
  const activeRef = useRef([]);
  const tasksRef = useRef([]);
  simRef.current = simulate;
  activeRef.current = active;
  tasksRef.current = tasks;

  const load = useCallback(async () => {
    try {
      const m = await run(supabase.from('drivers').select('*').eq('user_id', profile.id).single());
      const isPrivate = m.kind === 'private';
      const [o, a, t] = await Promise.all([
        !isPrivate && m.status === 'available' ? run(supabase.from('order_offers').select('*').order('order_id')) : [],
        isPrivate ? [] : run(supabase.from('orders').select('*, order_items(*)').eq('driver_id', m.id).in('status', ACTIVE_STATUSES).order('id')),
        isPrivate ? run(supabase.from('tasks').select('*').eq('driver_id', m.id).in('status', ['assigned', ...TASK_RUNNING]).order('id')) : [],
      ]);
      if (!isPrivate) {
        const d = await run(supabase.from('offer_views').select('order_id').eq('driver_id', m.id).not('declined_at', 'is', null));
        setDeclined(d.map((x) => x.order_id));
      }
      setMe(m);
      setOffers(o);
      setActive(a);
      setTasks(t);
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
    const unsub = subscribe([{ event: '*', table: 'order_offers' }], load);
    const timer = setInterval(load, 30000);
    return () => { unsub(); clearInterval(timer); };
  }, [load]);

  // تسجيل "شاهد العرض" — فقط والشاشة ظاهرة أمام السائق
  const visibleOffers = offers.filter((o) => !declined.includes(o.order_id));
  useEffect(() => {
    const report = () => {
      if (document.visibilityState !== 'visible') return;
      const ids = visibleOffers.map((o) => o.order_id).filter((id) => !reportedRef.current.has(id));
      if (!ids.length) return;
      ids.forEach((id) => reportedRef.current.add(id));
      supabase.rpc('driver_offer_seen', { p_order_ids: ids }).then(() => {});
    };
    report();
    document.addEventListener('visibilitychange', report);
    return () => document.removeEventListener('visibilitychange', report);
  }, [visibleOffers.map((o) => o.order_id).join(',')]);

  // يرن حتى تقبل العرض أو ترفضه — وكذلك عند وصول مهمة خاصة
  const waitingTask = tasks.some((t) => t.status === 'assigned');
  const needsAnswer = visibleOffers.length > 0 || waitingTask;
  useEffect(() => {
    if (needsAnswer && !muted) startAlarm();
    else stopAlarm();
    return stopAlarm;
  }, [needsAnswer, muted]);

  function toggleMute() {
    const next = !muted;
    setMutedState(next);
    setMuted(next);
  }

  // تغييرات طلباتي (المتجر جهّز، الأدمن عيّنني...)
  const myId = me?.id;
  useEffect(() => {
    if (!myId) return;
    return subscribe(
      [
        { event: '*', table: 'orders', filter: `driver_id=eq.${myId}` },
        { event: '*', table: 'tasks', filter: `driver_id=eq.${myId}` },
      ],
      (payload) => {
        load();
      }
    );
  }, [myId, load]);

  const online = !!me && me.status !== 'offline';
  const isPrivate = me?.kind === 'private';
  const runningTask = tasks.find((t) => TASK_RUNNING.includes(t.status));
  const hasActive = active.length > 0 || !!runningTask;

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
    return watchLocation(
      (p) => {
        if (simRef.current) return;
        posRef.current = p;
        maybeSend();
      },
      { distanceFilter: runningTask ? 0 : 10 } // المهمة الخاصة: تحديث مستمر حتى لو واقف
    );
  }, [online, !!runningTask]);

  // إرسال الموقع: كل 5 ثواني أثناء التوصيل، وكل 30 ثانية وأنت فاضي
  const lastSentRef = useRef(0);
  const everyRef = useRef(EVERY_IDLE_MS);
  const every = hasActive ? EVERY_ACTIVE_MS : EVERY_IDLE_MS;
  everyRef.current = every;

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
    const timer = setInterval(tick, every);
    return () => clearInterval(timer);
  }, [online, every]);

  // وضع المحاكاة: يقرّب السائق 25% نحو هدفه بكل تحديث (للتجربة من الكمبيوتر)
  function moveTowardTarget() {
    const p = posRef.current;
    const task = tasksRef.current.find((t) => TASK_RUNNING.includes(t.status));
    if (task && p) {
      const to = toPoint(task.to_lat, task.to_lng);
      if (to) posRef.current = [p[0] + (to[0] - p[0]) * 0.25, p[1] + (to[1] - p[1]) * 0.25];
      return;
    }
    const order = activeRef.current[0];
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

  // بعد تسليم الطلب: رسالة تحفيزية + عدد ما سلّمته اليوم
  async function deliver(order) {
    try {
      await rpc('driver_set_order_status', { p_order_id: order.id, p_status: 'delivered' });
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const rows = await run(
        supabase.from('orders').select('id').eq('driver_id', me.id).eq('status', 'delivered').gte('delivered_at', since.toISOString())
      ).catch(() => []);
      setCheer({ text: CHEERS[Math.floor(Math.random() * CHEERS.length)], count: rows.length || 1 });
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

      {cheer && (
        <section className="panel stack" style={{ textAlign: 'center' }}>
          <h2>{cheer.text}</h2>
          <p className="muted" style={{ margin: 0 }}>سلّمت اليوم {cheer.count} طلب</p>
          <button className="ghost" onClick={() => setCheer(null)}>متابعة</button>
        </section>
      )}

      <section className="panel stack">
        <div className="row between">
          <div>
            <h3 className="row" style={{ gap: 10 }}>
              <span>حالتك الآن: <span className={`badge ${me.status}`}>{DRIVER_STATUS[me.status]}</span></span>
              <Rating avg={me.rating_avg} count={me.rating_count} />
            </h3>
            <div className="muted">
              {!online && 'أنت غير متصل، لن تصلك طلبات'}
              {online && runningTask && 'تتبع كامل: موقعك يُرسل كل 5 ثواني ويُسجَّل المسار.'}
              {online && hasActive && !runningTask && 'العميل بانتظارك لاستلام الطلب'}
              {online && !hasActive && me.status === 'available' && (isPrivate ? 'حسابك متاح لاستقبال المهام' : 'حسابك متاح لاستقبال الطلبات')}
              {online && !hasActive && me.status === 'busy' && 'حالتك مشغول: لن تصلك طلبات جديدة'}
            </div>
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
            <button className="ghost" onClick={toggleMute} title={muted ? 'تشغيل صوت التنبيه' : 'كتم صوت التنبيه'}>
              {muted ? '🔕' : '🔔'}
            </button>
            {isNativeApp && (
              <button className="ghost" title="إعدادات التطبيق (الأذونات والبطارية)" aria-label="إعدادات التطبيق" onClick={openAppSettings}>⚙️</button>
            )}
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
                  <button className="ok" onClick={() => deliver(o)}>تم التسليم للزبون</button>
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

      {isPrivate && (
        <section className="stack">
          <h2>مهماتي</h2>
          {!tasks.length ? (
            <div className="empty">لا توجد مهمات حالياً. ستسمع تنبيهاً عند وصول مهمة.</div>
          ) : (
            tasks.map((t) => {
              const from = toPoint(t.from_lat, t.from_lng);
              const to = toPoint(t.to_lat, t.to_lng);
              const next = {
                assigned: ['started', 'انطلقت'],
                started: ['arrived', 'وصلت'],
                arrived: ['done', 'تم التسليم'],
              }[t.status];
              return (
                <section key={t.id} className="panel stack">
                  <div className="row between">
                    <h2>{t.title}</h2>
                    <span className={`badge ${TASK_BADGE[t.status]}`}>{TASK_STATUS[t.status]}</span>
                  </div>
                  <div className="split wide">
                    <BaseMap height={300}>
                      <FitBounds points={[from, to]} />
                      {from && <Marker position={from} icon={icons.vendor} />}
                      {to && <Marker position={to} icon={icons.bank} />}
                      {pos && <Marker position={pos} icon={icons.driver} />}
                    </BaseMap>
                    <div className="stack">
                      <div><label>من</label><strong>{t.from_name || '—'}</strong></div>
                      <div><label>إلى</label><strong>{t.to_name || '—'}</strong></div>
                      {t.notes && <div className="muted">ملاحظة: {t.notes}</div>}
                      {TASK_RUNNING.includes(t.status) && (
                        <div className="notice">التتبع الكامل مفعّل حتى تضغط "تم التسليم".</div>
                      )}
                      {pos && to && <a href={directionsUrl(pos, to)} target="_blank" rel="noreferrer">افتح المسار</a>}
                      {next && (
                        <button
                          className={t.status === 'arrived' ? 'ok' : ''}
                          disabled={t.status === 'assigned' && !!runningTask}
                          onClick={() => act(() => rpc('driver_set_task_status', { p_task_id: t.id, p_status: next[0] }))}
                        >
                          {next[1]}
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              );
            })
          )}
        </section>
      )}

      {me.status === 'available' && !isPrivate && (
        <section className="stack">
          <div className="row between">
            <h2>عروض الطلبات</h2>
            {needsAnswer && !muted && <button className="ghost sm" onClick={stopAlarm}>🔇 إسكات هذا التنبيه</button>}
          </div>
          {!visibleOffers.length ? (
            <div className="empty">لا توجد عروض الآن. ستسمع تنبيهاً عند وصول عرض.</div>
          ) : (
            <div className="grid">
              {visibleOffers.map((o) => (
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
                  <div className="row">
                    <button style={{ flex: 1 }} onClick={() => act(() => rpc('driver_accept_order', { p_order_id: o.order_id }))}>قبول الطلب</button>
                    <button className="ghost" onClick={() => {
                      setDeclined((d) => [...d, o.order_id]);
                      rpc('driver_decline_offer', { p_order_id: o.order_id }).catch(() => {});
                    }}>رفض</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
