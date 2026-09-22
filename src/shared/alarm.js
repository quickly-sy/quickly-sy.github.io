// تنبيه متكرر يبقى يرن حتى يقبل المستخدم الطلب أو يرفضه
const MUTE_KEY = 'quickly-muted';
const REPEAT_MS = 5000;
const MAX_MINUTES = 5; // يتوقف تلقائياً بعد 5 دقائق حتى لا يرن بلا نهاية

let ctx;
let timer = null;
let startedAt = 0;

export const isMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
};

export function setMuted(value) {
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (value) stopAlarm();
}

export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* ignore */
  }
}

// نغمة عالية: موجة مربعة (أوضح من الجيبية) + اهتزاز على الموبايل
function ring() {
  unlockAudio();
  try {
    navigator.vibrate?.([300, 120, 300, 120, 500]);
  } catch {
    /* ignore */
  }
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  [0, 0.28, 0.56, 0.84].forEach((t, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = i % 2 ? 1320 : 990;
    osc.connect(gain);
    gain.connect(master);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + t);
    gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.24);
    osc.start(ctx.currentTime + t);
    osc.stop(ctx.currentTime + t + 0.26);
  });
}

export function startAlarm() {
  if (timer || isMuted()) return;
  startedAt = Date.now();
  ring();
  timer = setInterval(() => {
    if (Date.now() - startedAt > MAX_MINUTES * 60000) return stopAlarm();
    ring();
  }, REPEAT_MS);
}

export function stopAlarm() {
  if (timer) clearInterval(timer);
  timer = null;
}

export const alarmRinging = () => !!timer;

if (typeof window !== 'undefined') window.addEventListener('pointerdown', unlockAudio, { once: true });
