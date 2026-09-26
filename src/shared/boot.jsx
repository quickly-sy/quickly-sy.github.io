import { Component } from 'react';
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

/*
  شبكة أمان: أي خطأ برمجي غير متوقع يعرض رسالة واضحة
  بدل الشاشة البيضاء، مع نص الخطأ لنسخه وإرساله.
*/
class Guard extends Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err) {
    return { err };
  }

  componentDidCatch(err, info) {
    // يبقى بالـ Console لمن يفتح أدوات المطوّر
    console.error('Quickly error:', err, info);
  }

  render() {
    if (!this.state.err) return this.props.children;
    const text = String(this.state.err?.message || this.state.err);
    return (
      <div className="page stack" style={{ maxWidth: 560 }}>
        <div className="panel stack">
          <h2>صار خلل غير متوقع</h2>
          <p className="muted" style={{ margin: 0 }}>
            جرّب تحديث الصفحة. إذا تكرر، انسخ الرسالة تحت وأرسلها.
          </p>
          <pre className="crash-text">{text}</pre>
          <div className="row">
            <button onClick={() => window.location.reload()}>تحديث الصفحة</button>
            <button
              className="ghost"
              onClick={() => navigator.clipboard?.writeText(text).catch(() => {})}
            >
              نسخ الرسالة
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export function boot(App) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    configMissing ? <ConfigMissing /> : (
      <Guard>
        <App />
      </Guard>
    )
  );
}
