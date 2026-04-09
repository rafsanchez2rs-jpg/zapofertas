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

// GET /api/whatsapp/qrcode
router.get('/qrcode', authenticate, async (req, res) => {
  try {
    // Garantir que a instância existe
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
    }

    // Buscar QR Code
    const { data } = await evo.get(`/instance/connect/${INSTANCE}`);

    if (data?.base64) {
      return res.json({ qr: data.base64 });
    }
    if (data?.code) {
      const qrBase64 = await QRCode.toDataURL(data.code);
      return res.json({ qr: qrBase64 });
    }

    res.status(404).json({ error: 'QR Code não disponível' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/whatsapp/connect
router.post('/connect', authenticate, async (req, res) => {
  try {
    const status = waManager.getStatus();

    // Bloquear se em cooldown de rate limit
    if (status.rateLimitedUntil) {
      const remainingMs = status.rateLimitedUntil - Date.now();
      const remainingMin = Math.ceil(remainingMs / 60000);
      return res.status(429).json({
        error: `WhatsApp bloqueou temporariamente. Aguarde ${remainingMin} minuto${remainingMin > 1 ? 's' : ''}.`,
        rateLimitedUntil: status.rateLimitedUntil,
        remainingMs,
      });
    }

    // Non-blocking: waManager emits QR via WebSocket
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

// GET /api/whatsapp/groups — get live groups from WhatsApp
router.get('/groups', authenticate, async (req, res) => {
  try {
    const groups = await waManager.getGroups();
    res.json({ groups });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/whatsapp/settings
router.get('/settings', authenticate, (req, res) => {
  const db = getDb();
  let settings = db
    .prepare('SELECT * FROM settings WHERE user_id = ?')
    .get(req.user.id);

  if (!settings) {
    db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(req.user.id);
    settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
  }

  res.json({ settings });
});

// PUT /api/whatsapp/settings
router.put('/settings', authenticate, (req, res) => {
  const { delay_between_sends, send_image, auto_reconnect, coupon_default_link } = req.body;
  const db = getDb();

  db.prepare(`
    UPDATE settings SET
      delay_between_sends = COALESCE(?, delay_between_sends),
      send_image = COALESCE(?, send_image),
      auto_reconnect = COALESCE(?, auto_reconnect),
      coupon_default_link = COALESCE(?, coupon_default_link),
      updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    delay_between_sends !== undefined ? Number(delay_between_sends) : null,
    send_image !== undefined ? (send_image ? 1 : 0) : null,
    auto_reconnect !== undefined ? (auto_reconnect ? 1 : 0) : null,
    coupon_default_link !== undefined ? (coupon_default_link || null) : null,
    req.user.id
  );

  const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(req.user.id);
  res.json({ settings });
});

module.exports = router;
