const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Todos os endpoints requerem autenticação + role admin
router.use(authenticate, requireAdmin);

// GET /api/admin/users
router.get('/users', (req, res) => {
  const db = getDb();
  const users = db.prepare(
    'SELECT id, name, email, plan, role, active, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json({ users });
});

// PATCH /api/admin/users/:id/plan
router.patch('/users/:id/plan', (req, res) => {
  const { plan } = req.body;
  if (!['free', 'pro'].includes(plan)) {
    return res.status(400).json({ error: 'Plano inválido. Use "free" ou "pro".' });
  }

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  db.prepare("UPDATE users SET plan = ?, updated_at = datetime('now') WHERE id = ?")
    .run(plan, req.params.id);

  res.json({ message: 'Plano atualizado com sucesso' });
});

// PATCH /api/admin/users/:id/deactivate
router.patch('/users/:id/deactivate', (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Não é possível desativar um admin' });

  db.prepare("UPDATE users SET active = 0, updated_at = datetime('now') WHERE id = ?")
    .run(req.params.id);

  res.json({ message: 'Usuário desativado com sucesso' });
});

// GET /api/admin/invites
router.get('/invites', (req, res) => {
  const db = getDb();
  const invites = db.prepare(`
    SELECT i.id, i.token, i.plan, i.created_at, i.used_at,
           u1.name AS created_by_name, u1.email AS created_by_email,
           u2.name AS used_by_name, u2.email AS used_by_email
    FROM invites i
    LEFT JOIN users u1 ON i.created_by = u1.id
    LEFT JOIN users u2 ON i.used_by = u2.id
    ORDER BY i.created_at DESC
  `).all();
  res.json({ invites });
});

// POST /api/admin/invites
router.post('/invites', (req, res) => {
  const { plan = 'pro' } = req.body;
  if (!['free', 'pro'].includes(plan)) {
    return res.status(400).json({ error: 'Plano inválido. Use "free" ou "pro".' });
  }

  const token = uuidv4();
  const db = getDb();
  db.prepare('INSERT INTO invites (token, plan, created_by) VALUES (?, ?, ?)')
    .run(token, plan, req.user.id);

  res.status(201).json({ token, plan });
});

module.exports = router;
