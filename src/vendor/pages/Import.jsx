// استيراد المنتجات من ملف Excel/CSV — لوقف الإدخال المزدوج
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, run, rpc } from '../../shared/supabase';
import { parseCsv, readTextFile, normHeader, toNumber, downloadCsv } from '../../shared/csv';

const CHUNK = 100;

// أسماء الأعمدة المقبولة (بعد التطبيع)
const FIELDS = {
  name:        ['الاسم', 'اسم المنتج', 'المنتج', 'الصنف', 'name', 'product', 'title'],
  description: ['الوصف', 'التفاصيل', 'ملاحظات', 'description', 'desc'],
  price:       ['السعر', 'سعر', 'سعر المبيع', 'price'],
  main:        ['التصنيف', 'التصنيف الرئيسي', 'القسم', 'القسم الرئيسي', 'category'],
  sub:         ['التصنيف الفرعي', 'القسم الفرعي', 'الفرعي', 'subcategory', 'sub'],
  image:       ['الصوره', 'رابط الصوره', 'صوره', 'image', 'image_url', 'photo'],
  available:   ['متوفر', 'الحاله', 'متاح', 'available', 'status'],
};

const TEMPLATE = [
  ['الاسم', 'الوصف', 'السعر', 'التصنيف الرئيسي', 'التصنيف الفرعي', 'رابط الصورة', 'متوفر'],
  ['خلخال فضة 1', 'فضة عيار 925', '450', 'إكسسوارات', 'خلخال', '', 'نعم'],
  ['اسوارة vip 1', '', '550', 'إكسسوارات', 'أساور', '', 'نعم'],
  ['حرف مضيء', 'حسب الطلب', '350', 'هدايا', '', '', 'نعم'],
];

const FALSE_WORDS = ['لا', 'غير متوفر', 'لا يوجد', 'no', 'false', '0', 'غير متاح', 'منتهي'];

export default function Import({ vendorId, onDone }) {
  const [rows, setRows] = useState([]);        // الصفوف المقروءة
  const [fileName, setFileName] = useState('');
  const [cats, setCats] = useState([]);
  const [mainId, setMainId] = useState('');    // تصنيف احتياطي لما الملف ما فيه
  const [skipDup, setSkipDup] = useState(true);
  const [existing, setExisting] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const picker = useRef(null);

  const loadCats = useCallback(() => {
    run(supabase.from('categories').select('id, parent_id, name, icon')
      .eq('is_active', true).order('sort_order').order('name'))
      .then(setCats).catch(() => {});
  }, []);

  useEffect(() => {
    loadCats();
    run(supabase.from('products').select('name').eq('vendor_id', vendorId))
      .then((r) => setExisting(new Set((r || []).map((x) => normHeader(x.name)))))
      .catch(() => {});
  }, [loadCats, vendorId]);

  const mains = cats.filter((c) => !c.parent_id);

  async function choose(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setMsg(''); setRows([]);

    try {
      const text = await readTextFile(file);
      const table = parseCsv(text);
      if (table.length < 2) throw new Error('الملف فاضي أو ما فيه إلا سطر العناوين');

      // مطابقة الأعمدة
      const head = table[0].map(normHeader);
      const col = {};
      for (const [key, names] of Object.entries(FIELDS)) {
        const set = names.map(normHeader);
        const i = head.findIndex((h) => set.includes(h));
        if (i !== -1) col[key] = i;
      }
      if (col.name === undefined) {
        throw new Error(`ما لقينا عمود الاسم. العناوين الموجودة: ${table[0].join(' | ')}`);
      }
      if (col.price === undefined) {
        throw new Error(`ما لقينا عمود السعر. العناوين الموجودة: ${table[0].join(' | ')}`);
      }

      const get = (r, k) => (col[k] === undefined ? '' : String(r[col[k]] ?? '').trim());

      const parsed = table.slice(1).map((r, n) => {
        const name = get(r, 'name');
        const price = toNumber(get(r, 'price'));
        const availRaw = normHeader(get(r, 'available'));
        const problems = [];
        if (!name) problems.push('بلا اسم');
        if (!(price > 0)) problems.push('سعر غير صالح');
        const dup = name && existing.has(normHeader(name));
        return {
          line: n + 2,
          name,
          description: get(r, 'description'),
          price,
          main: get(r, 'main'),
          sub: get(r, 'sub'),
          image: get(r, 'image'),
          available: !(availRaw && FALSE_WORDS.map(normHeader).includes(availRaw)),
          dup,
          problems,
        };
      });

      setRows(parsed);
      setFileName(file.name);
      const bad = parsed.filter((r) => r.problems.length).length;
      const dups = parsed.filter((r) => r.dup).length;
      setMsg(
        `قرأنا ${parsed.length} سطر` +
        (bad ? ` — ${bad} فيها مشكلة` : '') +
        (dups ? ` — ${dups} موجودة عندك مسبقاً` : '')
      );
    } catch (err) {
      setError(err.message);
    }
  }

  const usable = rows.filter((r) => !r.problems.length && !(skipDup && r.dup));

  async function doImport() {
    if (!usable.length) return setError('ما في أسطر صالحة للاستيراد.');
    setBusy(true); setError(''); setMsg(''); setProgress('');

    try {
      // أولاً: تجهيز التصنيفات: نطابق أسماء الملف مع الموجود، وننشئ الفرعي الناقص
      const norm = (s) => normHeader(s);
      const mainByName = new Map(mains.map((c) => [norm(c.name), c.id]));
      const subCache = new Map();  // "mainId|subName" → id

      const resolve = async (r) => {
        const mId = (r.main && mainByName.get(norm(r.main))) || (mainId ? Number(mainId) : null);
        if (!r.sub) return mId;
        if (!mId) return null;
        const key = `${mId}|${norm(r.sub)}`;
        if (subCache.has(key)) return subCache.get(key);
        const found = cats.find((c) => c.parent_id === mId && norm(c.name) === norm(r.sub));
        const id = found ? found.id : await rpc('vendor_ensure_subcategory', { p_parent: mId, p_name: r.sub });
        subCache.set(key, id);
        return id;
      };

      setProgress('جاري تجهيز التصنيفات...');
      const bodies = [];
      for (const r of usable) {
        bodies.push({
          vendor_id: vendorId,
          name: r.name,
          description: r.description || null,
          price: r.price,
          image_url: r.image || null,
          images: r.image ? [r.image] : [],
          category_id: await resolve(r),
          is_available: r.available,
        });
      }

      // ثانياً: الإدخال على دفعات
      let done = 0;
      for (let i = 0; i < bodies.length; i += CHUNK) {
        const part = bodies.slice(i, i + CHUNK);
        await run(supabase.from('products').insert(part));
        done += part.length;
        setProgress(`أُضيف ${done} من ${bodies.length}...`);
      }

      setRows([]);
      setFileName('');
      setProgress('');
      setMsg(`تم استيراد ${done} منتج ✅`);
      setExisting((s) => new Set([...s, ...bodies.map((b) => normHeader(b.name))]));
      loadCats();
      if (onDone) onDone();
    } catch (e) {
      setError(e.message);
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="panel stack">
        <h3>استيراد المنتجات من ملف</h3>
        <p className="muted" style={{ margin: 0 }}>
          إذا منتجاتك موجودة بنقطة البيع أو بملف Excel، صدّرها ملف
          <b> CSV UTF-8 </b> واستوردها من هون بدل ما تعيد إدخالها.
        </p>

        <div className="row">
          <button type="button" className="ghost" onClick={() => downloadCsv('quickly-template.csv', TEMPLATE)}>
            ⬇️ نزّل ملف نموذجي
          </button>
          <button type="button" onClick={() => picker.current.click()} disabled={busy}>
            📄 اختر ملف CSV
          </button>
        </div>
        <input ref={picker} type="file" accept=".csv,text/csv,text/plain" hidden onChange={choose} />

        <details>
          <summary className="muted">كيف بصدّر من Excel؟</summary>
          <p className="muted" style={{ marginBottom: 0 }}>
            من Excel: <b>ملف ← حفظ باسم</b> واختر النوع
            <b> CSV UTF-8 (محدد بفواصل)</b>. مهم تختار UTF-8 وإلا بتطلع
            الحروف العربية مشوّشة. الأعمدة المطلوبة: <b>الاسم</b> و<b>السعر</b>.
            الباقي اختياري: الوصف، التصنيف الرئيسي، التصنيف الفرعي، رابط الصورة، متوفر.
          </p>
        </details>

        {cats.length > 0 && (
          <>
            <label style={{ margin: 0 }}>التصنيف الاحتياطي (للأسطر يلي ما فيها تصنيف بالملف)</label>
            <select value={mainId} onChange={(e) => setMainId(e.target.value)}>
              <option value="">بدون تصنيف</option>
              {mains.map((c) => (
                <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
              ))}
            </select>
          </>
        )}

        {error && <div className="error">{error}</div>}
        {msg && <div className="notice">{msg}</div>}
      </div>

      {rows.length > 0 && (
        <>
          <div className="panel stack">
            <div className="row between">
              <strong>{fileName}</strong>
              <button className="ghost sm" onClick={() => { setRows([]); setFileName(''); setMsg(''); }}>إلغاء</button>
            </div>
            <label className="row" style={{ gap: 8, margin: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={skipDup}
                onChange={(e) => setSkipDup(e.target.checked)} />
              <span>تجاهل المنتجات الموجودة عندي بنفس الاسم</span>
            </label>
          </div>

          <div className="panel">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>#</th><th>الاسم</th><th>السعر</th><th>التصنيف</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r) => (
                    <tr key={r.line} className={r.problems.length ? 'bad-row' : ''}>
                      <td className="muted">{r.line}</td>
                      <td>{r.name || <span className="muted">—</span>}</td>
                      <td className="price">{r.problems.includes('سعر غير صالح') ? '—' : r.price}</td>
                      <td className="muted">{[r.main, r.sub].filter(Boolean).join(' › ') || '—'}</td>
                      <td>
                        {r.problems.length
                          ? <span style={{ color: 'var(--danger)' }}>{r.problems.join('، ')}</span>
                          : r.dup
                            ? <span className="vtag">{skipDup ? 'موجود — يُتجاهل' : 'موجود — يُضاف مكرر'}</span>
                            : <span style={{ color: 'var(--ok)' }}>جاهز</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 200 && <p className="muted">عم نعرض أول 200 سطر — الاستيراد بيشمل الكل.</p>}
          </div>

          <div className="panel stack">
            {progress && <div className="notice">{progress}</div>}
            <button onClick={doImport} disabled={busy || !usable.length}>
              {busy ? 'جاري الاستيراد...' : `استورد ${usable.length} منتج`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
