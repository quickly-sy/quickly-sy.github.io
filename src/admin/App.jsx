import { useState } from 'react';
import { useProfile, Login } from '../shared/auth';
import Topbar from '../shared/Topbar';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Vendors from './pages/Vendors';
import Drivers from './pages/Drivers';
import Settings from './pages/Settings';
import Tasks from './pages/Tasks';

const TABS = [
  ['dashboard', 'نظرة عامة', Dashboard],
  ['orders', 'الطلبات', Orders],
  ['vendors', 'المتاجر', Vendors],
  ['drivers', 'السائقون', Drivers],
  ['tasks', 'المهام الخاصة', Tasks],
  ['settings', 'الإعدادات', Settings],
];

export default function App() {
  const { profile, loading, error, reload, logout } = useProfile('admin');
  const [tab, setTab] = useState('dashboard');

  if (loading) return <div className="page muted">جاري التحميل...</div>;
  if (!profile)
    return <Login
        title="غرفة التحكم"
        subtitle="المتاجر، والسائقون، والطلبات، وكل شيء أمامك لحظة بلحظة."
        onDone={reload}
        error={error}
      />;

  const Page = TABS.find((t) => t[0] === tab)[2];

  return (
    <>
      <Topbar subtitle="الإدارة" tabs={TABS.map(([k, l]) => [k, l])} active={tab} onTab={setTab} onLogout={logout} />
      <main className="page"><Page /></main>
    </>
  );
}
