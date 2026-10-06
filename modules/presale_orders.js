const { supabase } = require('../shared/db');
const PACKS = { 1000: 2, 5000: 9, 10000: 16 };
const STARTS = Date.UTC(2026, 9, 6, 0, 0, 0);
const ENDS = Date.UTC(2026, 9, 13, 23, 59, 59);
const TARGET_USERS = 10000;
const WALLET_RE = /^(?:(?:EQ|UQ)[A-Za-z0-9_-]{46}|-?\d:[0-9a-fA-F]{64})$/;
function wallet() { return process.env.PROJECT_TON_WALLET || process.env.TON_TREASURY_ADDRESS || ''; }
async function getInfo() {
  const { count } = await supabase.from('mining_state').select('user_id', { count: 'exact', head: true });
  return {
    packs: Object.keys(PACKS).map(h => ({ hmz: Number(h), price: PACKS[h] })),
    startsAt: STARTS, endsAt: ENDS, active: Date.now() >= STARTS && Date.now() <= ENDS,
    users: count || 0, targetUsers: TARGET_USERS, wallet: wallet()
  };
}
async function createOrder(userId, pack, userWallet) {
  const now = Date.now();
  if (now < STARTS || now > ENDS) return { ok: false, reason: 'presale_closed' };
  if (!PACKS[pack]) return { ok: false, reason: 'invalid_pack' };
  const w = String(userWallet || '').trim();
  if (!WALLET_RE.test(w)) return { ok: false, reason: 'invalid_wallet' };
  const { count } = await supabase.from('presale_orders').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'pending');
  if ((count || 0) >= 3) return { ok: false, reason: 'too_many_pending' };
  const memo = 'hp_' + userId + '_' + Math.random().toString(36).slice(2, 8);
  const { data, error } = await supabase.from('presale_orders')
    .insert({ user_id: userId, hmz_amount: pack, currency: 'TON', pay_amount: PACKS[pack], memo, wallet: w })
    .select().single();
  if (error) throw error;
  return { ok: true, order: data, wallet: wallet() };
}
async function myOrders(userId) {
  const { data, error } = await supabase.from('presale_orders').select('*')
    .eq('user_id', userId).order('id', { ascending: false }).limit(10);
  if (error) throw error;
  return data;
}
async function list() {
  const { data, error } = await supabase.from('presale_orders').select('*')
    .order('id', { ascending: false }).limit(100);
  if (error) throw error;
  return { orders: data };
}
async function setStatus(id, status) {
  const { data: up, error } = await supabase.from('presale_orders')
    .update({ status, processed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select();
  if (error) throw error;
  if (!up || !up.length) return { ok: false, reason: 'not_pending' };
  return { ok: true, order: up[0] };
}
module.exports = { getInfo, createOrder, myOrders, list,
  approve: (id) => setStatus(id, 'approved'), reject: (id) => setStatus(id, 'rejected') };
