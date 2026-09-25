import { useCallback, useEffect, useState } from 'react';
import { supabase, run } from './supabase';
import { readCache, writeCache, clearCache } from './cache';
import { LOGIN_EMAIL_BASE } from './config';
import logo from './assets/quickly-logo.webp';
import ThemeToggle from './ThemeToggle';

const ROLE_LABEL = { customer: 'زبون', vendor: 'متجر', driver: 'سائق', admin: 'إدارة' };

// يقبل: 0955 555 555 / +963955555555 / ٠٩٥٥٥٥٥٥٥٥
export function normalizePhone(input) {
  let s = String(input || '')
    .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[^\d+]/g, '');
  if (s.startsWith('+963')) s = '0' + s.slice(4);
  else if (s.startsWith('00963')) s = '0' + s.slice(5);
  else if (s.startsWith('963')) s = '0' + s.slice(3);
  return s;
}

export const isValidPhone = (p) => /^09\d{8}$/.test(p);

export function phoneToEmail(phone) {
  const [user, domain] = LOGIN_EMAIL_BASE.split('@');
  return `${user}+${phone}@${domain}`;
}

// يحمّل الحساب الحالي ويتأكد إن دوره يناسب هذه الواجهة
export function useProfile(role) {
  // نبدأ من آخر حساب محفوظ حتى تظهر الواجهة فوراً، ثم نتحقق بالخلفية
  const cacheKey = `profile:${role}`;
  const [profile, setProfile] = useState(() => readCache(cacheKey));
  const [loading, setLoading] = useState(() => readCache(cacheKey) === null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      clearCache('profile:');
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data, error: qError } = await supabase
      .from('profiles').select('*').eq('id', session.user.id).maybeSingle();

    // انقطاع شبكة أو بطء: نُبقي المستخدم داخلاً ونكمل بالنسخة المحفوظة
    if (qError) {
      if (!readCache(cacheKey)) setError('تعذر الاتصال، سنحاول مجدداً');
      setLoading(false);
      return;
    }

    if (!data || data.role !== role) {
      await supabase.auth.signOut();
      clearCache('profile:');
      setProfile(null);
      setError(data ? `هذا الحساب ليس حساب ${ROLE_LABEL[role]}` : 'تعذر تحميل الحساب');
    } else {
      setProfile(data);
      writeCache(cacheKey, data);
      setError('');
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    reload();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearCache('profile:');
        setProfile(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [reload]);

  const logout = async () => {
    clearCache();
    await supabase.auth.signOut();
    setProfile(null);
  };

  return { profile, loading, error, reload, logout };
}

export function Login({ title, subtitle, allowRegister = false, onDone, error: outerError, themeToggle = false }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    const phone = normalizePhone(form.phone);
    if (!isValidPhone(phone)) return setError('اكتب رقماً سورياً من 10 أرقام يبدأ بـ 09');
    if (form.password.length < 6) return setError('كلمة المرور 6 أحرف على الأقل');
    if (mode === 'register' && !form.name.trim()) return setError('اكتب اسمك');

    setBusy(true);
    try {
      const email = phoneToEmail(phone);
      if (mode === 'register') {
        const data = await run(
          supabase.auth.signUp({ email, password: form.password, options: { data: { name: form.name.trim(), phone } } })
        );
        if (!data.session) throw new Error('انعمل الحساب لكن "Confirm email" مفعّل في Supabase — طفّيه من إعدادات Authentication');
      } else {
        await run(supabase.auth.signInWithPassword({ email, password: form.password }));
      }
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const shownError = error || outerError;

  return (
    <div className="auth">
      <div className="auth-brand">
        <img src={logo} alt="Quickly" />
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <form className="panel stack" onSubmit={submit}>
        {themeToggle && (
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <ThemeToggle className="ghost sm" />
          </div>
        )}
        {mode === 'register' && (
          <div>
            <label>الاسم</label>
            <input value={form.name} onChange={set('name')} autoComplete="name" />
          </div>
        )}
        <div>
          <label>رقم الهاتف</label>
          <input value={form.phone} onChange={set('phone')} inputMode="tel" dir="ltr" placeholder="09xxxxxxxx" autoComplete="tel" />
        </div>
        <div>
          <label>كلمة المرور</label>
          <input type="password" value={form.password} onChange={set('password')} dir="ltr"
                 autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        </div>
        {shownError && <div className="error">{shownError}</div>}
        <button disabled={busy}>{busy ? 'لحظة...' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}</button>
        {allowRegister && (
          <button type="button" className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'ما عندك حساب؟ أنشئ حساباً' : 'عندك حساب؟ سجّل الدخول'}
          </button>
        )}
      </form>
    </div>
  );
}
