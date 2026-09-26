import { useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { useCached } from '../../shared/cache';
import { Rating } from '../../shared/Stars';
import CategoryStrip from '../../shared/CategoryStrip';

const CATEGORY_ICON = { هدايا: '🎁', مطاعم: '🍽️', بقالة: '🛒', صيدلية: '💊', حلويات: '🍰' };

export default function Stores({ onOpen, onBrowse }) {
  const [category, setCategory] = useState('الكل');
  const [q, setQ] = useState('');

  const { data: cats } = useCached('categories', () =>
    run(supabase.from('categories').select('id, parent_id, name, icon, image_url')
      .eq('is_active', true).order('sort_order').order('name'))
  );
  const mains = (cats || []).filter((c) => !c.parent_id);

  const { data: vendors, error, stale, loading } = useCached('vendors', () =>
    run(
      supabase
        .from('vendors')
        .select('id, name, category, address, is_open, rating_avg, rating_count')
        .order('is_open', { ascending: false })
        .order('name')
    )
  );

  if (loading) return <StoresSkeleton />;
  if (error && !vendors) return <div className="error">{error}</div>;

  const categories = ['الكل', ...new Set(vendors.map((v) => v.category).filter(Boolean))];
  const list = vendors.filter(
    (v) => (category === 'الكل' || v.category === category) && v.name.includes(q.trim())
  );

  return (
    <div className="stack">
      <button type="button" className="search-box search-fake" onClick={() => onBrowse(null)}>
        🔍 ابحث عن منتج أو متجر
      </button>

      {mains.length > 0 && (
        <CategoryStrip items={mains} value={null} onChange={(id) => onBrowse(id)} allLabel="كل الأصناف" />
      )}

      <div className="row between">
        <h2>المتاجر {stale && <span className="dot-pulse" aria-label="جاري التحديث" />}</h2>
        <input style={{ maxWidth: 220 }} placeholder="اسم المتجر" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {categories.length > 2 && (
        <div className="chips">
          {categories.map((c) => (
            <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
      )}

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

// هيكل مبدئي: يظهر فوراً بدل شاشة انتظار فارغة
function StoresSkeleton() {
  return (
    <div className="stack" aria-busy="true">
      <div className="row between">
        <h2>المتاجر</h2>
        <span className="sk" style={{ width: 200, height: 40 }} />
      </div>
      <div className="row">
        {[60, 70, 55].map((w, i) => <span key={i} className="sk" style={{ width: w, height: 30 }} />)}
      </div>
      <div className="grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel stack">
            <span className="sk thumb" />
            <span className="sk" style={{ width: '60%', height: 18 }} />
            <span className="sk" style={{ width: '85%', height: 14 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
