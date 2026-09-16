// shared/telegram/index.js
// نسخة وحيدة من بوت تيليجرام. كل module يستورد bot من هنا للإرسال فقط.
// تسجيل الأوامر (commands) نفسها يصير في bot.js الرئيسي، مو هنا.

const { Telegraf } = require('telegraf');

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN ناقص في .env');
}

const bot = new Telegraf(token);

module.exports = { bot };
