const { supabase } = require('../shared/db');
const mining = require('./mining');
const payments = require('./payments');

async function getStatus() {
  const { data, error } = await supabase.from('presale').select('*').eq('id', 1).single();
  if (error) throw error;
  const active = new Date(data.ends_at) > new Date() && Number(data.sold) < Number(data.total_cap);
  return { ...data, active };
}

async function buy(userId, senderAddress) {
  const status = await getStatus();
  if (!status.active) return { ok: false, reason: 'presale_closed' };

  const remaining = Number(status.total_cap) - Number(status.sold);
  if (remaining <= 0) return { ok: false, reason: 'sold_out' };

  const found = await payments.findMatchingTransaction(senderAddress, 0.000001);
  if (!found.ok) return found;

  const hrzAmount = found.amount * Number(status.rate);
  const finalAmount = Math.min(hrzAmount, remaining);

  await payments.markTxUsed(found.hash, userId, 'presale_purchase');

  const { error: updErr } = await supabase
    .from('presale')
    .update({ sold: Number(status.sold) + finalAmount })
    .eq('id', 1);
  if (updErr) throw updErr;

  const newBalance = await mining.addBalance(userId, finalAmount);

  return { ok: true, hrzReceived: finalAmount, tonPaid: found.amount, newBalance };
}

module.exports = { getStatus, buy };
