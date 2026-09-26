import { useState } from 'react';
import { useProfile, Login } from '../shared/auth';
import Topbar from '../shared/Topbar';
import ThemeToggle from '../shared/ThemeToggle';
import SaverToggle from '../shared/SaverToggle';
import NotificationBell from '../shared/NotificationBell';
import Stores from './pages/Stores';
import Browse from './pages/Browse';
import BottomNav from './BottomNav';
import Store from './pages/Store';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import Track from './pages/Track';

const EMPTY_CART = { vendor: null, items: [] }; // items: [{ product, qty }]

export default function App() {
  const { profile, loading, error, reload, logout } = useProfile('customer');
  // رابط مباشر لمتجر: ...customer/?store=3
  const [page, setPage] = useState(() => {
    try {
      const v = new URLSearchParams(window.location.search).get('store');
      if (v && /^\d+$/.test(v)) return { name: 'store', vendorId: Number(v) };
    } catch { /* تجاهل */ }
    return { name: 'stores' };
  });
  const [cart, setCart] = useState(EMPTY_CART);
  const go = (name, extra = {}) => setPage({ name, ...extra });

  // السلة من متجر واحد فقط.
  // كل موديل سطر مستقل: مفتاحه رقم المنتج + رقم الموديل
  function addToCart(vendor, product, variantIndex = null) {
    let base = cart;
    if (cart.vendor && cart.vendor.id !== vendor.id) {
      if (!window.confirm(`سلتك فيها منتجات من ${cart.vendor.name}. تفريغها والبدء من ${vendor.name}؟`)) return;
      base = EMPTY_CART;
    }
    const key = `${product.id}:${variantIndex ?? ''}`;
    const exists = base.items.some((i) => i.key === key);
    const items = exists
      ? base.items.map((i) => (i.key === key ? { ...i, qty: i.qty + 1 } : i))
      : [...base.items, { key, product, variantIndex, qty: 1 }];
    setCart({ vendor, items });
  }

  function changeQty(key, delta) {
    setCart((c) => {
      const items = c.items
        .map((i) => (i.key === key ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0);
      return items.length ? { ...c, items } : EMPTY_CART;
    });
  }

  if (loading) return <div className="page muted">جاري التحميل...</div>;
  if (!profile)
    return (
      <Login
        title="طلبك لباب بيتك — لحظة بلحظة"
        subtitle="اطلب من متاجر مدينتك، وتابعه على الخريطة من لحظة التأكيد حتى الاستلام."
        allowRegister
        themeToggle
        onDone={reload}
        error={error}
      />
    );

  const cartCount = cart.items.reduce((s, i) => s + i.qty, 0);
  const active = { store: 'stores', track: 'orders' }[page.name] || page.name;

  return (
    <>
      <Topbar
        tabs={[
          ['stores', 'المتاجر'],
          ['browse', 'الأصناف'],
          ['checkout', `السلة (${cartCount})`],
          ['orders', 'طلباتي'],
        ]}
        active={active}
        onTab={go}
        right={
          <>
            <span className="muted">{profile.name}</span>
            <NotificationBell userId={profile.id} onOpenOrder={(id) => go('track', { orderId: id })} />
            <SaverToggle />
            <ThemeToggle className="ghost sm" />
          </>
        }
        onLogout={() => { logout(); setCart(EMPTY_CART); go('stores'); }}
      />
      <main className="page">
        {page.name === 'stores' && (
          <Stores
            onOpen={(id) => go('store', { vendorId: id })}
            onBrowse={(categoryId) => go('browse', { categoryId })}
          />
        )}
        {page.name === 'browse' && (
          <Browse
            initialCategory={page.categoryId ?? null}
            cart={cart}
            onAdd={addToCart}
            onOpenStore={(id) => go('store', { vendorId: id })}
          />
        )}
        {page.name === 'store' && (
          <Store vendorId={page.vendorId} cart={cart} onAdd={addToCart} onBack={() => go('stores')} onCheckout={() => go('checkout')} />
        )}
        {page.name === 'checkout' && (
          <Checkout
            cart={cart}
            onQty={changeQty}
            onBrowse={() => go('stores')}
            onDone={(orderId) => { setCart(EMPTY_CART); go('track', { orderId }); }}
          />
        )}
        {page.name === 'orders' && <Orders profile={profile} onTrack={(id) => go('track', { orderId: id })} />}
        {page.name === 'track' && <Track orderId={page.orderId} onBack={() => go('orders')} />}
      </main>
      <BottomNav active={active} onGo={(k) => go(k)} cartCount={cartCount} />
    </>
  );
}
