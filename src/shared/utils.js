import { CURRENCY } from './config';

export const STATUS = {
  pending: 'بانتظار المتجر',
  confirmed: 'قبله المتجر',
  preparing: 'قيد التحضير',
  ready: 'جاهز للاستلام',
  picked: 'مع السائق',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

export const DRIVER_STATUS = { available: 'متاح', busy: 'مشغول', offline: 'غير متصل' };
export const ACTIVE_STATUSES = ['confirmed', 'preparing', 'ready', 'picked'];

// مهمات السائق الخاص
export const TASK_STATUS = { assigned: 'بانتظار الانطلاق', started: 'في الطريق', arrived: 'وصل', done: 'تمت', cancelled: 'ملغاة' };
export const TASK_BADGE = { assigned: 'pending', started: 'picked', arrived: 'ready', done: 'delivered', cancelled: 'cancelled' };
export const TASK_RUNNING = ['started', 'arrived'];

// المسافة بالمتر بين نقطتين [lat, lng]
export function distanceM(a, b) {
  if (!a || !b) return Infinity;
  const r = (d) => (d * Math.PI) / 180;
  const dLat = r(b[0] - a[0]);
  const dLng = r(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export const money = (n) => `${Number(n || 0).toLocaleString('en-US')} ${CURRENCY}`;
export const toPoint = (lat, lng) => (lat != null && lng != null ? [Number(lat), Number(lng)] : null);
export const formatTime = (d) =>
  new Date(d).toLocaleString('ar', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

// صوت تنبيه بدون ملفات. المتصفح يحتاج نقرة واحدة على الصفحة قبل أول صوت.
let ctx;
export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* ignore */
  }
}

export function playBeep() {
  unlockAudio();
  if (!ctx) return;
  [0, 0.22, 0.44].forEach((t) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = t === 0.44 ? 1175 : 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
    osc.start(ctx.currentTime + t);
    osc.stop(ctx.currentTime + t + 0.2);
  });
}

if (typeof window !== 'undefined') window.addEventListener('pointerdown', unlockAudio, { once: true });
