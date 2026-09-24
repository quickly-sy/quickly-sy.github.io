import { useEffect, useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { Rating } from '../../shared/Stars';

const CATEGORY_ICON = { هدايا: '🎁', مطاعم: '🍽️', بقالة: '🛒', صيدلية: '💊', حلويات: '🍰' };

export default function Stores({ onOpen }) {
  const [vendors, setVendors] = useState(null);
  const [category, setCategory] = useState('الكل');
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    run(
      supabase.from('vendors').select('id, name, category, address, is_open, rating_avg, rating_count')
        .order('is_open', { ascending: false }).order('name')
    ).then(setVendors).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!vendors) return <p className="muted">جاري تحميل المتاجر...</p>;

  const categories = ['الكل', ...new Set(vendors.map((v) => v.category).filter(Boolean))];
  const list = vendors.filter((v) => (category === 'الكل' || v.category === category) && v.name.includes(q.trim()));

  return (
    <div className="stack">
      <div className="row between">
        <h2>المتاجر</h2>
        <input style={{ maxWidth: 280 }} placeholder="ابحث باسم المتجر" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="tabs">
        {categories.map((c) => (
          <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>
      {list.length ? (
        <div className="grid">
          {list.map((v) => (
            <button key={v.id} className="card-btn stack" disabled={!v.is_open} onClick={() => onOpen(v.id)}>
              <div className="thumb">{CATEGORY_ICON[v.category] || '🏪'}</div>
              <div className="row between">
                <h3>{v.name}</h3>
                <span className={`badge ${v.is_open ? 'open' : 'closed'}`}>{v.is_open ? 'مفتوح' : 'مغلق'}</span>
              </div>
              <div className="row between">
                <span className="muted">{[v.category, v.address].filter(Boolean).join('، ')}</span>
                <Rating avg={v.rating_avg} count={v.rating_count} />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">لا يوجد متجر بهذا الاسم أو التصنيف.</div>
      )}
    </div>
  );
}
