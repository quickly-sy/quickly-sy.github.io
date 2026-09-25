import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config';

export const configMissing = SUPABASE_URL.includes('YOUR-PROJECT') || SUPABASE_KEY.includes('XXXX');

// كل واجهة تحفظ جلستها بمفتاح مختلف، فتقدر تفتح الأربعة بنفس المتصفح بحسابات مختلفة
const app = document.documentElement.dataset.app || 'app';

// فتح الاتصال بالخادم من أول لحظة، قبل أول استعلام — يوفّر ثانية أو أكثر على الشبكات البطيئة
if (!configMissing && typeof document !== 'undefined') {
  for (const rel of ['preconnect', 'dns-prefetch']) {
    const l = document.createElement('link');
    l.rel = rel;
    l.href = SUPABASE_URL;
    if (rel === 'preconnect') l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }
}

export const supabase = createClient(configMissing ? 'https://placeholder.supabase.co' : SUPABASE_URL, SUPABASE_KEY, {
  auth: { storageKey: `quickly-${app}-auth`, persistSession: true, autoRefreshToken: true },
});

const MESSAGES = [
  ['Invalid login credentials', 'رقم الهاتف أو كلمة المرور غير صحيحة'],
  ['User already registered', 'رقم الهاتف مسجل مسبقاً، سجّل الدخول بدلاً من ذلك'],
  ['Password should be at least', 'كلمة المرور لازم تكون 6 أحرف على الأقل'],
  ['Failed to fetch', 'تعذر الاتصال بالخادم، تحقق من الإنترنت'],
  ['Database error saving new user', 'تعذر إنشاء الحساب، ربما الرقم مستخدم'],
  ['JWT expired', 'انتهت الجلسة، سجّل الدخول من جديد'],
];

function toArabic(error) {
  const msg = error?.message || 'حدث خطأ غير متوقع';
  const hit = MESSAGES.find(([en]) => msg.includes(en));
  return hit ? hit[1] : msg; // رسائل قاعدة البيانات مكتوبة بالعربي أصلاً
}

// ينفّذ أي طلب Supabase ويرمي خطأ مفهوم بدل { data, error }
export async function run(query) {
  const { data, error } = await query;
  if (error) throw new Error(toArabic(error));
  return data;
}

export const rpc = (fn, args) => run(supabase.rpc(fn, args));

// الاشتراك بتغييرات مباشرة. changes: [{ event, table, filter? }]  — يرجّع دالة إلغاء الاشتراك
export function subscribe(changes, onChange) {
  const channel = supabase.channel(`rt-${Math.random().toString(36).slice(2)}`);
  for (const c of changes) channel.on('postgres_changes', { schema: 'public', ...c }, onChange);
  channel.subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
