// shared/db/index.js
// نقطة الاتصال الوحيدة بـ Supabase. أي module يحتاج قاعدة بيانات يستورد من هنا.
// ممنوع أي module يسوي createClient خاص فيه.

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // service role, يشتغل من السيرفر بس

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY ناقصين في .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };
