const express = require('express');
const axios = require('axios');
const QRCode = require('qrcode');
const { authenticate } = require('../middleware/auth');
const waManager = require('../services/whatsappClient');
const { getDb } = require('../db/database');

const router = express.Router();

const EVO_URL  = process.env.EVOLUTION_API_URL  || 'http://localhost:8080';
const EVO_KEY  = process.env.EVOLUTION_API_KEY  || 'zapofertas123';
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'zapofertas';

const evo = axios.create({
  baseURL: EVO_URL,
  headers: { apikey: EVO_KEY },
  timeout: 60000,
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET /api/whatsapp/status
router.get('/status', authenticate, async (req, res) => {
  try {
    const { data } = await evo.get('/instance/fetchInstances');
    const list = Array.isArray(data) ? data : [];
    const inst = list.find(
      (i) => (i.name || i.instanceName || i.instance?.instanceName) === INSTANCE
    );
    if (!inst) return res.json({ status: 'disconnected' });

    const stateRes = await evo.get(`/instance/connectionState/${INSTANCE}`);
    const state = stateRes.data?.instance?.state || 'close';
    res.json({ status: state === 'open' ? 'ready' : 'disconnected' });
  } catch {
    res.json({ status: 'disconnected' });
  }
});

// GET /api/whatsapp/qrcode — retries até Evolution API acordar
router.get('/qrcode', authenticate, async (req, res) => {
  const MAX_RETRIES = 6;
  const RETRY_DELAY = 8000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Garantir instância
      const { data: instances } = await evo.get('/instance/fetchInstances');
      const list = Array.isArray(instances) ? instances : [];
      const found = list.find(
        (i) => (i.name || i.instanceName || i.instance?.instanceName) === INSTANCE
      );
      if (!found) {
        await evo.post('/instance/create', {
          instanceName: INSTANCE,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        });
        await sleep(3000);
      }

      const { data } = await evo.get(`/instance/connect/${INSTANCE}`);

      if (data?.base64) return res.json({ qr: data.base64 });
      if (data?.code) {
        const qrBase64 = await QRCode.toDataURL(data.code);
        return res.json({ qr: qrBase64 });
      }

      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY); continue; }
    } catch (err) {
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY); continue; }
      return res.status(500).json({ error: `Serviço WhatsApp indisponível: ${err.message}` });
    }
  }

  res.status(404).json({ error: 'QR Code não disponível. Tente novamente.' });
});

// POST /api/whatsapp/connect
router.post('/connect', authenticate, async (req, res) => {
  try {
    waManager.initialize().catch((err) => {
      console.error('[WA Route] Init error:', err.message);
    });
    res.json({ message: 'Iniciando conexão WhatsApp. Aguarde o QR Code.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/disconnect
router.post('/disconnect', authenticate, async (req, res) => {
  try {
    await waManager.logout();
    res.json({ message: 'WhatsApp desconectado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/whatsapp/groups
router.get('/groups', authenticate, async (req, res) => {
  try {
    const groups = await waManager.getGroups();
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
