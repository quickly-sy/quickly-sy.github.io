import { useState } from 'react';

// فاتح (افتراضي) / غامق — يُحفظ على الجهاز
const KEY = 'quickly-theme';

export default function ThemeToggle({ className = 'ghost' }) {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light');
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggle}
      aria-label={dark ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الغامق'}
      title={dark ? 'الوضع الفاتح' : 'الوضع الغامق'}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}