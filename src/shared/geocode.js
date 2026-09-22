// تحويل الإحداثيات لاسم شارع/حي عبر OpenStreetMap (Nominatim) — مجاني بدون مفتاح
// سياسة الخدمة: طلب واحد بالثانية كحد أقصى، لذلك نستدعيها فقط عند تحديد موقع جديد
export async function reverseGeocode([lat, lng]) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=ar`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const data = await res.json();
    const a = data.address || {};
    const parts = [a.road, a.neighbourhood || a.quarter || a.suburb, a.city_district, a.city || a.town || a.village];
    const label = [...new Set(parts.filter(Boolean))].slice(0, 3).join('، ');
    return label || (data.display_name || '').split(',').slice(0, 3).join('،');
  } catch {
    return '';
  }
}
