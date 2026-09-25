// ذاكرة مؤقتة في المتصفح: تعرض آخر نسخة فوراً، ثم تحدّثها بالخلفية
// الهدف: المستخدم يشوف الشاشة مباشرة بدل ما ينتظر رد الخادم
import { useCallback, useEffect, useRef, useState } from 'react';

const PREFIX = 'quickly-cache:';

export function readCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw).v : null;
  } catch {
    return null;
  }
}

export function writeCache(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    /* الذاكرة ممتلئة أو محظورة — نتجاهل */
  }
}

export function clearCache(prefix = '') {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX + prefix))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/*
  useCached: يرجّع البيانات المحفوظة فوراً (إن وجدت) ويجلب الجديد بالخلفية.
  data     البيانات (من الذاكرة أو من الخادم)
  stale    true يعني المعروض من الذاكرة والتحديث جارٍ
  loading  true فقط عند أول مرة بلا ذاكرة
*/
export function useCached(key, fetcher, deps = []) {
  const [data, setData] = useState(() => (key ? readCache(key) : null));
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const refresh = useCallback(async () => {
    if (!key) return;
    setStale(true);
    try {
      const value = await fetcherRef.current();
      setData(value);
      writeCache(key, value);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setStale(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const cached = key ? readCache(key) : null;
    setData(cached);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);

  return { data, error, stale, loading: data === null && !error, refresh, setData };
}
