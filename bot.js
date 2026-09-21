// bot.js
// هذا الملف "سلكي" فقط — يربط أوامر تيليجرام بدوال الـ modules.
// ممنوع تحط هنا منطق أعمال (حسابات، شروط اقتصادية، إلخ) — هذا يروح داخل الـ module نفسه.

require('dotenv').config();
const { bot } = require('./shared/telegram');
const { Markup } = require('telegraf');
const profile = require('./modules/profile');
const mining = require('./modules/mining');
const tasks = require('./modules/tasks');
const referrals = require('./modules/referrals');
const payments = require('./modules/payments');

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  await profile.ensureUser(userId, { username: ctx.from.username, firstName: ctx.from.first_name });

  const payload = ctx.startPayload; // referral code لو موجود
  if (payload && /^\d+$/.test(payload)) {
    const referrerId = Number(payload);
    const result = await referrals.registerReferral(userId, referrerId);
    if (result.ok) {
      await mining.getState(referrerId); // تأكد للمُحيل حساب تعدين موجود
      const newBalance = await mining.addBalance(referrerId, result.reward);
      await bot.telegram.sendMessage(referrerId, `🎉 إحالة جديدة! +${result.reward} — رصيدك الآن: ${newBalance.toFixed(4)}`);
    }
  }

  await ctx.reply('أهلاً بك في hermez! استخدم /mine للبدء.');
});

bot.command('mine', async (ctx) => {
  const result = await mining.startSession(ctx.from.id);
  if (!result.ok) {
    return ctx.reply(`عندك جلسة شغالة، باقي ${result.hoursRemaining.toFixed(1)} ساعة.`);
  }
  return ctx.reply('بدأت جلسة تعدين لمدة 12 ساعة. استخدم /claim بعدها.');
});

bot.command('claim', async (ctx) => {
  const result = await mining.claimSession(ctx.from.id);
  if (!result.ok) return ctx.reply('ما عندك جلسة جاهزة للسحب.');
  return ctx.reply(`سحبت ${result.earned.toFixed(4)} عملة.`);
});

bot.command('tasks', async (ctx) => {
  const list = await tasks.listActiveTasks();
  const lines = list.map(t => `${t.code} — ${t.reward}`).join('\n');
  const adTasks = list.filter(t => t.code.startsWith('monetag_'));
  if (adTasks.length > 0 && process.env.MINI_APP_URL) {
    return ctx.reply(
      (lines || 'لا توجد مهام حالياً.') + '\n\nاضغط الزر لمشاهدة الإعلانات:',
      Markup.inlineKeyboard([Markup.button.webApp('🎬 شاهد الإعلانات', process.env.MINI_APP_URL + '?v=' + Date.now())])
    );
  }
  return ctx.reply(lines || 'لا توجد مهام حالياً.');
});

bot.command('profile', async (ctx) => {
  const p = await profile.getFullProfile(ctx.from.id);
  return ctx.reply(
    `👤 ${p.username}\nالمستوى: ${p.miningLevel}\nالرصيد: ${p.balance.toFixed(4)}\nالإحالات: ${p.referralCount}`
  );
});

bot.on('message', async (ctx) => {
  if (!ctx.message || !ctx.message.web_app_data) return;
  try {
    const payload = JSON.parse(ctx.message.web_app_data.data);
    if (payload.action === 'request_upgrade') {
      try {
        const result = await mining.purchaseUpgrade(ctx.from.id, payload.level);
        if (!result.ok) {
          const reasons = {
            max_level_reached: 'وصلت لأعلى مستوى.',
            upgrade_not_found: 'هذا المستوى غير متوفر.',
            wrong_level: 'يجب ترقية المستوى بالترتيب.',
            insufficient_balance: 'رصيدك غير كافٍ لهذه الترقية.',
          };
          return ctx.reply(reasons[result.reason] || 'تعذر إتمام الترقية.');
        }
        return ctx.reply(`✅ تم الترقية إلى المستوى ${result.newLevel}!\nرصيدك الآن: ${result.newBalance.toFixed(4)}`);
      } catch (e) {
        console.error('request_upgrade error:', e);
        return ctx.reply('حدث خطأ أثناء الترقية.');
      }
    }

    if (payload.action !== 'complete_task') return;
    const allTasks = await tasks.listActiveTasks();
    const task = allTasks.find(t => t.code === payload.code);
    if (!task) return ctx.reply('المهمة غير موجودة.');
    const result = await tasks.completeTask(ctx.from.id, task.id);
    if (!result.ok) {
      const reasons = { already_completed: 'أنجزت هذه المهمة من قبل.', task_inactive: 'هذه المهمة غير نشطة.' };
      return ctx.reply(reasons[result.reason] || 'تعذر إتمام المهمة.');
    }
    const newBalance = await mining.addBalance(ctx.from.id, result.reward);
    return ctx.reply(`✅ تمت المهمة! +${result.reward} عملة\nرصيدك الآن: ${newBalance.toFixed(4)}`);
  } catch (e) {
    console.error('web_app_data error:', e);
    return ctx.reply('حدث خطأ أثناء معالجة الطلب.');
  }
});

bot.launch();
console.log('hermez bot running');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

bot.command("wallet", (ctx) => {
  ctx.reply("اربط محفظتك:", {
    reply_markup: {
      inline_keyboard: [[
        { text: "🔗 Connect Wallet", web_app: { url: "https://hermez-backend.onrender.com/wallet.html" } }
      ]]
    }
  });
});
