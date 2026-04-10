const express = require('express');
const { getDb } = require('../db/database');
const { authenticate, planLimiter } = require('../middleware/auth');
const waManager = require('../services/whatsappClient');

const router = express.Router();

async function executeCampaign(campaignId) {
  const pool = getDb();
  const { rows: campRows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  const campaign = campRows[0];
  if (!campaign) return;

  const { rows: groups } = await pool.query(`
    SELECT cg.*, g.wa_group_id, g.name as group_name
    FROM campaign_groups cg
    JOIN groups g ON cg.group_id = g.id
    WHERE cg.campaign_id = $1 AND cg.status = 'pending'
  `, [campaignId]);

  if (groups.length === 0) return;

  const { rows: settingsRows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [campaign.user_id]);
  const settings = settingsRows[0];
  const imageUrl = settings?.send_image ? campaign.image_url : null;

  await pool.query("UPDATE campaigns SET status = 'sending', sent_at = NOW() WHERE id = $1", [campaignId]);

  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const result = await waManager.sendMessage(g.wa_group_id, campaign.message, imageUrl);
    if (result.success) {
      successCount++;
      await pool.query(
        "UPDATE campaign_groups SET status = 'sent', sent_at = NOW(), error_message = NULL WHERE campaign_id = $1 AND group_id = $2",
        [campaignId, g.group_id]
      );
      console.log(`[Campaign:${campaignId}] ✅ "${g.group_name}" enviado`);
    } else {
      failedCount++;
      await pool.query(
        "UPDATE campaign_groups SET status = 'failed', sent_at = NOW(), error_message = $1 WHERE campaign_id = $2 AND group_id = $3",
        [result.error || null, campaignId, g.group_id]
      );
      console.error(`[Campaign:${campaignId}] ❌ "${g.group_name}" falhou: ${result.error}`);
    }
    if (i < groups.length - 1) {
      const delay = 6000 + Math.random() * 6000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  const finalStatus = failedCount === 0 ? 'sent' : successCount > 0 ? 'partial' : 'failed';
  await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2', [finalStatus, campaignId]);
}

// GET /api/campaigns
router.get('/', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    const { page = 1, limit = 20, platform, status } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE c.user_id = $1';
    const params = [req.user.id];
    let idx = 2;

    if (platform) { where += ` AND c.platform = $${idx++}`; params.push(platform); }
    if (status) { where += ` AND c.status = $${idx++}`; params.push(status); }

    const { rows: countRows } = await pool.query(`SELECT COUNT(*) as count FROM campaigns c ${where}`, params);
    const total = parseInt(countRows[0].count);

    const { rows: campaigns } = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM campaign_groups cg WHERE cg.campaign_id = c.id AND cg.status = 'sent') as groups_sent,
        (SELECT COUNT(*) FROM campaign_groups cg WHERE cg.campaign_id = c.id) as groups_total
      FROM campaigns c
      ${where}
      ORDER BY
        CASE WHEN c.status = 'scheduled' AND c.scheduled_at > NOW() THEN 0 ELSE 1 END ASC,
        c.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, Number(limit), offset]);

    res.json({ campaigns, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/stats
router.get('/stats', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    const userId = req.user.id;

    const { rows: resetRows } = await pool.query(
      'SELECT reset_at FROM dashboard_reset WHERE user_id = $1', [userId]
    );
    const resetAt = resetRows[0]?.reset_at || new Date('2000-01-01');

    const { rows: todayRows } = await pool.query(`
      SELECT COUNT(*) as count FROM campaigns
      WHERE user_id = $1 AND created_at::date = CURRENT_DATE AND status IN ('sent','partial') AND created_at > $2
    `, [userId, resetAt]);

    const { rows: weekRows } = await pool.query(`
      SELECT COUNT(*) as count FROM campaigns
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days' AND status IN ('sent','partial') AND created_at > $2
    `, [userId, resetAt]);

    const { rows: monthRows } = await pool.query(`
      SELECT COUNT(*) as count FROM campaigns
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days' AND status IN ('sent','partial') AND created_at > $2
    `, [userId, resetAt]);

    const { rows: last7Days } = await pool.query(`
      SELECT created_at::date as day, COUNT(*) as count
      FROM campaigns
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days' AND status IN ('sent','partial') AND created_at > $2
      GROUP BY created_at::date ORDER BY day ASC
    `, [userId, resetAt]);

    const { rows: last14Days } = await pool.query(`
      SELECT created_at::date as day, COUNT(*) as count
      FROM campaigns
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '14 days' AND status IN ('sent','partial') AND created_at > $2
      GROUP BY created_at::date ORDER BY day ASC
    `, [userId, resetAt]);

    const { rows: lastAdRows } = await pool.query(
      'SELECT * FROM campaigns WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [userId]
    );

    const { rows: activeGroupRows } = await pool.query(
      'SELECT COUNT(*) as count FROM groups WHERE user_id = $1 AND active = 1', [userId]
    );

    const { rows: rateRows } = await pool.query(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status IN ('sent','partial') THEN 1 ELSE 0 END) as success
      FROM campaigns WHERE user_id = $1 AND created_at > $2
    `, [userId, resetAt]);
    const successRate = parseInt(rateRows[0].total) > 0
      ? Math.round((parseInt(rateRows[0].success) / parseInt(rateRows[0].total)) * 100) : 0;

    const { rows: topProducts } = await pool.query(`
      SELECT product_name, platform, COUNT(*) as total, MAX(created_at) as last_sent
      FROM campaigns
      WHERE user_id = $1 AND status IN ('sent','partial') AND created_at > $2
      GROUP BY product_name, platform ORDER BY total DESC LIMIT 5
    `, [userId, resetAt]);

    const { rows: topGroups } = await pool.query(`
      SELECT cg.group_name, COUNT(*) as total, MAX(cg.sent_at) as last_sent
      FROM campaign_groups cg
      JOIN campaigns c ON cg.campaign_id = c.id
      WHERE c.user_id = $1 AND cg.status = 'sent' AND c.created_at > $2
      GROUP BY cg.group_name ORDER BY total DESC LIMIT 5
    `, [userId, resetAt]);

    res.json({
      today: parseInt(todayRows[0].count),
      week: parseInt(weekRows[0].count),
      month: parseInt(monthRows[0].count),
      last7Days,
      last14Days,
      lastAd: lastAdRows[0] || null,
      activeGroups: parseInt(activeGroupRows[0].count),
      successRate,
      topProducts,
      topGroups,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/history
router.get('/history', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    const userId = req.user.id;
    const status = req.query.status || '';
    const platform = req.query.platform || '';

    let query = `SELECT *,
      (SELECT COUNT(*) FROM campaign_groups WHERE campaign_id = campaigns.id) as groups_total,
      (SELECT COUNT(*) FROM campaign_groups WHERE campaign_id = campaigns.id AND status = 'sent') as groups_sent
      FROM campaigns WHERE user_id = $1`;
    const params = [userId];
    let idx = 2;

    if (status && status !== 'all') {
      query += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (platform && platform !== 'all') {
      if (platform === 'mercadolivre') {
        query += ` AND (platform = 'mercadolivre' OR product_url LIKE '%mercadolivre%' OR product_url LIKE '%mercadolibre%' OR product_url LIKE '%meli.%' OR product_url LIKE '%/MLB%' OR product_url LIKE '%-MLB%')`;
      } else {
        query += ` AND platform = $${idx++} AND product_url NOT LIKE '%mercadolivre%' AND product_url NOT LIKE '%mercadolibre%' AND product_url NOT LIKE '%meli.%' AND product_url NOT LIKE '%/MLB%' AND product_url NOT LIKE '%-MLB%'`;
        params.push(platform);
      }
    }
    query += ' ORDER BY created_at DESC';

    const { rows: campaigns } = await pool.query(query, params);
    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/campaigns/history/all
router.delete('/history/all', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    await pool.query(
      'DELETE FROM campaign_groups WHERE campaign_id IN (SELECT id FROM campaigns WHERE user_id = $1)',
      [req.user.id]
    );
    await pool.query('DELETE FROM campaigns WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    const { rows: campRows } = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!campRows[0]) return res.status(404).json({ error: 'Campanha não encontrada' });

    const { rows: groups } = await pool.query(
      'SELECT * FROM campaign_groups WHERE campaign_id = $1',
      [req.params.id]
    );
    res.json({ campaign: campRows[0], groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns
router.post('/', authenticate, planLimiter, async (req, res) => {
  try {
    const {
      productName, platform, originalPrice, salePrice, pixPrice,
      discountPercent, couponValue, imageUrl, productUrl,
      message, hasHeadline, headline, groupIds, scheduledAt,
    } = req.body;

    if (!productName || !message || !productUrl) {
      return res.status(400).json({ error: 'Campos obrigatórios: productName, message, productUrl' });
    }
    if (!groupIds || groupIds.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um grupo' });
    }

    const isFutureSchedule = scheduledAt && new Date(scheduledAt) > new Date();

    if (!isFutureSchedule) {
      const { status } = waManager.getStatus();
      if (status !== 'ready') {
        return res.status(400).json({
          error: 'WhatsApp não está conectado. Vá em Configurações e escaneie o QR Code.',
          waStatus: status,
        });
      }
    }

    const pool = getDb();
    const { rows: groups } = await pool.query(
      'SELECT * FROM groups WHERE id = ANY($1) AND user_id = $2',
      [groupIds, req.user.id]
    );
    if (groups.length === 0) return res.status(400).json({ error: 'Nenhum grupo válido selecionado' });

    const status = isFutureSchedule ? 'scheduled' : 'pending';
    const { rows: inserted } = await pool.query(`
      INSERT INTO campaigns (user_id, product_name, platform, original_price, sale_price, pix_price,
        discount_percent, coupon_value, image_url, product_url, message, has_headline, headline, status, scheduled_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id
    `, [
      req.user.id, productName, platform || 'shopee',
      originalPrice || null, salePrice || null, pixPrice || null,
      discountPercent || null, couponValue || null, imageUrl || null,
      productUrl, message, hasHeadline ? 1 : 0, headline || null,
      status, isFutureSchedule ? new Date(scheduledAt).toISOString() : null,
    ]);
    const campaignId = inserted[0].id;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const g of groups) {
        await client.query(
          "INSERT INTO campaign_groups (campaign_id, group_id, wa_group_id, group_name, status) VALUES ($1, $2, $3, $4, 'pending')",
          [campaignId, g.id, g.wa_group_id, g.name]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    if (!isFutureSchedule) {
      const today = new Date().toISOString().split('T')[0];
      const newSends = req.user.last_send_date === today ? (req.user.daily_sends || 0) + 1 : 1;
      await pool.query('UPDATE users SET daily_sends = $1, last_send_date = $2 WHERE id = $3', [newSends, today, req.user.id]);
    }

    if (isFutureSchedule) {
      return res.status(201).json({ campaignId, status: 'scheduled', scheduledAt });
    }

    res.status(201).json({ campaignId, status: 'dispatching' });
    executeCampaign(campaignId).catch((err) => {
      console.error(`[Campaigns] Execute error for ${campaignId}:`, err);
    });
  } catch (err) {
    console.error('[Campaigns] Create error:', err);
    res.status(500).json({ error: err.message || 'Erro ao criar campanha' });
  }
});

// PATCH /api/campaigns/:id/cancel
router.patch('/:id/cancel', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (rows[0].status !== 'scheduled') {
      return res.status(400).json({ error: 'Apenas campanhas agendadas podem ser canceladas' });
    }
    await pool.query("UPDATE campaigns SET status = 'cancelled' WHERE id = $1", [req.params.id]);
    res.json({ message: 'Agendamento cancelado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/:id/resend
router.post('/:id/resend', authenticate, planLimiter, async (req, res) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query(
      'SELECT * FROM campaigns WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Campanha não encontrada' });

    await pool.query(
      "UPDATE campaign_groups SET status = 'pending', sent_at = NULL, error_message = NULL WHERE campaign_id = $1 AND status = 'failed'",
      [req.params.id]
    );
    await pool.query("UPDATE campaigns SET status = 'pending' WHERE id = $1", [req.params.id]);

    res.json({ message: 'Reenvio iniciado', campaignId: rows[0].id });
    executeCampaign(rows[0].id).catch((err) => {
      console.error(`[Campaigns] Resend error for ${rows[0].id}:`, err);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
