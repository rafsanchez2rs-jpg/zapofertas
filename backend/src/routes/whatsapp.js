const express = require('express');
const axios = require('axios');
const QRCode = require('qrcode');
const { authenticate } = require('../middleware/auth');
const waManager = require('../services/whatsappClient');
const { sql } = require('../db/database');   // ← PostgreSQL correto

const router = express.Router();

const EVO_URL  = process.env.EVOLUTION_API_URL  || 'http://localhost:8080';
const EVO_KEY  = process.env.EVOLUTION_API_KEY  || 'zapofertas123';
const INSTANCE = process.env.EVOLUTION_INSTANCE || 'zapofertas';

// Axios com timeout longo (para cold start do Render free tier)
const evo = axios.create({
  baseURL: EVO_URL,
  headers: { apikey: EVO_KEY },
  timeout: 150000,   // 150 segundos
});

// Axios rápido para verificações quando o serviço já está acordado
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
    const inst = list.find(i => 
      (i.name || i.instanceName || i.instance?.instanceName) === INSTANCE
    );

    if (!inst) return res.json({ status: 'disconnected' });

    const stateRes = await evoFast.get(`/instance/connectionState/${INSTANCE}`);
    const state = stateRes.data?.instance?.state || 'close';

    res.json({ status: state === 'open' ? 'ready' : 'disconnected' });
  } catch {
    res.json({ status: 'disconnected' });
  }
});

// GET /api/whatsapp/qrcode  ← VERSÃO AGRESSIVA PARA FREE TIER
router.get('/qrcode', authenticate, async (req, res) => {
  const MAX_RETRIES = 8;
  const RETRY_DELAY = 12000;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  console.log('[QR] Iniciando processo com warm-up agressivo...');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[QR] Warm-up tentativa ${attempt}...`);
      
      // Warm-up agressivo
      await evo.get('/instance/fetchInstances').catch(() => {});
      await sleep(1500);
      await evo.get('/instance/fetchInstances').catch(() => {});
      await sleep(1500);

      // Verifica se a instância existe
      const { data: instances } = await evo.get('/instance/fetchInstances');
      const list = Array.isArray(instances) ? instances : [];
      const found = list.find(i => 
        (i.name || i.instanceName || i.instance?.instanceName) === INSTANCE
      );

      if (!found) {
        console.log(`[QR] Criando instância ${INSTANCE}...`);
        await evo.post('/instance/create', {
          instanceName: INSTANCE,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        });
        await sleep(5000);
      }

      console.log(`[QR] Buscando QR Code (tentativa ${attempt})...`);
      const { data } = await evo.get(`/instance/connect/${INSTANCE}`);

      if (data?.base64) {
        console.log('[QR] Sucesso! QR Code base64 recebido');
        return res.json({ qr: data.base64 });
      }
      if (data?.code) {
        const qrBase64 = await QRCode.toDataURL(data.code);
        console.log('[QR] Sucesso! QR Code gerado');
        return res.json({ qr: qrBase64 });
      }

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY);
        continue;
      }
    } catch (err) {
      console.warn(`[QR] Tentativa ${attempt} falhou:`, err.message);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY);
        continue;
      }
    }
  }

  console.error('[QR] Falha total após todas as tentativas');
  return res.status(500).json({ 
    error: 'Evolution API demorando muito (cold start). Tente novamente em 20 segundos.' 
  });
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

// ==================== SETTINGS (PostgreSQL) ====================
router.get('/settings', authenticate, async (req, res) => {
  try {
    let settings = await sql`SELECT * FROM settings WHERE user_id = ${req.user.id}`.then(r => r[0]);

    if (!settings) {
      await sql`INSERT INTO settings (user_id) VALUES (${req.user.id})`;
      settings = await sql`SELECT * FROM settings WHERE user_id = ${req.user.id}`.then(r => r[0]);
    }

    res.json({ settings });
  } catch (err) {
    console.error('Erro settings:', err);
    res.status(500).json({ error: 'Erro ao carregar configurações' });
  }
});

router.put('/settings', authenticate, async (req, res) => {
  const { delay_between_sends, send_image, auto_reconnect, coupon_default_link } = req.body;

  try {
    await sql`
      UPDATE settings 
      SET 
        delay_between_sends = COALESCE(${delay_between_sends}, delay_between_sends),
        send_image = COALESCE(${send_image !== undefined ? (send_image ? 1 : 0) : null}, send_image),
        auto_reconnect = COALESCE(${auto_reconnect !== undefined ? (auto_reconnect ? 1 : 0) : null}, auto_reconnect),
        coupon_default_link = COALESCE(${coupon_default_link || null}, coupon_default_link),
        updated_at = NOW()
      WHERE user_id = ${req.user.id}
    `;

    const settings = await sql`SELECT * FROM settings WHERE user_id = ${req.user.id}`.then(r => r[0]);
    res.json({ settings });
  } catch (err) {
    console.error('Erro update settings:', err);
    res.status(500).json({ error: 'Erro ao salvar configurações' });
  }
});

module.exports = router;
