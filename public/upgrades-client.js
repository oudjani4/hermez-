// public/upgrades-client.js — include after telegram-web-app.js
// Usage: HermezUpgrades.render(document.getElementById('upgrades'))

const HermezUpgrades = (() => {
  const TG = window.Telegram.WebApp;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function api(p, body) {
    const r = await fetch('https://hermez-backend.onrender.com/api/upgrades' + p, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'x-init-data': TG.initData },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'request_failed');
    return j;
  }

  async function buy(type, id) {
    const o = await api('/order', { type, id });
    const link = `https://app.tonkeeper.com/transfer/${o.address}?amount=${o.amountNano}&text=${encodeURIComponent(o.comment)}`;
    TG.openLink(link);
    for (let i = 0; i < 120; i++) { // ~10 min
      await sleep(5000);
      const v = await api('/verify', { orderId: o.orderId });
      if (v.status === 'paid') return true;
      if (v.status !== 'pending') throw new Error(v.status);
    }
    throw new Error('timeout');
  }

  async function render(el) {
    const [cat, me] = await Promise.all([api('/catalog'), api('/me')]);
    const next = cat.levels.find((l) => l.level === me.level + 1);
    const boostLeft = Math.max(0, me.boostUntil - Date.now());
    el.innerHTML = `
      <p>Level ${me.level} · x${me.multiplier}${boostLeft ? ` · boost ${Math.ceil(boostLeft / 60000)}m` : ''}</p>
      ${next ? `<button data-t="level">Upgrade to L${next.level} — ${next.price} TON</button>` : '<p>Max level</p>'}
      ${cat.boosters.map((b) => `<button data-t="boost" data-id="${b.id}">x${b.mult} · ${b.hours}h — ${b.price} TON</button>`).join('')}`;
    el.querySelectorAll('button').forEach((btn) => {
      btn.onclick = async () => {
        btn.disabled = true;
        try { await buy(btn.dataset.t, btn.dataset.id); TG.showAlert('Payment confirmed ✅'); }
        catch (e) { TG.showAlert('Not completed: ' + e.message); }
        render(el);
      };
    });
  }

  return { api, buy, render };
})();
