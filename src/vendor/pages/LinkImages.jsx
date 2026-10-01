// ربط صور من الكمبيوتر بالمنتجات الموجودة — المطابقة باسم الملف
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, run, rpc } from '../../shared/supabase';
import { uploadImage } from '../../shared/image';
import { normHeader } from '../../shared/csv';
import MigrateImages from './MigrateImages';
import ImageUpload from '../../shared/ImageUpload';

const CONCURRENCY = 2;

/* اسم الملف بلا امتداد، مطبَّع للمقارنة */
const baseOf = (n = '') => n.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
const key = (s) => normHeader(s).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

let seq = 0;

export default function LinkImages({ vendorId }) {
  const [products, setProducts] = useState([]);
  const [files, setFiles] = useState([]);       // { id, file, preview, base, productId, state, error }
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const picker = useRef(null);
  const filesRef = useRef(files);
  filesRef.current = files;

  const load = useCallback(() => {
    run(supabase.from('products').select('id, code, name, image_url, images')
      .eq('vendor_id', vendorId).order('name'))
      .then((r) => setProducts(r || []))
      .catch((e) => setError(e.message));
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => filesRef.current.forEach((f) => URL.revokeObjectURL(f.preview)), []);

  const hasImage = (p) => !!p.image_url || (Array.isArray(p.images) && p.images.length > 0);

  // فهرسان: واحد لأرقام المفاتيح وواحد للأسماء
  const index = useMemo(() => {
    const byCode = new Map();
    const byName = new Map();
    for (const p of products) {
      const c = key(p.code || '');
      if (c && !byCode.has(c)) byCode.set(c, p);   // أول منتج بهالكود
      const k = key(p.name);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(p);
    }
    return { byCode, byName };
  }, [products]);

  // احتمالات رقم المفتاح داخل اسم الملف: 1271 / 1271-2 / 1271 (3) / 1271_b
  const codesOf = (base) => {
    const b = base.trim();
    const out = [b];
    const m = b.match(/^(\d{2,})\s*[-_ ]?\(?\s*\w{1,3}\s*\)?$/);
    if (m && m[1] !== b) out.push(m[1]);
    return out;
  };

  /* يلاقي المنتج المناسب لاسم ملف — رقم المفتاح أولاً ثم الاسم */
  const match = useCallback((base) => {
    // أولاً: رقم المفتاح — تطابق تام بلا تخمين
    for (const c of codesOf(base)) {
      const byCode = index.byCode.get(key(c));
      if (byCode) return { id: byCode.id, how: 'code' };
    }

    const k = key(base);

    // ثانياً: تطابق تام بالاسم
    const hit = index.byName.get(k);
    if (hit) return { id: hit[0].id, how: 'name' };

    // ثالثاً: اسم المنتج جزء من اسم الملف أو العكس — بشرط يكون واحد فقط
    const near = products.filter((p) => {
      const pk = key(p.name);
      return pk.length > 2 && (k.includes(pk) || pk.includes(k));
    });
    if (near.length === 1) return { id: near[0].id, how: 'near' };

    return { id: null, how: null };
  }, [index, products]);

  function pick(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setError(''); setMsg(''); setDone(0);

    const images = picked.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return setError('ما في صور بالملفات المختارة.');

    const rows = images
      .sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }))
      .map((file) => {
        const base = baseOf(file.name);
        const m = match(base);
        return {
          id: `f${++seq}`,
          file,
          preview: URL.createObjectURL(file),
          base,
          productId: m.id,
          how: m.how,
          state: 'ready',
          error: '',
        };
      });

    setFiles(rows);
    const byCode = rows.filter((r) => r.how === 'code').length;
    const byName = rows.filter((r) => r.productId && r.how !== 'code').length;
    const none = rows.length - byCode - byName;
    setMsg(
      `${rows.length} صورة — ${byCode} برقم المفتاح` +
      (byName ? `، ${byName} بالاسم` : '') +
      (none ? `، ${none} بلا مطابقة` : '')
    );
  }

  const setRow = (id, ch) => setFiles((l) => l.map((f) => (f.id === id ? { ...f, ...ch } : f)));

  const shownProducts = onlyEmpty ? products.filter((p) => !hasImage(p)) : products;
  const ready = files.filter((f) => f.productId && f.state !== 'done');

  async function upload() {
    if (!ready.length) return setError('ما في صور مربوطة بمنتجات.');
    setBusy(true); setError(''); setMsg(''); setDone(0);

    // نجمّع الصور حسب المنتج حتى المنتج ياخد صوره بالترتيب
    const byProduct = new Map();
    for (const f of ready) {
      if (!byProduct.has(f.productId)) byProduct.set(f.productId, []);
      byProduct.get(f.productId).push(f);
    }

    const queue = [...byProduct.entries()];
    let n = 0;

    const worker = async () => {
      while (queue.length) {
        const [pid, group] = queue.shift();
        try {
          const urls = [];
          for (const f of group) {
            setRow(f.id, { state: 'uploading' });
            urls.push(await uploadImage(`vendors/${vendorId}`, f.file));
          }
          const p = products.find((x) => x.id === pid);
          const old = Array.isArray(p?.images) ? p.images : (p?.image_url ? [p.image_url] : []);
          const next = [...old, ...urls].slice(0, 8);
          await run(supabase.from('products').update({ images: next, image_url: next[0] }).eq('id', pid));
          group.forEach((f) => setRow(f.id, { state: 'done' }));
          n += group.length;
          setDone(n);
        } catch (e) {
          group.forEach((f) => setRow(f.id, { state: 'error', error: e.message }));
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
      setMsg(`تم ربط ${n} صورة ✅`);
      load();
    } finally {
      setBusy(false);
    }
  }

  const matched = files.filter((f) => f.productId).length;
  const noImage = products.filter((p) => !hasImage(p)).length;

  return (
    <div className="stack">
      <StoreLogo vendorId={vendorId} />

      <div className="panel stack">
        <h3>ربط صور من الكمبيوتر بالمنتجات</h3>
        <p className="muted" style={{ margin: 0 }}>
          اختر كل الصور مرة وحدة. التطبيق بيطابقها مع منتجاتك <b>باسم الملف</b> —
          صورة اسمها <code>1271.jpg</code> بتروح للمنتج يلي رقم مفتاحه
          <code> 1271</code>، وإذا ما في كود بيجرّب الاسم. الصور بتنضغط قبل الرفع.
        </p>

        {products.length > 0 && (
          <div className="notice">
            عندك {products.length} منتج — <strong>{noImage}</strong> منهم بلا صورة.
          </div>
        )}

        <div className="row">
          <button type="button" onClick={() => picker.current.click()} disabled={busy}>
            🖼️ اختر الصور
          </button>
          {files.length > 0 && (
            <button type="button" className="ghost" disabled={busy}
              onClick={() => { files.forEach((f) => URL.revokeObjectURL(f.preview)); setFiles([]); setMsg(''); }}>
              إفراغ القائمة
            </button>
          )}
        </div>
        <input ref={picker} type="file" accept="image/*" multiple hidden onChange={pick} />

        <label className="row" style={{ gap: 8, margin: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={onlyEmpty}
            onChange={(e) => setOnlyEmpty(e.target.checked)} />
          <span>اعرض بالقائمة المنسدلة المنتجات بلا صورة فقط</span>
        </label>

        {error && <div className="error">{error}</div>}
        {msg && <div className="notice">{msg}</div>}
      </div>

      {files.length > 0 && (
        <>
          <div className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th></th><th>اسم الملف</th><th>طابقنا بـ</th><th>المنتج</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id} className={!f.productId ? 'bad-row' : ''}>
                      <td><img className="row-thumb" src={f.preview} alt="" /></td>
                      <td className="muted" dir="ltr" style={{ textAlign: 'right' }}>{f.base}</td>
                      <td>
                        {f.how === 'code' && <span className="vtag">رقم المفتاح</span>}
                        {f.how === 'name' && <span className="muted">الاسم</span>}
                        {f.how === 'near' && <span className="muted">اسم مشابه</span>}
                        {!f.how && <span className="muted">—</span>}
                      </td>
                      <td>
                        <select
                          value={f.productId || ''}
                          onChange={(e) => setRow(f.id, { productId: e.target.value ? Number(e.target.value) : null })}
                          disabled={busy || f.state === 'done'}
                        >
                          <option value="">— بلا ربط —</option>
                          {shownProducts.map((p) => (
                            <option key={p.id} value={p.id}>{p.code ? `${p.code} — ` : ''}{p.name}</option>
                          ))}
                          {/* المنتج المطابق حتى لو عنده صورة والفلتر مفعّل */}
                          {onlyEmpty && f.productId && !shownProducts.some((p) => p.id === f.productId) && (
                            <option value={f.productId}>
                              {products.find((p) => p.id === f.productId)?.name} (عنده صورة)
                            </option>
                          )}
                        </select>
                      </td>
                      <td>
                        {f.state === 'done' && <span style={{ color: 'var(--ok)' }}>تم ✓</span>}
                        {f.state === 'uploading' && <span className="muted">جاري الرفع...</span>}
                        {f.state === 'error' && <span style={{ color: 'var(--danger)' }}>{f.error}</span>}
                        {f.state === 'ready' && (f.productId
                          ? <span className="muted">جاهز</span>
                          : <span style={{ color: 'var(--danger)' }}>ما لقينا منتج</span>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel stack">
            {busy && <div className="notice">جاري الرفع... {done} من {ready.length}</div>}
            <span className="muted">مربوطة: {matched} من {files.length}</span>
            <button onClick={upload} disabled={busy || !ready.length}>
              {busy ? 'جاري الرفع...' : `ارفع واربط ${ready.length} صورة`}
            </button>
          </div>
        </>
      )}

      <MigrateImages vendorId={vendorId} />
    </div>
  );
}

/* شعار المتجر — يظهر للزبون بقائمة المتاجر وبرأس صفحة المتجر */
function StoreLogo({ vendorId }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [off, setOff] = useState(false);

  useEffect(() => {
    run(supabase.from('vendors').select('logo_url').eq('id', vendorId).single())
      .then((v) => setUrl(v?.logo_url || ''))
      .catch((e) => {
        if (/schema cache|column/i.test(String(e.message))) setOff(true);
      });
  }, [vendorId]);

  async function save(next) {
    setBusy(true); setError(''); setMsg('');
    try {
      await rpc('vendor_set_logo', { p_url: next || null });
      setUrl(next);
      setMsg(next ? 'تم حفظ الشعار ✅' : 'تمت إزالة الشعار');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (off) return null;

  return (
    <div className="panel stack">
      <h3>شعار المتجر</h3>
      <p className="muted" style={{ margin: 0 }}>
        بيظهر للزبون بقائمة المتاجر وبرأس صفحة متجرك. استعمل صورة مربّعة.
      </p>
      <div style={{ maxWidth: 240 }}>
        <ImageUpload
          label=""
          value={url}
          onChange={save}
          folder={`vendors/${vendorId}`}
        />
      </div>
      {busy && <span className="muted">جاري الحفظ...</span>}
      {msg && <div className="notice">{msg}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
