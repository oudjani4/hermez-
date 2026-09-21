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
  const MIN_WITHDRAWAL = 500;
  if (amount < MIN_WITHDRAWAL) {
    return { ok: false, reason: 'below_minimum', minimum: MIN_WITHDRAWAL };
  }

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


// ===== التحقق من معاملات TON على البلوكتشين =====
const TONCENTER_API_KEY = process.env.TONCENTER_API_KEY;
const PROJECT_TON_WALLET = process.env.PROJECT_TON_WALLET;

async function verifyTonTransaction(txHash, expectedAmountTon) {
  const url = `https://toncenter.com/api/v3/transactions?hash=${txHash}`;
  const res = await fetch(url, {
    headers: { "X-API-Key": TONCENTER_API_KEY }
  });
  const data = await res.json();

  if (!data.transactions || data.transactions.length === 0) {
    return { ok: false, reason: "tx_not_found" };
  }

  const tx = data.transactions[0];
  const inMsg = tx.in_msg;

  if (!inMsg || !inMsg.destination) {
    return { ok: false, reason: "invalid_tx" };
  }

  // نتأكد الوجهة هي محفظة المشروع
  if (inMsg.destination !== PROJECT_TON_WALLET) {
    return { ok: false, reason: "wrong_destination" };
  }

  const amountTon = Number(inMsg.value) / 1e9; // من nanoton لـ TON
  if (amountTon < expectedAmountTon) {
    return { ok: false, reason: "insufficient_amount", received: amountTon, expected: expectedAmountTon };
  }

  return { ok: true, amount: amountTon };
}

async function isTxAlreadyUsed(txHash) {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id")
    .eq("tx_hash", txHash)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function markTxUsed(txHash, userId, purpose) {
  const { error } = await supabase
    .from("wallet_transactions")
    .insert({ tx_hash: txHash, user_id: userId, purpose });
  if (error) throw error;
}


async function findMatchingTransaction(senderAddress, expectedAmountTon) {
  const url = `https://toncenter.com/api/v3/transactions?account=${PROJECT_TON_WALLET}&limit=20&sort=desc`;
  const res = await fetch(url, { headers: { "X-API-Key": TONCENTER_API_KEY } });
  const data = await res.json();
  if (!data.transactions) return { ok: false, reason: "no_transactions" };

  for (const tx of data.transactions) {
    const inMsg = tx.in_msg;
    if (!inMsg || !inMsg.source) continue;
    if (inMsg.source !== senderAddress) continue;
    const amountTon = Number(inMsg.value) / 1e9;
    if (amountTon < expectedAmountTon) continue;
    const used = await isTxAlreadyUsed(tx.hash);
    if (used) continue;
    return { ok: true, hash: tx.hash, amount: amountTon };
  }
  return { ok: false, reason: "tx_not_found" };
}

module.exports = { getUpgradeCost, purchaseUpgrade, requestWithdrawal, approveWithdrawal, verifyTonTransaction, findMatchingTransaction, isTxAlreadyUsed, markTxUsed };
