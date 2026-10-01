// مبيعات المتجر — أرقام الفترة والأكثر مبيعاً
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { money } from '../../shared/utils';
import { downloadCsv } from '../../shared/csv';

const RANGES = [
  ['today', 'اليوم'],
  ['week', 'آخر 7 أيام'],
  ['month', 'هذا الشهر'],
  ['all', 'من البداية'],
  ['custom', 'مدة محددة'],
];

/* بداية اليوم بالتوقيت المحلي (مو UTC) */
function dayStart(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function boundsOf(range, from, to) {
  const now = new Date();
  if (range === 'today') return [dayStart(now), null];
  if (range === 'week') {
    const s = dayStart(now);
    s.setDate(s.getDate() - 6);
    return [s, null];
  }
  if (range === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), null];
  if (range === 'custom') {
    const s = from ? dayStart(new Date(from)) : null;
    const e = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : null;
    return [s, e];
  }
  return [null, null];
}

export default function Sales({ vendorId }) {
  const [range, setRange] = useState('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const [s, e] = boundsOf(range, from, to);
    let q = supabase
      .from('orders')
      .select('id, total, delivery_fee, status, created_at, order_items(product_name, variant_label, quantity, price)')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (s) q = q.gte('created_at', s.toISOString());
    if (e) q = q.lte('created_at', e.toISOString());

    run(q)
      .then((r) => { setRows(r || []); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [vendorId, range, from, to]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const done = rows.filter((o) => o.status === 'delivered');
    const cancelled = rows.filter((o) => o.status === 'cancelled').length;
    const active = rows.filter((o) => !['delivered', 'cancelled'].includes(o.status)).length;

    // مبيعات المتجر = مجموع المنتجات بدون رسوم التوصيل
    const revenue = done.reduce((n, o) => n + Number(o.total || 0), 0);
    const pieces = done.reduce(
      (n, o) => n + (o.order_items || []).reduce((m, i) => m + Number(i.quantity || 0), 0), 0
    );

    // الأكثر مبيعاً
    const map = new Map();
    for (const o of done) {
      for (const i of o.order_items || []) {
        const key = `${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ''}`;
        const cur = map.get(key) || { name: key, qty: 0, sum: 0 };
        cur.qty += Number(i.quantity || 0);
        cur.sum += Number(i.price || 0) * Number(i.quantity || 0);
        map.set(key, cur);
      }
    }
    const top = [...map.values()].sort((a, b) => b.sum - a.sum);

    return {
      orders: done.length,
      cancelled,
      active,
      revenue,
      pieces,
      avg: done.length ? revenue / done.length : 0,
      top,
    };
  }, [rows]);

  function exportCsv() {
    const head = ['المنتج', 'الكمية المباعة', 'الإجمالي'];
    const body = stats.top.map((t) => [t.name, t.qty, Math.round(t.sum)]);
    downloadCsv(`quickly-sales-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...body]);
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <h3>المبيعات</h3>
        <div className="chips">
          {RANGES.map(([k, label]) => (
            <button key={k} type="button" className={range === k ? 'on' : ''} onClick={() => setRange(k)}>
              {label}
            </button>
          ))}
        </div>

        {range === 'custom' && (
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>من</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
            </div>
            <div style={{ flex: 1 }}>
              <label>إلى</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} dir="ltr" />
            </div>
          </div>
        )}

        {error && <div className="error">{error}</div>}
      </div>

      {loading ? (
        <div className="grid">
          {[0, 1, 2, 3].map((i) => <div key={i} className="panel"><span className="sk" style={{ height: 54 }} /></div>)}
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <span className="kpi-label">المبيعات</span>
              <strong className="kpi-value">{money(Math.round(stats.revenue))}</strong>
              <span className="muted">بدون رسوم التوصيل</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">طلبات مسلّمة</span>
              <strong className="kpi-value">{stats.orders}</strong>
              {stats.active > 0 && <span className="muted">{stats.active} قيد التنفيذ</span>}
            </div>
            <div className="kpi">
              <span className="kpi-label">متوسط الطلب</span>
              <strong className="kpi-value">{money(Math.round(stats.avg))}</strong>
            </div>
            <div className="kpi">
              <span className="kpi-label">قطع مباعة</span>
              <strong className="kpi-value">{stats.pieces}</strong>
              {stats.cancelled > 0 && <span className="muted">{stats.cancelled} طلب ملغي</span>}
            </div>
          </div>

          <div className="panel stack">
            <div className="row between">
              <h3>الأكثر مبيعاً</h3>
              {stats.top.length > 0 && (
                <button className="ghost sm" onClick={exportCsv}>⬇️ تصدير CSV</button>
              )}
            </div>

            {!stats.top.length ? (
              <div className="empty">
                ما في مبيعات بهالفترة.
                {range !== 'all' && <div className="muted">جرّب «من البداية».</div>}
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>المنتج</th><th>الكمية</th><th>الإجمالي</th></tr></thead>
                  <tbody>
                    {stats.top.slice(0, 50).map((t, i) => (
                      <tr key={t.name}>
                        <td className="muted">{i + 1}</td>
                        <td>{t.name}</td>
                        <td>{t.qty}</td>
                        <td className="price">{money(Math.round(t.sum))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {stats.top.length > 50 && <p className="muted">عم نعرض أعلى 50 — التصدير بيشمل الكل.</p>}
          </div>
        </>
      )}
    </div>
  );
}
