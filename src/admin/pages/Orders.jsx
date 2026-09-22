import { useCallback, useEffect, useState } from 'react';
import { supabase, run, rpc, subscribe } from '../../shared/supabase';
import { STATUS, DRIVER_STATUS, money, formatTime } from '../../shared/utils';

const FILTERS = [['active', 'الجارية'], ['all', 'الكل'], ...Object.entries(STATUS)];
const RUNNING = ['pending', 'confirmed', 'preparing', 'ready', 'picked'];
const ASSIGNABLE = ['pending', 'confirmed', 'preparing', 'ready'];

export default function Orders() {
  const [filter, setFilter] = useState('active');
  const [orders, setOrders] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [choice, setChoice] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(() => {
    let q = supabase.from('orders').select('*, order_items(*)').order('id', { ascending: false }).limit(200);
    if (filter === 'active') q = q.in('status', RUNNING);
    else if (filter !== 'all') q = q.eq('status', filter);
    run(q).then(setOrders).catch((e) => setError(e.message));
    run(supabase.from('drivers').select('id, status, is_active, kind, profile:profiles(name)').order('id')).then(setDrivers).catch(() => {});
  }, [filter]);

  useEffect(() => {
    load();
    return subscribe([{ event: '*', table: 'orders' }], load);
  }, [load]);

  async function act(fn) {
    try { await fn(); load(); } catch (e) { alert(e.message); }
  }

  function assign(order) {
    const driverId = Number(choice[order.id]);
    if (!driverId) return alert('اختر سائقاً أولاً');
    act(() => rpc('admin_assign_driver', { p_order_id: order.id, p_driver_id: driverId }));
  }

  function cancel(order) {
    if (window.confirm(`إلغاء الطلب #${order.id}؟`)) act(() => rpc('admin_cancel_order', { p_order_id: order.id }));
  }

  return (
    <div className="stack">
      <div className="row between">
        <h2>الطلبات</h2>
        <select style={{ maxWidth: 220 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          {FILTERS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      {error && <div className="error">{error}</div>}
      {!orders.length ? (
        <div className="empty">لا توجد طلبات بهذه الحالة.</div>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>الزبون</th><th>المتجر</th><th>المبلغ</th><th>الحالة</th><th>السائق</th><th></th></tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.id}</strong><div className="muted">{formatTime(o.created_at)}</div></td>
                  <td>
                    {o.customer_name}
                    <div className="muted" dir="ltr" style={{ textAlign: 'right' }}>{o.customer_phone}</div>
                    <div className="muted">{o.order_items.map((i) => `${i.quantity}× ${i.product_name}`).join('، ')}</div>
                  </td>
                  <td>{o.vendor_name}</td>
                  <td className="price">{money(Number(o.total) + Number(o.delivery_fee))}</td>
                  <td><span className={`badge ${o.status}`}>{STATUS[o.status]}</span></td>
                  <td style={{ minWidth: 200 }}>
                    <div>{o.driver_name || <span className="muted">بدون سائق</span>}</div>
                    {ASSIGNABLE.includes(o.status) && (
                      <div className="row" style={{ marginTop: 6 }}>
                        <select style={{ flex: 1, padding: 6 }} value={choice[o.id] || ''}
                                onChange={(e) => setChoice({ ...choice, [o.id]: e.target.value })}>
                          <option value="">اختر سائقاً</option>
                          {drivers.filter((d) => d.is_active && d.kind !== 'private').map((d) => (
                            <option key={d.id} value={d.id}>{d.profile?.name} ({DRIVER_STATUS[d.status]})</option>
                          ))}
                        </select>
                        <button className="sm" onClick={() => assign(o)}>{o.driver_id ? 'تغيير' : 'تعيين'}</button>
                      </div>
                    )}
                  </td>
                  <td>
                    {!['delivered', 'cancelled'].includes(o.status) && (
                      <button className="ghost sm" onClick={() => cancel(o)}>إلغاء</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
