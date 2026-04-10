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

// Timeout longo para acordar a Evolution API (free tier cold start ~80-120s)
const evo = axios.create({
  baseURL: EVO_URL,
  headers: { apikey: EVO_KEY },
  timeout: 150000, // 150s — margem para cold start lento
});

// Timeout curto para status (quando já está acordado)
const evoFast = axios.create({
  baseURL: EVO_URL,
  headers: { apikey: EVO_KEY },
  timeout: 10000,
});

// GET /api/whatsapp/status
router.get('/status', authenticate, async (req, res) => {
  try {
    const { data } = await evoFast.get('/instance/fetchInstances');
    const list = Array.isArray(data) ? data : [];
    const inst = list.find(
      (i) => (i.name || i.instanceName || i.instance?.instanceName) === INSTANCE
    );
    if (!inst) return res.json({ status: 'disconnected' });

    const stateRes = await evoFast.get(`/instance/connectionState/${INSTANCE}`);
    const state = stateRes.data?.instance?.state || 'close';
    res.json({ status: state === 'open' ? 'ready' : 'disconnected' });
  } catch {
    res.json({ status: 'disconnected' });
  }
});

// Extrai QR de uma resposta da Evolution API
async function extractQr(data) {
  if (!data) return null;
  if (data.base64) return data.base64;
  if (data.code) return QRCode.toDataURL(data.code);
  return null;
}

// GET /api/whatsapp/qrcode
router.get('/qrcode', authenticate, async (req, res) => {
  try {
    // 1. Acorda a Evolution API e busca instâncias (timeout longo = cold start)
    const { data: instances } = await evo.get('/instance/fetchInstances');
    const list = Array.isArray(instances) ? instances : [];
    const found = list.find(
      (i) => (i.name || i.instanceName || i.instance?.instanceName) === INSTANCE
    );

    // 2. Cria instância se não existir
    if (!found) {
      console.log('[QR] Criando instância nova:', INSTANCE);
      await evo.post('/instance/create', {
        instanceName: INSTANCE,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      });
      await new Promise((r) => setTimeout(r, 3000));
    }

    // 3. Agora que Evo está acordado, verifica estado real
    let state = 'close';
    try {
      const stateRes = await evoFast.get(`/instance/connectionState/${INSTANCE}`);
      state = stateRes.data?.instance?.state || 'close';
      console.log('[QR] Estado da instância:', state);
    } catch { /* ignora */ }

    // 4. Já conectado?
    if (state === 'open') {
      return res.json({ connected: true });
    }

    // 5. Tenta obter QR via connect
    try {
      const { data } = await evoFast.get(`/instance/connect/${INSTANCE}`);
      const qr = await extractQr(data);
      if (qr) return res.json({ qr });
      console.log('[QR] connect retornou sem QR, estado:', state, 'keys:', Object.keys(data || {}));
    } catch (e) {
      console.log('[QR] connect falhou:', e.message);
    }

    // 6. Sem QR: força logout/restart para gerar QR novo
    console.log('[QR] Forçando logout para gerar QR novo');
    try {
      await evoFast.delete(`/instance/logout/${INSTANCE}`);
    } catch { /* pode falhar se já desconectado */ }
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const { data: qrData } = await evoFast.get(`/instance/connect/${INSTANCE}`);
      const qr = await extractQr(qrData);
      if (qr) return res.json({ qr });
    } catch { /* ignora */ }

    res.status(202).json({ message: 'Aguardando QR Code' });
  } catch (err) {
    console.warn('[QR] Evolution API ainda acordando:', err.message);
    res.status(503).json({ error: 'Serviço WhatsApp iniciando. Aguarde...' });
  }
});

// GET /api/whatsapp/config — mostra configuração (sem chamar Evolution API)
router.get('/config', async (req, res) => {
  res.json({
    evo_url: EVO_URL,
    instance: INSTANCE,
    key_set: !!EVO_KEY,
    key_value: EVO_KEY ? EVO_KEY.substring(0, 4) + '****' : null,
  });
});

// GET /api/whatsapp/debug — diagnóstico da Evolution API (sem auth para diagnóstico)
router.get('/debug', async (req, res) => {
  const quick = axios.create({ baseURL: EVO_URL, headers: { apikey: EVO_KEY }, timeout: 8000 });
  const out = { evo_url: EVO_URL, instance: INSTANCE, key_set: !!EVO_KEY };
  try {
    const r = await quick.get('/instance/fetchInstances');
    out.fetchInstances = { ok: true, count: Array.isArray(r.data) ? r.data.length : r.data };
  } catch (e) {
    out.fetchInstances = { ok: false, error: e.message, status: e.response?.status, data: e.response?.data };
  }
  try {
    const r = await quick.get(`/instance/connectionState/${INSTANCE}`);
    out.connectionState = { ok: true, data: r.data };
  } catch (e) {
    out.connectionState = { ok: false, error: e.message, status: e.response?.status };
  }
  try {
    const r = await quick.get(`/instance/connect/${INSTANCE}`);
    out.connect = { ok: true, keys: Object.keys(r.data || {}), hasBase64: !!r.data?.base64, hasCode: !!r.data?.code, raw: r.data };
  } catch (e) {
    out.connect = { ok: false, error: e.message, status: e.response?.status, data: e.response?.data };
  }
  res.json(out);
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
