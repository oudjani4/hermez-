// modules/mining/index.js
// هذا الملف يلمس جدول mining_state بس. أي شي يخص المهام/الإحالات/الدفعات
// ما يكتب هنا — يستورد من module الثاني إذا احتاج قيمة منه.

const { supabase } = require('../../shared/db');

const SESSION_HOURS = 24;
const BASE_RATE = 10 / 86400; // 10 HRZ لكل 24 ساعة عند level 1
const MAX_LEVEL = 25;

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
  if (newLevel > MAX_LEVEL) {
    return { ok: false, reason: "max_level_reached" };
  }
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


async function purchaseUpgrade(userId, targetLevel) {
  if (targetLevel > MAX_LEVEL) {
    return { ok: false, reason: "max_level_reached" };
  }

  const { data: upgrade, error: upErr } = await supabase
    .from('upgrades')
    .select('*')
    .eq('level', targetLevel)
    .maybeSingle();
  if (upErr) throw upErr;
  if (!upgrade) {
    return { ok: false, reason: "upgrade_not_found" };
  }

  const state = await getState(userId);

  if (state.level !== targetLevel - 1) {
    return { ok: false, reason: "wrong_level" };
  }

  if (Number(state.balance) < Number(upgrade.cost)) {
    return { ok: false, reason: "insufficient_balance" };
  }

  const newBalance = Number(state.balance) - Number(upgrade.cost);
  const { error: updErr } = await supabase
    .from('mining_state')
    .update({ balance: newBalance, level: targetLevel })
    .eq('user_id', userId);
  if (updErr) throw updErr;

  return { ok: true, newBalance, newLevel: targetLevel };
}


function activeBoosterMultiplier(state) {
  if (state.booster_expires_at && new Date(state.booster_expires_at) > new Date()) {
    return Number(state.booster_multiplier) || 1;
  }
  return 1;
}

async function activateBooster(userId, multiplier, durationHours) {
  const expiresAt = new Date(Date.now() + durationHours * 3600000).toISOString();
  const { error } = await supabase
    .from('mining_state')
    .update({ booster_multiplier: multiplier, booster_expires_at: expiresAt })
    .eq('user_id', userId);
  if (error) throw error;
  return { ok: true, expiresAt };
}

module.exports = { getState, startSession, claimSession, setLevel, rateForLevel, addBalance, purchaseUpgrade, activeBoosterMultiplier, activateBooster };
