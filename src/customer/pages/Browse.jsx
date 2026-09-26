import { useEffect, useMemo, useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { useCached } from '../../shared/cache';
import { useSaver } from '../../shared/saver';
import CategoryStrip from '../../shared/CategoryStrip';
import ImageZoom from '../../shared/ImageZoom';
import VariantPicker, { hasVariants } from '../VariantPicker';
import { money } from '../../shared/utils';

const PRODUCT_FIELDS =
  'id, name, description, price, image_url, images, variant_mode, variant_labels, variant_off, category_id, vendor:vendors(id, name, is_open, is_active, lat, lng)';

export default function Browse({ initialCategory = null, cart, onAdd, onOpenStore }) {
  const [main, setMain] = useState(initialCategory);
  const [sub, setSub] = useState(null);
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [saver] = useSaver();
  const [picking, setPicking] = useState(null);

  const { data: cats } = useCached('categories', () =>
    run(supabase.from('categories').select('id, parent_id, name, icon, image_url')
      .eq('is_active', true).order('sort_order').order('name'))
  );

  const mains = useMemo(() => (cats || []).filter((c) => !c.parent_id), [cats]);
  const subs = useMemo(() => (cats || []).filter((c) => c.parent_id === main), [cats, main]);

  // معرّفات التصنيف المطلوبة: الفرعي وحده، أو الرئيسي مع كل فرعياته
  const catIds = useMemo(() => {
    if (sub) return [sub];
    if (main) return [main, ...subs.map((s) => s.id)];
    return null;
  }, [main, sub, subs]);

  const term = q.trim();
  const key = term ? `search:${term}` : `cat:${catIds ? catIds.join('.') : 'all'}`;

  const { data: products, loading, stale } = useCached(
    key,
    () => {
      let query = supabase.from('products').select(PRODUCT_FIELDS).eq('is_available', true).limit(120);
      if (term) query = query.ilike('name', `%${term}%`);
      else if (catIds) query = query.in('category_id', catIds);
      return run(query.order('name'));
    },
    [key]
  );

  // البحث بالنص يشمل المتاجر أيضاً
  const { data: vendors } = useCached('vendors', () =>
    run(supabase.from('vendors').select('id, name, category, address, is_open, rating_avg, rating_count')
      .order('is_open', { ascending: false }).order('name'))
  );
  const matchedStores = term ? (vendors || []).filter((v) => v.name.includes(term)) : [];

  useEffect(() => { setSub(null); }, [main]);

  const list = (products || [])
    .filter((p) => p.vendor && p.vendor.is_active)
    .filter((p) => !openOnly || p.vendor.is_open);

  const vendorOf = (p) => ({ id: p.vendor.id, name: p.vendor.name, lat: p.vendor.lat, lng: p.vendor.lng });

  const clearAll = () => { setMain(null); setSub(null); setQ(''); setOpenOnly(false); };

  return (
    <div className="stack">
      {picking && (
        <VariantPicker
          product={picking}
          onPick={(vi) => onAdd(vendorOf(picking), picking, vi)}
          onClose={() => setPicking(null)}
        />
      )}
      <input
        className="search-box"
        placeholder="ابحث عن منتج أو متجر"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        inputMode="search"
      />

      {!term && cats && <CategoryStrip items={mains} value={main} onChange={setMain} />}

      {!term && main && subs.length > 0 && (
        <div className="chips">
          <button className={sub === null ? 'on' : ''} onClick={() => setSub(null)}>الكل</button>
          {subs.map((s) => (
            <button key={s.id} className={sub === s.id ? 'on' : ''} onClick={() => setSub(s.id)}>{s.name}</button>
          ))}
        </div>
      )}

      <div className="chips">
        <button className={openOnly ? 'on' : ''} onClick={() => setOpenOnly(!openOnly)}>مفتوح الآن</button>
        {(main || sub || term || openOnly) && (
          <button className="chip-clear" onClick={clearAll}>✕ إزالة الفلاتر</button>
        )}
      </div>

      {term && matchedStores.length > 0 && (
        <section className="stack">
          <h3>متاجر</h3>
          <div className="chips">
            {matchedStores.map((v) => (
              <button key={v.id} onClick={() => onOpenStore(v.id)}>{v.name}</button>
            ))}
          </div>
        </section>
      )}

      <div className="row between">
        <h3>{term ? 'منتجات مطابقة' : sub ? subs.find((s) => s.id === sub)?.name : main ? mains.find((m) => m.id === main)?.name : 'كل المنتجات'}</h3>
        {stale && <span className="dot-pulse" aria-label="جاري التحديث" />}
      </div>

      {loading ? (
        <div className="grid products">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="panel stack"><span className="sk thumb" /><span className="sk" style={{ width: '70%', height: 16 }} /></div>
          ))}
        </div>
      ) : list.length ? (
        <div className="grid products">
          {list.map((p) => (
            <article key={p.id} className="panel stack">
              {saver ? <div className="thumb">📦</div> : <ImageZoom src={p.image_url} images={p.images} alt={p.name} />}
              <div>
                <h3>{p.name}</h3>
                <button className="link" onClick={() => onOpenStore(p.vendor.id)}>
                  {p.vendor.name} {p.vendor.is_open ? '' : '(مغلق)'}
                </button>
              </div>
              <div className="row between">
                <span className="price">{money(p.price)}</span>
                <button
                  className="sm"
                  disabled={!p.vendor.is_open}
                  onClick={() => (hasVariants(p) ? setPicking(p) : onAdd(vendorOf(p), p))}
                >
                  {hasVariants(p) ? 'اختر الموديل' : 'أضف للسلة'}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty stack">
          <p>{term ? 'ما لقينا نتائج مطابقة.' : 'لا توجد منتجات في هذا التصنيف بعد.'}</p>
          <button className="ghost" onClick={clearAll}>إزالة الفلاتر</button>
        </div>
      )}
    </div>
  );
}
