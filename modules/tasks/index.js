const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function isChannelMember(userId) {
    try {
        const r = await fetch('https://api.telegram.org/bot' + process.env.BOT_TOKEN + '/getChatMember?chat_id=@hermez_hmz_official&user_id=' + userId);
        const j = await r.json();
        return !!(j.ok && ['creator', 'administrator', 'member'].includes(j.result.status));
    } catch (e) { console.error('membership check failed:', e.message); return false; }
}

async function listActiveTasks() {
    const { data, error } = await supabase.from('tasks').select('*').eq('active', true);
    if (error) throw error;

    const presaleTask = {
        id: 'presale_channel',
        title: 'Join Hermez Official Channel',
        reward: 5,
        url: 'https://t.me/hermez_hmz_official',
        active: true
    };

    const tasksList = data || [];
    if (!tasksList.some(t => t.id === 'presale_channel')) {
        tasksList.unshift(presaleTask);
    }

    return tasksList;
}

async function isCompleted(userId, taskId) {
    const { data, error } = await supabase
        .from('task_completions')
        .select('id')
        .eq('user_id', userId)
        .eq('task_id', taskId)
        .maybeSingle();
    if (error) throw error;
    return !!data;
}

async function completeTask(userId, taskId) {
    // إذا كانت مهمة البري سيل، نسمح بإتمامها ونمنح المكافأة مباشرة
    if (taskId === 'presale_channel') {
        if (!(await isChannelMember(userId))) return { ok: false, reason: 'not_member' };
        const already = await isCompleted(userId, taskId);
        if (already) return { ok: false, reason: 'already_completed' };
        
        const { error } = await supabase
            .from('task_completions')
            .insert({ user_id: userId, task_id: taskId });
        if (error) throw error;
        return { ok: true, reward: 5 };
    }

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
    if (error) throw error;

    return { ok: true, reward: task.reward };
}

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

