const { supabase } = require('../shared/db');
const mining = require('./mining');

async function fetchAll(table, cols, orderCol, asc) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols)
      .order(orderCol, { ascending: asc }).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

async function listUsers() {
  const users = await fetchAll('users', 'id,username,first_name,created_at,wallet_address,referred_by', 'created_at', true);
  const ms = await fetchAll('mining_state', 'user_id,level,balance', 'user_id', true);
  const st = {}; ms.forEach(m => { st[m.user_id] = m; });
  const num = {}; users.forEach((u, i) => { num[u.id] = i + 1; });
  const refs = {}; users.forEach(u => { if (u.referred_by) refs[u.referred_by] = (refs[u.referred_by] || 0) + 1; });
  return {
    total: users.length,
    users: users.map((u, i) => ({
      n: i + 1, id: u.id, username: u.username, first_name: u.first_name,
      created_at: u.created_at, wallet: u.wallet_address,
      upline: u.referred_by ? (num[u.referred_by] || null) : null,
      upline_id: u.referred_by || null,
      referrals: refs[u.id] || 0,
      level: st[u.id] ? Number(st[u.id].level) : 1,
      balance: st[u.id] ? Number(st[u.id].balance) : 0
    }))
  };
}

async function listWithdrawals() {
  let rows;
  try { rows = await fetchAll('withdrawals', '*', 'created_at', false); }
  catch (e) { rows = await fetchAll('withdrawals', '*', 'id', false); }
  const users = await fetchAll('users', 'id,username,first_name,created_at', 'created_at', true);
  const num = {}, nm = {};
  users.forEach((u, i) => { num[u.id] = i + 1; nm[u.id] = u.username ? '@' + u.username : (u.first_name || ''); });
  return {
    withdrawals: rows.map(w => ({
      id: w.id, user_id: w.user_id, n: num[w.user_id] || null, name: nm[w.user_id] || '',
      amount: Number(w.amount), status: w.status, wallet: w.wallet || null,
      created_at: w.created_at || null, processed_at: w.processed_at || null
    }))
  };
}

function badId(id) { return id === undefined || id === null || id === ''; }

async function approve(id) {
  if (badId(id)) return { ok: false, reason: 'invalid' };
  const { data: w, error } = await supabase.from('withdrawals').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!w) return { ok: false, reason: 'not_found' };
  if (w.status !== 'pending') return { ok: false, reason: 'not_pending' };
  const { data: r, error: rErr } = await supabase.from('reserve_wallet').select('balance').eq('id', 1).single();
  if (rErr) throw rErr;
  if (Number(r.balance) < Number(w.amount)) return { ok: false, reason: 'reserve_insolvent' };
  const { data: up, error: uErr } = await supabase.from('withdrawals')
    .update({ status: 'paid', processed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select();
  if (uErr) throw uErr;
  if (!up || up.length !== 1) return { ok: false, reason: 'not_pending' };
  const { error: e2 } = await supabase.from('reserve_wallet')
    .update({ balance: Number(r.balance) - Number(w.amount) }).eq('id', 1);
  if (e2) throw e2;
  return { ok: true };
}

async function reject(id) {
  if (badId(id)) return { ok: false, reason: 'invalid' };
  const { data: up, error } = await supabase.from('withdrawals')
    .update({ status: 'rejected', processed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select();
  if (error) throw error;
  if (!up || up.length !== 1) return { ok: false, reason: 'not_pending' };
  try {
    await mining.addBalance(up[0].user_id, Number(up[0].amount));
  } catch (e) {
    await supabase.from('withdrawals').update({ status: 'pending', processed_at: null }).eq('id', id);
    throw e;
  }
  return { ok: true };
}

module.exports = { listUsers, listWithdrawals, approve, reject };
