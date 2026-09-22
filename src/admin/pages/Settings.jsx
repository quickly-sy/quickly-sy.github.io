import { useEffect, useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { money } from '../../shared/utils';

export default function Settings() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    run(supabase.from('app_settings').select('*').eq('id', 1).single()).then(setS).catch((e) => setError(e.message));
  }, []);

  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError(''); setMsg('');
    try {
      await run(supabase.from('app_settings').update({
        base_delivery_fee: Number(s.base_delivery_fee),
        per_km_fee: Number(s.per_km_fee),
        max_pending_orders: Number(s.max_pending_orders),
      }).eq('id', 1));
      setMsg('تم حفظ الإعدادات');
    } catch (err) {
      setError(err.message);
    }
  }

  if (error && !s) return <div className="error">{error}</div>;
  if (!s) return <p className="muted">جاري التحميل...</p>;

  const example = Math.round(Number(s.base_delivery_fee) + Number(s.per_km_fee) * 3);

  return (
    <form className="panel stack" style={{ maxWidth: 480 }} onSubmit={save}>
      <h2>رسوم التوصيل</h2>
      <div><label>الرسم الأساسي لكل طلب</label><input type="number" min="0" value={s.base_delivery_fee} onChange={set('base_delivery_fee')} dir="ltr" /></div>
      <div><label>سعر الكيلومتر</label><input type="number" min="0" value={s.per_km_fee} onChange={set('per_km_fee')} dir="ltr" /></div>
      <div className="notice">مثال: طلب على بعد 3 كم رسومه {money(example)}</div>
      <div><label>أقصى عدد طلبات معلّقة للزبون الواحد</label><input type="number" min="1" value={s.max_pending_orders} onChange={set('max_pending_orders')} dir="ltr" /></div>
      {error && <div className="error">{error}</div>}
      {msg && <div className="notice">{msg}</div>}
      <button>حفظ</button>
    </form>
  );
}
