const express = require('express');
const { getDb } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/dashboard/reset-metrics
router.post('/reset-metrics', authenticate, async (req, res) => {
  try {
    const pool = getDb();
    await pool.query(`
      INSERT INTO dashboard_reset (user_id, reset_at) VALUES ($1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET reset_at = NOW()
    `, [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
