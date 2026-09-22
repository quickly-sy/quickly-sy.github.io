# Quickly Web — الواجهات الأربعة على Supabase

مشروع واحد، `npm install` واحد، وأربع واجهات:

| الواجهة | الرابط المحلي | الحساب |
|---|---|---|
| الصفحة الرئيسية | http://localhost:5173/ | — |
| الزبون | http://localhost:5173/customer/ | 0934948249 |
| المتجر | http://localhost:5173/vendor/ | 0934589893 (Trend) |
| السائق | http://localhost:5173/driver/ | 0985218648 / 0938898345 |
| الإدارة | http://localhost:5173/admin/ | 0982638423 |

كل واجهة تحفظ جلستها بشكل منفصل، فتقدر تفتح الأربعة بتبويبات نفس المتصفح بحسابات مختلفة.
السائق الثاني يحتاج نافذة Incognito أو متصفح آخر (لأنه نفس واجهة السائق الأول).

## البنية
```
quickly-web/
├── index.html, customer/, vendor/, driver/, admin/   ← صفحات HTML لكل واجهة
└── src/
    ├── shared/
    │   ├── config.js      ← ⬅️ الملف الوحيد اللي بتعدّله
    │   ├── supabase.js    ← الاتصال + run/rpc/subscribe
    │   ├── auth.jsx       ← الدخول برقم الهاتف + التحقق من الدور
    │   ├── map.jsx, utils.js, Topbar.jsx, styles.css
    ├── customer/  vendor/  driver/  admin/
```

## التشغيل
```bash
npm install
npm run dev
```
