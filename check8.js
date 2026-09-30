
function getTonEquivalent(amount) {
    const rate = 500;
    return (amount / rate).toFixed(4);
}
  const API_BASE = 'https://hermez-backend.onrender.com';
  const tg = window.Telegram?.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  const SUPABASE_URL = 'https://kchlvixnacsvfhwqnitn.supabase.co';
  const SUPABASE_PUBLIC_KEY = 'sb_publishable_XiLzEU1cboPi3oTcuDUI5w_LveMLTYj';
  let sb = null;
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY);
  } catch (e) {
    console.error('Supabase client init failed', e);
  }

  async function loadUpgrades() {
    const listEl = document.getElementById('miner-list');
    if (!sb) {
      listEl.innerHTML = '<div class="row-sub" style="text-align:center">Error: Supabase client failed to load.</div>';
      return;
    }
    let data, error;
    try {
      const res = await sb.from('upgrades').select('*').order('level', { ascending: true });
      data = res.data; error = res.error;
    } catch (e) {
      listEl.innerHTML = `<div class="row-sub" style="text-align:center">Error: ${e.message}</div>`;
      return;
    }
    if (error) {
      listEl.innerHTML = `<div class="row-sub" style="text-align:center">Error: ${error.message || JSON.stringify(error)}</div>`;
      return;
    }
    if (!data || data.length === 0) {
      listEl.innerHTML = '<div class="row-sub" style="text-align:center">No levels available yet.</div>';
      return;
    }
    listEl.innerHTML = data.map(u => `
      <div class="card card-flex">
        <div>
          <div class="row-title">Level ${u.level}</div>
          <div class="row-sub">+${u.mining_rate_bonus}% mining rate · Cost: <span class="reward">${u.cost}</span></div>
        </div>
        <button class="action-btn" onclick="requestUpgrade(${u.level})">Upgrade</button>
      </div>
    `).join('');
  }
  async function refreshProfile() {
    try {
      const data = await apiFetch('/api/state');
      if (data && data.mining) {
        document.getElementById('p-balance').textContent = Number(data.mining.balance).toFixed(4);
              document.getElementById('p-balance-ton').textContent = (Number(getTonEquivalent(data.mining.balance))).toFixed(4);
        document.getElementById('p-level').textContent = data.mining.level;
      }
      if (data && data.profile && typeof data.profile.referralCount !== 'undefined') {
        document.getElementById('p-refs').textContent = data.profile.referralCount;
        const refCountEl = document.getElementById('ref-count');
        if (refCountEl) refCountEl.textContent = data.profile.referralCount;
      }
    } catch (e) { alert('refreshProfile error: ' + e.message); }
  }
  refreshProfile();

  async function loadReferralList() {
    try {
      const data = await apiFetch('/api/referrals');
      const el = document.getElementById('ref-list');
      if (!el) return;
      if (!data || !data.ok || !data.referrals || data.referrals.length === 0) {
        el.innerHTML = '<div class="row-sub" style="text-align:center;margin-top:10px">No referrals yet.</div>';
        return;
      }
      el.innerHTML = data.referrals.map(r =>
        '<div class="card card-flex"><div><div class="row-title">' + r.name + '</div><div class="row-sub">ID: ' + r.id + '</div></div><span class="reward">+' + r.reward + '</span></div>'
      ).join('');
    } catch (e) { console.error('loadReferralList', e); }
  }
  loadReferralList();

  loadUpgrades();

  async function loadBoosters() {
    const listEl = document.getElementById('booster-list');
    if (!sb) { listEl.innerHTML = '<div class="row-sub" style="text-align:center">Error: client failed.</div>'; return; }
    let data, error;
    try {
      const res = await sb.from('boosters').select('*').order('multiplier', { ascending: true });
      data = res.data; error = res.error;
    } catch (e) { listEl.innerHTML = '<div class="row-sub" style="text-align:center">Error: ' + e.message + '</div>'; return; }
    if (error) { listEl.innerHTML = '<div class="row-sub" style="text-align:center">Error: ' + (error.message || JSON.stringify(error)) + '</div>'; return; }
    if (!data || data.length === 0) { listEl.innerHTML = '<div class="row-sub" style="text-align:center">No boosters yet.</div>'; return; }
    listEl.innerHTML = data.map(function(b) {
      return '<div class="card card-flex"><div><div class="row-title">' + b.name + '</div><div class="row-sub">×' + b.multiplier + ' mining speed for ' + b.duration_hours + 'h · Cost: <span class="reward">' + b.cost + '</span></div></div><button class="action-btn" onclick="requestBooster(' + b.id + ')">Activate</button></div>';
    }).join('');
  }
  loadBoosters();

  async function requestBooster(id) {
    if (!tonConnectUI.connected) {
      alert('Connect your TON wallet first.');
      tonConnectUI.openModal();
      return;
    }

    try {
      const walletRes = await fetch(API_BASE + '/api/project-wallet');
      const walletData = await walletRes.json();
      if (!walletData.address) {
        alert('Server wallet not configured.');
        return;
      }

      const boosterRow = Array.from(document.querySelectorAll('.card-flex')).find(c => c.querySelector(`button[onclick="requestBooster(${id})"]`));
      const costMatch = boosterRow ? boosterRow.textContent.match(/Cost:\s*([0-9.]+)/) : null;
      const cost = costMatch ? parseFloat(costMatch[1]) : null;
      if (!cost) {
        alert('Could not determine booster cost.');
        return;
      }

      const nanoAmount = Math.ceil(cost * 1e9).toString();

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: walletData.address, amount: nanoAmount }]
      });

      alert('Transaction sent. Verifying...');

      const senderAddress = tonConnectUI.wallet.account.address;

      setTimeout(async () => {
        const result = await apiFetch('/api/booster/activate', {
          method: 'POST',
          body: JSON.stringify({ boosterId: id, senderAddress })
        });
        if (result.ok) {
          alert('Booster activated! x' + result.multiplier + ' mining speed.');
          loadBoosters();
        } else {
          alert('Activation failed: ' + (result.reason || 'unknown_error'));
        }
      }, 15000);

    } catch (e) {
      console.error(e);
      alert('Transaction cancelled or failed.');
    }
  }

  function getInitData() {
    return tg && tg.initData ? tg.initData : '';
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(API_BASE + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-telegram-init-data': getInitData(),
        ...(options.headers || {})
      }
    });
    if (!res.ok) {
      const text = await res.text();
      alert('API ERROR ' + res.status + ' on ' + path + ': ' + text);
    }
    return res.json();
  }

  async function requestUpgrade(level) {
    if (!tonConnectUI.connected) {
      alert('Connect your TON wallet first.');
      tonConnectUI.openModal();
      return;
    }

    try {
      const walletRes = await fetch(API_BASE + '/api/project-wallet');
      const walletData = await walletRes.json();
      if (!walletData.address) {
        alert('Server wallet not configured.');
        return;
      }

      const upgradeRow = Array.from(document.querySelectorAll('.card-flex')).find(c => c.querySelector(`button[onclick="requestUpgrade(${level})"]`));
      const costMatch = upgradeRow ? upgradeRow.textContent.match(/Cost:\s*([0-9.]+)/) : null;
      const cost = costMatch ? parseFloat(costMatch[1]) : null;
      if (!cost) {
        alert('Could not determine upgrade cost.');
        return;
      }

      const nanoAmount = Math.ceil(cost * 1e9).toString();

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{ address: walletData.address, amount: nanoAmount }]
      });

      alert('Transaction sent. Verifying...');

      const senderAddress = tonConnectUI.wallet.account.address;

      setTimeout(async () => {
        const result = await apiFetch('/api/upgrade', {
          method: 'POST',
          body: JSON.stringify({ senderAddress })
        });
        if (result.ok) {
          alert('Upgraded to level ' + result.level + '!');
          loadUpgrades();
        } else {
          alert('Upgrade failed: ' + (result.reason || 'unknown_error'));
        }
      }, 15000);

    } catch (e) {
      console.error(e);
      alert('Transaction cancelled or failed.');
    }
  }

  const screens = document.querySelectorAll('.screen');
  const navButtons = document.querySelectorAll('.bottom-nav button');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.screen;
      screens.forEach(s => s.classList.toggle('active', s.id === 'screen-' + target));
      navButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
  });

  const user = tg?.initDataUnsafe?.user;
  if (user) {
    document.getElementById('profile-name').textContent = user.first_name || 'User';
    document.getElementById('profile-avatar').textContent = (user.first_name || 'H')[0].toUpperCase();
    document.getElementById('profile-id').textContent = 'ID: ' + user.id;
    document.getElementById('ref-link').value = `https://t.me/hermezcoin_bot?start=${user.id}`;
  }

  function copyRefLink() {
    const input = document.getElementById('ref-link');
    input.select();
    document.execCommand('copy');
  }

  const tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
    manifestUrl: 'https://oudjani4.github.io/hermez-/tonconnect-manifest.json'
  });

  function shortAddr(a) { return a ? a.slice(0,4) + '...' + a.slice(-4) : ''; }

  function updateWalletUI(wallet) {
    const status = document.getElementById('wallet-status');
    const btn = document.getElementById('wallet-btn');
    const topStatus = document.getElementById('wallet-status-top');
    if (wallet) {
      const addr = shortAddr(wallet.account.address);
      if (status) status.textContent = addr;
      if (btn) btn.textContent = 'Disconnect';
      if (topStatus) topStatus.textContent = addr + ' · Disconnect';
      document.getElementById('withdraw-wallet').value = wallet.account.address;
      const uid = tg?.initDataUnsafe?.user?.id;
      try { fetch(API_BASE + '/api/wallet', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': getInitData() }, body: JSON.stringify({ address: wallet.account.address }) }).catch(function () {}); } catch (e) {}
    } else {
      if (status) status.textContent = 'Not connected';
      if (btn) btn.textContent = 'Connect';
      if (topStatus) topStatus.textContent = 'Connect Wallet';
      document.getElementById('withdraw-wallet').value = '';
    }
  }

  tonConnectUI.onStatusChange(updateWalletUI);
  updateWalletUI(tonConnectUI.wallet);

  function toggleWallet() {
    if (tonConnectUI.connected) {
      tonConnectUI.disconnect();
    } else {
      tonConnectUI.openModal();
    }
  }

  async function requestWithdraw() {
    const amount = document.getElementById('withdraw-amount').value.trim();
    const wallet = document.getElementById('withdraw-wallet').value.trim();
    const status = document.getElementById('withdraw-status');
    if (!amount || !wallet) {
      status.textContent = 'Enter both an amount and a wallet address.';
      return;
    }
    status.textContent = 'Sending request...'; try { status.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
    try {
      const r = await apiFetch('/api/withdraw', { method: 'POST', body: JSON.stringify({ amount, wallet }) });
      if (r.ok) {
        status.textContent = 'Withdraw request submitted.';
        await loadState();
      } else {
        const m = { below_minimum: 'Minimum withdrawal is 1000 HMZ.', insufficient_balance: 'Not enough holding balance.', invalid_wallet: 'Invalid wallet address.', invalid_amount: 'Invalid amount.', reserve_insolvent: 'Withdrawals are temporarily unavailable.', try_again: 'Try again.' };
        status.textContent = m[r.reason] || 'Could not submit request.';
      }
    } catch (e) {
      status.textContent = 'Could not submit request.';
    }
  }

  let currentMiningState = null;

  function renderMineButton() {
    const btn = document.getElementById('mine-btn');
    const status = document.getElementById('mine-status');
    if (!currentMiningState) return;

    const s = currentMiningState;
    if (s.session_started_at && !s.session_claimed) {
      const startedAt = new Date(s.session_started_at);
      const hoursElapsed = (Date.now() - startedAt.getTime()) / 3600000;
      if (hoursElapsed >= 24) {
        btn.disabled = false;
        btn.textContent = 'Claim Reward';
        btn.dataset.mode = 'claim';
        status.textContent = 'Session complete! Claim your reward.';
      } else {
        btn.disabled = true;
        btn.textContent = 'Mining...';
        btn.dataset.mode = 'active';
        const hoursLeft = (24 - hoursElapsed).toFixed(1);
        status.textContent = '';
      }
    } else {
      btn.disabled = false;
      btn.textContent = 'Start Mining';
      btn.dataset.mode = 'start';
      status.textContent = 'Ready to mine';
    }
  }

  async function loadState() {
    try {
      const data = await apiFetch('/api/state');
      if (data.mining) {
        currentMiningState = data.mining; window.currentRate = Number(data.rate_per_sec) || 0;
        const balEl = document.getElementById('balance-amount');
        if (balEl) balEl.textContent = Number(data.mining.balance || 0).toFixed(4);
        renderMineButton();
      }
    } catch (e) {
      console.error('loadState error:', e);
    }
  }
  loadState();
  setInterval(loadState, 60000);

  document.getElementById('mine-btn').addEventListener('click', async () => {
    const btn = document.getElementById('mine-btn');
    const status = document.getElementById('mine-status');
    const mode = btn.dataset.mode || 'start';

    btn.disabled = true;

    if (mode === 'start') {
      status.textContent = 'Starting...';
      const result = await apiFetch('/api/mine/start', { method: 'POST' });
      if (result.ok) {
        await loadState();
      } else {
        status.textContent = result.reason || 'Could not start mining.';
        btn.disabled = false;
      }
    } else if (mode === 'claim') {
      status.textContent = 'Claiming...';
      const result = await apiFetch('/api/mine/claim', { method: 'POST' });
      if (result.ok) {
        status.textContent = 'Claimed ' + result.earned.toFixed(4) + ' HMZ!'; playCoinSound();
        await loadState();
      } else {
        status.textContent = result.reason || 'Could not claim.';
        btn.disabled = false;
      }
    }
  });

  function startMineCounter() {
    setInterval(() => {
      const old = document.getElementById('mine-live');
      if (old) old.remove();
      const old2 = document.getElementById('holding-balance');
      if (old2) old2.remove();
      const s = currentMiningState;
      const balEl = document.getElementById('balance-amount');
      if (!balEl || !s) return;
      const hold = document.getElementById('profile-holding');
      if (hold) hold.textContent = Number(s.balance || 0).toFixed(4) + ' HMZ';
      if (!s.session_started_at || s.session_claimed) return;
      const elapsed = Math.min((Date.now() - new Date(s.session_started_at).getTime()) / 1000, 24 * 3600);
      balEl.textContent = (Number(s.balance || 0) + elapsed * (window.currentRate || 0)).toFixed(6);
    }, 1000);
  }
  startMineCounter();
  function setupHarvestButton() {
    const mineBtn = document.getElementById('mine-btn');
    const hb = document.createElement('button');
    hb.id = 'harvest-btn';
    hb.className = mineBtn.className;
    hb.style.cssText = 'display:none;margin-top:10px';
    hb.textContent = 'Claim';
    mineBtn.parentNode.insertBefore(hb, mineBtn.nextSibling);
    setInterval(() => {
      const s = currentMiningState;
      const active = s && s.session_started_at && !s.session_claimed &&
        (Date.now() - new Date(s.session_started_at).getTime()) < 24 * 3600 * 1000;
      if (hb.dataset.busy !== '1') hb.style.display = active ? 'block' : 'none';
    }, 1000);
    hb.addEventListener('click', async () => {
      hb.dataset.busy = '1';
      hb.disabled = true;
      const status = document.getElementById('mine-status');
      const r = await apiFetch('/api/mine/harvest', { method: 'POST' });
      await loadState();
      if (r.ok) { status.textContent = 'Claimed ' + r.earned.toFixed(4) + ' HMZ!'; playCoinSound(); }
      else status.textContent = r.reason === 'too_soon' ? 'Mine a little longer.' : 'Try again.';
      hb.disabled = false;
      hb.dataset.busy = '0';
    });
  }
  setupHarvestButton();
  setInterval(() => {
    const m = document.getElementById('mine-btn');
    if (m) m.style.display = m.dataset.mode === 'active' ? 'none' : '';
  }, 500);


  let _audioCtx = null;
  function soundOn() { try { return localStorage.getItem('hermez_sound') !== 'off'; } catch (e) { return true; } }
  function unlockAudio() {
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (_audioCtx.state === 'suspended') _audioCtx.resume();
    } catch (e) {}
  }
  document.addEventListener('click', unlockAudio);
  document.addEventListener('touchstart', unlockAudio);
  const _cashAudio = new Audio('cash.mp3');
  _cashAudio.preload = 'auto';
  function playCoinSound() {
    if (!soundOn()) return;
    try {
      _cashAudio.currentTime = 0;
      const p = _cashAudio.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }
  function flyCoins(fromEl) {
    const r = fromEl.getBoundingClientRect();
    const sx = r.left + r.width / 2, sy = r.top + r.height / 2;
    const bal = document.getElementById('balance-amount');
    const br = bal ? bal.getBoundingClientRect() : null;
    const tx = br && br.width > 0 ? br.left + br.width / 2 : window.innerWidth / 2;
    const ty = br && br.width > 0 ? br.top + br.height / 2 : 90;
    for (let i = 0; i < 10; i++) {
      const c = document.createElement('div');
      c.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:22px;height:22px;border-radius:50%;left:' + (sx - 11) + 'px;top:' + (sy - 11) + 'px;background:radial-gradient(circle at 30% 30%,#fff3b0,#e6b800 60%,#a67c00);box-shadow:0 0 8px rgba(255,200,0,.8);border:1px solid #7a5a00';
      document.body.appendChild(c);
      const jx = (Math.random() - 0.5) * 60, jy = (Math.random() - 0.5) * 40;
      const a = c.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: 'translate(' + jx + 'px,' + (jy - 40) + 'px) scale(1.1)', opacity: 1, offset: 0.25 },
        { transform: 'translate(' + (tx - sx) + 'px,' + (ty - sy) + 'px) scale(0.4)', opacity: 0.3 }
      ], { duration: 900 + Math.random() * 300, delay: i * 70, easing: 'ease-in', fill: 'both' });
      a.onfinish = function () { c.remove(); };
    }
  }
  const _st = document.getElementById('sound-toggle');
  function paintSound() { if (_st) _st.textContent = soundOn() ? 'Sound: ON 🔊' : 'Sound: OFF 🔇'; }
  if (_st) _st.addEventListener('click', function () {
    try { localStorage.setItem('hermez_sound', soundOn() ? 'off' : 'on'); } catch (e) {}
    paintSound();
    if (soundOn()) playCoinSound();
  });
  paintSound();

  const TASK_COOLDOWN_MS = 12 * 60 * 60 * 1000;
  const TASK_CODES = ['monetag_view_1','monetag_view_2','monetag_view_3','monetag_view_4'];

  function refreshTaskButtons() {
    TASK_CODES.forEach((code, idx) => {
      const btn = document.getElementById('task-btn-' + (idx+1));
      const last = parseInt(localStorage.getItem('hermez_task_' + code) || '0', 10);
      const remaining = (last + TASK_COOLDOWN_MS) - Date.now();
      if (remaining > 0) {
        btn.disabled = true;
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        btn.textContent = h + 'h ' + m + 'm';
      } else {
        btn.disabled = false;
        btn.textContent = 'Watch';
      }
    });
  }
  refreshTaskButtons();
  setInterval(refreshTaskButtons, 60000);

  function refreshJoinButton() {
    const btn = document.getElementById('task-btn-channel');
    if (!btn) return;
    const last = parseInt(localStorage.getItem('hermez_task_join_channel') || '0', 10);
    const remaining = (last + TASK_COOLDOWN_MS) - Date.now();
    if (remaining > 0) {
      btn.disabled = true;
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      btn.textContent = h + 'h ' + m + 'm';
    } else if (btn.dataset.mode !== 'claim') {
      btn.disabled = false;
      btn.textContent = 'Join';
    }
  }
  refreshJoinButton();
  setInterval(refreshJoinButton, 60000);

  function joinChannelTask(btnEl) {
    const status = document.getElementById('task-status');
    if (btnEl.dataset.mode !== 'claim') {
      if (window.Telegram && Telegram.WebApp && Telegram.WebApp.openTelegramLink) {
        Telegram.WebApp.openTelegramLink('https://t.me/hermezcoin');
      } else {
        window.open('https://t.me/hermezcoin', '_blank');
      }
      btnEl.dataset.mode = 'claim';
      btnEl.textContent = 'Claim';
      status.textContent = 'Join the channel, then come back and press Claim.';
      return;
    }
    btnEl.disabled = true;
    status.textContent = 'Claiming reward...';
    (async () => {
      try {
        const r = await apiFetch('/api/ad-reward', {
          method: 'POST',
          body: JSON.stringify({ code: 'join_channel' })
        });
        if (r.ok) {
          status.textContent = 'Reward added: ' + r.reward + ' HMZ';
          if (typeof playCoinSound === 'function') playCoinSound();
          if (typeof flyCoins === 'function') flyCoins(btnEl);
          localStorage.setItem('hermez_task_join_channel', String(Date.now()));
          btnEl.dataset.mode = '';
          refreshJoinButton();
        } else {
          if (r.reason === 'cooldown') {
            localStorage.setItem('hermez_task_join_channel', String(Date.now()));
            btnEl.dataset.mode = '';
            status.textContent = 'Already claimed. Come back later.';
            refreshJoinButton();
          } else {
            status.textContent = r.reason || 'Could not claim reward.';
            btnEl.disabled = false;
          }
        }
      } catch (err) {
        console.error('join channel task error:', err);
        status.textContent = 'Error claiming reward. Try again.';
        btnEl.disabled = false;
      }
    })();
  }

  function watchAd(code, btnEl) {
    const status = document.getElementById('task-status');
    status.textContent = 'Loading ad...';
    if (typeof window['show_11813680'] !== 'function') {
      status.textContent = 'Could not load the ad, try again later.';
      return;
    }
    window['show_11813680']().then(async () => {
      status.textContent = 'Recording your reward...';
      btnEl.disabled = true;
      try {
        const r = await apiFetch('/api/ad-reward', {
          method: 'POST',
          body: JSON.stringify({ code })
        });
        if (r.ok) {
          localStorage.setItem('hermez_task_' + code, String(Date.now()));
          btnEl.textContent = 'Done ✅';
          status.textContent = 'Reward added: ' + r.reward + ' HMZ'; playCoinSound(); flyCoins(btnEl);
          await loadState();
        } else {
          btnEl.disabled = false;
          status.textContent = r.reason === 'cooldown' ? 'Come back later for this task.' : 'Could not record reward.';
        }
        refreshTaskButtons();
      } catch (e) {
        btnEl.disabled = false;
        status.textContent = 'Could not record reward.';
      }
    }).catch(() => {
      status.textContent = 'Ad was not completed.';
    });
  }
