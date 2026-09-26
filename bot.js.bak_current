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
    `👤 ${p.username}\nالمستوى: ${p.miningLevel}\nالرصيد: ${p.balance.toFixed(4)} (≈ ${p.tonEquivalent.toFixed(4)} TON)\nالإحالات: ${p.referralCount}`
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

    if (payload.action === 'request_upgrade') {
      const level = payload.level;
      await bot.telegram.sendMessage(
        process.env.ADMIN_CHAT_ID,
        '\ud83d\udce5 طلب ترقية جديد\nUser: ' + ctx.from.id + ' (@' + (ctx.from.username || '-') + ')\nLevel: ' + level,
        Markup.inlineKeyboard([
          Markup.button.callback('✅ Approve', 'approve_upgrade_' + ctx.from.id + '_' + level),
          Markup.button.callback('❌ Reject', 'reject_req_' + ctx.from.id)
        ])
      );
      return ctx.reply('تم إرسال طلب الترقية للأدمين، فانتظار الموافقة.');
    }

    if (payload.action === 'request_booster') {
      const boosterId = payload.id;
      await bot.telegram.sendMessage(
        process.env.ADMIN_CHAT_ID,
        '\ud83d\udce5 طلب Booster جديد\nUser: ' + ctx.from.id + ' (@' + (ctx.from.username || '-') + ')\nBooster ID: ' + boosterId,
        Markup.inlineKeyboard([
          Markup.button.callback('✅ Approve', 'approve_booster_' + ctx.from.id + '_' + boosterId),
          Markup.button.callback('❌ Reject', 'reject_req_' + ctx.from.id)
        ])
      );
      return ctx.reply('تم إرسال طلب الـ Booster للأدمين، فانتظار الموافقة.');
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


const BOOSTER_CATALOG = {
  x2_24h: { multiplier: 2, hours: 24, cost: 100 },
  x3_48h: { multiplier: 3, hours: 48, cost: 250 },
};

bot.action(/^approve_upgrade_(\d+)_(\d+)$/, async (ctx) => {
  const userId = Number(ctx.match[1]);
  const level = Number(ctx.match[2]);
  try {
    const result = await mining.purchaseUpgrade(userId, level);
    if (result.ok) {
      await ctx.answerCbQuery('تمت الموافقة');
      await ctx.editMessageText(`✅ تمت الموافقة على ترقية المستخدم ${userId} إلى المستوى ${level}`);
      await bot.telegram.sendMessage(userId, `🎉 تمت الموافقة على ترقيتك! مستواك الآن: ${level}`);
    } else {
      await ctx.answerCbQuery('فشل: ' + result.reason);
      await ctx.editMessageText(`❌ فشلت الترقية للمستخدم ${userId}: ${result.reason}`);
    }
  } catch (e) {
    console.error('approve_upgrade error:', e);
    await ctx.answerCbQuery('خطأ في السيرفر');
  }
});

bot.action(/^approve_booster_(\d+)_(.+)$/, async (ctx) => {
  const userId = Number(ctx.match[1]);
  const boosterId = ctx.match[2];
  const booster = BOOSTER_CATALOG[boosterId];
  if (!booster) {
    await ctx.answerCbQuery('بوستر غير معروف');
    return;
  }
  try {
    const result = await mining.activateBooster(userId, booster.multiplier, booster.hours, booster.cost);
    if (result.ok) {
      await ctx.answerCbQuery('تمت الموافقة');
      await ctx.editMessageText(`✅ تم تفعيل Booster (${booster.multiplier}x لمدة ${booster.hours}س) للمستخدم ${userId}`);
      await bot.telegram.sendMessage(userId, `🚀 تم تفعيل Booster ${booster.multiplier}x لمدة ${booster.hours} ساعة!`);
    } else {
      await ctx.answerCbQuery('فشل: ' + result.reason);
      await ctx.editMessageText(`❌ فشل تفعيل Booster للمستخدم ${userId}: ${result.reason}`);
    }
  } catch (e) {
    console.error('approve_booster error:', e);
    await ctx.answerCbQuery('خطأ في السيرفر');
  }
});

bot.action(/^reject_req_(\d+)$/, async (ctx) => {
  const userId = Number(ctx.match[1]);
  try {
    await ctx.answerCbQuery('تم الرفض');
    await ctx.editMessageText(`❌ تم رفض الطلب للمستخدم ${userId}`);
    await bot.telegram.sendMessage(userId, '❌ تم رفض طلبك من الأدمين.');
  } catch (e) {
    console.error('reject_req error:', e);
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
