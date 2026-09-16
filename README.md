# hermez-bot

## القاعدة
كل مجلد داخل `modules/` مسؤول عن جدول (أو جداول) خاصة فيه بس، ومعرّف دواله عن طريق `module.exports`.
`bot.js` هو الوحيد اللي "يوصل" بين الأوامر ودوال الـ modules — ما فيه منطق أعمال بداخله.

| المشكلة | وين تدور |
|---|---|
| خطأ بالتعدين / نافذة الـ12 ساعة | `modules/mining/index.js` فقط |
| خطأ بمهمة ما تتحقق أو تتكرر | `modules/tasks/index.js` فقط |
| خطأ بالإحالات (نفس باگ zoro) | `modules/referrals/index.js` فقط |
| خطأ بالسحب أو الترقيات | `modules/payments/index.js` فقط |
| خطأ ببيانات العرض في البروفايل | `modules/profile/index.js` فقط |
| خطأ اتصال قاعدة البيانات نفسها | `shared/db/index.js` |
| خطأ إرسال/استقبال تيليجرام | `shared/telegram/index.js` |

## التشغيل على Termux (32-bit)
```bash
cd hermez-bot
npm install
cp .env.example .env   # عبّي BOT_TOKEN و SUPABASE_URL و SUPABASE_SERVICE_KEY
npm start
```

## قاعدة البيانات
نفّذ `config/schema.sql` في Supabase SQL editor قبل أول تشغيل.

## قاعدة الإحالات المهمة (سبب باگ zoro)
جدول `referral_rewards` فيه `unique (referred_id)` — يعني حتى لو انضغط /start مرتين بسرعة
لنفس المستخدم، القاعدة نفسها ترفض تكرار المكافأة، مو الكود بس.

## إضافة gram لاحقاً
انسخ هذا المجلد كامل، غيّر أسماء الجداول لو حبيت فصل قاعدة بيانات منفصلة،
وبس. الهيكلة والمنطق ما يتغيرون.
