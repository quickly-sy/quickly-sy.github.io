import { useEffect, useState } from 'react';

// صورة بحجم متوسط مع زر تكبير في الزاوية
export default function ImageZoom({ src, alt, fallback = '📦', eager = false }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!src) return <div className="thumb">{fallback}</div>;

  return (
    <div className="thumb-wrap">
      <img className="thumb" src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      <button type="button" className="zoom-btn" onClick={() => setOpen(true)} aria-label="تكبير الصورة" title="تكبير">🔍</button>
      {open && (
        <div className="zoom-back" onClick={() => setOpen(false)} role="dialog" aria-label={alt}>
          <img src={src} alt={alt} />
          <button type="button" className="zoom-close" onClick={() => setOpen(false)} aria-label="إغلاق">✕</button>
        </div>
      )}
    </div>
  );
}
