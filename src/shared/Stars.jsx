import { useState } from 'react';

// نجوم للتقييم: تفاعلية عند تمرير onChange، وعرض فقط بدونها
export function Stars({ value = 0, onChange, size = 30, label }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div>
      {label && <label>{label}</label>}
      <div className="row" style={{ gap: 4 }} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className="star"
            style={{ fontSize: size, color: n <= shown ? '#d8a811' : 'var(--line)' }}
            aria-label={`${n} من 5`}
            onMouseEnter={() => onChange && setHover(n)}
            onClick={() => onChange && onChange(n)}
            disabled={!onChange}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

// عرض مختصر: 4.8 ★ (12)
export function Rating({ avg, count, className = 'muted' }) {
  if (!count) return <span className={className}>جديد</span>;
  return (
    <span className={className} style={{ whiteSpace: 'nowrap' }}>
      <span style={{ color: '#d8a811' }}>★</span> {Number(avg).toFixed(1)} ({count})
    </span>
  );
}
