import { useEffect, useState } from 'react';
import { useProfile, Login } from '../shared/auth';
import { supabase, run } from '../shared/supabase';
import Topbar from '../shared/Topbar';
import NotificationBell from '../shared/NotificationBell';
import Orders from './pages/Orders';
import Products from './pages/Products';
import BulkAdd from './pages/BulkAdd';

export default function App() {
  const { profile, loading, error, reload, logout } = useProfile('vendor');
  const [tab, setTab] = useState('orders');
  const [store, setStore] = useState(null);

  useEffect(() => {
    if (!profile) return setStore(null);
    run(supabase.from('vendors').select('*').eq('owner_id', profile.id).single())
      .then(setStore)
      .catch((e) => alert(e.message));
  }, [profile]);

  async function toggleOpen() {
    try {
      setStore(await run(supabase.from('vendors').update({ is_open: !store.is_open }).eq('id', store.id).select().single()));
    } catch (e) {
      alert(e.message);
    }
  }

  if (loading) return <div className="page muted">جاري التحميل...</div>;
  if (!profile)
    return <Login
        title="متجرك على Quickly"
        subtitle="طلبات تصلك فوراً، وتجهيز منظّم، وسائق عند الباب."
        onDone={reload}
        error={error}
      />;
  if (!store) return <div className="page muted">جاري تحميل المتجر...</div>;

  return (
    <>
      <Topbar
        subtitle={`${store.name}${store.rating_count ? ` ★ ${Number(store.rating_avg).toFixed(1)}` : ''}`}
        tabs={[['orders', 'الطلبات'], ['products', 'المنتجات'], ['bulk', 'إضافة سريعة']]}
        active={tab}
        onTab={setTab}
        right={
          <>
            <NotificationBell userId={profile.id} onOpenOrder={() => setTab('orders')} />
            <button className={store.is_open ? 'ok sm' : 'danger sm'} onClick={toggleOpen}>
              {store.is_open ? 'المتجر مفتوح — إغلاق' : 'المتجر مغلق — فتح'}
            </button>
          </>
        }
        onLogout={logout}
      />
      {!store.is_active && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="error">حساب المتجر موقوف حالياً ولا يظهر للزبائن. تواصل مع إدارة Quickly.</div>
        </div>
      )}
      <main className="page">
        {tab === 'orders' && <Orders vendorId={store.id} />}
        {tab === 'products' && <Products vendorId={store.id} />}
        {tab === 'bulk' && <BulkAdd vendorId={store.id} onDone={() => setTab('products')} />}
      </main>
    </>
  );
}
