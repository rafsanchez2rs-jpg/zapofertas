const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getSession } = require('../services/waSessions');
const { getDb } = require('../db/database');

const router = express.Router();

// GET /api/whatsapp/status
router.get('/status', authenticate, async (req, res) => {
  const s = getSession(req.user.id).getStatus();
  res.json({ status: s.status === 'ready' ? 'ready' : 'disconnected', phone: s.phone });
});

// GET /api/whatsapp/qrcode — retorna QR da sessão do usuário logado
router.get('/qrcode', authenticate, async (req, res) => {
  const wa = getSession(req.user.id);

  if (wa.status === 'ready') {
    return res.json({ connected: true });
  }

  if (wa.qrBase64) {
    return res.json({ qr: wa.qrBase64 });
  }

  if (wa.status === 'disconnected' && !wa.isInitializing) {
    console.log(`[QR] Iniciando Baileys para user ${req.user.id}...`);
    wa.initialize().catch((err) =>
      console.error(`[WA] user ${req.user.id} init error:`, err.message)
    );
  }

  res.status(202).json({ message: 'Aguardando QR Code' });
});

// POST /api/whatsapp/connect
router.post('/connect', authenticate, async (req, res) => {
  getSession(req.user.id).initialize().catch((err) =>
    console.error(`[WA Route] user ${req.user.id} init error:`, err.message)
  );
  res.json({ message: 'Iniciando conexão WhatsApp. Aguarde o QR Code.' });
});

// POST /api/whatsapp/disconnect
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    await getSession(req.user.id).logout();
    res.json({ message: 'WhatsApp desconectado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/groups
router.get('/groups', authenticate, async (req, res) => {
  try {
    const groups = await getSession(req.user.id).getGroups();
    res.json({ groups });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/whatsapp/settings
router.get('/settings', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    let { rows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.id]);
    if (!rows[0]) {
      await pool.query('INSERT INTO settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [req.user.id]);
      const result = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.id]);
      rows = result.rows;
    }
    res.json({ settings: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/whatsapp/settings
router.put('/settings', authenticate, async (req, res) => {
  try {
    const { delay_between_sends, send_image, auto_reconnect, coupon_default_link } = req.body;
    const pool = getDb();

    await pool.query(`
      UPDATE settings SET
        delay_between_sends = COALESCE($1, delay_between_sends),
        send_image = COALESCE($2, send_image),
        auto_reconnect = COALESCE($3, auto_reconnect),
        coupon_default_link = COALESCE($4, coupon_default_link),
        updated_at = NOW()
      WHERE user_id = $5
    `, [
      delay_between_sends !== undefined ? Number(delay_between_sends) : null,
      send_image !== undefined ? (send_image ? 1 : 0) : null,
      auto_reconnect !== undefined ? (auto_reconnect ? 1 : 0) : null,
      coupon_default_link !== undefined ? (coupon_default_link || null) : null,
      req.user.id,
    ]);

    const { rows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.id]);
    res.json({ settings: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
