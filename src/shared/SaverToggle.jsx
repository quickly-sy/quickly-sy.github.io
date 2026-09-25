import { useSaver } from './saver';

export default function SaverToggle({ className = 'ghost sm' }) {
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
