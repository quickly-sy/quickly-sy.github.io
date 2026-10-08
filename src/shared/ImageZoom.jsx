// صورة بحجم وسط — الضغط عليها بأي مكان يفتح العرض الكامل،
// وداخل العرض الكامل الضغط على نقطة بالصورة بيكبّرها عند هاي النقطة.
import { useCallback, useEffect, useRef, useState } from 'react';

const SCALE = 2.5; // قوة التكبير داخل العرض الكامل

function ExpandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4H4v5" /><path d="M20 9V4h-5" />
      <path d="M15 20h5v-5" /><path d="M4 15v5h5" />
    </svg>
  );
}

export default function ImageZoom({ src, images, alt = '' }) {
  const list = (Array.isArray(images) && images.length ? images : [src]).filter(Boolean);
  const [at, setAt] = useState(-1);   // -1 مغلق
  const [big, setBig] = useState(0);  // 0 = بحجمها، وإلا عرضها بالبكسل بعد التكبير
  const open = at >= 0;

  const stage = useRef(null);
  const imgRef = useRef(null);
  const tapAt = useRef({ x: 0.5, y: 0.5 });

  const go = useCallback((d) => setAt((i) => (i + d + list.length) % list.length), [list.length]);

  // تبديل الصورة أو الإغلاق يرجّع التكبير للصفر
  useEffect(() => { setBig(0); }, [at]);

  useEffect(() => {
    if (!open) return undefined;
    const key = (e) => {
      if (e.key === 'Escape') { if (big) setBig(0); else setAt(-1); }
      // بالعربية: السهم الأيمن يرجّع للخلف
      if (e.key === 'ArrowRight') go(-1);
      if (e.key === 'ArrowLeft') go(1);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [open, big, go]);

  // بعد التكبير: نزحزح المشهد حتى تصير نقطة الضغط بالنص
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    if (!big) { el.scrollTop = 0; el.scrollLeft = 0; return; }
    const { x, y } = tapAt.current;
    el.scrollLeft = x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = y * el.scrollHeight - el.clientHeight / 2;
  }, [big]);

  function tapImage(e) {
    e.stopPropagation();
    if (big) return setBig(0);
    const r = e.currentTarget.getBoundingClientRect();
    tapAt.current = {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
    setBig(Math.round(r.width * SCALE));
  }

  if (!list.length) return <div className="thumb">📦</div>;

  return (
    <>
      <div className="thumb-wrap">
        <button type="button" className="thumb-open" onClick={() => setAt(0)} aria-label="توسيع الصورة">
          <img className="thumb" src={list[0]} alt={alt} loading="lazy" />
          <span className="zoom-btn"><ExpandIcon /></span>
        </button>
        {list.length > 1 && <span className="img-count">{list.length} صور</span>}
      </div>

      {open && (
        <div className="zoom-back" onClick={() => setAt(-1)} role="dialog" aria-label={alt || 'صورة'}>
          <button type="button" className="zoom-close"
            onClick={(e) => { e.stopPropagation(); setAt(-1); }} aria-label="إغلاق">✕</button>

          <div ref={stage} className={`zoom-stage ${big ? 'on' : ''}`} onClick={(e) => e.stopPropagation()}>
            <img
              ref={imgRef}
              src={list[at]}
              alt={alt}
              onClick={tapImage}
              draggable="false"
              style={big ? { width: big, maxWidth: 'none', maxHeight: 'none', height: 'auto' } : undefined}
            />
          </div>

          {!big && (
            <div className={`zoom-hint ${list.length > 1 ? 'above' : ''}`}>
              اضغط على أي مكان بالصورة لتكبيره
            </div>
          )}

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
