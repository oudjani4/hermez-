-- ============================================
-- HERMEZ BOT — SUPABASE SCHEMA
-- كل جدول مملوك لـ module واحد فقط. لا تخلط الحقول بين الجداول.
-- ============================================

-- ---------- PROFILE (owned by modules/profile) ----------
create table if not exists users (
  id bigint primary key,              -- telegram user id
  username text,
  first_name text,
  created_at timestamptz default now(),
  last_active_at timestamptz default now(),
  wallet_address text                 -- TON wallet, يُملأ من payments لكن يُخزّن هنا
);

-- ---------- MINING (owned by modules/mining) ----------
create table if not exists mining_state (
  user_id bigint primary key references users(id),
  level int not null default 1,             -- 1..100
  session_started_at timestamptz,           -- بداية نافذة الـ12 ساعة
  session_claimed boolean default false,
  balance numeric not null default 0        -- رصيد العملة داخل التعدين فقط
);

-- ---------- TASKS (owned by modules/tasks) ----------
create table if not exists tasks (
  id bigserial primary key,
  code text unique not null,          -- 'join_channel', 'follow_x', ...
  reward numeric not null,
  active boolean default true
);

create table if not exists task_completions (
  user_id bigint references users(id),
  task_id bigint references tasks(id),
  completed_at timestamptz default now(),
  primary key (user_id, task_id)
);

-- ---------- REFERRALS (owned by modules/referrals) ----------
-- معزول تماماً: عمود واحد بس بجدول users (referred_by) وباقي المنطق هنا
alter table users add column if not exists referred_by bigint references users(id);

create table if not exists referral_rewards (
  id bigserial primary key,
  referrer_id bigint references users(id),
  referred_id bigint references users(id),
  reward numeric not null,
  granted_at timestamptz default now(),
  unique (referred_id)   -- كل مستخدم يعطي مكافأة إحالة مرة وحدة بس، هذا كان مصدر باگ zoro
);

-- ---------- PAYMENTS (owned by modules/payments) ----------
create table if not exists withdrawals (
  id bigserial primary key,
  user_id bigint references users(id),
  amount numeric not null,
  status text not null default 'pending', -- pending | approved | rejected | paid
  requested_at timestamptz default now(),
  processed_at timestamptz
);

create table if not exists reserve_wallet (
  id int primary key default 1,
  balance numeric not null default 0,
  check (id = 1)  -- صف وحيد فقط
);

create table if not exists upgrades (
  level int primary key,
  cost numeric not null,
  mining_rate_bonus numeric not null
);
