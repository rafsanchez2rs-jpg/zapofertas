const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, planLimiter } = require('../middleware/auth');
const waManager = require('../services/whatsappClient');

const router = express.Router();

async function executeCampaign(campaignId) {
  const db = getDb();
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return;

  const groups = db
    .prepare(`
      SELECT cg.*, g.wa_group_id, g.name as group_name
      FROM campaign_groups cg
      JOIN groups g ON cg.group_id = g.id
      WHERE cg.campaign_id = ? AND cg.status = 'pending'
    `)
    .all(campaignId);

  if (groups.length === 0) return;

  const settings = db
    .prepare('SELECT * FROM settings WHERE user_id = ?')
    .get(campaign.user_id);

  const delayMs = Math.max(settings?.delay_between_sends || 5000, 5000);
  const imageUrl = settings?.send_image ? campaign.image_url : null;

  db.prepare("UPDATE campaigns SET status = 'sending', sent_at = datetime('now') WHERE id = ?").run(
    campaignId
  );

  const updateGroup = db.prepare(`
    UPDATE campaign_groups SET status = ?, sent_at = datetime('now'), error_message = ?
    WHERE campaign_id = ? AND group_id = ?
  `);

  let successCount = 0;
  let failedCount = 0;

  try {
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      const result = await waManager.sendMessage(g.wa_group_id, campaign.message, imageUrl);
      if (result.success) {
        successCount++;
        updateGroup.run('sent', null, campaignId, g.group_id);
        console.log(`[Campaign:${campaignId}] ✅ "${g.group_name}" enviado`);
      } else {
        failedCount++;
        updateGroup.run('failed', result.error || null, campaignId, g.group_id);
        console.error(`[Campaign:${campaignId}] ❌ "${g.group_name}" falhou: ${result.error}`);
      }
      if (i < groups.length - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    const finalStatus = failedCount === 0 ? 'sent' : successCount > 0 ? 'partial' : 'failed';
    db.prepare("UPDATE campaigns SET status = ? WHERE id = ?").run(finalStatus, campaignId);
  } catch (err) {
    console.error(`[Campaign:${campaignId}] Erro inesperado:`, err);
    db.prepare("UPDATE campaigns SET status = 'failed' WHERE id = ?").run(campaignId);
    throw err;
  }
}

// GET /api/campaigns
router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const { page = 1, limit = 20, platform, status } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  let where = 'WHERE c.user_id = ?';
  const params = [req.user.id];

  if (platform) { where += ' AND c.platform = ?'; params.push(platform); }
  if (status) { where += ' AND c.status = ?'; params.push(status); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM campaigns c ${where}`).get(...params).count;

  const campaigns = db
    .prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM campaign_groups cg WHERE cg.campaign_id = c.id AND cg.status = 'sent') as groups_sent,
        (SELECT COUNT(*) FROM campaign_groups cg WHERE cg.campaign_id = c.id) as groups_total
      FROM campaigns c
      ${where}
      ORDER BY
        CASE WHEN c.status = 'scheduled' AND c.scheduled_at > datetime('now') THEN 0 ELSE 1 END ASC,
        c.created_at DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, Number(limit), offset);

  res.json({ campaigns, total, page: Number(page), limit: Number(limit) });
});

// GET /api/campaigns/stats
router.get('/stats', authenticate, (req, res) => {
  const db = getDb();
  const userId = req.user.id;

  // Subquery de reset: apenas campanhas após o último reset do dashboard
  const resetFilter = `AND created_at > (SELECT COALESCE(reset_at, '2000-01-01') FROM dashboard_reset WHERE user_id = ?)`;

  const today = db.prepare(`
    SELECT COUNT(*) as count FROM campaigns
    WHERE user_id = ? AND date(created_at) = date('now') AND status IN ('sent','partial') ${resetFilter}
  `).get(userId, userId);

  const week = db.prepare(`
    SELECT COUNT(*) as count FROM campaigns
    WHERE user_id = ? AND created_at >= datetime('now', '-7 days') AND status IN ('sent','partial') ${resetFilter}
  `).get(userId, userId);

  const month = db.prepare(`
    SELECT COUNT(*) as count FROM campaigns
    WHERE user_id = ? AND created_at >= datetime('now', '-30 days') AND status IN ('sent','partial') ${resetFilter}
  `).get(userId, userId);

  const last7Days = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM campaigns
    WHERE user_id = ? AND created_at >= datetime('now', '-7 days') AND status IN ('sent','partial') ${resetFilter}
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all(userId, userId);

  const last14Days = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as count
    FROM campaigns
    WHERE user_id = ? AND created_at >= datetime('now', '-14 days') AND status IN ('sent','partial') ${resetFilter}
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all(userId, userId);

  const lastAd = db.prepare(`
    SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(userId);

  const activeGroups = db.prepare(`
    SELECT COUNT(*) as count FROM groups WHERE user_id = ? AND active = 1
  `).get(userId);

  const successRateRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('sent','partial') THEN 1 ELSE 0 END) as success
    FROM campaigns WHERE user_id = ? ${resetFilter}
  `).get(userId, userId);
  const successRate = successRateRow.total > 0
    ? Math.round((successRateRow.success / successRateRow.total) * 100)
    : 0;

  const topProducts = db.prepare(`
    SELECT product_name, platform, COUNT(*) as total, MAX(created_at) as last_sent
    FROM campaigns
    WHERE user_id = ? AND status IN ('sent','partial') ${resetFilter}
    GROUP BY product_name
    ORDER BY total DESC LIMIT 5
  `).all(userId, userId);

  const topGroups = db.prepare(`
    SELECT cg.group_name, COUNT(*) as total, MAX(cg.sent_at) as last_sent
    FROM campaign_groups cg
    JOIN campaigns c ON cg.campaign_id = c.id
    WHERE c.user_id = ? AND cg.status = 'sent' ${resetFilter.replace('created_at', 'c.created_at').replace('user_id = ?', 'c.user_id = ?')}
    GROUP BY cg.group_name
    ORDER BY total DESC LIMIT 5
  `).all(userId, userId);

  res.json({
    today: today.count,
    week: week.count,
    month: month.count,
    last7Days,
    last14Days,
    lastAd,
    activeGroups: activeGroups.count,
    successRate,
    topProducts,
    topGroups,
  });
});

// GET /api/campaigns/history/debug
router.get('/history/debug', authenticate, (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    'SELECT id, status, platform, product_name FROM campaigns WHERE user_id = ? LIMIT 20'
  ).all(req.user.id);
  res.json(rows);
});

// DELETE /api/campaigns/history/all
router.delete('/history/all', authenticate, (req, res) => {
  try {
    const db = getDb();
    db.prepare(
      'DELETE FROM campaign_groups WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = ?)'
    ).run(req.user.id);
    db.prepare('DELETE FROM campaigns WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/history
router.get('/history', authenticate, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;
    const status = req.query.status || '';
    const platform = req.query.platform || '';

    let query = `SELECT *,
      (SELECT COUNT(*) FROM campaign_groups WHERE campaign_id = campaigns.id) as groups_total,
      (SELECT COUNT(*) FROM campaign_groups WHERE campaign_id = campaigns.id AND status = 'sent') as groups_sent
      FROM campaigns WHERE user_id = ?`;
    const params = [userId];

    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }
    if (platform && platform !== 'all') {
      if (platform === 'mercadolivre') {
        query += ` AND (platform = 'mercadolivre' OR product_url LIKE '%mercadolivre%' OR product_url LIKE '%mercadolibre%' OR product_url LIKE '%meli.%' OR product_url LIKE '%/MLB%' OR product_url LIKE '%-MLB%')`;
      } else {
        query += ` AND platform = ? AND product_url NOT LIKE '%mercadolivre%' AND product_url NOT LIKE '%mercadolibre%' AND product_url NOT LIKE '%meli.%' AND product_url NOT LIKE '%/MLB%' AND product_url NOT LIKE '%-MLB%'`;
        params.push(platform);
      }
    }

    query += ` ORDER BY created_at DESC`;

    const campaigns = db.prepare(query).all(...params);
    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id
router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const campaign = db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

  const groups = db
    .prepare('SELECT * FROM campaign_groups WHERE campaign_id = ?')
    .all(req.params.id);

  res.json({ campaign, groups });
});

// POST /api/campaigns — create and optionally dispatch
router.post('/', authenticate, planLimiter, async (req, res) => {
  try {
    const {
      productName, platform, originalPrice, salePrice, pixPrice,
      discountPercent, couponValue, imageUrl, productUrl,
      message, hasHeadline, headline,
      groupIds, scheduledAt,
    } = req.body;

    if (!productName || !message || !productUrl) {
      return res.status(400).json({ error: 'Campos obrigatórios: productName, message, productUrl' });
    }

    if (!groupIds || groupIds.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um grupo' });
    }

    // Determinar se é agendamento futuro
    const isFutureSchedule = scheduledAt && new Date(scheduledAt) > new Date();

    // Verificar WhatsApp apenas para disparos imediatos
    if (!isFutureSchedule) {
      const { status } = waManager.getStatus();
      if (status !== 'ready') {
        return res.status(400).json({
          error: 'WhatsApp não está conectado. Vá em Configurações e escaneie o QR Code.',
          waStatus: status,
        });
      }
    }

    const db = getDb();

    const placeholders = groupIds.map(() => '?').join(',');
    const groups = db
      .prepare(`SELECT * FROM groups WHERE id IN (${placeholders}) AND user_id = ?`)
      .all(...groupIds, req.user.id);

    if (groups.length === 0) {
      return res.status(400).json({ error: 'Nenhum grupo válido selecionado' });
    }

    const status = isFutureSchedule ? 'scheduled' : 'pending';

    const result = db.prepare(`
      INSERT INTO campaigns (user_id, product_name, platform, original_price, sale_price, pix_price,
        discount_percent, coupon_value, image_url, product_url, message, has_headline, headline, status, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, productName, platform || 'shopee',
      originalPrice || null, salePrice || null, pixPrice || null,
      discountPercent || null, couponValue || null, imageUrl || null,
      productUrl, message, hasHeadline ? 1 : 0, headline || null,
      status, isFutureSchedule ? scheduledAt : null
    );

    const campaignId = result.lastInsertRowid;

    const insertGroup = db.prepare(`
      INSERT INTO campaign_groups (campaign_id, group_id, wa_group_id, group_name, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    const insertGroups = db.transaction(() => {
      for (const g of groups) {
        insertGroup.run(campaignId, g.id, g.wa_group_id, g.name);
      }
    });
    insertGroups();

    // Atualiza contador diário apenas para disparos imediatos
    if (!isFutureSchedule) {
      db.prepare(`
        UPDATE users SET
          daily_sends = CASE WHEN last_send_date = date('now') THEN daily_sends + 1 ELSE 1 END,
          last_send_date = date('now')
        WHERE id = ?
      `).run(req.user.id);
    }

    if (isFutureSchedule) {
      console.log(`[Campaigns] Campanha ${campaignId} agendada para ${scheduledAt}`);
      return res.status(201).json({ campaignId, status: 'scheduled', scheduledAt });
    }

    // Disparo imediato
    res.status(201).json({ campaignId, status: 'dispatching' });
    executeCampaign(campaignId).catch(err => {
      console.error(`[Campaigns] Execute error for ${campaignId}:`, err);
    });
  } catch (err) {
    console.error('[Campaigns] Create error:', err);
    res.status(500).json({ error: err.message || 'Erro ao criar campanha' });
  }
});

// PATCH /api/campaigns/:id/cancel
router.patch('/:id/cancel', authenticate, (req, res) => {
  const db = getDb();
  const campaign = db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });
  if (campaign.status !== 'scheduled') {
    return res.status(400).json({ error: 'Apenas campanhas agendadas podem ser canceladas' });
  }

  db.prepare("UPDATE campaigns SET status = 'cancelled' WHERE id = ?").run(req.params.id);
  res.json({ message: 'Agendamento cancelado' });
});

// POST /api/campaigns/:id/resend
router.post('/:id/resend', authenticate, planLimiter, async (req, res) => {
  const db = getDb();
  const campaign = db
    .prepare('SELECT * FROM campaigns WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!campaign) return res.status(404).json({ error: 'Campanha não encontrada' });

  db.prepare(`
    UPDATE campaign_groups SET status = 'pending', sent_at = NULL, error_message = NULL
    WHERE campaign_id = ? AND status = 'failed'
  `).run(req.params.id);

  db.prepare("UPDATE campaigns SET status = 'pending' WHERE id = ?").run(req.params.id);

  res.json({ message: 'Reenvio iniciado', campaignId: campaign.id });

  executeCampaign(campaign.id).catch(err => {
    console.error(`[Campaigns] Resend error for ${campaign.id}:`, err);
  });
});

module.exports = router;
