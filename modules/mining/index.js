// modules/mining/index.js
// هذا الملف يلمس جدول mining_state بس. أي شي يخص المهام/الإحالات/الدفعات
// ما يكتب هنا — يستورد من module الثاني إذا احتاج قيمة منه.

const { supabase } = require('../../shared/db');

const SESSION_HOURS = 24;
const BASE_RATE = 10 / 86400; // 10 HRZ لكل 24 ساعة عند level 1

function rateForLevel(level) {
  return BASE_RATE * (1 + (level - 1) * 0.05);
}

async function getState(userId) {
  const { data, error } = await supabase
    .from('mining_state')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    const { data: created, error: insErr } = await supabase
      .from('mining_state')
      .insert({ user_id: userId, level: 1, balance: 0 })
      .select()
      .single();
    if (insErr) throw insErr;
    return created;
  }
  return data;
}

async function startSession(userId) {
  const state = await getState(userId);

  if (state.session_started_at && !state.session_claimed) {
    const startedAt = new Date(state.session_started_at);
    const hoursElapsed = (Date.now() - startedAt.getTime()) / 3600000;
    if (hoursElapsed < SESSION_HOURS) {
      return { ok: false, reason: 'session_active', hoursRemaining: SESSION_HOURS - hoursElapsed };
    }
  }

  const { error } = await supabase
    .from('mining_state')
    .update({ session_started_at: new Date().toISOString(), session_claimed: false })
    .eq('user_id', userId);
  if (error) throw error;

  return { ok: true };
}

async function claimSession(userId) {
  const state = await getState(userId);

  if (!state.session_started_at || state.session_claimed) {
    return { ok: false, reason: 'no_active_session' };
  }

  const startedAt = new Date(state.session_started_at);
  const hoursElapsed = (Date.now() - startedAt.getTime()) / 3600000;
  const cappedHours = Math.min(hoursElapsed, SESSION_HOURS);
  const earned = cappedHours * 3600 * rateForLevel(state.level);

  const { error } = await supabase
    .from('mining_state')
    .update({
      balance: state.balance + earned,
      session_claimed: true,
    })
    .eq('user_id', userId);
  if (error) throw error;

  return { ok: true, earned };
}

// upgrades تستدعي هذي الدالة بس، مو توصل لجدول mining_state مباشرة
async function setLevel(userId, newLevel) {
  const { error } = await supabase
    .from('mining_state')
    .update({ level: newLevel })
    .eq('user_id', userId);
  if (error) throw error;
  return { ok: true };
}


async function addBalance(userId, amount) {
  const { data: state, error: getErr } = await supabase
    .from('mining_state')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();
  if (getErr) throw getErr;

  if (!state) {
    const { error: insErr } = await supabase
      .from('mining_state')
      .insert({ user_id: userId, balance: amount });
    if (insErr) throw insErr;
    return amount;
  }

  const newBalance = Number(state.balance) + amount;
  const { error: updErr } = await supabase
    .from('mining_state')
    .update({ balance: newBalance })
    .eq('user_id', userId);
  if (updErr) throw updErr;
  return newBalance;
}

module.exports = { getState, startSession, claimSession, setLevel, rateForLevel, addBalance };
