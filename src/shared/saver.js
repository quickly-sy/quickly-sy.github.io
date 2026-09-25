// وضع التوفير: يقلّل استهلاك البيانات — بلا صور تلقائية وبلا خرائط إلا عند الطلب
import { useEffect, useState } from 'react';

const KEY = 'quickly-saver';
const listeners = new Set();

function autoDetect() {
  const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (!c) return false;
  return !!c.saveData || ['slow-2g', '2g', '3g'].includes(c.effectiveType);
}

export function isSaver() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* ignore */
  }
  return autoDetect(); // يُفعَّل تلقائياً على الشبكات البطيئة أو إذا فعّله المستخدم في متصفحه
}

export function setSaver(on) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn(on));
}

export function useSaver() {
  const [on, setOn] = useState(isSaver);
  useEffect(() => {
    listeners.add(setOn);
    return () => listeners.delete(setOn);
  }, []);
  return [on, setSaver];
}

export function SaverToggle({ className = 'ghost sm' }) {
  const [on, set] = useSaver();
  return (
    <button
      type="button"
      className={`theme-toggle ${className} ${on ? 'saver-on' : ''}`}
      onClick={() => set(!on)}
      title={on ? 'وضع التوفير مفعّل — اضغط للإيقاف' : 'تفعيل وضع التوفير (بيانات أقل)'}
      aria-pressed={on}
    >
      🪶
    </button>
  );
}
