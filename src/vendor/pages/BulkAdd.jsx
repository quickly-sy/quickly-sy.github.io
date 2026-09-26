// إضافة سريعة بالصور.
// الصور يلي اسمها متشابه (خلخال 1، خلخال 2 ...) بتنجمع، وبتقرر شو تعمل فيها:
//   أقسام  → قسم فرعي اسمه "خلخال" وكل صورة منتج مستقل جواته  (الافتراضي)
//   موديلات → منتج واحد والزبون بيختار الموديل
//   صور     → منتج واحد وصوره زوايا لنفس القطعة
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, run, rpc } from '../../shared/supabase';
import { uploadImage, deleteImage } from '../../shared/image';
import { groupByName } from '../../shared/filename';

const CONCURRENCY = 2;
const MAX_GROUPS = 40;
const MAX_IMAGES = 8;

const MODES = [
  ['split', 'أقسام فرعية', 'قسم فرعي باسم المجموعة، وكل صورة منتج مستقل جواته'],
  ['variant', 'موديلات', 'منتج واحد، والزبون بيختار الموديل قبل الطلب'],
  ['gallery', 'زوايا', 'منتج واحد وصوره زوايا مختلفة لنفس القطعة'],
];

let seq = 0;
const nextKey = () => `k${++seq}`;

export default function BulkAdd({ vendorId, onDone }) {
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [mainId, setMainId] = useState('');
  const [subId, setSubId] = useState('');       // للمنتجات المفردة
  const [mode, setMode] = useState('split');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const picker = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const loadCats = useCallback(() => {
    run(supabase.from('categories').select('id, parent_id, name, icon')
      .eq('is_active', true).order('sort_order').order('name'))
      .then(setCats).catch(() => {});
  }, []);
  useEffect(() => { loadCats(); }, [loadCats]);

  useEffect(() => () => {
    rowsRef.current.forEach((r) => r.imgs.forEach((i) => URL.revokeObjectURL(i.preview)));
  }, []);

  const mains = cats.filter((c) => !c.parent_id);
  const subs = cats.filter((c) => c.parent_id === Number(mainId));

  const patchRow = useCallback((key, changes) => {
    setRows((l) => l.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }, []);

  const patchImg = useCallback((rowKey, imgId, changes) => {
    setRows((l) => l.map((r) => (
      r.key !== rowKey ? r : { ...r, imgs: r.imgs.map((i) => (i.id === imgId ? { ...i, ...changes } : i)) }
    )));
  }, []);

  function pick(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setError(''); setMsg('');

    const groups = groupByName(files);
    const room = MAX_GROUPS - rows.length;
    if (room <= 0) return setError(`الحد ${MAX_GROUPS} مجموعة بالدفعة. احفظ الحالية ثم تابع.`);
    const take = groups.slice(0, room);
    if (groups.length > room) setError(`أخذنا أول ${room} مجموعة فقط.`);

    const fresh = take.map((g) => {
      const imgs = g.files.slice(0, MAX_IMAGES).map((file, n) => ({
        id: nextKey(),
        file,
        preview: URL.createObjectURL(file),
        state: 'waiting',
        url: '',
        error: '',
        name: g.files.length > 1 && g.suggested ? `${g.suggested} ${n + 1}` : g.suggested,
      }));
      return {
        key: nextKey(),
        group: g.files.length > 1,
        subName: g.suggested,     // اسم القسم الفرعي المقترح
        price: '',
        imgs,
      };
    });

    setRows((l) => [...l, ...fresh]);
    const grouped = take.filter((g) => g.files.length > 1).length;
    if (grouped) setMsg(`لقينا ${grouped} مجموعة صور متشابهة الاسم ✅`);

    pump(fresh.flatMap((r) => r.imgs.map((i) => ({ rowKey: r.key, img: i }))));
  }

  async function pump(jobs) {
    const list = [...jobs];
    const worker = async () => {
      while (list.length) {
        const { rowKey, img } = list.shift();
        patchImg(rowKey, img.id, { state: 'uploading', error: '' });
        try {
          const url = await uploadImage(`vendors/${vendorId}`, img.file);
          patchImg(rowKey, img.id, { state: 'done', url });
        } catch (err) {
          patchImg(rowKey, img.id, { state: 'error', error: err.message });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
  }

  const retryImg = (row, img) => {
    patchImg(row.key, img.id, { state: 'waiting', error: '' });
    pump([{ rowKey: row.key, img }]);
  };

  function dropImg(row, img) {
    URL.revokeObjectURL(img.preview);
    if (img.url) deleteImage(img.url);
    const left = row.imgs.filter((i) => i.id !== img.id);
    if (!left.length) dropRow(row);
    else patchRow(row.key, { imgs: left, group: left.length > 1 });
  }

  function dropRow(row) {
    row.imgs.forEach((i) => { URL.revokeObjectURL(i.preview); if (i.url) deleteImage(i.url); });
    setRows((l) => l.filter((r) => r.key !== row.key));
  }

  const makeCover = (row, img) =>
    patchRow(row.key, { imgs: [img, ...row.imgs.filter((i) => i.id !== img.id)] });

  const busy = rows.some((r) => r.imgs.some((i) => i.state === 'uploading' || i.state === 'waiting'));
  const okImgs = (r) => r.imgs.filter((i) => i.state === 'done' && i.url);

  // صف جاهز: سعر صحيح + صور مرفوعة + الأسماء المطلوبة حسب الوضع
  function rowReady(r) {
    const imgs = okImgs(r);
    if (!imgs.length || !(Number(r.price) > 0)) return false;
    if (r.group && mode === 'split') return !!r.subName.trim() && imgs.every((i) => i.name.trim());
    return !!(r.imgs[0] && r.imgs[0].name.trim());
  }

  const ready = rows.filter(rowReady);
  const incomplete = rows.length - ready.length;
  const needsMain = mode === 'split' && ready.some((r) => r.group);

  // عدد المنتجات الفعلي (مجموعة "أقسام" = عدة منتجات)
  const productCount = ready.reduce(
    (n, r) => n + (r.group && mode === 'split' ? okImgs(r).length : 1), 0
  );

  async function saveAll() {
    if (!ready.length) return setError('كمّل السعر والأسماء لمنتج واحد على الأقل.');
    if (needsMain && !mainId) return setError('اختر التصنيف الرئيسي — منه بينبني القسم الفرعي.');

    setSaving(true); setError(''); setMsg('');
    try {
      const body = [];
      let madeSubs = 0;

      for (const r of ready) {
        const imgs = okImgs(r);

        if (r.group && mode === 'split') {
          // قسم فرعي باسم المجموعة + منتج مستقل لكل صورة
          const catId = await rpc('vendor_ensure_subcategory', {
            p_parent: Number(mainId),
            p_name: r.subName.trim(),
          });
          madeSubs += 1;
          for (const i of imgs) {
            body.push({
              vendor_id: vendorId,
              name: i.name.trim(),
              price: Number(r.price),
              image_url: i.url,
              images: [i.url],
              category_id: catId,
              is_available: true,
            });
          }
        } else {
          const urls = imgs.map((i) => i.url);
          body.push({
            vendor_id: vendorId,
            name: r.imgs[0].name.trim(),
            price: Number(r.price),
            image_url: urls[0],
            images: urls,
            variant_mode: mode === 'variant' && urls.length > 1,
            variant_labels: [],
            variant_off: [],
            category_id: subId ? Number(subId) : mainId ? Number(mainId) : null,
            is_available: true,
          });
        }
      }

      // أمان: أي أسماء متكررة داخل نفس الدفعة بترقّم لحالها
      const seen = new Map();
      for (const b of body) {
        const n = (seen.get(b.name) || 0) + 1;
        seen.set(b.name, n);
      }
      const used = new Map();
      for (const b of body) {
        if (seen.get(b.name) > 1) {
          const n = (used.get(b.name) || 0) + 1;
          used.set(b.name, n);
          b.name = `${b.name} ${n}`;
        }
      }

      await run(supabase.from('products').insert(body));

      const done = new Set(ready.map((r) => r.key));
      rows.filter((r) => done.has(r.key))
        .forEach((r) => r.imgs.forEach((i) => URL.revokeObjectURL(i.preview)));
      setRows((l) => l.filter((r) => !done.has(r.key)));
      setMsg(`تمت إضافة ${body.length} منتج${madeSubs ? ` ضمن ${madeSubs} قسم فرعي` : ''} ✅`);
      if (madeSubs) loadCats();
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
          اختر صور بضاعتك كلها مرة وحدة. الصور يلي اسمها متشابه — مثل
          <code> خلخال 1.jpg </code> و<code> خلخال 2.jpg </code> — بتنجمع سوا،
          وانت بتقرر شو تعمل فيها من المفتاح تحت.
        </p>

        <div className="row">
          <button type="button" onClick={() => picker.current.click()} disabled={saving}>
            {rows.length ? `+ أضف صوراً (${rows.length}/${MAX_GROUPS})` : '🖼️ اختر صور بضاعتك'}
          </button>
        </div>
        <input ref={picker} type="file" accept="image/*" multiple hidden onChange={pick} />

        {rows.length > 0 && (
          <>
            <hr />
            <label style={{ margin: 0 }}>الصور المتشابهة الاسم شو نعمل فيها؟</label>
            <div className="chips">
              {MODES.map(([k, label]) => (
                <button key={k} type="button" className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="muted" style={{ margin: 0 }}>{MODES.find((m) => m[0] === mode)[2]}</p>

            <hr />
            <label style={{ margin: 0 }}>
              التصنيف {mode === 'split' ? '(الرئيسي مطلوب — منه بينبني القسم الفرعي)' : ''}
            </label>
            <div className="row">
              <select style={{ flex: 1 }} value={mainId}
                onChange={(e) => { setMainId(e.target.value); setSubId(''); }}>
                <option value="">التصنيف الرئيسي</option>
                {mains.map((c) => (
                  <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                ))}
              </select>
              {mode !== 'split' && (
                <select style={{ flex: 1 }} value={subId}
                  onChange={(e) => setSubId(e.target.value)} disabled={!mainId}>
                  <option value="">{subs.length ? 'الفرعي (اختياري)' : 'بدون فرعي'}</option>
                  {subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}
        {msg && <div className="notice">{msg}</div>}
      </div>

      {rows.map((row) => {
        const split = row.group && mode === 'split';
        return (
          <article key={row.key} className="panel stack">
            <div className="row between">
              <strong>
                {split
                  ? `قسم فرعي: ${row.subName || '—'}`
                  : row.imgs[0].name || 'منتج جديد'}
                {row.group && (
                  <span className="vtag">
                    {row.imgs.length} {split ? 'منتج' : mode === 'variant' ? 'موديل' : 'صور'}
                  </span>
                )}
              </strong>
              <button type="button" className="ghost sm" onClick={() => dropRow(row)}>إزالة</button>
            </div>

            {split && (
              <div>
                <label>اسم القسم الفرعي</label>
                <input value={row.subName} placeholder="خلخال"
                  onChange={(e) => patchRow(row.key, { subName: e.target.value })} />
              </div>
            )}

            <div>
              <label>السعر {row.group && <span className="muted">(لكل القطع)</span>}</label>
              <input type="number" min="0" step="0.01" dir="ltr" placeholder="السعر"
                value={row.price} onChange={(e) => patchRow(row.key, { price: e.target.value })} />
            </div>

            {/* في وضع الأقسام: سطر لكل صورة باسمه الخاص */}
            {split ? (
              <div className="var-rows">
                {row.imgs.map((img) => (
                  <div key={img.id} className={`var-row ${img.state}`}>
                    <img src={img.preview} alt="" />
                    <input
                      placeholder="اسم المنتج"
                      value={img.name}
                      onChange={(e) => patchImg(row.key, img.id, { name: e.target.value })}
                    />
                    {img.state === 'error'
                      ? <button type="button" className="sm danger" onClick={() => retryImg(row, img)}>إعادة</button>
                      : <button type="button" className="ghost sm" onClick={() => dropImg(row, img)}>حذف</button>}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div>
                  <label>اسم المنتج</label>
                  <input
                    placeholder="اسم المنتج"
                    value={row.imgs[0].name}
                    onChange={(e) => patchImg(row.key, row.imgs[0].id, { name: e.target.value })}
                  />
                </div>
                <div className="mini-strip">
                  {row.imgs.map((img, idx) => (
                    <span key={img.id} className={`mini ${idx === 0 ? 'cover' : ''} ${img.state}`}>
                      <img src={img.preview} alt="" onClick={() => makeCover(row, img)} />
                      <button type="button" className="mini-x" onClick={() => dropImg(row, img)} aria-label="إزالة">✕</button>
                      {idx === 0 && <em>الغلاف</em>}
                    </span>
                  ))}
                </div>
              </>
            )}

            {row.imgs.some((i) => i.state === 'error') && (
              <div className="error">{row.imgs.find((i) => i.state === 'error').error}</div>
            )}
            {row.imgs.some((i) => i.state === 'uploading' || i.state === 'waiting') && (
              <span className="muted">جاري رفع الصور...</span>
            )}
          </article>
        );
      })}

      {rows.length > 0 && (
        <div className="panel stack">
          <div className="row between">
            <span className="muted">
              جاهز: <strong>{productCount}</strong> منتج
              {incomplete > 0 && ` — ناقص: ${incomplete} مجموعة`}
            </span>
            {busy && <span className="dot-pulse" aria-label="جاري الرفع" />}
          </div>
          <button onClick={saveAll} disabled={saving || busy || !ready.length}>
            {saving ? 'جاري الحفظ...' : busy ? 'انتظر انتهاء الرفع...' : `احفظ ${productCount} منتج`}
          </button>
        </div>
      )}
    </div>
  );
}
