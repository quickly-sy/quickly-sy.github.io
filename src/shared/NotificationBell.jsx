// جرس الإشعارات — يعمل لأي حساب (زبون، متجر، إدارة)
// يعرض آخر 30 إشعاراً، ويتحدّث لحظياً عبر Realtime
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, run, rpc, subscribe } from './supabase';
import NavIcon from './navIcons';

const LIMIT = 30;

function since(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'الآن';
  if (s < 3600) return `قبل ${Math.floor(s / 60)} دقيقة`;
  if (s < 86400) return `قبل ${Math.floor(s / 3600)} ساعة`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'أمس' : `قبل ${d} يوم`;
}

export default function NotificationBell({ userId, onOpenOrder }) {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  const [off, setOff] = useState(false); // جدول الإشعارات غير موجود بعد ← نخفي الجرس

  const load = useCallback(() => {
    if (!userId) return;
    run(
      supabase.from('notifications')
        .select('id, title, body, order_id, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(LIMIT)
    )
      .then((rows) => setList(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        // لم يُشغَّل ملف addresses_and_notifications.sql بعد
        if (/does not exist|relation|schema cache|404/i.test(String(e.message))) setOff(true);
      });
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // وصول إشعار جديد أثناء فتح التطبيق
  useEffect(() => {
    if (!userId || off) return undefined;
    try {
      return subscribe(
        [{ event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }],
        load
      );
    } catch {
      return undefined;
    }
  }, [userId, off, load]);

  // إغلاق اللوحة عند الضغط خارجها أو بزر Escape
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const unread = (list || []).filter((n) => !n.read_at).length;
  if (off) return null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setList((l) => l.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
      rpc('mark_notifications_read', { p_ids: null }).catch(() => load());
    }
  }

  return (
    <div className="bell-wrap" ref={boxRef}>
      <button
        type="button"
        className="ghost sm bell-btn"
        onClick={toggle}
        aria-label={unread ? `${unread} إشعار جديد` : 'الإشعارات'}
        aria-expanded={open}
      >
        <NavIcon name="bell" size={19} />
        {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel panel" role="dialog" aria-label="الإشعارات">
          <div className="row between bell-head">
            <strong>الإشعارات</strong>
            <button className="link" onClick={() => setOpen(false)}>إغلاق</button>
          </div>

          {list.length === 0 ? (
            <div className="bell-empty muted">ما في إشعارات بعد.</div>
          ) : (
            <ul className="bell-list">
              {list.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="bell-item"
                    onClick={() => {
                      setOpen(false);
                      if (n.order_id && onOpenOrder) onOpenOrder(n.order_id);
                    }}
                  >
                    <span className="bell-title">{n.title}</span>
                    {n.body && <span className="muted">{n.body}</span>}
                    <span className="bell-time">{since(n.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
