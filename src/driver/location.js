// الموقع: بالمتصفح نستعمل GPS المتصفح، وبتطبيق أندرويد نستعمل التتبع الخلفي (يشتغل والشاشة مطفية)
import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { supabase } from '../shared/supabase';
import { SUPABASE_URL, SUPABASE_KEY } from '../shared/config';

export const isNativeApp = Capacitor.isNativePlatform();

const BackgroundGeolocation = registerPlugin('BackgroundGeolocation');
const LocalNotifications = registerPlugin('LocalNotifications');

// يبدأ متابعة الموقع ويرجّع دالة الإيقاف
// distanceFilter: 10 = يوفّر البطارية، 0 = تحديث مستمر حتى بدون حركة (للمهمات الخاصة)
export function watchLocation(onPosition, { distanceFilter = 10 } = {}) {
  if (isNativeApp) {
    let watcherId = null;
    let stopped = false;
    (async () => {
      try {
        await LocalNotifications.requestPermissions(); // أندرويد 13+: إذن الإشعار الثابت
      } catch {
        /* ignore */
      }
      try {
        watcherId = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: 'Quickly — السائق',
            backgroundMessage: 'يتم إرسال موقعك أثناء العمل',
            requestPermissions: true,
            stale: false,
            distanceFilter,
          },
          (location, error) => {
            if (error) {
              if (error.code === 'NOT_AUTHORIZED' &&
                  window.confirm('Quickly يحتاج إذن الموقع ليعمل. فتح إعدادات التطبيق؟')) {
                BackgroundGeolocation.openSettings();
              }
              return;
            }
            if (location) onPosition([location.latitude, location.longitude]);
          }
        );
        if (stopped) BackgroundGeolocation.removeWatcher({ id: watcherId });
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      stopped = true;
      if (watcherId) BackgroundGeolocation.removeWatcher({ id: watcherId });
    };
  }

  if (!navigator.geolocation) return () => {};
  const id = navigator.geolocation.watchPosition(
    (p) => onPosition([p.coords.latitude, p.coords.longitude]),
    () => {},
    { enableHighAccuracy: true }
  );
  return () => navigator.geolocation.clearWatch(id);
}

// إرسال الموقع للقاعدة. بالتطبيق نستعمل HTTP الأصلي لأن أندرويد يبطّئ طلبات الـ WebView بالخلفية
export async function sendLocation([lat, lng]) {
  if (!isNativeApp) {
    await supabase.rpc('driver_update_location', { p_lat: lat, p_lng: lng });
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await CapacitorHttp.post({
    url: `${SUPABASE_URL}/rest/v1/rpc/driver_update_location`,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    data: { p_lat: lat, p_lng: lng },
  });
}

export function openAppSettings() {
  if (isNativeApp) BackgroundGeolocation.openSettings();
}
