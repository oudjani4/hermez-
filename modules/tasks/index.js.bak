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

module.exports = { listActiveTasks, isCompleted, completeTask };
