import { useProfile, Login } from '../shared/auth';
import Topbar from '../shared/Topbar';
import Dashboard from './Dashboard';

export default function App() {
  const { profile, loading, error, reload, logout } = useProfile('driver');

  if (loading) return <div className="page muted">جاري التحميل...</div>;
  if (!profile)
    return <Login
        title="أسطول Quickly"
        subtitle="طلبات واضحة — مسار مباشر — تسليم أسرع"
        onDone={reload}
        error={error}
      />;

  return (
    <>
      <Topbar subtitle={profile.name} onLogout={logout} />
      <main className="page">
        <Dashboard profile={profile} />
      </main>
    </>
  );
}
