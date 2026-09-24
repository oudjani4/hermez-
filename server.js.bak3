require('dotenv').config();
const express = require('express');
const path = require('path');
const { verifyInitData } = require('./shared/telegram/verify');

const profile = require('./modules/profile');
const mining = require('./modules/mining');
const tasks = require('./modules/tasks');
const referrals = require('./modules/referrals');
const payments = require('./modules/payments');

const app = express();
app.use((req, res, next) => {
  const allowed = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim());
  const o = req.get('origin');
  if (o && allowed.includes(o)) {
    res.set({
      'Access-Control-Allow-Origin': o,
      'Access-Control-Allow-Headers': 'Content-Type,x-telegram-init-data',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      Vary: 'Origin',
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
  }
  next();
});
const upgrades = require("./modules/upgrades");
app.use("/api/upgrades", upgrades.router);
upgrades.start();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const initData = req.headers['x-telegram-init-data'];
  if (!initData) return res.status(401).json({ error: 'no_init_data' });
  const user = verifyInitData(initData, process.env.BOT_TOKEN);
  if (!user) return res.status(401).json({ error: 'invalid_init_data' });
  req.telegramUser = user;
  next();
}

app.get('/api/state', auth, async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    await profile.ensureUser(userId, { username: req.telegramUser.username, firstName: req.telegramUser.first_name });
    const p = await profile.getFullProfile(userId);
    const m = await mining.getState(userId);
    res.json({ profile: p, mining: m });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/mine/start', auth, async (req, res) => {
  try {
    const result = await mining.startSession(req.telegramUser.id);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/mine/claim', auth, async (req, res) => {
  try {
    const result = await mining.claimSession(req.telegramUser.id);
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/tasks', auth, async (req, res) => {
  try {
    const list = await tasks.listActiveTasks();
    const withStatus = await Promise.all(list.map(async t => ({
      ...t,
      completed: await tasks.isCompleted(req.telegramUser.id, t.id)
    })));
    res.json(withStatus);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/ad-reward', auth, async (req, res) => {
  try {
    const result = await tasks.claimAdReward(req.telegramUser.id, req.body.code);
    if (!result.ok) return res.json(result);
    const balance = await mining.addBalance(req.telegramUser.id, result.reward);
    res.json({ ok: true, reward: result.reward, balance });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/tasks/complete', auth, async (req, res) => {
  try {
    const { taskId } = req.body;
    const result = await tasks.completeTask(req.telegramUser.id, taskId);
    if (result.ok) {
      const newBalance = await mining.addBalance(req.telegramUser.id, result.reward);
      return res.json({ ok: true, reward: result.reward, balance: newBalance });
    }
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/referrals', auth, async (req, res) => {
  try {
    const stats = await referrals.getReferralStats(req.telegramUser.id);
    res.json(stats);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/api/upgrade-cost', auth, async (req, res) => {
  try {
    const m = await mining.getState(req.telegramUser.id);
    const nextLevel = m.level + 1;
    const cost = await payments.getUpgradeCost(nextLevel);
    res.json({ level: m.level, nextLevel, cost });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get("/api/project-wallet", (req, res) => {
  res.json({ address: process.env.PROJECT_TON_WALLET });
});

app.post("/api/upgrade", auth, async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const { senderAddress } = req.body;
    if (!senderAddress) return res.status(400).json({ error: "missing_sender_address" });

    const m = await mining.getState(userId);
    const targetLevel = m.level + 1;
    const upgrade = await payments.getUpgradeCost(targetLevel);

    const found = await payments.findMatchingTransaction(senderAddress, upgrade.cost);
    if (!found.ok) {
      return res.json(found);
    }

    await payments.markTxUsed(found.hash, userId, `upgrade_level_${targetLevel}`);
    const setResult = await mining.setLevel(userId, targetLevel);
    if (!setResult.ok) {
      return res.json(setResult);
    }

    res.json({ ok: true, level: targetLevel, cost: upgrade.cost, bonus: upgrade.mining_rate_bonus });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/wallet", auth, async (req, res) => {
  try {
    const { address } = req.body;
    if (typeof address !== "string" || !/^(?:[EU]Q[A-Za-z0-9_-]{46}|-?\d:[0-9a-fA-F]{64})$/.test(address)) return res.status(400).json({ error: "invalid_address" });
    await profile.setWallet(req.telegramUser.id, address);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

app.get("/api/boosters", auth, async (req, res) => {
  try {
    const { supabase } = require('./shared/db');
    const { data, error } = await supabase.from('boosters').select('*').order('id', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});

app.post("/api/booster/activate", auth, async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const { boosterId, senderAddress } = req.body;
    if (!boosterId || !senderAddress) return res.status(400).json({ error: "missing_params" });

    const { supabase } = require('./shared/db');
    const { data: booster, error: bErr } = await supabase.from('boosters').select('*').eq('id', boosterId).single();
    if (bErr || !booster) return res.status(400).json({ error: "booster_not_found" });

    const found = await payments.findMatchingTransaction(senderAddress, booster.cost);
    if (!found.ok) {
      return res.json(found);
    }

    await payments.markTxUsed(found.hash, userId, `booster_${boosterId}`);
    const result = await mining.activateBooster(userId, booster.multiplier, booster.duration_hours);

    res.json({ ok: true, ...result, multiplier: booster.multiplier });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "server_error" });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`hermez mini app server running on port ${PORT}`);
});
