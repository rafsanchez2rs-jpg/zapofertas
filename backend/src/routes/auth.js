const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret';
const ACCESS_EXPIRES = '1h';
const REFRESH_EXPIRES = '7d';
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000;

function generateTokens(userId) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_EXPIRES });
  const refreshToken = uuidv4();
  return { accessToken, refreshToken };
}

function storeRefreshToken(userId, token) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS).toISOString();
  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)'
  ).run(userId, token, expiresAt);
}

// POST /api/auth/setup — só funciona se não há nenhum usuário no banco
router.post('/setup', async (req, res) => {
  try {
    const db = getDb();
    const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
    if (count.n > 0) {
      return res.status(404).json({ error: 'Setup já realizado' });
    }

    const { email, password, name } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const result = db
      .prepare('INSERT INTO users (email, password, name, plan, role) VALUES (?, ?, ?, ?, ?)')
      .run(email.toLowerCase(), hashedPassword, name || '', 'pro', 'admin');

    db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(result.lastInsertRowid);

    const { accessToken, refreshToken } = generateTokens(result.lastInsertRowid);
    storeRefreshToken(result.lastInsertRowid, refreshToken);

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: result.lastInsertRowid,
        email: email.toLowerCase(),
        name: name || '',
        plan: 'pro',
        role: 'admin',
      },
    });
  } catch (err) {
    console.error('[Auth] Setup error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// GET /api/auth/setup-required — verifica se precisa de setup
router.get('/setup-required', (req, res) => {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as n FROM users').get();
  res.json({ required: count.n === 0 });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name, invite } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter pelo menos 6 caracteres' });
    }

    const db = getDb();

    // Validar convite se fornecido
    let inviteRow = null;
    if (invite) {
      inviteRow = db.prepare('SELECT * FROM invites WHERE token = ? AND used_by IS NULL').get(invite);
      if (!inviteRow) {
        return res.status(400).json({ error: 'Convite inválido ou já utilizado' });
      }
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const plan = inviteRow ? (inviteRow.plan || 'pro') : 'free';

    const result = db
      .prepare('INSERT INTO users (email, password, name, plan) VALUES (?, ?, ?, ?)')
      .run(email.toLowerCase(), hashedPassword, name || '', plan);

    // Marcar convite como usado
    if (inviteRow) {
      db.prepare("UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE id = ?")
        .run(result.lastInsertRowid, inviteRow.id);
    }

    db.prepare('INSERT INTO settings (user_id) VALUES (?)').run(result.lastInsertRowid);

    const { accessToken, refreshToken } = generateTokens(result.lastInsertRowid);
    storeRefreshToken(result.lastInsertRowid, refreshToken);

    res.status(201).json({
      accessToken,
      refreshToken,
      user: {
        id: result.lastInsertRowid,
        email: email.toLowerCase(),
        name: name || '',
        plan,
        role: 'user',
      },
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

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const db = getDb();
    const user = db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (!user.active) {
      return res.status(403).json({ error: 'Conta desativada' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    storeRefreshToken(user.id, refreshToken);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        role: user.role || 'user',
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token obrigatório' });

    const db = getDb();
    const stored = db
      .prepare('SELECT * FROM refresh_tokens WHERE token = ?')
      .get(refreshToken);

    if (!stored) return res.status(401).json({ error: 'Refresh token inválido' });

    if (new Date(stored.expires_at) < new Date()) {
      db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
      return res.status(401).json({ error: 'Refresh token expirado' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(stored.user_id);
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado' });

    // Rotate refresh token
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id);
    storeRefreshToken(user.id, newRefreshToken);

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('[Auth] Refresh error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const db = getDb();
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
  }
  res.json({ message: 'Logout realizado' });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token obrigatório' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET);
    const db = getDb();
    const user = db
      .prepare('SELECT id, email, name, plan, role, created_at FROM users WHERE id = ? AND active = 1')
      .get(payload.userId);

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    res.json({ user: { ...user, role: user.role || 'user' } });
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
});

module.exports = router;
