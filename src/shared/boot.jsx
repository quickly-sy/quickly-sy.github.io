import ReactDOM from 'react-dom/client';
import { configMissing } from './supabase';

function ConfigMissing() {
  return (
    <div className="page">
      <div className="panel stack">
        <h2>الإعدادات ناقصة</h2>
        <p>
          افتح الملف <code>src/shared/config.js</code> وحط فيه <b>Project URL</b> و <b>Publishable key</b> من
          Supabase ← Project Settings ← API Keys، ثم احفظ الملف.
        </p>
      </div>
    </div>
  );
}

export function boot(App) {
  ReactDOM.createRoot(document.getElementById('root')).render(configMissing ? <ConfigMissing /> : <App />);
}
