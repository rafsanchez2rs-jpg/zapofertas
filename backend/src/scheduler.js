const cron = require('node-cron');
const { getDb } = require('./db/database');
const waManager = require('./services/whatsappClient');

async function executeScheduledCampaign(campaign) {
  const pool = getDb();

  const { rows: groups } = await pool.query(`
    SELECT cg.*, g.wa_group_id, g.name as group_name
    FROM campaign_groups cg
    JOIN groups g ON cg.group_id = g.id
    WHERE cg.campaign_id = $1 AND cg.status = 'pending'
  `, [campaign.id]);

  if (groups.length === 0) {
    await pool.query("UPDATE campaigns SET status = 'sent', fired_at = NOW() WHERE id = $1", [campaign.id]);
    return;
  }

  const { rows: settingsRows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [campaign.user_id]);
  const settings = settingsRows[0];
  const imageUrl = settings?.send_image ? campaign.image_url : null;

  await pool.query("UPDATE campaigns SET status = 'sending', sent_at = NOW(), fired_at = NOW() WHERE id = $1", [campaign.id]);

  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const result = await waManager.sendMessage(g.wa_group_id, campaign.message, imageUrl);
    if (result.success) {
      successCount++;
      await pool.query(
        "UPDATE campaign_groups SET status = 'sent', sent_at = NOW(), error_message = NULL WHERE campaign_id = $1 AND group_id = $2",
        [campaign.id, g.group_id]
      );
      console.log(`[Scheduler] Campaign:${campaign.id} ✅ "${g.group_name}" sent`);
    } else {
      failedCount++;
      await pool.query(
        "UPDATE campaign_groups SET status = 'failed', sent_at = NOW(), error_message = $1 WHERE campaign_id = $2 AND group_id = $3",
        [result.error || null, campaign.id, g.group_id]
      );
      console.error(`[Scheduler] Campaign:${campaign.id} ❌ "${g.group_name}" failed: ${result.error}`);
    }
    if (i < groups.length - 1) {
      const delay = 6000 + Math.random() * 6000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  const finalStatus = failedCount === 0 ? 'sent' : successCount > 0 ? 'partial' : 'failed';
  await pool.query('UPDATE campaigns SET status = $1 WHERE id = $2', [finalStatus, campaign.id]);
  console.log(`[Scheduler] Campanha ${campaign.id} finalizada — status: ${finalStatus} (✅${successCount} ❌${failedCount})`);
}

function init() {
  cron.schedule('* * * * *', async () => {
    try {
      const pool = getDb();
      const { rows: campaigns } = await pool.query(`
        SELECT * FROM campaigns
        WHERE status = 'scheduled'
          AND scheduled_at <= NOW()
          AND scheduled_at >= NOW() - INTERVAL '2 minutes'
      `);

      if (campaigns.length === 0) return;
      console.log(`[Scheduler] ${campaigns.length} campanha(s) para disparar`);

      for (const campaign of campaigns) {
        try {
          await executeScheduledCampaign(campaign);
        } catch (err) {
          console.error(`[Scheduler] Erro na campanha ${campaign.id}:`, err.message);
          const pool = getDb();
          await pool.query("UPDATE campaigns SET status = 'failed' WHERE id = $1", [campaign.id]);
        }
      }
    } catch (err) {
      console.error('[Scheduler] Erro ao verificar campanhas:', err.message);
    }
  });

  console.log('[Scheduler] Iniciado');
}

module.exports = { init };
