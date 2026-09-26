import { useCallback, useEffect, useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { money } from '../../shared/utils';
import ImageUpload from '../../shared/ImageUpload';

const EMPTY = { name: '', description: '', price: '', image_url: '', is_available: true, category_id: '' };

export default function Products({ vendorId }) {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [mainId, setMainId] = useState(''); // التصنيف الرئيسي المختار في النموذج
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    run(supabase.from('products').select('*').eq('vendor_id', vendorId).order('id', { ascending: false }))
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    run(supabase.from('categories').select('id, parent_id, name, icon').eq('is_active', true).order('sort_order').order('name'))
      .then(setCats)
      .catch(() => {});
  }, []);

  const mains = cats.filter((c) => !c.parent_id);
  const subs = cats.filter((c) => c.parent_id === Number(mainId));
  const catName = (id) => {
    const c = cats.find((x) => x.id === id);
    if (!c) return null;
    const parent = cats.find((x) => x.id === c.parent_id);
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !(Number(form.price) > 0)) return setError('اسم المنتج وسعر أكبر من صفر مطلوبان.');
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: Number(form.price),
      image_url: form.image_url.trim() || null,
      is_available: form.is_available === true || form.is_available === 'true',
      category_id: form.category_id ? Number(form.category_id) : mainId ? Number(mainId) : null,
    };
    try {
      if (editId) await run(supabase.from('products').update(body).eq('id', editId));
      else await run(supabase.from('products').insert({ ...body, vendor_id: vendorId }));
      cancelEdit();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(p) {
    setEditId(p.id);
    setForm({
      name: p.name, description: p.description || '', price: p.price,
      image_url: p.image_url || '', is_available: p.is_available,
      category_id: p.category_id || '',
    });
    const own = cats.find((c) => c.id === p.category_id);
    setMainId(own ? String(own.parent_id || own.id) : '');
    window.scrollTo({ top: 0 });
  }

  function cancelEdit() {
    setEditId(null);
    setForm(EMPTY);
    setMainId('');
  }

  async function remove(p) {
    if (!window.confirm(`حذف "${p.name}"؟ الطلبات القديمة تبقى محفوظة.`)) return;
    await run(supabase.from('products').delete().eq('id', p.id)).catch((e) => alert(e.message));
    load();
  }

  async function toggle(p) {
    await run(supabase.from('products').update({ is_available: !p.is_available }).eq('id', p.id)).catch((e) => alert(e.message));
    load();
  }

  return (
    <div className="split side">
      <form className="panel stack" onSubmit={save}>
        <h3>{editId ? 'تعديل المنتج' : 'منتج جديد'}</h3>
        <div><label>الاسم</label><input value={form.name} onChange={set('name')} /></div>
        <div><label>الوصف</label><textarea rows={2} value={form.description} onChange={set('description')} /></div>
        <div>
          <label>التصنيف</label>
          <div className="row">
            <select
              style={{ flex: 1 }}
              value={mainId}
              onChange={(e) => { setMainId(e.target.value); setForm({ ...form, category_id: '' }); }}
            >
              <option value="">اختر التصنيف</option>
              {mains.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
            </select>
            <select
              style={{ flex: 1 }}
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              disabled={!mainId}
            >
              <option value="">{subs.length ? 'اختر الفرعي' : 'بدون فرعي'}</option>
              {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!cats.length && <div className="muted">لا توجد تصنيفات بعد — تضيفها إدارة Quickly.</div>}
        </div>
        <div><label>السعر</label><input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} dir="ltr" /></div>
        <ImageUpload
          value={form.image_url}
          onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
          folder={`vendors/${vendorId}`}
        />
        <div>
          <label>الحالة</label>
          <select value={String(form.is_available)} onChange={set('is_available')}>
            <option value="true">متوفر</option>
            <option value="false">غير متوفر</option>
          </select>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button>{editId ? 'حفظ التعديل' : 'إضافة المنتج'}</button>
          {editId && <button type="button" className="ghost" onClick={cancelEdit}>إلغاء</button>}
        </div>
      </form>

      <section className="panel">
        {!items.length ? (
          <div className="empty">أضف أول منتج من النموذج.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th></th><th>المنتج</th><th>التصنيف</th><th>السعر</th><th>الحالة</th><th></th></tr></thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.image_url
                        ? <img className="row-thumb" src={p.image_url} alt="" loading="lazy" />
                        : <span className="row-thumb none" title="بلا صورة">📷</span>}
                    </td>
                    <td><strong>{p.name}</strong>{p.description && <div className="muted">{p.description}</div>}</td>
                    <td className="muted">{catName(p.category_id) || <span style={{ color: 'var(--danger)' }}>بلا تصنيف</span>}</td>
                    <td className="price">{money(p.price)}</td>
                    <td>
                      <button className={`sm ${p.is_available ? 'ok' : 'ghost'}`} onClick={() => toggle(p)}>
                        {p.is_available ? 'متوفر' : 'غير متوفر'}
                      </button>
                    </td>
                    <td>
                      <div className="row">
                        <button className="ghost sm" onClick={() => startEdit(p)}>تعديل</button>
                        <button className="ghost sm" onClick={() => remove(p)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
