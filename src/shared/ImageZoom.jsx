// صورة بحجم وسط + زر تكبير يفتح معرض ملء الشاشة
import { useCallback, useEffect, useState } from 'react';

export default function ImageZoom({ src, images, alt = '' }) {
  const list = (Array.isArray(images) && images.length ? images : [src]).filter(Boolean);
  const [at, setAt] = useState(-1); // -1 مغلق
  const open = at >= 0;

  const go = useCallback((d) => setAt((i) => (i + d + list.length) % list.length), [list.length]);

  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => {
      if (e.key === 'Escape') setAt(-1);
      // بالعربية: السهم الأيمن يرجّع للخلف
      if (e.key === 'ArrowRight') go(-1);
      if (e.key === 'ArrowLeft') go(1);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, go]);

  if (!list.length) return <div className="thumb">📦</div>;

  return (
    <>
      <div className="thumb-wrap">
        <img className="thumb" src={list[0]} alt={alt} loading="lazy" />
        <button type="button" className="zoom-btn" onClick={() => setAt(0)} aria-label="تكبير الصورة">🔍</button>
        {list.length > 1 && <span className="img-count">{list.length} صور</span>}
      </div>

      {open && (
        <div className="zoom-back" onClick={() => setAt(-1)} role="dialog" aria-label={alt || 'صورة'}>
          <button type="button" className="zoom-close" onClick={() => setAt(-1)} aria-label="إغلاق">✕</button>

          <img src={list[at]} alt={alt} onClick={(e) => e.stopPropagation()} />

          {list.length > 1 && (
            <>
              <button type="button" className="zoom-nav prev"
                onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="السابق">›</button>
              <button type="button" className="zoom-nav next"
                onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="التالي">‹</button>
              <div className="zoom-dots" onClick={(e) => e.stopPropagation()}>
                {list.map((u, i) => (
                  <button key={u + i} type="button" className={i === at ? 'on' : ''}
                    onClick={() => setAt(i)} aria-label={`صورة ${i + 1}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
