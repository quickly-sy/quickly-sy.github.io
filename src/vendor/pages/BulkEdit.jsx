// تعديل سريع: جدول بتعدّل فيه كل المنتجات مباشرة، مع تطبيق جماعي
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, run } from '../../shared/supabase';
import { money } from '../../shared/utils';

const norm = (t) => String(t || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').trim();

export default function BulkEdit({ vendorId }) {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [edits, setEdits] = useState({});     // { id: { name?, price?, category_id?, is_available? } }
  const [picked, setPicked] = useState(new Set());
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('all');
  const [sort, setSort] = useState('new');

  // أدوات التطبيق الجماعي
  const [bulkMain, setBulkMain] = useState('');
  const [bulkSub, setBulkSub] = useState('');
  const [factor, setFactor] = useState('');

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    run(supabase.from('products').select('id, code, name, price, category_id, image_url, is_available')
      .eq('vendor_id', vendorId).order('id', { ascending: false }))
      .then((r) => { setItems(r || []); setEdits({}); setPicked(new Set()); })
      .catch((e) => setError(e.message));
    run(supabase.from('categories').select('id, parent_id, name, icon')
      .eq('is_active', true).order('sort_order').order('name'))
      .then(setCats).catch(() => {});
  }, [vendorId]);

  useEffect(() => { load(); }, [load]);

  const mains = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);
  const byId = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const subsOf = useCallback((mid) => cats.filter((c) => c.parent_id === Number(mid)), [cats]);

  /* القيمة الفعلية للحقل بعد التعديلات غير المحفوظة */
  const val = (p, k) => (edits[p.id] && k in edits[p.id] ? edits[p.id][k] : p[k]);

  /* الرئيسي والفرعي المشتقّان من التصنيف الحالي */
  const splitCat = (cid) => {
    const c = byId.get(Number(cid));
    if (!c) return { main: '', sub: '' };
    return c.parent_id ? { main: String(c.parent_id), sub: String(c.id) } : { main: String(c.id), sub: '' };
  };

  const setField = (id, k, v) =>
    setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), [k]: v } }));

  const shown = useMemo(() => {
    const term = norm(q);
    return items
      .filter((p) => !term || norm(p.name).includes(term) || norm(p.code).includes(term))
      .filter((p) => (only === 'noimg' ? !p.image_url : only === 'nocat' ? !val(p, 'category_id') : true))
      .slice()
      .sort((a, b) => (
        sort === 'name' ? a.name.localeCompare(b.name, 'ar')
          : sort === 'priceDown' ? Number(val(b, 'price')) - Number(val(a, 'price'))
            : sort === 'priceUp' ? Number(val(a, 'price')) - Number(val(b, 'price'))
              : b.id - a.id
      ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, only, sort, edits]);

  const allShownPicked = shown.length > 0 && shown.every((p) => picked.has(p.id));
  const toggleAll = () => {
    setPicked((s) => {
      const n = new Set(s);
      if (allShownPicked) shown.forEach((p) => n.delete(p.id));
      else shown.forEach((p) => n.add(p.id));
      return n;
    });
  };
  const togglePick = (id) =>
    setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  /* تطبيق جماعي على المحدّد */
  function applyCategory() {
    if (!picked.size || !bulkMain) return;
    const cid = bulkSub ? Number(bulkSub) : Number(bulkMain);
    setEdits((e) => {
      const n = { ...e };
      picked.forEach((id) => { n[id] = { ...(n[id] || {}), category_id: cid }; });
      return n;
    });
    setMsg(`جهّزنا التصنيف لـ ${picked.size} منتج — اضغط حفظ`);
  }

  function applyFactor() {
    const f = Number(factor);
    if (!picked.size || !(f > 0)) return;
    setEdits((e) => {
      const n = { ...e };
      items.filter((p) => picked.has(p.id)).forEach((p) => {
        const cur = Number(val(p, 'price')) || 0;
        n[p.id] = { ...(n[p.id] || {}), price: Math.round(cur * f * 100) / 100 };
      });
      return n;
    });
    setMsg(`ضربنا سعر ${picked.size} منتج × ${f} — راجعهن واضغط حفظ`);
  }

  function applyAvailable(v) {
    if (!picked.size) return;
    setEdits((e) => {
      const n = { ...e };
      picked.forEach((id) => { n[id] = { ...(n[id] || {}), is_available: v }; });
      return n;
    });
  }

  /* الصفوف المعدّلة فعلياً */
  const dirty = useMemo(() => {
    const out = [];
    for (const p of items) {
      const e = edits[p.id];
      if (!e) continue;
      const ch = {};
      for (const k of ['name', 'price', 'category_id', 'is_available']) {
        if (k in e && String(e[k] ?? '') !== String(p[k] ?? '')) ch[k] = e[k];
      }
      if (Object.keys(ch).length) out.push({ id: p.id, ch });
    }
    return out;
  }, [items, edits]);

  async function save() {
    if (!dirty.length) return;
    const bad = dirty.find((d) => 'price' in d.ch && !(Number(d.ch.price) > 0));
    if (bad) return setError('في سعر صفر أو غير صالح — صلّحه قبل الحفظ.');
    const empty = dirty.find((d) => 'name' in d.ch && !String(d.ch.name).trim());
    if (empty) return setError('في اسم فاضي — صلّحه قبل الحفظ.');

    setSaving(true); setError(''); setMsg(''); setProgress('');
    try {
      // نجمّع الصفوف يلي عليها نفس التعديل بالضبط → طلب واحد لكل مجموعة
      const groups = new Map();
      for (const d of dirty) {
        const key = JSON.stringify(d.ch);
        if (!groups.has(key)) groups.set(key, { ch: d.ch, ids: [] });
        groups.get(key).ids.push(d.id);
      }

      let done = 0;
      for (const { ch, ids } of groups.values()) {
        const body = { ...ch };
        if ('name' in body) body.name = String(body.name).trim();
        if ('price' in body) body.price = Number(body.price);
        await run(supabase.from('products').update(body).in('id', ids));
        done += ids.length;
        setProgress(`حُفظ ${done} من ${dirty.length}...`);
      }

      setMsg(`تم حفظ ${dirty.length} منتج ✅`);
      setProgress('');
      load();
    } catch (e) {
      setError(e.message);
      setProgress('');
    } finally {
      setSaving(false);
    }
  }

  const noCat = items.filter((p) => !val(p, 'category_id')).length;

  return (
    <div className="stack">
      <div className="panel stack">
        <h3>تعديل سريع</h3>
        <p className="muted" style={{ margin: 0 }}>
          عدّل مباشرة بالجدول، أو حدّد مجموعة منتجات وطبّق عليها تصنيفاً أو سعراً دفعة وحدة.
          ما في شي بينحفظ قبل ما تضغط «حفظ».
        </p>
        {noCat > 0 && (
          <div className="notice"><strong>{noCat}</strong> منتج بلا تصنيف — اضغط «بلا تصنيف» تحت لتشوفهن.</div>
        )}

        <input className="search-box" placeholder="ابحث باسم المنتج أو رقم المفتاح"
          value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="row between">
          <div className="chips">
            {[['all', `الكل (${items.length})`], ['nocat', `بلا تصنيف (${noCat})`], ['noimg', 'بلا صورة']].map(([k, l]) => (
              <button key={k} type="button" className={only === k ? 'on' : ''} onClick={() => setOnly(k)}>{l}</button>
            ))}
          </div>
          <select style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="new">الأحدث</option>
            <option value="name">الاسم</option>
            <option value="priceDown">السعر: الأعلى أولاً</option>
            <option value="priceUp">السعر: الأدنى أولاً</option>
          </select>
        </div>
      </div>

      {/* شريط التطبيق الجماعي */}
      {picked.size > 0 && (
        <div className="panel stack bulk-bar">
          <strong>محدّد: {picked.size} منتج</strong>

          <div className="row">
            <select style={{ flex: 1 }} value={bulkMain}
              onChange={(e) => { setBulkMain(e.target.value); setBulkSub(''); }}>
              <option value="">التصنيف الرئيسي</option>
              {mains.map((c) => <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>)}
            </select>
            <select style={{ flex: 1 }} value={bulkSub}
              onChange={(e) => setBulkSub(e.target.value)} disabled={!bulkMain}>
              <option value="">{subsOf(bulkMain).length ? 'الفرعي (اختياري)' : 'بدون فرعي'}</option>
              {subsOf(bulkMain).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" onClick={applyCategory} disabled={!bulkMain}>طبّق التصنيف</button>
          </div>

          <div className="row">
            <input type="number" min="0" step="any" dir="ltr" style={{ flex: '0 0 130px' }}
              placeholder="اضرب السعر ×" value={factor} onChange={(e) => setFactor(e.target.value)} />
            <button type="button" className="ghost" onClick={applyFactor} disabled={!(Number(factor) > 0)}>
              طبّق على السعر
            </button>
            <span className="spacer" />
            <button type="button" className="ghost sm" onClick={() => applyAvailable(true)}>اجعلها متوفرة</button>
            <button type="button" className="ghost sm" onClick={() => applyAvailable(false)}>غير متوفرة</button>
            <button type="button" className="link" onClick={() => setPicked(new Set())}>إلغاء التحديد</button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {msg && <div className="notice">{msg}</div>}

      <div className="panel">
        <div className="table-wrap">
          <table className="edit-table">
            <thead>
              <tr>
                <th><input type="checkbox" checked={allShownPicked} onChange={toggleAll} style={{ width: 'auto' }} /></th>
                <th>المفتاح</th>
                <th>الاسم</th>
                <th>السعر</th>
                <th>التصنيف الرئيسي</th>
                <th>الفرعي</th>
                <th>متوفر</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 400).map((p) => {
                const { main, sub } = splitCat(val(p, 'category_id'));
                const changed = dirty.some((d) => d.id === p.id);
                return (
                  <tr key={p.id} className={changed ? 'row-dirty' : ''}>
                    <td><input type="checkbox" checked={picked.has(p.id)} onChange={() => togglePick(p.id)} style={{ width: 'auto' }} /></td>
                    <td className="muted" dir="ltr" style={{ textAlign: 'right' }}>{p.code || '—'}</td>
                    <td><input value={val(p, 'name')} onChange={(e) => setField(p.id, 'name', e.target.value)} /></td>
                    <td style={{ minWidth: 110 }}>
                      <input type="number" min="0" step="any" dir="ltr"
                        value={val(p, 'price')} onChange={(e) => setField(p.id, 'price', e.target.value)} />
                    </td>
                    <td>
                      <select value={main} onChange={(e) => setField(p.id, 'category_id', e.target.value ? Number(e.target.value) : null)}>
                        <option value="">—</option>
                        {mains.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <select value={sub} disabled={!main}
                        onChange={(e) => setField(p.id, 'category_id', e.target.value ? Number(e.target.value) : Number(main))}>
                        <option value="">—</option>
                        {subsOf(main).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </td>
                    <td>
                      <button type="button" className={`sm ${val(p, 'is_available') ? 'ok' : 'ghost'}`}
                        onClick={() => setField(p.id, 'is_available', !val(p, 'is_available'))}>
                        {val(p, 'is_available') ? 'متوفر' : 'لأ'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {shown.length > 400 && <p className="muted">عم نعرض 400 صف — ضيّق البحث لتشوف الباقي.</p>}
      </div>

      <div className="panel stack save-bar">
        {progress && <div className="notice">{progress}</div>}
        <div className="row between">
          <span className="muted">
            {dirty.length ? <>معدّل ولم يُحفظ: <strong>{dirty.length}</strong> منتج</> : 'ما في تعديلات'}
          </span>
          <div className="row">
            {dirty.length > 0 && (
              <button className="ghost" onClick={() => setEdits({})} disabled={saving}>تراجع عن الكل</button>
            )}
            <button onClick={save} disabled={saving || !dirty.length}>
              {saving ? 'جاري الحفظ...' : `احفظ ${dirty.length || ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
