// modules/profile/index.js
// يلمس جدول users بس (بيانات هوية المستخدم). مو رصيد التعدين ومو الإحالات —
// هذي تُجلب من modules الثانية وتُجمّع هنا فقط عند العرض النهائي للمستخدم.

const { supabase } = require('../../shared/db');
const mining = require('../mining');
const referrals = require('../referrals');

async function ensureUser(userId, { username, firstName } = {}) {
  const { data, error } = await supabase
    .from('users')
    .upsert({ id: userId, username, first_name: firstName, last_active_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// نقطة التجميع الوحيدة: تستدعي modules الثانية بدال ما تنسخ منطقها
async function getFullProfile(userId) {
  const [user, miningState, refStats] = await Promise.all([
    supabase.from('users').select('*').eq('id', userId).single().then(r => r.data),
    mining.getState(userId),
    referrals.getReferralStats(userId),
  ]);

  return {
    username: user.username,
    joinedAt: user.created_at,
    miningLevel: miningState.level,
    balance: miningState.balance,
    referralCount: refStats.count,
    referralEarnings: refStats.totalEarned,
  };
}

async function setWallet(userId, address) {
  const { error } = await supabase
    .from("users")
    .update({ wallet_address: address })
    .eq("id", userId);
  if (error) throw error;
  return { ok: true };
}

module.exports = { ensureUser, getFullProfile, setWallet };
