// قراءة ملف استيراد (CSV أو JSON) وتحويله لصفوف + أسماء أعمدة
import { parseCsv, readTextFile, normHeader } from './csv';

/* قيمة الخلية كنص — حتى لو كانت كائناً متداخلاً */
export function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v)) return v.map(cellText).filter(Boolean).join('، ');
    for (const k of ['name', 'title', 'label', 'ar', 'value', 'url']) {
      if (v[k] != null && typeof v[k] !== 'object') return String(v[k]);
    }
    return '';
  }
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  return String(v);
}

/* كل الأعمدة الظاهرة في أول 50 صف (الصفوف مو دايماً متطابقة) */
function columnsOf(rows) {
  const seen = new Set();
  for (const r of rows.slice(0, 50)) {
    for (const k of Object.keys(r || {})) seen.add(k);
  }
  return [...seen];
}

/* يدوّر على كل المصفوفات يلي فيها كائنات — نسخة احتياطية غالباً فيها أكثر من جدول */
function findTables(data, path = '', out = []) {
  if (Array.isArray(data)) {
    if (data.length && typeof data[0] === 'object' && !Array.isArray(data[0])) {
      out.push({ key: path || 'الملف', rows: data, count: data.length });
    }
    return out;
  }
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      findTables(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

/*
  يرجّع: { tables: [{ key, rows, count, columns }] }
  CSV بيرجّع جدول واحد. JSON ممكن يرجّع أكثر من جدول فيختار التاجر.
*/
export async function readImportFile(file) {
  const name = (file.name || '').toLowerCase();
  const text = await readTextFile(file);

  if (name.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error(`الملف مو JSON صالح: ${e.message}`);
    }
    const tables = findTables(data)
      .map((t) => ({ ...t, columns: columnsOf(t.rows) }))
      .filter((t) => t.columns.length)
      .sort((a, b) => b.count - a.count);

    if (!tables.length) throw new Error('ما لقينا قائمة منتجات داخل الملف');
    return { tables };
  }

  // CSV
  const table = parseCsv(text);
  if (table.length < 2) throw new Error('الملف فاضي أو ما فيه إلا سطر العناوين');
  const head = table[0].map((h, i) => String(h).trim() || `عمود ${i + 1}`);
  const rows = table.slice(1).map((r) => {
    const o = {};
    head.forEach((h, i) => { o[h] = r[i] ?? ''; });
    return o;
  });
  return { tables: [{ key: 'الملف', rows, count: rows.length, columns: head }] };
}

/* يخمّن أي عمود يقابل أي حقل، حسب قائمة أسماء مقبولة */
export function guessMapping(columns, fields) {
  const map = {};
  const used = new Set();
  for (const [key, names] of Object.entries(fields)) {
    const want = names.map(normHeader);
    const hit = columns.find((c) => !used.has(c) && want.includes(normHeader(c)));
    if (hit) { map[key] = hit; used.add(hit); }
  }
  return map;
}
