// نقل الصور المستضافة برّا (imgbb وغيره) إلى تخزين Quickly
// لتصير مضغوطة وسريعة وما تضيع لو وقف الموقع الخارجي.
import { useCallback, useEffect, useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { SUPABASE_URL } from '../../shared/config';
import { compressImage, BUCKET } from '../../shared/image';

const CONCURRENCY = 2;

const isOurs = (u) => typeof u === 'string' && u.includes(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`);
const isExternal = (u) => typeof u === 'string' && /^https?:\/\//i.test(u) && !isOurs(u);

export default function MigrateImages({ vendorId }) {
  const [items, setItems] = useState([]);       // المنتجات يلي صورها برّا
  const [open, setOpen] = useState(false);
  const [probe, setProbe] = useState('');       // نتيجة فحص أول صورة
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    run(supabase.from('products').select('id, name, image_url, images').eq('vendor_id', vendorId))
      .then((rows) => {
        const list = (rows || [])
          .map((p) => {
            const imgs = Array.isArray(p.images) && p.images.length ? p.images : (p.image_url ? [p.image_url] : []);
            return { ...p, imgs, outside: imgs.filter(isExternal) };
          })
          .filter((p) => p.outside.length);
        setItems(list);
      })
      .catch((e) => setError(e.message));
  }, [vendorId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const totalImgs = items.reduce((n, p) => n + p.outside.length, 0);

  /* يجلب صورة خارجية ويرفعها عندنا — يرجّع الرابط الجديد */
  async function move(url) {
    const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!res.ok) throw new Error(`الخادم ردّ ${res.status}`);
    const blob = await res.blob();
    const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
    const small = await compressImage(new File([blob], 'x', { type }));
    const ext = small.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `vendors/${vendorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const up = await supabase.storage.from(BUCKET).upload(path, small, {
      contentType: small.type, cacheControl: '31536000', upsert: false,
    });
    if (up.error) throw new Error(up.error.message);
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  /* نجرّب صورة واحدة أولاً — بعض المواقع بتمنع الجلب من المتصفح */
  async function testOne() {
    setProbe('جاري الفحص...'); setError('');
    const url = items[0]?.outside[0];
    if (!url) return setProbe('');
    try {
      const res = await fetch(url, { mode: 'cors', cache: 'no-store' });
      if (!res.ok) throw new Error(`ردّ ${res.status}`);
      await res.blob();
      setProbe('ok');
    } catch {
      setProbe('blocked');
    }
  }

  async function migrate() {
    setBusy(true); setError(''); setMsg(''); setDone(0); setFailed([]);
    const queue = [...items];
    const bad = [];
    let n = 0;

    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        try {
          const next = [];
          for (const u of p.imgs) next.push(isExternal(u) ? await move(u) : u);
          await run(supabase.from('products').update({ images: next, image_url: next[0] }).eq('id', p.id));
          n += 1;
          setDone(n);
        } catch (e) {
          bad.push({ name: p.name, reason: e.message });
          setFailed([...bad]);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
      setMsg(`تم نقل صور ${n} منتج ✅${bad.length ? ` — ${bad.length} ما نجحوا` : ''}`);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="panel stack">
        <div className="row between">
          <strong>الصور المستضافة برّا</strong>
          <button className="ghost sm" onClick={() => setOpen(true)}>افحص</button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          إذا منتجاتك المستوردة صورها على موقع خارجي (imgbb مثلاً)، انقلها
          لتخزين Quickly حتى تصير مضغوطة وسريعة وما تضيع لو وقف الموقع.
        </p>
      </div>
    );
  }

  return (
    <div className="panel stack">
      <div className="row between">
        <strong>الصور المستضافة برّا</strong>
        <button className="ghost sm" onClick={() => setOpen(false)}>إخفاء</button>
      </div>

      {!items.length ? (
        <div className="notice">كل الصور عندك مخزّنة على Quickly ✅</div>
      ) : (
        <>
          <p className="muted" style={{ margin: 0 }}>
            <strong>{items.length}</strong> منتج صوره برّا ({totalImgs} صورة).
            النقل بيضغطها كمان — يعني صفحة المتجر بتفتح أسرع عند الزبون.
          </p>

          {probe === '' && (
            <button type="button" className="ghost" onClick={testOne}>
              جرّب صورة وحدة أولاً
            </button>
          )}
          {probe === 'جاري الفحص...' && <span className="muted">جاري الفحص...</span>}

          {probe === 'blocked' && (
            <div className="error">
              الموقع الخارجي ما بيسمح للمتصفح يجلب صوره مباشرة.
              النقل التلقائي ما بيشتغل معه. الحل: نزّل الصور على جهازك
              وارفعها من تبويب «إضافة سريعة»، أو خلّيها كما هي — رح تشتغل
              عند الزبون عادي، بس أبطأ.
            </div>
          )}

          {probe === 'ok' && !busy && done === 0 && (
            <>
              <div className="notice">الفحص نجح — النقل جاهز.</div>
              <button onClick={migrate}>انقل صور {items.length} منتج</button>
            </>
          )}

          {busy && <div className="notice">جاري النقل... {done} من {items.length}</div>}
          {msg && <div className="notice">{msg}</div>}
          {error && <div className="error">{error}</div>}

          {failed.length > 0 && (
            <div className="stack">
              <strong style={{ color: 'var(--danger)' }}>ما نجحوا ({failed.length}):</strong>
              {failed.slice(0, 10).map((f, i) => (
                <div key={i} className="muted">{f.name} — {f.reason}</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
