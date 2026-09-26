// إعداد الموديلات: هل الصور لنفس القطعة، أم كل صورة موديل مستقل؟
// وإذا كانت موديلات: اسم اختياري لكل موديل، وإمكانية سحب موديل من العرض.
export default function VariantEditor({ images = [], mode, labels = [], off = [], onChange }) {
  if (!Array.isArray(images) || images.length < 2) return null;

  const isOff = (i) => (off || []).some((x) => Number(x) === i);
  const setLabel = (i, v) => {
    const next = [...(labels || [])];
    while (next.length < images.length) next.push('');
    next[i] = v;
    onChange({ mode, labels: next, off });
  };
  const toggleOff = (i) =>
    onChange({ mode, labels, off: isOff(i) ? off.filter((x) => Number(x) !== i) : [...(off || []), i] });

  return (
    <div className="stack var-editor">
      <label style={{ margin: 0 }}>شو يعني هالصور؟</label>
      <div className="chips">
        <button type="button" className={!mode ? 'on' : ''}
          onClick={() => onChange({ mode: false, labels, off: [] })}>
          صور لنفس القطعة
        </button>
        <button type="button" className={mode ? 'on' : ''}
          onClick={() => onChange({ mode: true, labels, off })}>
          موديلات مختلفة
        </button>
      </div>

      {mode ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            الزبون لازم يختار موديلاً قبل ما يضيفه للسلة، والموديل المختار بيوصلك مع الطلب.
            سمّي الموديلات إذا بدك (اختياري) — بدون تسمية بتصير «موديل ١، موديل ٢...».
          </p>
          <div className="var-rows">
            {images.map((src, i) => (
              <div key={src + i} className={`var-row ${isOff(i) ? 'off' : ''}`}>
                <img src={src} alt="" loading="lazy" />
                <input
                  placeholder={`موديل ${i + 1}`}
                  value={(labels && labels[i]) || ''}
                  onChange={(e) => setLabel(i, e.target.value)}
                />
                <button type="button" className={`sm ${isOff(i) ? 'danger' : 'ghost'}`}
                  onClick={() => toggleOff(i)}>
                  {isOff(i) ? 'غير متوفر' : 'متوفر'}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          الزبون بيشوف الصور كمعرض لنفس القطعة، وبيضيفها للسلة مباشرة.
        </p>
      )}
    </div>
  );
}
