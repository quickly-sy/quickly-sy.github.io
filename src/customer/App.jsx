import { useState } from 'react';
import { useProfile, Login } from '../shared/auth';
import Topbar from '../shared/Topbar';
import ThemeToggle from '../shared/ThemeToggle';
import { SaverToggle } from '../shared/saver';
import Stores from './pages/Stores';
import Store from './pages/Store';
import Checkout from './pages/Checkout';
import Orders from './pages/Orders';
import Track from './pages/Track';

const EMPTY_CART = { vendor: null, items: [] }; // items: [{ product, qty }]

export default function App() {
  const { profile, loading, error, reload, logout } = useProfile('customer');
  const [page, setPage] = useState({ name: 'stores' });
  const [cart, setCart] = useState(EMPTY_CART);
  const go = (name, extra = {}) => setPage({ name, ...extra });

  // السلة من متجر واحد فقط
  function addToCart(vendor, product) {
    let base = cart;
    if (cart.vendor && cart.vendor.id !== vendor.id) {
      if (!window.confirm(`سلتك فيها منتجات من ${cart.vendor.name}. تفريغها والبدء من ${vendor.name}؟`)) return;
      base = EMPTY_CART;
    }
    const exists = base.items.some((i) => i.product.id === product.id);
    const items = exists
      ? base.items.map((i) => (i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i))
      : [...base.items, { product, qty: 1 }];
    setCart({ vendor, items });
  }

  function changeQty(productId, delta) {
    setCart((c) => {
      const items = c.items
        .map((i) => (i.product.id === productId ? { ...i, qty: i.qty + delta } : i))
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
        tabs={[['stores', 'المتاجر'], ['checkout', `السلة (${cartCount})`], ['orders', 'طلباتي']]}
        active={active}
        onTab={go}
        right={
          <>
            <span className="muted">{profile.name}</span>
            <SaverToggle />
            <ThemeToggle className="ghost sm" />
          </>
        }
        onLogout={() => { logout(); setCart(EMPTY_CART); go('stores'); }}
      />
      <main className="page">
        {page.name === 'stores' && <Stores onOpen={(id) => go('store', { vendorId: id })} />}
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
    </>
  );
}
