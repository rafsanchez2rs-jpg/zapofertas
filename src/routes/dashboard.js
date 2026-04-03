const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/dashboard/reset-metrics
router.post('/reset-metrics', authenticate, (req, res) => {
  try {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO dashboard_reset (user_id, reset_at)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET reset_at = ?
    `).run(req.user.id, now, now);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
