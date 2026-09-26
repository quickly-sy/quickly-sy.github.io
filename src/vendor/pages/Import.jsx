// استيراد المنتجات من ملف CSV أو JSON — لوقف الإدخال المزدوج
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, run, rpc } from '../../shared/supabase';
import { normHeader, toNumber, downloadCsv } from '../../shared/csv';
import { readImportFile, guessMapping, cellText } from '../../shared/importfile';

const CHUNK = 100;

// أسماء الأعمدة المعروفة — للتخمين التلقائي فقط، والتاجر يقدر يعدّل
const FIELDS = {
  name:        ['الاسم', 'اسم المنتج', 'المنتج', 'الصنف', 'name', 'product_name', 'product', 'title', 'item'],
  price:       ['السعر', 'سعر', 'سعر المبيع', 'price', 'sell_price', 'unit_price', 'sale_price'],
  description: ['الوصف', 'التفاصيل', 'ملاحظات', 'description', 'desc', 'notes', 'details'],
  main:        ['التصنيف', 'التصنيف الرئيسي', 'القسم', 'القسم الرئيسي', 'category', 'main_category', 'cat'],
  sub:         ['التصنيف الفرعي', 'القسم الفرعي', 'الفرعي', 'subcategory', 'sub_category', 'sub'],
  image:       ['الصوره', 'رابط الصوره', 'صوره', 'image', 'image_url', 'photo', 'img', 'picture'],
  available:   ['متوفر', 'الحاله', 'متاح', 'available', 'is_available', 'status', 'active'],
};

const LABELS = {
  name: 'الاسم *',
  price: 'السعر *',
  description: 'الوصف',
  main: 'التصنيف الرئيسي',
  sub: 'التصنيف الفرعي',
  image: 'رابط الصورة',
  available: 'متوفر',
};

const TEMPLATE = [
  ['الاسم', 'الوصف', 'السعر', 'التصنيف الرئيسي', 'التصنيف الفرعي', 'رابط الصورة', 'متوفر'],
  ['خلخال فضة 1', 'فضة عيار 925', '450', 'إكسسوارات', 'خلخال', '', 'نعم'],
  ['اسوارة vip 1', '', '550', 'إكسسوارات', 'أساور', '', 'نعم'],
  ['حرف مضيء', 'حسب الطلب', '350', 'هدايا', '', '', 'نعم'],
];

const FALSE_WORDS = ['لا', 'غير متوفر', 'لا يوجد', 'no', 'false', '0', 'غير متاح', 'منتهي', 'inactive'];

export default function Import({ vendorId, onDone }) {
  const [tables, setTables] = useState([]);     // الجداول الموجودة بالملف
  const [tableIdx, setTableIdx] = useState(0);
  const [map, setMap] = useState({});           // حقل → اسم العمود بالملف
  const [fileName, setFileName] = useState('');
  const [cats, setCats] = useState([]);
  const [mainId, setMainId] = useState('');
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
  const table = tables[tableIdx];

  async function choose(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setError(''); setMsg(''); setTables([]);

    try {
      const { tables: found } = await readImportFile(file);
      setTables(found);
      setTableIdx(0);
      setMap(guessMapping(found[0].columns, FIELDS));
      setFileName(file.name);
      setMsg(
        found.length > 1
          ? `الملف فيه ${found.length} قائمة — اختر قائمة المنتجات تحت`
          : `قرأنا ${found[0].count} سطر`
      );
    } catch (err) {
      setError(err.message);
    }
  }

  function switchTable(i) {
    setTableIdx(i);
    setMap(guessMapping(tables[i].columns, FIELDS));
    setMsg(`قرأنا ${tables[i].count} سطر`);
  }

  // تحويل الصفوف حسب الربط الحالي
  const rows = useMemo(() => {
    if (!table || !map.name || !map.price) return [];
    const get = (r, k) => (map[k] ? cellText(r[map[k]]).trim() : '');
    return table.rows.map((r, n) => {
      const name = get(r, 'name');
      const price = toNumber(get(r, 'price'));
      const availRaw = normHeader(get(r, 'available'));
      const problems = [];
      if (!name) problems.push('بلا اسم');
      if (!(price > 0)) problems.push('سعر غير صالح');
      return {
        line: n + 1,
        name,
        description: get(r, 'description'),
        price,
        main: get(r, 'main'),
        sub: get(r, 'sub'),
        image: get(r, 'image'),
        available: !(availRaw && FALSE_WORDS.map(normHeader).includes(availRaw)),
        dup: !!name && existing.has(normHeader(name)),
        problems,
      };
    });
  }, [table, map, existing]);

  const usable = rows.filter((r) => !r.problems.length && !(skipDup && r.dup));
  const badCount = rows.filter((r) => r.problems.length).length;
  const dupCount = rows.filter((r) => r.dup).length;

  async function doImport() {
    if (!usable.length) return setError('ما في أسطر صالحة للاستيراد.');
    setBusy(true); setError(''); setMsg(''); setProgress('');

    try {
      const norm = (s) => normHeader(s);
      const mainByName = new Map(mains.map((c) => [norm(c.name), c.id]));
      const subCache = new Map();

      const resolve = async (r) => {
        const mId = (r.main && mainByName.get(norm(r.main))) || (mainId ? Number(mainId) : null);
        if (!r.sub || !mId) return mId;
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
        const img = /^https?:\/\//i.test(r.image) ? r.image : '';
        bodies.push({
          vendor_id: vendorId,
          name: r.name,
          description: r.description || null,
          price: r.price,
          image_url: img || null,
          images: img ? [img] : [],
          category_id: await resolve(r),
          is_available: r.available,
        });
      }

      let done = 0;
      for (let i = 0; i < bodies.length; i += CHUNK) {
        const part = bodies.slice(i, i + CHUNK);
        await run(supabase.from('products').insert(part));
        done += part.length;
        setProgress(`أُضيف ${done} من ${bodies.length}...`);
      }

      setTables([]); setFileName(''); setProgress('');
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
          إذا منتجاتك موجودة بنقطة البيع أو بنسخة احتياطية، ارفع الملف هون
          بدل ما تعيد إدخالها. بيقبل <b>CSV</b> و<b>JSON</b>.
        </p>

        <div className="row">
          <button type="button" className="ghost" onClick={() => downloadCsv('quickly-template.csv', TEMPLATE)}>
            ⬇️ نزّل ملف نموذجي
          </button>
          <button type="button" onClick={() => picker.current.click()} disabled={busy}>
            📄 اختر ملف
          </button>
        </div>
        <input ref={picker} type="file" accept=".csv,.json,text/csv,application/json,text/plain" hidden onChange={choose} />

        <details>
          <summary className="muted">من وين بجيب الملف؟</summary>
          <p className="muted" style={{ marginBottom: 0 }}>
            <b>JSON:</b> أي نسخة احتياطية من نقطة البيع — ارفعها كما هي،
            والتطبيق بيدوّر على قائمة المنتجات جواتها لحاله.
            <br />
            <b>Excel:</b> ملف ← حفظ باسم ← <b>CSV UTF-8 (محدد بفواصل)</b>.
            مهم تختار UTF-8 وإلا بتطلع الحروف العربية مشوّشة.
            <br />
            المطلوب عمودين بس: <b>الاسم</b> و<b>السعر</b>. وإذا أسماء الأعمدة
            عندك مختلفة، بتربطها يدوياً بالخطوة الجاية.
          </p>
        </details>

        {error && <div className="error">{error}</div>}
        {msg && <div className="notice">{msg}</div>}
      </div>

      {/* اختيار الجدول داخل ملف JSON فيه أكثر من قائمة */}
      {tables.length > 1 && (
        <div className="panel stack">
          <label style={{ margin: 0 }}>أي قائمة فيها المنتجات؟</label>
          <div className="chips">
            {tables.map((t, i) => (
              <button key={t.key} type="button" className={i === tableIdx ? 'on' : ''} onClick={() => switchTable(i)}>
                {t.key} ({t.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ربط الأعمدة */}
      {table && (
        <div className="panel stack">
          <div className="row between">
            <strong>{fileName}</strong>
            <button className="ghost sm" onClick={() => { setTables([]); setFileName(''); setMsg(''); }}>إلغاء</button>
          </div>
          <label style={{ margin: 0 }}>اربط أعمدة الملف بحقول المنتج</label>
          <div className="map-grid">
            {Object.keys(FIELDS).map((k) => (
              <div key={k}>
                <label>{LABELS[k]}</label>
                <select
                  value={map[k] || ''}
                  onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value }))}
                >
                  <option value="">— لا شيء —</option>
                  {table.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            ))}
          </div>
          {(!map.name || !map.price) && (
            <div className="error">لازم تحدّد عمود الاسم وعمود السعر على الأقل.</div>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="panel stack">
            <div className="row between">
              <span className="muted">
                {rows.length} سطر
                {badCount ? ` — ${badCount} فيها مشكلة` : ''}
                {dupCount ? ` — ${dupCount} موجودة عندك مسبقاً` : ''}
              </span>
            </div>
            <label className="row" style={{ gap: 8, margin: 0 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={skipDup}
                onChange={(e) => setSkipDup(e.target.checked)} />
              <span>تجاهل المنتجات الموجودة عندي بنفس الاسم</span>
            </label>
            {cats.length > 0 && (
              <div>
                <label>التصنيف الاحتياطي (للأسطر يلي ما فيها تصنيف بالملف)</label>
                <select value={mainId} onChange={(e) => setMainId(e.target.value)}>
                  <option value="">بدون تصنيف</option>
                  {mains.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                  ))}
                </select>
              </div>
            )}
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
