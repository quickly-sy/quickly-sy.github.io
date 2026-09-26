// رفع عدة صور للمنتج: أول صورة هي الغلاف، والباقي معرض
import { useRef, useState } from 'react';
import { uploadImage, deleteImage } from './image';

const MAX = 8;

export default function ImagesUpload({ value = [], onChange, folder, label = 'صور المنتج' }) {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  const [byUrl, setByUrl] = useState(false);
  const [url, setUrl] = useState('');
  const camera = useRef(null);
  const gallery = useRef(null);

  async function handle(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;

    const room = MAX - list.length;
    if (room <= 0) return setError(`الحد ${MAX} صور للمنتج الواحد`);
    const take = files.slice(0, room);
    if (files.length > room) setError(`أخذنا ${room} صور فقط (الحد ${MAX}).`);
    else setError('');

    setBusy((n) => n + take.length);
    const added = [];
    for (const f of take) {
      try {
        added.push(await uploadImage(folder, f));
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (added.length) onChange([...list, ...added]);
  }

  const remove = (u) => { onChange(list.filter((x) => x !== u)); deleteImage(u); };
  const makeCover = (u) => onChange([u, ...list.filter((x) => x !== u)]);

  function addUrl() {
    const u = url.trim();
    if (!u) return;
    if (list.length >= MAX) return setError(`الحد ${MAX} صور`);
    onChange([...list, u]);
    setUrl('');
  }

  return (
    <div className="stack up-block">
      <label style={{ margin: 0 }}>{label} {list.length > 0 && <span className="muted">({list.length}/{MAX})</span>}</label>

      {list.length ? (
        <div className="imgs-grid">
          {list.map((u, i) => (
            <div key={u} className={`imgs-cell ${i === 0 ? 'cover' : ''}`}>
              <img src={u} alt="" loading="lazy" onClick={() => i !== 0 && makeCover(u)} />
              <button type="button" className="up-x" onClick={() => remove(u)} aria-label="إزالة">✕</button>
              {i === 0 ? <em>الغلاف</em> : <em className="hint">اضغط للغلاف</em>}
            </div>
          ))}
        </div>
      ) : (
        <div className="up-empty">
          <span className="muted">{busy ? 'جاري الرفع...' : 'ما في صور بعد'}</span>
        </div>
      )}

      {busy > 0 && list.length > 0 && <span className="muted">جاري رفع {busy} صورة...</span>}

      <div className="row">
        <button type="button" className="ghost sm" disabled={busy > 0} onClick={() => camera.current.click()}>
          📷 صوّر
        </button>
        <button type="button" className="ghost sm" disabled={busy > 0} onClick={() => gallery.current.click()}>
          🖼️ من المعرض
        </button>
        <button type="button" className="link" onClick={() => setByUrl(!byUrl)}>
          {byUrl ? 'إخفاء الرابط' : 'أو الصق رابطاً'}
        </button>
      </div>

      {byUrl && (
        <div className="row">
          <input style={{ flex: 1 }} dir="ltr" placeholder="https://..."
            value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUrl())} />
          <button type="button" className="ghost" onClick={addUrl}>أضف</button>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={handle} />
      <span className="muted" style={{ fontSize: 12 }}>
        تُضغط الصور تلقائياً قبل الرفع. أول صورة هي يلي بتظهر للزبون بالقائمة.
      </span>
    </div>
  );
}
