import { useCallback, useEffect, useRef, useState } from 'react';
import { Marker, Polyline, Popup } from 'react-leaflet';
import { supabase, run, rpc, subscribe } from '../../shared/supabase';
import { BaseMap, ClickPicker, FitBounds, icons } from '../../shared/map';
import { TASK_STATUS, TASK_BADGE, TASK_RUNNING, money, formatTime, toPoint, distanceM } from '../../shared/utils';

const SIGNAL_LOST_MS = 2 * 60 * 1000; // لا موقع منذ دقيقتين
const STOP_ALERT_MS = 5 * 60 * 1000; // واقف 5 دقائق
const STOP_RADIUS_M = 60;
const NEAR_DEST_M = 150;

const EMPTY = { driver_id: '', title: 'إيداع بنكي', from_name: '', from: null, to_name: '', to: null, amount: '', notes: '' };
const amountOf = (t) => (Array.isArray(t.task_secrets) ? t.task_secrets[0]?.amount : t.task_secrets?.amount);
const isLost = (t, now) =>
  TASK_RUNNING.includes(t.status) &&
  (!t.driver?.location_at || now - new Date(t.driver.location_at).getTime() > SIGNAL_LOST_MS);

export default function Tasks() {
  const [drivers, setDrivers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [pick, setPick] = useState('to');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    run(supabase.from('tasks')
      .select('*, task_secrets(amount), driver:drivers(id, location_at, profile:profiles(name, phone))')
      .order('id', { ascending: false }).limit(50))
      .then(setTasks).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    run(supabase.from('drivers').select('id, is_active, kind, profile:profiles(name)').eq('kind', 'private'))
      .then(setDrivers).catch(() => {});
    run(supabase.from('vendors').select('id, name, lat, lng').order('name')).then(setVendors).catch(() => {});
    const off = subscribe([{ event: '*', table: 'tasks' }], load);
    const tick = setInterval(() => { setNow(Date.now()); load(); }, 20000);
    return () => { off(); clearInterval(tick); };
  }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function pickVendor(id) {
    const v = vendors.find((x) => String(x.id) === id);
    if (v) setForm((f) => ({ ...f, from_name: v.name, from: toPoint(v.lat, v.lng) }));
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    if (!form.driver_id) return setError('اختر السائق الخاص');
    if (!form.to) return setError('حدد نقطة الوصول على الخريطة');
    try {
      const id = await rpc('admin_create_task', {
        p_driver_id: Number(form.driver_id),
        p_title: form.title,
        p_from_name: form.from_name, p_from_lat: form.from?.[0] ?? null, p_from_lng: form.from?.[1] ?? null,
        p_to_name: form.to_name, p_to_lat: form.to[0], p_to_lng: form.to[1],
        p_amount: form.amount === '' ? null : Number(form.amount),
        p_notes: form.notes,
      });
      setForm({ ...EMPTY, driver_id: form.driver_id });
      setSelectedId(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancel(t) {
    if (!window.confirm(`إلغاء المهمة #${t.id}؟`)) return;
    await rpc('admin_cancel_task', { p_task_id: t.id }).catch((e) => alert(e.message));
    load();
  }

  const selected = tasks.find((t) => t.id === selectedId);

  return (
    <div className="stack">
      {tasks.some((t) => isLost(t, now)) && (
        <div className="error">🔴 انقطع موقع السائق الخاص أثناء مهمة جارية — اتصل به فوراً.</div>
      )}

      {selected && <TaskTracker task={selected} now={now} onClose={() => setSelectedId(null)} />}

      <div className="split side">
        <form className="panel stack" onSubmit={save}>
          <h3>مهمة جديدة</h3>
          {!drivers.length && (
            <div className="notice">لا يوجد سائق خاص. من تبويب "السائقون" غيّر نوع السائق إلى "خاص".</div>
          )}
          <div>
            <label>السائق</label>
            <select value={form.driver_id} onChange={set('driver_id')}>
              <option value="">اختر</option>
              {drivers.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.profile?.name}</option>)}
            </select>
          </div>
          <div><label>العنوان</label><input value={form.title} onChange={set('title')} /></div>
          <div>
            <label>الانطلاق من متجر (اختياري)</label>
            <select onChange={(e) => pickVendor(e.target.value)} defaultValue="">
              <option value="">اختر متجراً أو حدده على الخريطة</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="row">
            <input style={{ flex: 1 }} placeholder="اسم نقطة الانطلاق" value={form.from_name} onChange={set('from_name')} />
            <input style={{ flex: 1 }} placeholder="اسم الوجهة (مثلاً: بنك ...)" value={form.to_name} onChange={set('to_name')} />
          </div>
          <div className="tabs">
            <button type="button" className={pick === 'from' ? 'on' : ''} onClick={() => setPick('from')}>حدد الانطلاق 🏪</button>
            <button type="button" className={pick === 'to' ? 'on' : ''} onClick={() => setPick('to')}>حدد الوجهة 🏦</button>
          </div>
          <BaseMap height={240}>
            <ClickPicker onPick={(p) => setForm((f) => ({ ...f, [pick]: p }))} />
            {form.from && <Marker position={form.from} icon={icons.vendor} />}
            {form.to && <Marker position={form.to} icon={icons.bank} />}
          </BaseMap>
          <div><label>المبلغ (يظهر للإدارة فقط)</label><input type="number" min="0" value={form.amount} onChange={set('amount')} dir="ltr" /></div>
          <div><label>ملاحظات للسائق</label><textarea rows={2} value={form.notes} onChange={set('notes')} /></div>
          {error && <div className="error">{error}</div>}
          <button>إرسال المهمة للسائق</button>
        </form>

        <section className="panel table-wrap">
          {!tasks.length ? (
            <div className="empty">لا توجد مهمات بعد.</div>
          ) : (
            <table>
              <thead><tr><th>#</th><th>المهمة</th><th>السائق</th><th>المبلغ</th><th>الحالة</th><th></th></tr></thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} style={t.id === selectedId ? { background: 'var(--accent-soft)' } : undefined}>
                    <td><strong>{t.id}</strong><div className="muted">{formatTime(t.created_at)}</div></td>
                    <td>{t.title}<div className="muted">{[t.from_name, t.to_name].filter(Boolean).join(' ← ')}</div></td>
                    <td>{t.driver?.profile?.name}</td>
                    <td className="price">{amountOf(t) != null ? money(amountOf(t)) : '—'}</td>
                    <td>
                      <span className={`badge ${TASK_BADGE[t.status]}`}>{TASK_STATUS[t.status]}</span>
                      {isLost(t, now) && <div className="muted" style={{ color: 'var(--danger)' }}>🔴 انقطع الموقع</div>}
                    </td>
                    <td>
                      <div className="row">
                        <button className="sm" onClick={() => setSelectedId(t.id)}>تتبّع</button>
                        {!['done', 'cancelled'].includes(t.status) && (
                          <button className="ghost sm" onClick={() => cancel(t)}>إلغاء</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

// عرض المهمة: المسار الكامل + موقع السائق المباشر + التنبيهات
function TaskTracker({ task, now, onClose }) {
  const [path, setPath] = useState([]); // [{ p: [lat, lng], at }]
  const [driver, setDriver] = useState(null);
  const statusRef = useRef(task.status);
  statusRef.current = task.status;

  useEffect(() => {
    run(supabase.from('location_history').select('lat, lng, at').eq('task_id', task.id).order('at'))
      .then((rows) => setPath(rows.map((r) => ({ p: [r.lat, r.lng], at: r.at }))))
      .catch(() => {});
    run(supabase.from('drivers').select('current_lat, current_lng, location_at').eq('id', task.driver_id).single())
      .then(setDriver).catch(() => {});
    return subscribe([{ event: 'UPDATE', table: 'drivers', filter: `id=eq.${task.driver_id}` }], ({ new: d }) => {
      setDriver(d);
      if (TASK_RUNNING.includes(statusRef.current) && d.current_lat != null) {
        setPath((old) => [...old, { p: [d.current_lat, d.current_lng], at: d.location_at }]);
      }
    });
  }, [task.id, task.driver_id]);

  const from = toPoint(task.from_lat, task.from_lng);
  const to = toPoint(task.to_lat, task.to_lng);
  const live = toPoint(driver?.current_lat, driver?.current_lng);
  const running = TASK_RUNNING.includes(task.status);

  // تنبيهات
  const lastAt = driver?.location_at ? new Date(driver.location_at).getTime() : 0;
  const lost = running && now - lastAt > SIGNAL_LOST_MS;
  let stoppedMin = 0;
  if (running && task.status === 'started' && path.length > 1) {
    const last = path[path.length - 1];
    let i = path.length - 1;
    while (i > 0 && distanceM(path[i - 1].p, last.p) < STOP_RADIUS_M) i--;
    const stoppedMs = new Date(last.at).getTime() - new Date(path[i].at).getTime();
    if (stoppedMs > STOP_ALERT_MS && distanceM(last.p, to) > NEAR_DEST_M) stoppedMin = Math.round(stoppedMs / 60000);
  }

  const steps = [
    ['أُنشئت', task.created_at],
    ['انطلق', task.started_at],
    ['وصل', task.arrived_at],
    ['تمت', task.done_at],
  ];

  return (
    <section className="panel stack">
      <div className="row between">
        <h2>#{task.id} {task.title}</h2>
        <div className="row">
          <span className={`badge ${TASK_BADGE[task.status]}`}>{TASK_STATUS[task.status]}</span>
          <button className="ghost sm" onClick={onClose}>إغلاق</button>
        </div>
      </div>
      {lost && <div className="error">🔴 لا يصل موقع السائق منذ أكثر من دقيقتين. اتصل به: <a href={`tel:${task.driver?.profile?.phone}`} dir="ltr">{task.driver?.profile?.phone}</a></div>}
      {stoppedMin > 0 && <div className="error" style={{ background: '#fff3d6', color: '#8a5a00' }}>🟠 السائق متوقف منذ {stoppedMin} دقيقة بعيداً عن الوجهة.</div>}
      <div className="split wide">
        <BaseMap height={420}>
          <FitBounds points={[from, to, live]} />
          {from && <Marker position={from} icon={icons.vendor}><Popup>{task.from_name || 'الانطلاق'}</Popup></Marker>}
          {to && <Marker position={to} icon={icons.bank}><Popup>{task.to_name || 'الوجهة'}</Popup></Marker>}
          {path.length > 1 && <Polyline positions={path.map((x) => x.p)} pathOptions={{ color: '#1c64d6', weight: 5, opacity: 0.8 }} />}
          {live && <Marker position={live} icon={icons.driver}><Popup>{task.driver?.profile?.name}</Popup></Marker>}
        </BaseMap>
        <div className="stack">
          <div>
            <label>السائق</label>
            <strong>{task.driver?.profile?.name}</strong>{' '}
            <a href={`tel:${task.driver?.profile?.phone}`} dir="ltr">{task.driver?.profile?.phone}</a>
          </div>
          <div><label>المبلغ</label><span className="price">{amountOf(task) != null ? money(amountOf(task)) : '—'}</span></div>
          <div>
            <label>المراحل</label>
            {steps.map(([label, t]) => (
              <div key={label} className="item-line">
                <span>{label}</span>
                <span className="muted">{t ? formatTime(t) : '—'}</span>
              </div>
            ))}
          </div>
          <div className="muted">
            نقاط المسار المسجّلة: {path.length}
            {driver?.location_at && ` — آخر موقع: ${new Date(driver.location_at).toLocaleTimeString('ar')}`}
          </div>
          {task.notes && <div className="muted">ملاحظة: {task.notes}</div>}
        </div>
      </div>
    </section>
  );
}
