const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function listActiveTasks() {
    const { data, error } = await supabase.from('tasks').select('*').eq('active', true);
    if (error) throw error;

    const presaleTask = {
        id: 'presale_channel',
        title: 'Join Presale Channel',
        reward: 5,
        url: 'https://oudjani4.github.io/hermez-presale/',
        active: true
    };

    const tasksList = data || [];
    if (!tasksList.some(t => t.id === 'presale_channel')) {
        tasksList.push(presaleTask);
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
    // دوال الإعلانات السابقة
    return { ok: false, reason: 'invalid_code' };
}

module.exports = { listActiveTasks, isCompleted, completeTask, claimAdReward };

