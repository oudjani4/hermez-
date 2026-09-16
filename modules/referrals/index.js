// modules/referrals/index.js
// هذا هو المكان الوحيد اللي يتعامل مع منطق الإحالة.
// باگ zoro صار من عدم وجود قيد unique على referred_id — هنا مضبوط بالسكيما (schema.sql)
// بحيث حتى لو صار استدعاء مزدوج (race condition)، القاعدة نفسها ترفض التكرار.

const { supabase } = require('../../shared/db');

const REFERRAL_REWARD = 50; // بعملة hermez، عدّلها حسب اقتصادك

// يُستدعى مرة وحدة بس عند /start مع referral code
async function registerReferral(newUserId, referrerId) {
  if (newUserId === referrerId) return { ok: false, reason: 'self_referral' };

  // تأكد المستخدم الجديد ما عنده referred_by من قبل
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('referred_by')
    .eq('id', newUserId)
    .maybeSingle();
  if (userErr) throw userErr;

  if (user && user.referred_by) {
    return { ok: false, reason: 'already_referred' };
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({ referred_by: referrerId })
    .eq('id', newUserId);
  if (updateErr) throw updateErr;

  // unique(referred_id) بالسكيما يمنع أي تكرار حتى تحت ضغط
  const { error: rewardErr } = await supabase
    .from('referral_rewards')
    .insert({ referrer_id: referrerId, referred_id: newUserId, reward: REFERRAL_REWARD });

  if (rewardErr) {
    if (rewardErr.code === '23505') { // unique_violation
      return { ok: false, reason: 'reward_already_granted' };
    }
    throw rewardErr;
  }

  return { ok: true, reward: REFERRAL_REWARD, referrerId };
}

async function getReferralStats(userId) {
  const { data, error } = await supabase
    .from('referral_rewards')
    .select('reward')
    .eq('referrer_id', userId);
  if (error) throw error;

  return {
    count: data.length,
    totalEarned: data.reduce((sum, r) => sum + Number(r.reward), 0),
  };
}

module.exports = { registerReferral, getReferralStats, REFERRAL_REWARD };
