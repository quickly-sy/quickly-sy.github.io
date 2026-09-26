// تجميع الصور حسب اسم الملف: "طوق (1).jpg" و "طوق (2).jpg" ← منتج واحد باسم "طوق"

// أسماء الكاميرا التلقائية — ما منستعملها كاسم منتج
const AUTO = /^(img|image|dsc|dscn|pxl|vid|photo|screenshot|لقطة|صورة)[-_ ]?\d|^\d+$/i;

/* يشيل الامتداد ولاحقة الترقيم: (2) أو -2 أو _2 أو " 2"
   نكتفي برقم من خانة أو خانتين حتى لا نقص أسماء مثل "خاتم فضة 925" */
export function baseName(fileName = '') {
  const noExt = fileName.replace(/\.[a-z0-9]{2,5}$/i, '');
  const trimmed = noExt
    .replace(/\s*\(\d{1,2}\)\s*$/, '')        // طوق (2)
    .replace(/\s*(?:نسخة|copy)\s*$/i, '')      // طوق - نسخة  /  طوق - Copy
    .replace(/[-_\s]+$/, '')                  // الفاصل المتبقي بعد "نسخة"
    .replace(/[-_ ]\d{1,2}$/, '')             // طوق-2  طوق_2  طوق 2
    .replace(/[-_\s]+$/, '')
    .trim();
  return trimmed || noExt.trim() || fileName;
}

/* هل يصلح هذا الاسم ليكون اسم منتج مقترحاً؟ */
export function looksLikeName(base = '') {
  const s = base.trim();
  if (!s || s.length < 2 || s.length > 40) return false;
  if (AUTO.test(s)) return false;
  return true;
}

/*
  يجمّع الملفات: كل مجموعة = منتج واحد.
  - المجموعة تتكوّن فقط إذا شارك ملفان أو أكثر نفس الاسم الأساسي.
  - الملف الوحيد يبقى بمفرده، واسمه المقترح من اسم ملفه الكامل (بلا امتداد).
  يرجّع: [{ base, suggested, files: [File, ...] }]
*/
export function groupByName(files = []) {
  const buckets = new Map();
  for (const f of files) {
    const b = baseName(f.name);
    if (!buckets.has(b)) buckets.set(b, []);
    buckets.get(b).push(f);
  }

  const out = [];
  for (const [base, list] of buckets) {
    if (list.length > 1) {
      // ترتيب طبيعي: (1) قبل (2) قبل (10)
      list.sort((a, b2) => a.name.localeCompare(b2.name, 'ar', { numeric: true }));
      out.push({ base, suggested: looksLikeName(base) ? base : '', files: list });
    } else {
      const full = list[0].name.replace(/\.[a-z0-9]{2,5}$/i, '').trim();
      out.push({ base, suggested: looksLikeName(full) ? full : '', files: list });
    }
  }
  return out;
}
