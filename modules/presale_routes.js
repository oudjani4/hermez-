const P = require('./presale_orders');

module.exports = function (app, { auth, adminAuth, adminRoute }) {
  const fail = (res, e) => { console.error(e); res.status(500).json({ error: 'server_error' }); };

  app.post('/api/presale/status', auth, async (req, res) => {
    try { res.json({ ok: true, ...(await P.getInfo()) }); } catch (e) { fail(res, e); }
  });

  app.post('/api/presale/mine', auth, async (req, res) => {
    try { res.json({ ok: true, orders: await P.myOrders(req.telegramUser.id) }); } catch (e) { fail(res, e); }
  });

  app.post('/api/presale/order', auth, async (req, res) => {
    try {
      const r = await P.createOrder(req.telegramUser.id, Number(req.body.pack), req.body.wallet);
      if (r.ok) {
        try {
          const tok = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
          if (tok && process.env.ADMIN_CHAT_ID) {
            await fetch('https://api.telegram.org/bot' + tok + '/sendMessage', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: process.env.ADMIN_CHAT_ID,
                text: 'طلب presale جديد\nUser: ' + r.order.user_id + '\n' + r.order.hmz_amount + ' HMZ = ' + r.order.pay_amount + ' TON\nMemo: ' + r.order.memo + '\nWallet: ' + r.order.wallet })
            });
          }
        } catch (e) { console.error('presale notify failed'); }
      }
      res.json(r);
    } catch (e) { fail(res, e); }
  });

  app.post('/api/admin/presale/orders', adminAuth, adminRoute(() => P.list()));
  app.post('/api/admin/presale/approve', adminAuth, adminRoute((req) => P.approve(req.body.id)));
  app.post('/api/admin/presale/reject', adminAuth, adminRoute((req) => P.reject(req.body.id)));
};
