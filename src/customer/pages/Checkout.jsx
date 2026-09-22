import { useEffect, useState } from 'react';
import { Marker } from 'react-leaflet';
import { rpc } from '../../shared/supabase';
import { BaseMap, ClickPicker, FitBounds, icons, DEFAULT_CENTER } from '../../shared/map';
import { money, toPoint } from '../../shared/utils';

export default function Checkout({ cart, onQty, onDone, onBrowse }) {
  const [point, setPoint] = useState(null);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const vendorId = cart.vendor?.id;

  // رسوم التوصيل تُحسب في قاعدة البيانات حسب المسافة
  useEffect(() => {
    if (!point || !vendorId) return;
    rpc('get_delivery_quote', { p_vendor_id: vendorId, p_lat: point[0], p_lng: point[1] })
      .then(setQuote)
      .catch(() => setQuote(null));
  }, [point, vendorId]);

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
    if (!navigator.geolocation) return setError('المتصفح لا يدعم تحديد الموقع، اختر موقعك من الخريطة.');
    navigator.geolocation.getCurrentPosition(
      (p) => setPoint([p.coords.latitude, p.coords.longitude]),
      () => setError('تعذر تحديد موقعك تلقائياً، اضغط على الخريطة لاختياره.')
    );
  }

  async function submit() {
    setError('');
    if (!point) return setError('اضغط على الخريطة لتحديد مكان التسليم.');
    if (!address.trim()) return setError('اكتب العنوان التفصيلي ليصل السائق بسهولة.');
    setSending(true);
    try {
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
      </section>

      <section className="panel stack">
        <div className="row between">
          <h3>مكان التسليم</h3>
          <button className="ghost sm" onClick={locateMe}>📍 موقعي الحالي</button>
        </div>
        <p className="muted" style={{ margin: 0 }}>اضغط على الخريطة لتحديد المكان بدقة.</p>
        <BaseMap center={vendorPoint || DEFAULT_CENTER} height={300}>
          <ClickPicker onPick={setPoint} />
          <FitBounds points={[vendorPoint, point]} />
          {vendorPoint && <Marker position={vendorPoint} icon={icons.vendor} />}
          {point && <Marker position={point} icon={icons.home} />}
        </BaseMap>
        <div>
          <label>العنوان التفصيلي</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="الحي، الشارع، البناء، الطابق" />
        </div>
        <div>
          <label>ملاحظات للمتجر أو السائق (اختياري)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <div className="error">{error}</div>}
        <button onClick={submit} disabled={sending}>{sending ? 'جاري إرسال الطلب...' : 'أرسل الطلب'}</button>
      </section>
    </div>
  );
}
