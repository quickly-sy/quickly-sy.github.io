import { useSaver } from './saver';

export default function SaverToggle({ className = 'ghost sm' }) {
  const [on, set] = useSaver();
  return (
    <button
      type="button"
      className={`saver-toggle ${className} ${on ? 'saver-on' : ''}`}
      onClick={() => set(!on)}
      title={on ? 'توفير البيانات مفعّل — اضغط للإيقاف' : 'تفعيل توفير البيانات'}
      aria-pressed={on}
    >
      <span aria-hidden="true">⚡</span>
      <span className="saver-label">توفير البيانات</span>
    </button>
  );
}
