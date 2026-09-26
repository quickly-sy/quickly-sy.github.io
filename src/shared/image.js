// ضغط الصور في المتصفح قبل الرفع + الرفع إلى Supabase Storage
// الهدف: صورة من كاميرا الموبايل (4 ميغا) تصير ~80 كيلو قبل ما تترك الجهاز
import { supabase } from './supabase';

export const BUCKET = 'media';

let webpOk = null;
function supportsWebp() {
  if (webpOk === null) {
    try {
      webpOk = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
    } catch { webpOk = false; }
  }
  return webpOk;
}

/* يصغّر الصورة لأطول ضلع maxSide ويحوّلها webp (أو jpeg) */
export async function compressImage(file, { maxSide = 1280, quality = 0.82 } = {}) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    throw new Error('الملف ليس صورة');
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file); // متصفحات قديمة
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  const type = supportsWebp() ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise((res) => canvas.toBlob(res, type, quality));
  canvas.width = canvas.height = 0; // تحرير الذاكرة على الموبايل
  if (!blob) throw new Error('تعذر معالجة الصورة، جرّب صورة ثانية');
  return blob;
}

function storageError(e) {
  const m = String(e?.message || e);
  if (/row-level security|violates|Unauthorized|403/i.test(m)) return 'ما عندك صلاحية رفع صور لهذا المتجر';
  if (/exceeded|too large|413/i.test(m)) return 'الصورة كبيرة — جرّب صورة أصغر';
  if (/mime|not allowed/i.test(m)) return 'نوع الملف غير مدعوم (JPG أو PNG أو WEBP)';
  if (/Bucket not found/i.test(m)) return 'حاوية الصور غير موجودة — شغّل ملف storage.sql';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'الشبكة ضعيفة — أعد المحاولة';
  return m;
}

/* يضغط ويرفع ويرجّع الرابط العام */
export async function uploadImage(folder, file, opts = {}) {
  const blob = await compressImage(file, opts);
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(storageError(error));

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/* يحوّل الرابط العام إلى مسار داخل الحاوية (للحذف) */
export function pathFromUrl(url) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
}

/* حذف صورة قديمة — لا يفشل الحفظ إذا تعذّر */
export async function deleteImage(url) {
  const path = pathFromUrl(url);
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* تجاهل */ }
}

export function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} كيلو`;
  return `${(bytes / 1048576).toFixed(1)} ميغا`;
}
