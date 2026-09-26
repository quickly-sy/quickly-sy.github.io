// تنقل سفلي — يظهر على الموبايل ويختفي على الشاشات الكبيرة
// الأيقونات تُقرأ من لوحة الإدارة (app_settings.nav_icons) مع قيم افتراضية فورية
import { rpc } from '../shared/supabase';
import { useCached } from '../shared/cache';
import NavIcon from '../shared/navIcons';

const ITEMS = [
  ['stores', 'الرئيسية', 'home'],
  ['browse', 'الأصناف', 'grid'],
  ['checkout', 'السلة', 'cart'],
  ['orders', 'طلباتي', 'box'],
];

export default function BottomNav({ active, onGo, cartCount }) {
  // لا ننتظر الشبكة: نرسم بالافتراضي فوراً ونحدّث بالخلفية
  const { data: icons } = useCached('nav-icons', () => rpc('get_nav_icons'));

  return (
    <nav className="bottom-nav" aria-label="التنقل">
      {ITEMS.map(([key, label, fallback]) => (
        <button
          key={key}
          className={active === key ? 'on' : ''}
          onClick={() => onGo(key)}
          aria-current={active === key ? 'page' : undefined}
        >
          <span className="bn-icon">
            <NavIcon name={(icons && icons[key]) || fallback} />
            {key === 'checkout' && cartCount > 0 && <span className="bn-badge">{cartCount}</span>}
          </span>
          <span className="bn-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
