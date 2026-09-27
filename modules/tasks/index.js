// modules/tasks/index.js
// يلمس جدولي tasks و task_completions بس.

const { supabase } = require('../../shared/db');

async function listActiveTasks() {
  const { data, error } = await supabase.from('tasks').select('*').eq('active', true);
  if (error) throw error;
  return data;
}

async function isCompleted(userId, taskId) {
  const { data, error } = await supabase
    .from('task_completions')
    .select('user_id')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// يرجع reward بس، ما يعدل رصيد المستخدم هنا — الاستدعاء الخارجي (bot.js)
// هو اللي يضيف الـ reward لرصيد التعدين عن طريق mining module
async function completeTask(userId, taskId) {
  const already = await isCompleted(userId, taskId);
  if (already) return { ok: false, reason: 'already_completed' };

  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  if (taskErr) throw taskErr;
  if (!task.active) return { ok: false, reason: 'task_inactive' };

  const { error } = await supabase
    .from('task_completions')
    .insert({ user_id: userId, task_id: taskId });
  if (error) throw error; // unique constraint يمنع تكرار حتى لو صار race condition

  return { ok: true, reward: task.reward };
}


const AD_REWARDS = { monetag_view_1: 5, monetag_view_2: 5, monetag_view_3: 5, monetag_view_4: 5, join_channel: 5 };
const AD_COOLDOWN_MS = 12 * 60 * 60 * 1000;

async function claimAdReward(userId, code) {
  const reward = AD_REWARDS[code];
  if (!reward) return { ok: false, reason: 'invalid_code' };

  const { error } = await supabase.from('ad_claims').insert({ user_id: userId, code });
  if (!error) return { ok: true, reward };
  if (error.code !== '23505') throw error;

  const cutoff = new Date(Date.now() - AD_COOLDOWN_MS).toISOString();
  const { data, error: upErr } = await supabase.from('ad_claims')
    .update({ claimed_at: new Date().toISOString() })
    .eq('user_id', userId).eq('code', code).lt('claimed_at', cutoff)
    .select();
  if (upErr) throw upErr;
  if (data && data.length) return { ok: true, reward };
  return { ok: false, reason: 'cooldown' };
}

module.exports = { listActiveTasks, isCompleted, completeTask, claimAdReward };
