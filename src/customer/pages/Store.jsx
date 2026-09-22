import { useEffect, useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { money } from '../../shared/utils';

export default function Store({ vendorId, cart, onAdd, onBack, onCheckout }) {
  const [store, setStore] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      run(supabase.from('vendors').select('id, name, category, address, lat, lng, is_open').eq('id', vendorId).single()),
      run(supabase.from('products').select('id, name, description, price, image_url')
        .eq('vendor_id', vendorId).eq('is_available', true).order('name')),
    ])
      .then(([v, products]) => setStore({ ...v, products }))
      .catch((e) => setError(e.message));
  }, [vendorId]);

  if (error) return <div className="error">{error}</div>;
  if (!store) return <p className="muted">جاري التحميل...</p>;

  const sameStore = cart.vendor?.id === store.id;
  const qtyOf = (id) => (sameStore ? cart.items.find((i) => i.product.id === id)?.qty || 0 : 0);
  const count = sameStore ? cart.items.reduce((s, i) => s + i.qty, 0) : 0;
  const vendorInfo = { id: store.id, name: store.name, lat: store.lat, lng: store.lng };

  return (
    <div className="stack">
      <button className="ghost sm" onClick={onBack}>رجوع للمتاجر</button>
      <div className="row between">
        <div>
          <h2>{store.name}</h2>
          <div className="muted">{[store.category, store.address].filter(Boolean).join('، ')}</div>
        </div>
        {count > 0 && <button onClick={onCheckout}>إتمام الطلب ({count})</button>}
      </div>
      {!store.is_open && <div className="error">المتجر مغلق حالياً، لا يمكن الطلب منه.</div>}
      {store.products.length ? (
        <div className="grid">
          {store.products.map((p) => (
            <div key={p.id} className="panel stack">
              {p.image_url ? <img className="thumb" src={p.image_url} alt={p.name} /> : <div className="thumb">📦</div>}
              <div>
                <h3>{p.name}</h3>
                {p.description && <div className="muted">{p.description}</div>}
              </div>
              <div className="row between">
                <span className="price">{money(p.price)}</span>
                <button className="sm" disabled={!store.is_open} onClick={() => onAdd(vendorInfo, p)}>
                  {qtyOf(p.id) ? `في السلة: ${qtyOf(p.id)} ＋` : 'أضف للسلة'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">لا توجد منتجات متاحة في هذا المتجر الآن.</div>
      )}
    </div>
  );
}
