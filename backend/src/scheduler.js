const cron = require('node-cron');
const { getDb } = require('./db/database');
const waManager = require('./services/whatsappClient');

function nowISO() {
  return new Date().toISOString();
}

async function executeScheduledCampaign(campaign) {
  const db = getDb();

  const groups = db.prepare(`
    SELECT cg.*, g.wa_group_id, g.name as group_name
    FROM campaign_groups cg
    JOIN groups g ON cg.group_id = g.id
    WHERE cg.campaign_id = ? AND cg.status = 'pending'
  `).all(campaign.id);

  if (groups.length === 0) {
    db.prepare("UPDATE campaigns SET status = 'sent', fired_at = ? WHERE id = ?").run(nowISO(), campaign.id);
    return;
  }

  const settings = db.prepare('SELECT * FROM settings WHERE user_id = ?').get(campaign.user_id);
  const delayMs = Math.max(settings?.delay_between_sends || 5000, 5000);
  const imageUrl = settings?.send_image ? campaign.image_url : null;

  db.prepare("UPDATE campaigns SET status = 'sending', sent_at = ?, fired_at = ? WHERE id = ?")
    .run(nowISO(), nowISO(), campaign.id);

  const updateGroup = db.prepare(`
    UPDATE campaign_groups SET status = ?, sent_at = ?, error_message = ?
    WHERE campaign_id = ? AND group_id = ?
  `);

  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const result = await waManager.sendMessage(g.wa_group_id, campaign.message, imageUrl);
    if (result.success) {
      successCount++;
      updateGroup.run('sent', nowISO(), null, campaign.id, g.group_id);
      console.log(`[Scheduler] Campaign:${campaign.id} ✅ "${g.group_name}" sent`);
    } else {
      failedCount++;
      updateGroup.run('failed', nowISO(), result.error || null, campaign.id, g.group_id);
      console.error(`[Scheduler] Campaign:${campaign.id} ❌ "${g.group_name}" failed: ${result.error}`);
    }
    if (i < groups.length - 1) {
      const delay = 6000 + Math.random() * 6000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  const finalStatus = failedCount === 0 ? 'sent' : successCount > 0 ? 'partial' : 'failed';
  db.prepare("UPDATE campaigns SET status = ? WHERE id = ?").run(finalStatus, campaign.id);
  console.log(`[Scheduler] Campanha ${campaign.id} finalizada — status: ${finalStatus} (✅${successCount} ❌${failedCount})`);
}

function init() {
  cron.schedule('* * * * *', async () => {
    const db = getDb();
    const now = nowISO();

    console.log('[Scheduler] Verificando campanhas para:', now);

    const campaigns = db.prepare(`
      SELECT * FROM campaigns
      WHERE status = 'scheduled'
        AND scheduled_at <= ?
        AND scheduled_at >= datetime('now', '-2 minutes')
    `).all(now);

    console.log('[Scheduler] Encontradas:', campaigns.length);
    campaigns.forEach(c => {
      console.log(`  - Campanha ${c.id}: agendada para ${c.scheduled_at}`);
    });

    if (campaigns.length === 0) return;

    console.log(`[Scheduler] ${campaigns.length} campanha(s) para disparar`);

    for (const campaign of campaigns) {
      try {
        await executeScheduledCampaign(campaign);
      } catch (err) {
        console.error(`[Scheduler] Erro na campanha ${campaign.id}:`, err.message);
        const db = getDb();
        db.prepare("UPDATE campaigns SET status = 'failed' WHERE id = ?").run(campaign.id);
      }
    }
  });

  console.log('[Scheduler] Iniciado');
}

module.exports = { init };
