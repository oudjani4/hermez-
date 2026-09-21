// modules/upgrades.js — Hermez: level upgrades + boosters paid in real TON
// Requires Node 18+ and Express. Env: TON_TREASURY_ADDRESS, BOT_TOKEN, TONCENTER_API_KEY (optional)

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ---------- CONFIG (edit prices/rates here) ----------
const CFG = {
  treasury: process.env.TON_TREASURY_ADDRESS,
  toncenterKey: process.env.TONCENTER_API_KEY || '',
  botToken: process.env.BOT_TOKEN,
  orderTtlMs: 30 * 60 * 1000,
  pollMs: 15000,
  maxPendingPerUser: 5,
  dataFile: path.join(__dirname, '..', 'data', 'upgrades.json'),
};

// rate = mining multiplier at that level; price in TON (string)
const LEVELS = [
  { level: 1, rate: 1, price: '0' },
  { level: 2, rate: 1.5, price: '0.5' },
  { level: 3, rate: 2, price: '1' },
  { level: 4, rate: 3, price: '2' },
  { level: 5, rate: 5, price: '4' },
];

const BOOSTERS = [
  { id: 'x2_1h', mult: 2, hours: 1, price: '0.2' },
  { id: 'x2_6h', mult: 2, hours: 6, price: '1' },
  { id: 'x3_24h', mult: 3, hours: 24, price: '3' },
];

// ---------- helpers ----------
function toNano(s) {
  const [i, f = ''] = String(s).split('.');
  return BigInt(i) * 1000000000n + BigInt((f + '000000000').slice(0, 9));
}

let S = { users: {}, orders: {}, txs: {} };
try { S = JSON.parse(fs.readFileSync(CFG.dataFile, 'utf8')); } catch (_) {}

function save() {
  fs.mkdirSync(path.dirname(CFG.dataFile), { recursive: true });
  const tmp = CFG.dataFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(S));
  fs.renameSync(tmp, CFG.dataFile);
}

function getUser(id) {
  if (!S.users[id]) S.users[id] = { level: 1, boostUntil: 0, boostMult: 1, boostId: null };
  return S.users[id];
}

// Validate Telegram Mini App initData (HMAC) -> returns userId or null
function verifyInitData(initData) {
  if (!initData || !CFG.botToken) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  p.delete('hash');
  if (!hash || hash.length !== 64) return null;
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(CFG.botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date')) > 86400) return null;
  try { return String(JSON.parse(p.get('user')).id); } catch (_) { return null; }
}

function auth(req, res, next) {
  const uid = verifyInitData(req.get('x-init-data'));
  if (!uid) return res.status(401).json({ error: 'unauthorized' });
  req.uid = uid;
  next();
}

// ---------- game logic: call this from your mining code ----------
function effectiveMultiplier(userId) {
  const u = getUser(userId);
  const lv = LEVELS.find((l) => l.level === u.level) || LEVELS[0];
  const boostOn = u.boostUntil > Date.now();
  return lv.rate * (boostOn ? u.boostMult : 1);
}

function applyOrder(order) {
  const u = getUser(order.uid);
  if (order.type === 'level') {
    if (u.level >= order.target) { order.status = 'paid_unused'; return; } // duplicate payment -> manual refund
    u.level = order.target;
  } else {
    const b = BOOSTERS.find((x) => x.id === order.itemId);
    const now = Date.now();
    const base = u.boostId === b.id && u.boostUntil > now ? u.boostUntil : now; // same booster extends
    u.boostId = b.id;
    u.boostMult = b.mult;
    u.boostUntil = base + b.hours * 3600 * 1000;
  }
  order.status = 'paid';
}

// ---------- TON payment verification ----------
async function fetchIncoming() {
  const url = `https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(CFG.treasury)}&limit=50`;
  const r = await fetch(url, { headers: CFG.toncenterKey ? { 'X-API-Key': CFG.toncenterKey } : {} });
  const j = await r.json();
  if (!j.ok) throw new Error('toncenter: ' + (j.error || 'failed'));
  return j.result;
}

async function scan() {
  const txs = await fetchIncoming();
  for (const t of txs) {
    const hash = t.transaction_id && t.transaction_id.hash;
    const m = t.in_msg;
    if (!hash || !m || !m.source || !m.message || S.txs[hash]) continue;
    const match = /^hz_([0-9a-f]{12})$/.exec(String(m.message).trim());
    if (!match) continue;
    const order = S.orders[match[1]];
    if (!order || order.status !== 'pending') continue;
    if (BigInt(m.value) < BigInt(order.nano)) continue; // underpaid
    const ts = t.utime * 1000;
    S.txs[hash] = order.id; // mark tx used (synchronous, no race)
    order.txHash = hash;
    if (ts < order.createdAt || ts > order.expiresAt) { order.status = 'late_payment'; continue; }
    applyOrder(order);
  }
  save();
}

// ---------- API ----------
const router = express.Router();
router.use((req, res, next) => {
  const o = req.get('origin');
  const allowed = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim());
  if (o && allowed.includes(o)) {
    res.set({
      'Access-Control-Allow-Origin': o,
      'Access-Control-Allow-Headers': 'Content-Type,x-init-data',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      Vary: 'Origin',
    });
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
router.use(express.json());

router.get('/catalog', (req, res) => res.json({ levels: LEVELS, boosters: BOOSTERS }));

router.get('/me', auth, (req, res) => {
  const u = getUser(req.uid);
  res.json({ ...u, multiplier: effectiveMultiplier(req.uid) });
});

router.post('/order', auth, (req, res) => {
  const { type, id } = req.body || {};
  const u = getUser(req.uid);
  const now = Date.now();
  const pending = Object.values(S.orders).filter((o) => o.uid === req.uid && o.status === 'pending' && o.expiresAt > now);
  if (pending.length >= CFG.maxPendingPerUser) return res.status(429).json({ error: 'too_many_pending' });

  let price, target = null, itemId = null;
  if (type === 'level') {
    const next = LEVELS.find((l) => l.level === u.level + 1);
    if (!next) return res.status(400).json({ error: 'max_level' });
    price = next.price; target = next.level;
  } else if (type === 'boost') {
    const b = BOOSTERS.find((x) => x.id === id);
    if (!b) return res.status(400).json({ error: 'bad_item' });
    price = b.price; itemId = b.id;
  } else return res.status(400).json({ error: 'bad_type' });

  const oid = crypto.randomBytes(6).toString('hex');
  const order = {
    id: oid, uid: req.uid, type, target, itemId, price,
    nano: toNano(price).toString(), status: 'pending',
    createdAt: now, expiresAt: now + CFG.orderTtlMs,
  };
  S.orders[oid] = order;
  save();
  res.json({
    orderId: oid, address: CFG.treasury, amountNano: order.nano,
    amountTon: price, comment: 'hz_' + oid, expiresAt: order.expiresAt,
  });
});

router.post('/verify', auth, async (req, res) => {
  const order = S.orders[(req.body || {}).orderId];
  if (!order || order.uid !== req.uid) return res.status(404).json({ error: 'not_found' });
  try { if (order.status === 'pending') await scan(); } catch (e) { console.error('[upgrades]', e.message); }
  if (order.status === 'pending' && Date.now() > order.expiresAt) { order.status = 'expired'; save(); }
  res.json({ status: order.status });
});

function start() {
  if (!CFG.treasury) { console.error("[upgrades] TON_TREASURY_ADDRESS missing, payments disabled"); return; }
  setInterval(() => scan().catch((e) => console.error('[upgrades]', e.message)), CFG.pollMs);
}

module.exports = { router, start, effectiveMultiplier, getUser };
