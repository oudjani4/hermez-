// modules/payments/index.js
// يلمس withdrawals / reserve_wallet / upgrades بس.
// نفس نموذج zoro المُصلَح: reserve wallet + solvency check قبل أي سحب.

const { supabase } = require('../../shared/db');

async function getUpgradeCost(level) {
  const { data, error } = await supabase
    .from('upgrades')
    .select('*')
    .eq('level', level)
    .single();
  if (error) throw error;
  return data;
}

// ملاحظة: هذي الدالة ترجع بس هل الشراء مسموح ماديًا (تخصم رصيد المستخدم).
// تحديث level الفعلي يصير في mining module عن طريق استدعاء خارجي من bot.js
async function purchaseUpgrade(userId, currentBalance, targetLevel) {
  const upgrade = await getUpgradeCost(targetLevel);
  if (currentBalance < upgrade.cost) {
    return { ok: false, reason: 'insufficient_balance', needed: upgrade.cost };
  }
  return { ok: true, cost: upgrade.cost, bonus: upgrade.mining_rate_bonus };
}

async function requestWithdrawal(userId, amount) {
  const { data: reserve, error: reserveErr } = await supabase
    .from('reserve_wallet')
    .select('balance')
    .eq('id', 1)
    .single();
  if (reserveErr) throw reserveErr;

  if (reserve.balance < amount) {
    return { ok: false, reason: 'reserve_insolvent' };
  }

  const { data, error } = await supabase
    .from('withdrawals')
    .insert({ user_id: userId, amount, status: 'pending' })
    .select()
    .single();
  if (error) throw error;

  return { ok: true, withdrawal: data };
}

async function approveWithdrawal(withdrawalId) {
  const { data: w, error: wErr } = await supabase
    .from('withdrawals')
    .select('*')
    .eq('id', withdrawalId)
    .single();
  if (wErr) throw wErr;
  if (w.status !== 'pending') return { ok: false, reason: 'not_pending' };

  const { data: reserve, error: reserveErr } = await supabase
    .from('reserve_wallet')
    .select('balance')
    .eq('id', 1)
    .single();
  if (reserveErr) throw reserveErr;

  if (reserve.balance < w.amount) {
    return { ok: false, reason: 'reserve_insolvent' };
  }

  await supabase.from('reserve_wallet').update({ balance: reserve.balance - w.amount }).eq('id', 1);
  await supabase
    .from('withdrawals')
    .update({ status: 'paid', processed_at: new Date().toISOString() })
    .eq('id', withdrawalId);

  return { ok: true };
}

module.exports = { getUpgradeCost, purchaseUpgrade, requestWithdrawal, approveWithdrawal };
