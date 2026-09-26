// رفع صورة واحدة: تصوير مباشر أو اختيار من المعرض، مع ضغط تلقائي
import { useRef, useState } from 'react';
import { uploadImage, deleteImage } from './image';
import NavIcon from './navIcons';

export default function ImageUpload({ value, onChange, folder, label = 'صورة المنتج' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [byUrl, setByUrl] = useState(false);
  const camera = useRef(null);
  const gallery = useRef(null);

  async function handle(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // حتى يعمل اختيار نفس الصورة مرة ثانية
    if (!file) return;
    setBusy(true); setError('');
    try {
      const old = value;
      const url = await uploadImage(folder, file);
      onChange(url);
      if (old) deleteImage(old);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    const old = value;
    onChange('');
    if (old) deleteImage(old);
  }

  return (
    <div className="stack up-block">
      <label style={{ margin: 0 }}>{label}</label>

      {value ? (
        <div className="up-preview">
          <img src={value} alt="" loading="lazy" />
          <button type="button" className="up-x" onClick={clear} aria-label="إزالة الصورة">✕</button>
        </div>
      ) : (
        <div className="up-empty">
          {busy ? <span className="muted">جاري الرفع...</span> : <span className="muted">ما في صورة بعد</span>}
        </div>
      )}

      <div className="row">
        <button type="button" className="ghost sm" disabled={busy} onClick={() => camera.current.click()}>
          📷 صوّر
        </button>
        <button type="button" className="ghost sm" disabled={busy} onClick={() => gallery.current.click()}>
          🖼️ من المعرض
        </button>
        <button type="button" className="link" onClick={() => setByUrl(!byUrl)}>
          {byUrl ? 'إخفاء الرابط' : 'أو الصق رابطاً'}
        </button>
      </div>

      {byUrl && (
        <input
          dir="ltr"
          placeholder="https://..."
          value={value || ''}
          onChange={(e) => onChange(e.target.value.trim())}
        />
      )}

      {error && <div className="error">{error}</div>}

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={handle} />
      <span className="muted" style={{ fontSize: 12 }}>
        <NavIcon name="bolt" size={12} /> تُضغط الصورة تلقائياً قبل الرفع لتوفير بياناتك وبيانات الزبون.
      </span>
    </div>
  );
}
