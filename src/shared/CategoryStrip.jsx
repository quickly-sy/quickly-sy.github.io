// شريط التصنيفات الأفقي — صور أو إيموجي، والمختار بإطار ذهبي
export default function CategoryStrip({ items, value, onChange, allLabel = 'الكل', allIcon = '✨' }) {
  const list = [{ id: null, name: allLabel, icon: allIcon }, ...items];
  return (
    <div className="cat-strip" role="tablist">
      {list.map((c) => {
        const on = (value ?? null) === c.id;
        return (
          <button
            key={c.id ?? 'all'}
            role="tab"
            aria-selected={on}
            className={`cat-item ${on ? 'on' : ''}`}
            onClick={() => onChange(c.id)}
          >
            <span className="cat-thumb">
              {c.image_url ? <img src={c.image_url} alt="" loading="lazy" /> : <span>{c.icon || '📦'}</span>}
            </span>
            <span className="cat-name">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
