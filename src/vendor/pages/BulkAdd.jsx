// إضافة سريعة: صوّر البضاعة كلها، اختر الصور دفعة وحدة،
// وبعدين اكتب الاسم والسعر تحت كل صورة. أسرع طريقة لإدخال عشرات المنتجات.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { uploadImage, deleteImage } from '../../shared/image';

const CONCURRENCY = 2;   // رفعتان بنفس الوقت — أرحم على شبكة الموبايل
const MAX_BATCH = 40;

let seq = 0;

export default function BulkAdd({ vendorId, onDone }) {
  const [rows, setRows] = useState([]);   // { key, file, preview, state, url, error, name, price, category_id }
  const [cats, setCats] = useState([]);
  const [mainId, setMainId] = useState('');
  const [bulkCat, setBulkCat] = useState('');   // تصنيف يُطبّق على الكل
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const picker = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    run(supabase.from('categories').select('id, parent_id, name, icon')
      .eq('is_active', true).order('sort_order').order('name'))
      .then(setCats).catch(() => {});
  }, []);

  // تنظيف روابط المعاينة عند مغادرة الشاشة
  useEffect(() => () => rowsRef.current.forEach((r) => URL.revokeObjectURL(r.preview)), []);

  const mains = cats.filter((c) => !c.parent_id);
  const subs = cats.filter((c) => c.parent_id === Number(mainId));

  const patch = useCallback((key, changes) => {
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }, []);

  async function pick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setError(''); setMsg('');

    const room = MAX_BATCH - rows.length;
    if (room <= 0) return setError(`الحد ${MAX_BATCH} صورة بالدفعة الواحدة. احفظ الحالية ثم تابع.`);
    const take = files.slice(0, room);
    if (files.length > room) setError(`أخذنا أول ${room} صورة فقط (الحد ${MAX_BATCH} بالدفعة).`);

    const fresh = take.map((file) => ({
      key: `f${++seq}`,
      file,
      preview: URL.createObjectURL(file),
      state: 'waiting',
      url: '',
      error: '',
      name: '',
      price: '',
      category_id: '',
    }));
    setRows((l) => [...l, ...fresh]);
    pump(fresh);
  }

  // رفع بالتوازي المحدود
  async function pump(queue) {
    const list = [...queue];
    const worker = async () => {
      while (list.length) {
        const r = list.shift();
        patch(r.key, { state: 'uploading', error: '' });
        try {
          const url = await uploadImage(`vendors/${vendorId}`, r.file);
          patch(r.key, { state: 'done', url });
        } catch (err) {
          patch(r.key, { state: 'error', error: err.message });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  }

  function retry(r) {
    patch(r.key, { state: 'waiting', error: '' });
    pump([{ ...r }]);
  }

  function drop(r) {
    URL.revokeObjectURL(r.preview);
    if (r.url) deleteImage(r.url);
    setRows((l) => l.filter((x) => x.key !== r.key));
  }

  function applyCatToAll() {
    const c = bulkCat || mainId;
    if (!c) return;
    setRows((l) => l.map((r) => ({ ...r, category_id: c })));
  }

  const uploading = rows.some((r) => r.state === 'uploading' || r.state === 'waiting');
  const ready = rows.filter((r) => r.state === 'done' && r.name.trim() && Number(r.price) > 0);
  const incomplete = rows.filter((r) => r.state === 'done' && !(r.name.trim() && Number(r.price) > 0));

  async function saveAll() {
    if (!ready.length) return setError('اكتب اسماً وسعراً لمنتج واحد على الأقل.');
    setSaving(true); setError(''); setMsg('');
    try {
      const body = ready.map((r) => ({
        vendor_id: vendorId,
        name: r.name.trim(),
        price: Number(r.price),
        image_url: r.url,
        category_id: r.category_id ? Number(r.category_id) : null,
        is_available: true,
      }));
      await run(supabase.from('products').insert(body));

      // نُبقي الصفوف الناقصة فقط ليكملها التاجر
      const keep = new Set(ready.map((r) => r.key));
      rows.filter((r) => keep.has(r.key)).forEach((r) => URL.revokeObjectURL(r.preview));
      setRows((l) => l.filter((r) => !keep.has(r.key)));
      setMsg(`تمت إضافة ${body.length} منتج ✅`);
      if (onDone) onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <h3>إضافة سريعة بالصور</h3>
        <p className="muted" style={{ margin: 0 }}>
          صوّر بضاعتك، اختر الصور كلها مرة وحدة، وبعدين اكتب الاسم والسعر تحت كل صورة.
          الصور تُضغط وتُرفع لحالها وانت عم تكتب.
        </p>

        <div className="row">
          <button type="button" onClick={() => picker.current.click()} disabled={saving}>
            {rows.length ? `+ أضف صوراً (${rows.length}/${MAX_BATCH})` : '🖼️ اختر صور بضاعتك'}
          </button>
        </div>
        <input ref={picker} type="file" accept="image/*" multiple hidden onChange={pick} />

        {rows.length > 0 && (
          <>
            <hr />
            <label style={{ margin: 0 }}>تصنيف يُطبّق على الكل (توفيراً للوقت)</label>
            <div className="row">
              <select
                style={{ flex: 1 }}
                value={mainId}
                onChange={(e) => { setMainId(e.target.value); setBulkCat(''); }}
              >
                <option value="">التصنيف الرئيسي</option>
                {mains.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                ))}
              </select>
              <select style={{ flex: 1 }} value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} disabled={!mainId}>
                <option value="">{subs.length ? 'الفرعي (اختياري)' : 'بدون فرعي'}</option>
                {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" className="ghost" onClick={applyCatToAll} disabled={!mainId}>طبّق</button>
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}
        {msg && <div className="notice">{msg}</div>}
      </div>

      {rows.length > 0 && (
        <div className="grid products">
          {rows.map((r) => (
            <article key={r.key} className="panel stack bulk-card">
              <div className="thumb-wrap">
                <img className="thumb" src={r.preview} alt="" />
                <button type="button" className="up-x" onClick={() => drop(r)} aria-label="إزالة">✕</button>
                {r.state !== 'done' && (
                  <div className={`bulk-state ${r.state}`}>
                    {r.state === 'waiting' && 'بالانتظار'}
                    {r.state === 'uploading' && 'جاري الرفع...'}
                    {r.state === 'error' && 'فشل الرفع'}
                  </div>
                )}
              </div>

              {r.state === 'error' ? (
                <>
                  <div className="error">{r.error}</div>
                  <button type="button" className="ghost sm" onClick={() => retry(r)}>إعادة المحاولة</button>
                </>
              ) : (
                <>
                  <input
                    placeholder="اسم المنتج"
                    value={r.name}
                    onChange={(e) => patch(r.key, { name: e.target.value })}
                  />
                  <input
                    type="number" min="0" step="0.01" dir="ltr"
                    placeholder="السعر"
                    value={r.price}
                    onChange={(e) => patch(r.key, { price: e.target.value })}
                  />
                </>
              )}
            </article>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="panel stack">
          <div className="row between">
            <span className="muted">
              جاهز للحفظ: <strong>{ready.length}</strong>
              {incomplete.length > 0 && ` — ناقص اسم أو سعر: ${incomplete.length}`}
            </span>
            {uploading && <span className="dot-pulse" aria-label="جاري الرفع" />}
          </div>
          <button onClick={saveAll} disabled={saving || uploading || !ready.length}>
            {saving ? 'جاري الحفظ...' : uploading ? 'انتظر انتهاء الرفع...' : `احفظ ${ready.length} منتج`}
          </button>
        </div>
      )}
    </div>
  );
}
