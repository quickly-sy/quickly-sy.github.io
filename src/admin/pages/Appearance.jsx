import { useEffect, useState } from 'react';
import { rpc } from '../../shared/supabase';
import { clearCache } from '../../shared/cache';
import NavIcon, { ICON_KEYS, ICON_LABELS } from '../../shared/navIcons';

const SLOTS = [
  ['stores', 'الرئيسية', 'home'],
  ['browse', 'الأصناف', 'grid'],
  ['checkout', 'السلة', 'cart'],
  ['orders', 'طلباتي', 'box'],
];

export default function Appearance() {
  const [icons, setIcons] = useState(null);
  const [slot, setSlot] = useState('stores');
  const [emoji, setEmoji] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    rpc('get_nav_icons')
      .then((d) => setIcons(d || {}))
      .catch((e) => setError(e.message));
  }, []);

  const valueOf = (key) => {
    const fallback = SLOTS.find((s) => s[0] === key)[2];
    return (icons && icons[key]) || fallback;
  };

  const pick = (name) => {
    setIcons({ ...(icons || {}), [slot]: name });
    setMsg('');
  };

  const applyEmoji = () => {
    const e = emoji.trim();
    if (!e) return;
    pick(`emoji:${e}`);
    setEmoji('');
  };

  async function save() {
    setSaving(true); setError(''); setMsg('');
    try {
      const body = Object.fromEntries(SLOTS.map(([k]) => [k, valueOf(k)]));
      const saved = await rpc('admin_set_nav_icons', { p_icons: body });
      setIcons(saved || body);
      clearCache('nav-icons');          // حتى تلتقط لوحة الإدارة الجديد فوراً
      setMsg('تم الحفظ — يظهر عند الزبائن خلال ثوانٍ، أو عند إعادة فتح التطبيق.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (error && !icons) return <div className="error">{error}</div>;
  if (!icons) return <p className="muted">جاري التحميل...</p>;

  const current = valueOf(slot);

  return (
    <div className="stack" style={{ maxWidth: 640 }}>
      <h2>شريط التنقل السفلي</h2>
      <p className="muted">
        هذا الشريط يظهر للزبون على الموبايل. اختر التبويب من المعاينة تحت، ثم اختر شكله من المكتبة.
      </p>

      {/* معاينة حيّة — نفس شكل التطبيق */}
      <div className="panel stack">
        <div className="nav-preview">
          {SLOTS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`np-item ${slot === key ? 'on' : ''}`}
              onClick={() => setSlot(key)}
            >
              <span className="np-icon">
                <NavIcon name={valueOf(key)} />
                {key === 'checkout' && <span className="bn-badge">2</span>}
              </span>
              <span className="np-label">{label}</span>
            </button>
          ))}
        </div>
        <div className="muted" style={{ textAlign: 'center' }}>
          التبويب المحدّد: <strong>{SLOTS.find((s) => s[0] === slot)[1]}</strong>
        </div>
      </div>

      {/* مكتبة الأشكال */}
      <div className="panel stack">
        <h3>اختر الشكل</h3>
        <div className="icon-picker">
          {ICON_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              className={`icon-cell ${current === k ? 'on' : ''}`}
              onClick={() => pick(k)}
              title={ICON_LABELS[k]}
            >
              <NavIcon name={k} size={26} />
              <small>{ICON_LABELS[k]}</small>
            </button>
          ))}
        </div>

        <hr />
        <label>أو استخدم إيموجي خاص</label>
        <div className="row">
          <input
            style={{ flex: '0 0 90px', textAlign: 'center', fontSize: 20 }}
            placeholder="🏬"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), applyEmoji())}
          />
          <button type="button" className="ghost" onClick={applyEmoji}>استخدمه</button>
          {current.startsWith('emoji:') && (
            <span className="muted">الحالي: {current.slice(6)}</span>
          )}
        </div>
        <p className="muted">
          نصيحة: الأشكال المرسومة تأخذ لون التطبيق وتبقى واضحة بالنمطين الفاتح والغامق.
          الإيموجي يبقى بألوانه ويختلف شكله من جهاز لآخر.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
      {msg && <div className="notice">{msg}</div>}
      <div className="row">
        <button onClick={save} disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
        <button
          type="button"
          className="ghost"
          onClick={() => setIcons(Object.fromEntries(SLOTS.map(([k, , d]) => [k, d])))}
        >
          إرجاع الافتراضي
        </button>
      </div>
    </div>
  );
}
