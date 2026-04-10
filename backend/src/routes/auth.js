const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const ACCESS_EXPIRES = '1h';
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
  const refreshToken = uuidv4();
  return { accessToken, refreshToken };
}

async function storeRefreshToken(pool, userId, token) {
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS).toISOString();
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt]
  );
}

// POST /api/auth/setup
router.post('/setup', async (req, res) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query('SELECT COUNT(*) as n FROM users');
    if (parseInt(rows[0].n) > 0) {
      return res.status(404).json({ error: 'Setup já realizado' });
    }

    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const { rows: inserted } = await pool.query(
      'INSERT INTO users (email, password, name, plan, role) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [email.toLowerCase(), hashedPassword, name || '', 'pro', 'admin']
    );
    const userId = inserted[0].id;
    await pool.query('INSERT INTO settings (user_id) VALUES ($1)', [userId]);

    const { accessToken, refreshToken } = generateTokens(userId);
    await storeRefreshToken(pool, userId, refreshToken);

    res.status(201).json({
      accessToken, refreshToken,
      user: { id: userId, email: email.toLowerCase(), name: name || '', plan: 'pro', role: 'admin' },
    });
  } catch (err) {
    console.error('[Auth] Setup error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/auth/setup-required
router.get('/setup-required', async (req, res) => {
  try {
    const pool = getDb();
    const { rows } = await pool.query('SELECT COUNT(*) as n FROM users');
    res.json({ required: parseInt(rows[0].n) === 0 });
  } catch {
    res.json({ required: false });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, invite } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });

    const pool = getDb();

    let inviteRow = null;
    if (invite) {
      const { rows } = await pool.query('SELECT * FROM invites WHERE token = $1 AND used_by IS NULL', [invite]);
      inviteRow = rows[0];
      if (!inviteRow) return res.status(400).json({ error: 'Convite inválido ou já utilizado' });
    }

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing[0]) return res.status(409).json({ error: 'Email já cadastrado' });

    const hashedPassword = await bcrypt.hash(password, 12);
    const plan = inviteRow ? (inviteRow.plan || 'pro') : 'free';

    const { rows: inserted } = await pool.query(
      'INSERT INTO users (email, password, name, plan) VALUES ($1, $2, $3, $4) RETURNING id',
      [email.toLowerCase(), hashedPassword, name || '', plan]
    );
    const userId = inserted[0].id;

    if (inviteRow) {
      await pool.query('UPDATE invites SET used_by = $1, used_at = NOW() WHERE id = $2', [userId, inviteRow.id]);
    }

    await pool.query('INSERT INTO settings (user_id) VALUES ($1)', [userId]);

    const { accessToken, refreshToken } = generateTokens(userId);
    await storeRefreshToken(pool, userId, refreshToken);

    res.status(201).json({
      accessToken, refreshToken,
      user: { id: userId, email: email.toLowerCase(), name: name || '', plan, role: 'user' },
    });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });

    const pool = getDb();
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = rows[0];

    if (!user) return res.status(401).json({ error: 'Credenciais inválidas' });
    if (!user.active) return res.status(403).json({ error: 'Conta desativada' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

    const { accessToken, refreshToken } = generateTokens(user.id);
    await storeRefreshToken(pool, user.id, refreshToken);

    res.json({
      accessToken, refreshToken,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan, role: user.role || 'user' },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token obrigatório' });

    const pool = getDb();
    const { rows: stored } = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1', [refreshToken]);
    if (!stored[0]) return res.status(401).json({ error: 'Refresh token inválido' });

    if (new Date(stored[0].expires_at) < new Date()) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
      return res.status(401).json({ error: 'Refresh token expirado' });
    }

    const { rows: users } = await pool.query('SELECT * FROM users WHERE id = $1', [stored[0].user_id]);
    if (!users[0]) return res.status(401).json({ error: 'Usuário não encontrado' });

    await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(users[0].id);
    await storeRefreshToken(pool, users[0].id, newRefreshToken);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('[Auth] Refresh error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    try {
      const pool = getDb();
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    } catch { /* ignore */ }
  }
  res.json({ message: 'Logout realizado' });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token obrigatório' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const pool = getDb();
    const { rows } = await pool.query(
      'SELECT id, email, name, plan, role, created_at FROM users WHERE id = $1 AND active = 1',
      [payload.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ user: { ...rows[0], role: rows[0].role || 'user' } });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;
