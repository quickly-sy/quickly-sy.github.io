// دبوس العناوين المحفوظة — يظهر فوق خريطة الطلب
// الهدف: الزبون يطلب بضغطة بدل ما يحدد موقعه كل مرة
import { useCallback, useEffect, useState } from 'react';
import { supabase, run } from '../shared/supabase';
import NavIcon from '../shared/navIcons';

const SUGGEST = ['المنزل', 'العمل', 'بيت الأهل'];

export default function AddressPicker({ point, area, details, onPick }) {
  const [list, setList] = useState([]);
  const [chosen, setChosen] = useState(null);   // id العنوان المستخدم حالياً
  const [saving, setSaving] = useState(false);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [manage, setManage] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    run(
      supabase.from('addresses')
        .select('id, label, lat, lng, area, details, is_default')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
    )
      .then((rows) => {
        setList(rows || []);
        // أول زيارة: نختار العنوان الافتراضي تلقائياً
        const d = (rows || []).find((r) => r.is_default) || (rows || [])[0];
        if (d && !point) use(d);
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  function use(a) {
    setChosen(a.id);
    onPick({ lat: a.lat, lng: a.lng, area: a.area || '', details: a.details || '' });
  }

  // الموقع الحالي لم يعد مطابقاً لأي عنوان محفوظ
  useEffect(() => {
    if (!chosen || !point) return;
    const a = list.find((x) => x.id === chosen);
    if (!a) return;
    const far = Math.abs(a.lat - point[0]) > 0.0004 || Math.abs(a.lng - point[1]) > 0.0004;
    if (far) setChosen(null);
  }, [point, chosen, list]);

  async function save() {
    const label = name.trim();
    if (!label) return setError('اكتب اسماً للعنوان (مثلاً: المنزل)');
    if (!point) return setError('حدد الموقع أولاً');
    setSaving(true); setError('');
    try {
      const rows = await run(
        supabase.from('addresses')
          .insert({
            label,
            lat: point[0],
            lng: point[1],
            area: area || null,
            details: (details || '').trim() || null,
            is_default: list.length === 0,
          })
          .select('id, label, lat, lng, area, details, is_default')
      );
      const added = rows && rows[0];
      setList((l) => [added, ...l.map((x) => (added.is_default ? { ...x, is_default: false } : x))]);
      setChosen(added.id);
      setNaming(false);
      setName('');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(a) {
    if (!window.confirm(`حذف عنوان "${a.label}"؟`)) return;
    try {
      await run(supabase.from('addresses').delete().eq('id', a.id));
      setList((l) => l.filter((x) => x.id !== a.id));
      if (chosen === a.id) setChosen(null);
    } catch (e) { setError(e.message); }
  }

  async function makeDefault(a) {
    try {
      await run(supabase.from('addresses').update({ is_default: true }).eq('id', a.id));
      setList((l) => l.map((x) => ({ ...x, is_default: x.id === a.id })));
    } catch (e) { setError(e.message); }
  }

  const alreadySaved = list.some(
    (a) => point && Math.abs(a.lat - point[0]) < 0.0004 && Math.abs(a.lng - point[1]) < 0.0004
  );

  return (
    <div className="stack addr-block">
      {list.length > 0 && (
        <>
          <div className="row between">
            <label style={{ margin: 0 }}>عناويني المحفوظة</label>
            <button type="button" className="link" onClick={() => setManage(true)}>إدارة</button>
          </div>
          <div className="chips addr-chips">
            {list.map((a) => (
              <button
                key={a.id}
                type="button"
                className={chosen === a.id ? 'on' : ''}
                onClick={() => use(a)}
                title={[a.area, a.details].filter(Boolean).join(' — ')}
              >
                <NavIcon name="pin" size={15} />
                {a.label}
                {a.is_default && <span className="addr-star" aria-label="الافتراضي">★</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {/* حفظ الموقع الحالي كعنوان جديد */}
      {point && !alreadySaved && (
        naming ? (
          <div className="stack">
            <label>اسم العنوان</label>
            <div className="row">
              <input
                style={{ flex: 1 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="المنزل"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
              />
              <button type="button" onClick={save} disabled={saving}>{saving ? '...' : 'احفظ'}</button>
              <button type="button" className="ghost" onClick={() => setNaming(false)}>إلغاء</button>
            </div>
            <div className="chips">
              {SUGGEST.filter((s) => !list.some((a) => a.label === s)).map((s) => (
                <button key={s} type="button" onClick={() => setName(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          <button type="button" className="ghost sm addr-save" onClick={() => setNaming(true)}>
            <NavIcon name="pin" size={15} /> احفظ هذا الموقع كعنوان
          </button>
        )
      )}

      {error && <div className="error">{error}</div>}

      {manage && (
        <div className="modal-back" onClick={() => setManage(false)}>
          <div className="panel stack modal" onClick={(e) => e.stopPropagation()}>
            <div className="row between">
              <h3>عناويني</h3>
              <button className="link" onClick={() => setManage(false)}>إغلاق</button>
            </div>
            {list.map((a) => (
              <div key={a.id} className="item-line">
                <div>
                  <strong>{a.label}{a.is_default && <span className="addr-star"> ★</span>}</strong>
                  <div className="muted">{[a.area, a.details].filter(Boolean).join(' — ') || 'موقع على الخريطة'}</div>
                </div>
                <div className="row">
                  {!a.is_default && (
                    <button className="ghost sm" onClick={() => makeDefault(a)}>اجعله الافتراضي</button>
                  )}
                  <button className="ghost sm" onClick={() => remove(a)}>حذف</button>
                </div>
              </div>
            ))}
            <p className="muted">الحد الأقصى 8 عناوين.</p>
          </div>
        </div>
      )}
    </div>
  );
}
