import { supabase, run } from '../../shared/supabase';
import { useCached } from '../../shared/cache';
import { money } from '../../shared/utils';
import ActionBar from '../../shared/ActionBar';

export default function Store({ vendorId, cart, onAdd, onBack, onCheckout }) {
  // طلب واحد للمتجر ومنتجاته معاً بدل طلبين متتاليين
  const { data: store, error, stale, loading } = useCached(
    `store:${vendorId}`,
    () =>
      run(
        supabase
          .from('vendors')
          .select('id, name, category, address, lat, lng, is_open, products(id, name, description, price, image_url, is_available)')
          .eq('id', vendorId)
          .single()
      ).then((v) => ({
        ...v,
        products: (v.products || []).filter((p) => p.is_available).sort((a, b) => a.name.localeCompare(b.name, 'ar')),
      })),
    [vendorId]
  );

  if (loading) return <StoreSkeleton onBack={onBack} />;
  if (error && !store) return <div className="error">{error}</div>;

  const sameStore = cart.vendor?.id === store.id;
  const qtyOf = (id) => (sameStore ? cart.items.find((i) => i.product.id === id)?.qty || 0 : 0);
  const count = sameStore ? cart.items.reduce((s, i) => s + i.qty, 0) : 0;
  const vendorInfo = { id: store.id, name: store.name, lat: store.lat, lng: store.lng };
  const subtotal = sameStore ? cart.items.reduce((sum, i) => sum + Number(i.product.price) * i.qty, 0) : 0;

  return (
    <div className="stack">
      <button className="ghost sm" onClick={onBack}>رجوع للمتاجر</button>
      <div className="row between">
        <div>
          <h2>{store.name} {stale && <span className="dot-pulse" aria-label="جاري التحديث" />}</h2>
          <div className="muted">{[store.category, store.address].filter(Boolean).join('، ')}</div>
        </div>
      </div>
      {!store.is_open && <div className="error">المتجر مغلق حالياً، لا يمكن الطلب منه.</div>}
      {store.products.length ? (
        <div className="grid">
          {store.products.map((p) => (
            <div key={p.id} className="panel stack">
              {p.image_url ? (
                <img className="thumb" src={p.image_url} alt={p.name} loading="lazy" decoding="async" />
              ) : (
                <div className="thumb">📦</div>
              )}
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

      {count > 0 && (
        <ActionBar>
          <div className="action-info">
            <strong>{count} منتج</strong>
            <span className="price">{money(subtotal)}</span>
          </div>
          <button onClick={onCheckout}>إتمام الطلب</button>
        </ActionBar>
      )}
    </div>
  );
}

function StoreSkeleton({ onBack }) {
  return (
    <div className="stack" aria-busy="true">
      <button className="ghost sm" onClick={onBack}>رجوع للمتاجر</button>
      <span className="sk" style={{ width: 180, height: 26 }} />
      <div className="grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="panel stack">
            <span className="sk thumb" />
            <span className="sk" style={{ width: '70%', height: 18 }} />
            <span className="sk" style={{ width: '40%', height: 16 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
