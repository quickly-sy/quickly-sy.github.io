// قراءة ملفات CSV المصدّرة من Excel — بما فيها العربي
// يتعامل مع: BOM، الفاصلة أو الفاصلة المنقوطة أو Tab، الاقتباسات،
// الأسطر داخل الخلايا، وترميز Windows-1256 القديم.

const DELIMS = [',', ';', '\t'];

/* يخمّن الفاصل من أول سطر فعلي */
function guessDelimiter(text) {
  const line = text.split(/\r?\n/).find((l) => l.trim()) || '';
  let best = ',';
  let bestCount = -1;
  for (const d of DELIMS) {
    // نعدّ خارج الاقتباسات فقط
    let n = 0;
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') q = !q;
      else if (!q && ch === d) n++;
    }
    if (n > bestCount) { bestCount = n; best = d; }
  }
  return best;
}

/* يحوّل نص CSV إلى مصفوفة صفوف */
export function parseCsv(text) {
  let t = text.replace(/^﻿/, '');          // BOM
  const d = guessDelimiter(t);

  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < t.length; i++) {
    const ch = t[i];

    if (quoted) {
      if (ch === '"') {
        if (t[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
      continue;
    }

    if (ch === '"') { quoted = true; continue; }
    if (ch === d) { row.push(cell); cell = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }

  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/* يقرأ الملف كنص، ويعيد المحاولة بترميز عربي قديم إذا ظهر تشويش */
export async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);

  // رموز الاستبدال تعني أن الملف ليس UTF-8
  const broken = (text.match(/�/g) || []).length;
  if (broken > 3) {
    for (const enc of ['windows-1256', 'iso-8859-6']) {
      try {
        const alt = new TextDecoder(enc).decode(buf);
        if ((alt.match(/�/g) || []).length < broken) return alt;
      } catch { /* الترميز غير مدعوم بهذا المتصفح */ }
    }
  }
  return text;
}

/* تطبيع اسم العمود: يشيل المسافات والتشكيل ويوحّد الألف والياء */
export function normHeader(s = '') {
  return String(s)
    .trim()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/* يحوّل الأرقام العربية والفواصل إلى رقم */
export function toNumber(v) {
  if (v == null) return NaN;
  const s = String(v)
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
    .replace(/[،,\s]/g, '')
    .replace(/[^\d.-]/g, '');
  return s === '' ? NaN : Number(s);
}

/* ينشئ ملف CSV للتنزيل (مع BOM حتى يفتح Excel العربي صح) */
export function downloadCsv(filename, rows) {
  const esc = (c) => {
    const s = String(c ?? '');
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  const blob = new Blob([`﻿${body}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
