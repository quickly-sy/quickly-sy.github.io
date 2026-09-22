import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Marker } from 'react-leaflet';
import { rpc } from '../../shared/supabase';
import { BaseMap, ClickPicker, FitBounds, icons, DEFAULT_CENTER } from '../../shared/map';
import { reverseGeocode } from '../../shared/geocode';
import { money, toPoint } from '../../shared/utils';

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
    setLabel('');
    const t = setTimeout(() => reverseGeocode(point).then(setLabel), 600);
    return () => clearTimeout(t);
  }, [point]);

  const markerRef = useRef(null);
  const dragHandlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current;
        if (!m) return;
        const { lat, lng } = m.getLatLng();
        setPoint([lat, lng]);
        setAccuracy(null);
      },
    }),
    []
  );

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
        <button onClick={locateMe} disabled={locating}>
          {locating ? 'جاري تحديد موقعك...' : '📍 استخدم موقعي الحالي'}
        </button>
        <p className="muted" style={{ margin: 0, textAlign: 'center' }}>
          أو اضغط على الخريطة لاختيار المكان — ويمكنك سحب الدبوس 🏠 لتعديله
        </p>

        <BaseMap center={vendorPoint || DEFAULT_CENTER} height={320}>
          <ClickPicker onPick={(p) => { setPoint(p); setAccuracy(null); }} />
          <FitBounds points={[vendorPoint, point]} />
          {vendorPoint && <Marker position={vendorPoint} icon={icons.vendor} />}
          {point && accuracy && accuracy > 30 && (
            <Circle center={point} radius={accuracy} pathOptions={{ color: '#d8a811', weight: 1, fillOpacity: 0.12 }} />
          )}
          {point && (
            <Marker position={point} icon={icons.home} draggable eventHandlers={dragHandlers} ref={markerRef} />
          )}
        </BaseMap>

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
        <button onClick={submit} disabled={sending || !point}>
          {sending ? 'جاري إرسال الطلب...' : 'أرسل الطلب'}
        </button>
      </section>
    </div>
  );
}
