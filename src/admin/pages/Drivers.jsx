import { useCallback, useEffect, useState } from 'react';
import { supabase, run, rpc } from '../../shared/supabase';
import { normalizePhone } from '../../shared/auth';
import { DRIVER_STATUS } from '../../shared/utils';
import { Rating } from '../../shared/Stars';

const VEHICLES = { motorcycle: 'دراجة نارية', car: 'سيارة', bicycle: 'دراجة هوائية' };

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState({ phone: '', vehicle_type: 'motorcycle' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    run(supabase.from('drivers').select('*, profile:profiles(name, phone)').order('id'))
      .then(setDrivers)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setError('');
    try {
      await rpc('admin_setup_driver', { p_phone: normalizePhone(form.phone), p_vehicle_type: form.vehicle_type });
      setForm({ phone: '', vehicle_type: 'motorcycle' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function update(d, patch) {
    await run(supabase.from('drivers').update(patch).eq('id', d.id)).catch((e) => alert(e.message));
    load();
  }

  return (
    <div className="split side">
      <form className="panel stack" onSubmit={save}>
        <h3>إضافة سائق</h3>
        <div className="notice">السائق يسجّل أولاً من واجهة الزبون، بعدها تحوّل حسابه لسائق من هنا.</div>
        <div><label>رقم هاتف السائق</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} dir="ltr" placeholder="09xxxxxxxx" /></div>
        <div>
          <label>المركبة</label>
          <select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
            {Object.entries(VEHICLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {error && <div className="error">{error}</div>}
        <button>تحويل الحساب لسائق</button>
      </form>

      <section className="panel table-wrap">
        <table>
          <thead><tr><th>السائق</th><th>المركبة</th><th>النوع</th><th>التقييم</th><th>الحالة</th><th>آخر موقع</th><th>مفعّل</th><th></th></tr></thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.profile?.name}</strong><div className="muted" dir="ltr" style={{ textAlign: 'right' }}>{d.profile?.phone}</div></td>
                <td>{VEHICLES[d.vehicle_type] || d.vehicle_type}</td>
                <td>
                  <button className={`sm ${d.kind === 'private' ? '' : 'ghost'}`}
                          onClick={() => window.confirm(d.kind === 'private' ? 'تحويله لسائق توصيل عادي؟' : 'تحويله لسائق خاص؟ لن تصله طلبات التوصيل بعدها.') &&
                                         update(d, { kind: d.kind === 'private' ? 'delivery' : 'private' })}>
                    {d.kind === 'private' ? 'خاص 🔒' : 'توصيل'}
                  </button>
                </td>
                <td><Rating avg={d.rating_avg} count={d.rating_count} className="" /></td>
                <td><span className={`badge ${d.status}`}>{DRIVER_STATUS[d.status]}</span></td>
                <td className="muted">{d.location_at ? new Date(d.location_at).toLocaleTimeString('ar') : '—'}</td>
                <td><button className={`sm ${d.is_active ? 'ok' : 'danger'}`} onClick={() => update(d, { is_active: !d.is_active })}>{d.is_active ? 'مفعّل' : 'موقوف'}</button></td>
                <td>{d.status === 'available' && <button className="ghost sm" onClick={() => update(d, { status: 'offline' })}>إيقاف</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
