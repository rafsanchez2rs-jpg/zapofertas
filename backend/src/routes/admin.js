const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, requireAdmin);

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const pool = getDb();
    const { rows: users } = await pool.query(
      'SELECT id, name, email, plan, role, active, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/plan
router.patch('/users/:id/plan', async (req, res) => {
  try {
    const { plan } = req.body;
    if (!['free', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'Plano inválido. Use "free" ou "pro".' });
    }
    const pool = getDb();
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
    await pool.query('UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2', [plan, req.params.id]);
    res.json({ message: 'Plano atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/users/:id/deactivate
router.patch('/users/:id/deactivate', async (req, res) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query('SELECT id, role FROM users WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (rows[0].role === 'admin') return res.status(400).json({ error: 'Não é possível desativar um admin' });
    await pool.query('UPDATE users SET active = 0, updated_at = NOW() WHERE id = $1', [req.params.id]);
    res.json({ message: 'Usuário desativado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/invites
router.get('/invites', async (req, res) => {
  try {
    const pool = getDb();
    const { rows: invites } = await pool.query(`
      SELECT i.id, i.token, i.plan, i.created_at, i.used_at,
             u1.name AS created_by_name, u1.email AS created_by_email,
             u2.name AS used_by_name, u2.email AS used_by_email
      FROM invites i
      LEFT JOIN users u1 ON i.created_by = u1.id
      LEFT JOIN users u2 ON i.used_by = u2.id
      ORDER BY i.created_at DESC
    `);
    res.json({ invites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/invites
router.post('/invites', async (req, res) => {
  try {
    const { plan = 'pro' } = req.body;
    if (!['free', 'pro'].includes(plan)) {
      return res.status(400).json({ error: 'Plano inválido. Use "free" ou "pro".' });
    }
    const token = uuidv4();
    const pool = getDb();
    await pool.query('INSERT INTO invites (token, plan, created_by) VALUES ($1, $2, $3)', [token, plan, req.user.id]);
    res.status(201).json({ token, plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
