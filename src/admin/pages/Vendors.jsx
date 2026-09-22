import { useCallback, useEffect, useState } from 'react';
import { Marker } from 'react-leaflet';
import { supabase, run, rpc } from '../../shared/supabase';
import { normalizePhone } from '../../shared/auth';
import { BaseMap, ClickPicker, icons } from '../../shared/map';
import { toPoint } from '../../shared/utils';

const EMPTY = { phone: '', name: '', category: '', address: '', lat: null, lng: null };

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    run(supabase.from('vendors').select('*, owner:profiles(name, phone), products(count)').order('id'))
      .then(setVendors)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const point = toPoint(form.lat, form.lng);

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('اكتب اسم المتجر');
    try {
      if (editId) {
        await run(supabase.from('vendors').update({
          name: form.name.trim(), category: form.category || null, address: form.address || null, lat: form.lat, lng: form.lng,
        }).eq('id', editId));
      } else {
        await rpc('admin_setup_vendor', {
          p_phone: normalizePhone(form.phone), p_store_name: form.name.trim(), p_category: form.category || null,
          p_address: form.address || null, p_lat: form.lat, p_lng: form.lng,
        });
      }
      reset();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function edit(v) {
    setEditId(v.id);
    setForm({ ...EMPTY, name: v.name, category: v.category || '', address: v.address || '', lat: v.lat, lng: v.lng });
    window.scrollTo({ top: 0 });
  }

  function reset() { setEditId(null); setForm(EMPTY); }

  async function toggle(v, field) {
    await run(supabase.from('vendors').update({ [field]: !v[field] }).eq('id', v.id)).catch((e) => alert(e.message));
    load();
  }

  return (
    <div className="split side">
      <form className="panel stack" onSubmit={save}>
        <h3>{editId ? 'تعديل المتجر' : 'إضافة متجر'}</h3>
        {!editId && (
          <>
            <div className="notice">صاحب المتجر يسجّل أولاً من واجهة الزبون، بعدها تحوّل حسابه لمتجر من هنا.</div>
            <div><label>رقم هاتف صاحب المتجر</label><input value={form.phone} onChange={set('phone')} dir="ltr" placeholder="09xxxxxxxx" /></div>
          </>
        )}
        <div><label>اسم المتجر</label><input value={form.name} onChange={set('name')} /></div>
        <div><label>التصنيف</label><input value={form.category} onChange={set('category')} placeholder="هدايا، مطاعم، بقالة..." /></div>
        <div><label>العنوان</label><input value={form.address} onChange={set('address')} /></div>
        <div>
          <label>موقع المتجر — اضغط على الخريطة</label>
          <BaseMap center={point || undefined} height={220}>
            <ClickPicker onPick={([lat, lng]) => setForm((f) => ({ ...f, lat, lng }))} />
            {point && <Marker position={point} icon={icons.vendor} />}
          </BaseMap>
        </div>
        {error && <div className="error">{error}</div>}
        <div className="row">
          <button>{editId ? 'حفظ التعديل' : 'تحويل الحساب لمتجر'}</button>
          {editId && <button type="button" className="ghost" onClick={reset}>إلغاء</button>}
        </div>
      </form>

      <section className="panel table-wrap">
        <table>
          <thead><tr><th>المتجر</th><th>الحساب</th><th>منتجات</th><th>مفتوح</th><th>مفعّل</th><th></th></tr></thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id}>
                <td><strong>{v.name}</strong><div className="muted">{[v.category, v.address].filter(Boolean).join('، ')}</div></td>
                <td>{v.owner?.name}<div className="muted" dir="ltr" style={{ textAlign: 'right' }}>{v.owner?.phone}</div></td>
                <td>{v.products?.[0]?.count ?? 0}</td>
                <td><button className={`sm ${v.is_open ? 'ok' : 'ghost'}`} onClick={() => toggle(v, 'is_open')}>{v.is_open ? 'مفتوح' : 'مغلق'}</button></td>
                <td><button className={`sm ${v.is_active ? 'ok' : 'danger'}`} onClick={() => toggle(v, 'is_active')}>{v.is_active ? 'مفعّل' : 'موقوف'}</button></td>
                <td><button className="ghost sm" onClick={() => edit(v)}>تعديل</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
