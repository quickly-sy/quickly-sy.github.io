import { useCallback, useEffect, useState } from 'react';
import { supabase, run } from '../../shared/supabase';

const EMPTY = { name: '', icon: '', image_url: '', sort_order: 100 };

export default function Categories() {
  const [rows, setRows] = useState([]);
  const [openId, setOpenId] = useState(null);   // التصنيف الرئيسي المفتوح
  const [form, setForm] = useState(EMPTY);      // نموذج تصنيف رئيسي جديد
  const [subName, setSubName] = useState({});   // اسم فرعي جديد لكل رئيسي
  const [editing, setEditing] = useState(null); // { id, name, icon }
  const [error, setError] = useState('');

  const load = useCallback(() => {
    run(supabase.from('categories').select('*').order('sort_order').order('name'))
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const mains = rows.filter((r) => !r.parent_id);
  const subsOf = (id) => rows.filter((r) => r.parent_id === id);

  async function act(fn) {
    setError('');
    try { await fn(); load(); } catch (e) { setError(e.message); }
  }

  const addMain = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('اكتب اسم التصنيف');
    act(async () => {
      await run(supabase.from('categories').insert({
        name: form.name.trim(),
        icon: form.icon.trim() || null,
        image_url: form.image_url.trim() || null,
        sort_order: Number(form.sort_order) || 100,
      }));
      setForm(EMPTY);
    });
  };

  const addSub = (parent) => {
    const name = (subName[parent.id] || '').trim();
    if (!name) return;
    act(async () => {
      await run(supabase.from('categories').insert({ parent_id: parent.id, name }));
      setSubName((s) => ({ ...s, [parent.id]: '' }));
    });
  };

  const saveEdit = () =>
    act(async () => {
      await run(supabase.from('categories')
        .update({ name: editing.name.trim(), icon: editing.icon?.trim() || null })
        .eq('id', editing.id));
      setEditing(null);
    });

  const remove = (row) => {
    const subs = subsOf(row.id).length;
    const msg = subs
      ? `حذف "${row.name}" سيحذف ${subs} تصنيفاً فرعياً معه. متابعة؟`
      : `حذف "${row.name}"؟ المنتجات المرتبطة به تبقى بلا تصنيف.`;
    if (window.confirm(msg)) act(() => run(supabase.from('categories').delete().eq('id', row.id)));
  };

  const toggle = (row) =>
    act(() => run(supabase.from('categories').update({ is_active: !row.is_active }).eq('id', row.id)));

  const move = (row, delta) =>
    act(() => run(supabase.from('categories')
      .update({ sort_order: Math.max(0, (row.sort_order || 100) + delta) })
      .eq('id', row.id)));

  return (
    <div className="split side">
      <form className="panel stack" onSubmit={addMain}>
        <h3>تصنيف رئيسي جديد</h3>
        <div className="notice">الرئيسي يظهر للزبون كشريط أصناف. الفرعي يظهر تحته عند الضغط عليه.</div>
        <div><label>الاسم</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: بياضات وسجاد" /></div>
        <div><label>إيموجي (اختياري)</label><input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🛏️" /></div>
        <div><label>رابط صورة (اختياري)</label><input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} dir="ltr" placeholder="https://..." /></div>
        <div><label>الترتيب (الأصغر يظهر أولاً)</label><input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} dir="ltr" /></div>
        {error && <div className="error">{error}</div>}
        <button>إضافة</button>
      </form>

      <section className="stack">
        {!mains.length && <div className="empty">لا توجد تصنيفات بعد.</div>}
        {mains.map((m) => {
          const subs = subsOf(m.id);
          const open = openId === m.id;
          return (
            <div key={m.id} className={`panel stack ${m.is_active ? '' : 'dimmed'}`}>
              <div className="row between">
                <button className="ghost sm" onClick={() => setOpenId(open ? null : m.id)}>
                  {open ? '▾' : '▸'} <span style={{ fontSize: 18 }}>{m.icon || '📁'}</span> <strong>{m.name}</strong>
                  <span className="muted"> ({subs.length})</span>
                </button>
                <div className="row">
                  <button className="ghost sm" title="أعلى" onClick={() => move(m, -10)}>↑</button>
                  <button className="ghost sm" title="أسفل" onClick={() => move(m, 10)}>↓</button>
                  <button className={`sm ${m.is_active ? 'ok' : 'danger'}`} onClick={() => toggle(m)}>
                    {m.is_active ? 'ظاهر' : 'مخفي'}
                  </button>
                  <button className="ghost sm" onClick={() => setEditing({ id: m.id, name: m.name, icon: m.icon || '' })}>تعديل</button>
                  <button className="ghost sm" onClick={() => remove(m)}>حذف</button>
                </div>
              </div>

              {open && (
                <div className="stack">
                  {subs.map((s) => (
                    <div key={s.id} className="item-line">
                      <span className={s.is_active ? '' : 'muted'}>{s.name}</span>
                      <div className="row">
                        <button className={`sm ${s.is_active ? 'ok' : 'danger'}`} onClick={() => toggle(s)}>
                          {s.is_active ? 'ظاهر' : 'مخفي'}
                        </button>
                        <button className="ghost sm" onClick={() => setEditing({ id: s.id, name: s.name, icon: '' })}>تعديل</button>
                        <button className="ghost sm" onClick={() => remove(s)}>حذف</button>
                      </div>
                    </div>
                  ))}
                  <div className="row">
                    <input
                      style={{ flex: 1 }}
                      placeholder="أضف تصنيفاً فرعياً"
                      value={subName[m.id] || ''}
                      onChange={(e) => setSubName({ ...subName, [m.id]: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSub(m))}
                    />
                    <button className="sm" type="button" onClick={() => addSub(m)}>إضافة</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="panel stack modal" onClick={(e) => e.stopPropagation()}>
            <h3>تعديل التصنيف</h3>
            <div><label>الاسم</label><input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
            <div><label>إيموجي</label><input value={editing.icon} onChange={(e) => setEditing({ ...editing, icon: e.target.value })} /></div>
            <div className="row">
              <button onClick={saveEdit}>حفظ</button>
              <button className="ghost" onClick={() => setEditing(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
