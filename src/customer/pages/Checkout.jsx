import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { rpc } from '../../shared/supabase';
import { reverseGeocode } from '../../shared/geocode';
import { money, toPoint } from '../../shared/utils';
import ActionBar from '../../shared/ActionBar';
import { useSaver } from '../../shared/saver';
import AddressPicker from '../AddressPicker';

const MapView = lazy(() => import('../../shared/MapView'));

export default function Checkout({ cart, onQty, onDone, onBrowse }) {
  const [point, setPoint] = useState(null);
  const [accuracy, setAccuracy] = useState(null); // دقة GPS بالمتر
  const [label, setLabel] = useState(''); // اسم الشارع/الحي (تلقائي)
  const [details, setDetails] = useState(''); // تفاصيل اختيارية: البناء، الطابق...
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [saver] = useSaver();
  const [showMap, setShowMap] = useState(!saver);
  const fromSaved = useRef(false); // اختير عنوان محفوظ: لا داعي لجلب اسم المكان من جديد
  const vendorId = cart.vendor?.id;

  // رسوم التوصيل حسب المسافة
  useEffect(() => {
    if (!point || !vendorId) return;
    rpc('get_delivery_quote', { p_vendor_id: vendorId, p_lat: point[0], p_lng: point[1] })
      .then(setQuote)
      .catch(() => setQuote(null));
  }, [point, vendorId]);

  // اسم المكان تلقائياً (بعد توقف تحريك الدبوس بنصف ثانية)
  useEffect(() => {
    if (!point) return;
    if (fromSaved.current) { fromSaved.current = false; return; } // الاسم جاهز من العنوان المحفوظ
    setLabel('');
    const t = setTimeout(() => reverseGeocode(point).then(setLabel), 600);
    return () => clearTimeout(t);
  }, [point]);

  if (!cart.items.length) {
    return (
      <div className="empty stack">
        <p>سلتك فارغة.</p>
        <button onClick={onBrowse}>تصفح المتاجر</button>
      </div>
    );
  }

  const vendorPoint = toPoint(cart.vendor.lat, cart.vendor.lng);
  const subtotal = cart.items.reduce((s, i) => s + Number(i.product.price) * i.qty, 0);

  function locateMe() {
    setError('');
    if (!navigator.geolocation) return setError('المتصفح لا يدعم تحديد الموقع، حدد موقعك على الخريطة.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPoint([p.coords.latitude, p.coords.longitude]);
        setAccuracy(Math.round(p.coords.accuracy));
        setLocating(false);
      },
      (e) => {
        setLocating(false);
        setError(e.code === 1
          ? 'رفضت إذن الموقع. فعّله من إعدادات المتصفح، أو حدد موقعك على الخريطة.'
          : 'تعذر تحديد موقعك، حدده على الخريطة.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function submit() {
    setError('');
    if (!point) return setError('حدد موقع التسليم: اضغط "موقعي الحالي" أو اختر على الخريطة.');
    setSending(true);
    try {
      const address = [label, details.trim()].filter(Boolean).join(' — ');
      const orderId = await rpc('create_order', {
        p_vendor_id: cart.vendor.id,
        p_items: cart.items.map((i) => ({ product_id: i.product.id, quantity: i.qty })),
        p_lat: point[0],
        p_lng: point[1],
        p_address: address,
        p_notes: notes || null,
      });
      onDone(orderId);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="split">
      <section className="panel stack">
        <h2>سلتك من {cart.vendor.name}</h2>
        <div>
          {cart.items.map((i) => (
            <div key={i.product.id} className="item-line">
              <div>
                <strong>{i.product.name}</strong>
                <div className="muted">{money(i.product.price)}</div>
              </div>
              <div className="row">
                <button className="ghost sm" aria-label="إنقاص" onClick={() => onQty(i.product.id, -1)}>−</button>
                <strong>{i.qty}</strong>
                <button className="ghost sm" aria-label="زيادة" onClick={() => onQty(i.product.id, 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
        <hr />
        <div className="row between"><span>المنتجات</span><span className="price">{money(subtotal)}</span></div>
        <div className="row between">
          <span>التوصيل {quote && <span className="muted">({quote.distance_km} كم)</span>}</span>
          <span className="price">{quote ? money(quote.delivery_fee) : '—'}</span>
        </div>
        <div className="row between" style={{ fontSize: 19 }}>
          <strong>المجموع</strong>
          <span className="price">{money(subtotal + Number(quote?.delivery_fee || 0))}</span>
        </div>
        <div>
          <label>ملاحظات للمتجر (اختياري)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثلاً: الاسم على الأحرف المضيئة" />
        </div>
      </section>

      <section className="panel stack">
        <h3>أين نوصل طلبك؟</h3>

        <AddressPicker
          point={point}
          area={label}
          details={details}
          onPick={({ lat, lng, area, details: d }) => {
            fromSaved.current = true;
            setPoint([lat, lng]);
            setAccuracy(null);
            setLabel(area || '');
            setDetails(d || '');
            setError('');
          }}
        />

        <button onClick={locateMe} disabled={locating}>
          {locating ? 'جاري تحديد موقعك...' : '📍 استخدم موقعي الحالي'}
        </button>
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
          أو اضغط على الخريطة لاختيار المكان — ويمكنك سحب الدبوس 🏠 لتعديله
        </p>

        {showMap ? (
          <Suspense fallback={<span className="sk" style={{ height: 320 }} />}>
            <MapView
              height={320}
              center={vendorPoint || undefined}
              fit={[vendorPoint, point]}
              onPick={(p) => { setPoint(p); setAccuracy(null); }}
              circle={point && accuracy > 30 ? { center: point, radius: accuracy } : undefined}
              markers={[
                vendorPoint && { point: vendorPoint, icon: 'vendor' },
                point && {
                  point,
                  icon: 'home',
                  draggable: true,
                  onDragEnd: (p) => { setPoint(p); setAccuracy(null); },
                },
              ]}
            />
          </Suspense>
        ) : (
          <button type="button" className="ghost" onClick={() => setShowMap(true)}>
            🗺️ افتح الخريطة لتحديد الموقع
          </button>
        )}

        {point && (
          <div className="notice">
            <strong>موقع التسليم:</strong> {label || 'جاري جلب اسم المكان...'}
            {accuracy > 100 && (
              <div style={{ marginTop: 4 }}>دقة الموقع ضعيفة (±{accuracy} م) — اسحب الدبوس لمكانك الصحيح.</div>
            )}
          </div>
        )}

        <div>
          <label>تفاصيل تساعد السائق (اختياري)</label>
          <input value={details} onChange={(e) => setDetails(e.target.value)} placeholder="رقم البناء، الطابق، علامة مميزة" />
        </div>

        {error && <div className="error">{error}</div>}
      </section>

      <ActionBar>
        <div className="action-info">
          <span className="muted">الإجمالي</span>
          <span className="price">{money(subtotal + Number(quote?.delivery_fee || 0))}</span>
        </div>
        <button onClick={submit} disabled={sending || !point}>
          {sending ? 'جاري الإرسال...' : point ? 'أرسل الطلب' : 'حدد الموقع أولاً'}
        </button>
      </ActionBar>
    </div>
  );
}
